import SwiftUI
import CoreLocation
import Observation

enum GalleryFilter: String, CaseIterable, Identifiable {
    case latest = "最新", random = "随览", nearby = "附近", far = "远方", film = "胶片"
    var id: String { rawValue }
}

struct GalleryCache: Codable {
    let source: String
    let fetchedAt: Date
    let photos: [Photo]
}

enum GalleryRefreshNotice: Equatable {
    case updating, noNewPhotos, newPhotos
}

struct PhotoLikeState {
    let liked: Bool
    let count: Int
}

@MainActor @Observable
private final class PhotoLikeUpdate {
    var pending: PhotoLikeState?
}

private struct PhotoLikeResponse: Decodable {
    struct Result: Decodable {
        let id: String
        let likes: Int
    }

    let success: Bool
    let data: Result
}

@MainActor
final class GalleryStore: ObservableObject {
    enum RefreshFeedback { case silent, opening, pull }

    @Published private(set) var photos: [Photo] = []
    @Published private(set) var loading = false
    @Published private(set) var error: String?
    @Published private(set) var refreshNotice: GalleryRefreshNotice?
    @Published var notice: String?
    @Published var filter: GalleryFilter = .latest
    @Published var search = ""
    @Published var favorites: Set<String>
    private var liked: Set<String>
    private var likeUpdates: [String: PhotoLikeUpdate] = [:]
    @Published private(set) var brandTitle = "Light of Anthony"
    @Published private(set) var brandSubtitle = "PHOTOGRAPHIC ARCHIVE"
    @Published private(set) var brandLogo = ""
    @Published private(set) var catalog = GalleryCatalog.empty
    @Published private(set) var mapConfig: [String: JSONValue] = [:]
    @Published private(set) var updatedAt: Date?
    let config: ClientConfig?
    let spatialClient: SpatialDepthClient?
    private var fetchedAt: Date?
    private var readGeneration = 0
    private var lastKnownPhotoIDs: Set<String> = []
    private var didOpenGallery = false
    private var refreshFeedbackRequested = false
    private var activeRefreshResult: GalleryRefreshNotice?
    private var dismissRefreshNotice: Task<Void, Never>?
    private var likesUpdatedDuringRefresh: [String: Int] = [:]
    private var randomIDs: [String] = []
    private let defaults = UserDefaults.standard
    private var cacheURL: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("pic4pick-photos-v1.json")
    }

    init() {
        favorites = Set(UserDefaults.standard.stringArray(forKey: "pic4pick.favorites") ?? [])
        liked = Set(UserDefaults.standard.stringArray(forKey: "pic4pick.likes") ?? [])
        config = Bundle.module.url(forResource: "ClientConfig", withExtension: "json")
            .flatMap { try? Data(contentsOf: $0) }.flatMap { try? JSONDecoder().decode(ClientConfig.self, from: $0) }
        spatialClient = config.map { SpatialDepthClient(config: $0) }
        if let url = Bundle.module.url(forResource: "PublicMapConfig", withExtension: "json"), let data = try? Data(contentsOf: url) {
            mapConfig = (try? JSONDecoder().decode([String: JSONValue].self, from: data)) ?? [:]
        }
        if let data = try? Data(contentsOf: cacheURL),
           let cache = try? JSONDecoder().decode(GalleryCache.self, from: data),
           cache.source == config?.supabaseURL {
            let publicPhotos = cache.photos.filter(\.isPublic)
            lastKnownPhotoIDs = Set(publicPhotos.map(\.id))
            let age = Date().timeIntervalSince(cache.fetchedAt)
            if age >= 0 && age < 300 {
                photos = publicPhotos
                fetchedAt = cache.fetchedAt
            }
        }
        reshuffle()
        catalog = GalleryCatalogEngine.make(photos)
    }

    func reshuffle() { randomIDs = photos.map(\.id).shuffled() }

    func displayed(favoritesOnly: Bool = false, location: CLLocation? = nil, filter: GalleryFilter? = nil) -> [Photo] {
        let filter = filter ?? self.filter
        var result = photos.filter { (!favoritesOnly || favorites.contains($0.id)) &&
            (search.isEmpty || $0.searchable.localizedCaseInsensitiveContains(search)) }
        if !favoritesOnly && filter == .film { result = result.filter(\.isFilm) }
        if !favoritesOnly && filter == .random {
            let ranks = Dictionary(uniqueKeysWithValues: randomIDs.enumerated().map { ($0.element, $0.offset) })
            return result.sorted { ranks[$0.id, default: .max] < ranks[$1.id, default: .max] }
        }
        if !favoritesOnly, [.nearby, .far].contains(filter), let location {
            return result.filter(\.hasCoordinate).sorted {
                let a = $0.distance(latitude: location.coordinate.latitude, longitude: location.coordinate.longitude)
                let b = $1.distance(latitude: location.coordinate.latitude, longitude: location.coordinate.longitude)
                return filter == .nearby ? a < b : a > b
            }
        }
        return result.sorted { (catalog.summaries[$0.id]?.time ?? 0) > (catalog.summaries[$1.id]?.time ?? 0) }
    }

    private func read(_ table: String, params: [URLQueryItem]) async throws -> Data {
        guard let config else { throw ClientError.message("缺少客户端配置，请运行 node ios/scripts/prepare.mjs 后重新构建。") }
        var components = URLComponents(string: config.supabaseURL + "/rest/v1/" + table)!
        components.queryItems = params
        var request = URLRequest(url: components.url!, timeoutInterval: 25)
        request.setValue(config.publicKey, forHTTPHeaderField: "apikey")
        request.setValue("public", forHTTPHeaderField: "Accept-Profile")
        if !config.publicKey.hasPrefix("sb_publishable_") { request.setValue("Bearer " + config.publicKey, forHTTPHeaderField: "Authorization") }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw ClientError.message(body?["message"] as? String ?? "作品请求失败，请稍后重试。")
        }
        return data
    }

    func invalidatePublicCache() {
        readGeneration += 1
        photos = []; fetchedAt = nil; loading = false
        likesUpdatedDuringRefresh.removeAll()
        refreshFeedbackRequested = false
        activeRefreshResult = nil
        showRefreshNotice(nil)
        catalog = .empty
        try? FileManager.default.removeItem(at: cacheURL)
    }

    func refreshOnForeground() async {
        let feedback: RefreshFeedback = didOpenGallery ? .silent : .opening
        didOpenGallery = true
        await refresh(feedback: feedback)
    }

    func refresh(feedback: RefreshFeedback = .silent) async {
        guard !Task.isCancelled else { return }
        if feedback != .silent {
            if let activeRefreshResult {
                showRefreshNotice(activeRefreshResult)
                return
            }
            refreshFeedbackRequested = true
            if feedback == .opening { showRefreshNotice(.updating) }
            else if refreshNotice != .updating { showRefreshNotice(nil) }
        }
        guard !loading else { return }
        let generation = readGeneration
        loading = true
        defer {
            if generation == readGeneration {
                likesUpdatedDuringRefresh.removeAll()
                loading = false
                finishRefreshFeedback(nil)
                activeRefreshResult = nil
            }
        }
        do {
            let fields = "id,title,location,country,category,tags,image_url,thumbnail_url,latitude,longitude,altitude,rating,camera,lens,focal,aperture,shutter,iso,film_stock,shot_date,created_at,status,hidden,likes"
            var params = [URLQueryItem(name: "select", value: fields), URLQueryItem(name: "status", value: "eq.approved"),
                          URLQueryItem(name: "hidden", value: "eq.false"), URLQueryItem(name: "limit", value: "1000"),
                          URLQueryItem(name: "order", value: "created_at.desc")]
            let data: Data
            do { data = try await read("photos", params: params) }
            catch {
                guard error.localizedDescription.localizedCaseInsensitiveContains("statement timeout") else { throw error }
                params.removeAll { $0.name == "order" }
                data = try await read("photos", params: params)
            }
            try Task.checkCancellation()
            let decoded = try JSONDecoder().decode([Photo].self, from: data).filter(\.isPublic)
            guard generation == readGeneration else { return }
            var ids = Set<String>()
            photos = decoded.filter { ids.insert($0.id).inserted }.map { photo in
                guard let likes = likesUpdatedDuringRefresh[photo.id] else { return photo }
                var updated = photo
                updated.likes = likes
                return updated
            }
            activeRefreshResult = ids.isSubset(of: lastKnownPhotoIDs) ? .noNewPhotos : .newPhotos
            lastKnownPhotoIDs = ids
            fetchedAt = Date()
            updatedAt = fetchedAt
            catalog = GalleryCatalogEngine.make(photos)
            error = nil
            if randomIDs.isEmpty || Set(randomIDs) != Set(photos.map(\.id)) { reshuffle() }
            if let config, let cache = try? JSONEncoder().encode(GalleryCache(source: config.supabaseURL, fetchedAt: Date(), photos: photos)) {
                try? cache.write(to: cacheURL, options: .atomic)
            }
            finishRefreshFeedback(activeRefreshResult)
            await loadBrand(generation: generation)
            await loadMapConfig(generation: generation)
        } catch is CancellationError { }
        catch let error as URLError where error.code == .cancelled { }
        catch {
            guard !Task.isCancelled, generation == readGeneration else { return }
            self.error = error.localizedDescription
            if fetchedAt == nil || Date().timeIntervalSince(fetchedAt!) >= 300 { photos = []; catalog = .empty; try? FileManager.default.removeItem(at: cacheURL) }
        }
    }

    private func finishRefreshFeedback(_ notice: GalleryRefreshNotice?) {
        guard refreshFeedbackRequested else { return }
        refreshFeedbackRequested = false
        showRefreshNotice(notice)
    }

    private func showRefreshNotice(_ notice: GalleryRefreshNotice?) {
        dismissRefreshNotice?.cancel()
        dismissRefreshNotice = nil
        if refreshNotice != notice { refreshNotice = notice }
        guard let notice, notice != .updating else { return }
        dismissRefreshNotice = Task { [weak self] in
            try? await Task.sleep(for: .seconds(1.8))
            guard !Task.isCancelled else { return }
            self?.refreshNotice = nil
        }
    }

    private func loadBrand(generation: Int) async {
        guard let data = try? await read("brand_settings", params: [.init(name: "select", value: "site_title,site_subtitle,logo_data,logo_url"),
            .init(name: "id", value: "eq.camarts_brand"), .init(name: "limit", value: "1")]),
              let rows = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]], let row = rows.first else { return }
        guard generation == readGeneration else { return }
        if let title = row["site_title"] as? String, !title.isEmpty { brandTitle = title }
        if let subtitle = row["site_subtitle"] as? String, !subtitle.isEmpty { brandSubtitle = subtitle }
        brandLogo = (row["logo_data"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? row["logo_url"] as? String ?? ""
    }

    private func loadMapConfig(generation: Int) async {
        guard let data = try? await read("app_settings", params: [.init(name: "select", value: "data"), .init(name: "id", value: "eq.env_config"), .init(name: "limit", value: "1")]),
              let rows = try? JSONDecoder().decode([JSONValue].self, from: data), generation == readGeneration else { return }
        let allowed = Set(["VITE_AMAP_WEB_KEY", "VITE_AMAP_KEY", "VITE_AMAP_SECURITY_JS_CODE", "VITE_MAP_STYLE_PRESET", "VITE_MAP_USE_AMAP_SDK", "VITE_AMAP_MAP_STYLE", "VITE_GAODE_RASTER_STYLE"])
        let cloud = rows.first?["data"].object ?? [:]
        // Empty overrides retain the build defaults, matching getEnvValue on the website.
        if let url = Bundle.module.url(forResource: "PublicMapConfig", withExtension: "json"), let data = try? Data(contentsOf: url),
           let defaults = try? JSONDecoder().decode([String: JSONValue].self, from: data) {
            mapConfig = defaults.merging(cloud.filter { allowed.contains($0.key) && !$0.value.string.isEmpty }) { _, cloud in cloud }
        }
    }

    func toggleFavorite(_ photo: Photo) {
        if !favorites.insert(photo.id).inserted { favorites.remove(photo.id) }
        defaults.set(Array(favorites), forKey: "pic4pick.favorites")
        UISelectionFeedbackGenerator().selectionChanged()
    }

    func likeState(for photo: Photo) -> PhotoLikeState {
        likeUpdate(for: photo.id).pending ?? PhotoLikeState(liked: liked.contains(photo.id), count: photo.likes)
    }

    func isUpdatingLike(_ photo: Photo) -> Bool { likeUpdate(for: photo.id).pending != nil }

    private func likeUpdate(for id: String) -> PhotoLikeUpdate {
        if let update = likeUpdates[id] { return update }
        let update = PhotoLikeUpdate()
        likeUpdates[id] = update
        return update
    }

    @discardableResult
    func toggleLike(_ photo: Photo) -> PhotoLikeState? {
        let update = likeUpdate(for: photo.id)
        guard update.pending == nil else { return nil }
        guard let config, let url = URL(string: config.apiBaseURL + "/api/photos/\(photo.id)/likes") else {
            notice = "点赞服务暂不可用。"
            return nil
        }
        let wasLiked = liked.contains(photo.id)
        let delta = wasLiked ? -1 : 1
        let count = photos.first(where: { $0.id == photo.id })?.likes ?? photo.likes
        let pending = PhotoLikeState(liked: !wasLiked, count: max(0, count + delta))
        update.pending = pending
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        Task { await submitLike(id: photo.id, delta: delta, url: url, update: update) }
        return pending
    }

    private func submitLike(id: String, delta: Int, url: URL, update: PhotoLikeUpdate) async {
        defer { update.pending = nil }
        do {
            var request = URLRequest(url: url, timeoutInterval: 60)
            request.httpMethod = "PATCH"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["delta": delta])
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode),
                  let result = try? JSONDecoder().decode(PhotoLikeResponse.self, from: data),
                  result.success, result.data.id.lowercased() == id.lowercased(), result.data.likes >= 0 else {
                let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
                throw ClientError.message(body?["error"] as? String ?? "点赞未成功，请重试。")
            }
            if delta < 0 { liked.remove(id) } else { liked.insert(id) }
            defaults.set(Array(liked), forKey: "pic4pick.likes")
            if loading { likesUpdatedDuringRefresh[id] = result.data.likes }
            if let index = photos.firstIndex(where: { $0.id == id }) { photos[index].likes = result.data.likes }
        } catch { notice = error.localizedDescription }
    }
}

enum ClientError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case let .message(value) = self { value } else { nil } }
}

@MainActor
final class LocationStore: NSObject, ObservableObject, @MainActor CLLocationManagerDelegate {
    @Published var location: CLLocation?
    @Published var message: String?
    private let manager = CLLocationManager()
    override init() { super.init(); manager.delegate = self; manager.desiredAccuracy = kCLLocationAccuracyKilometer }
    func request() {
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways: manager.requestLocation()
        default: message = "未开启定位，暂按时间排列。可在系统设置中允许位置访问。"
        }
    }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if [.authorizedAlways, .authorizedWhenInUse].contains(manager.authorizationStatus) { manager.requestLocation() }
        else if [.denied, .restricted].contains(manager.authorizationStatus) { message = "未开启定位，暂按时间排列。" }
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) { location = locations.last; message = nil }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) { message = "暂时无法定位，按时间排列。" }
}
