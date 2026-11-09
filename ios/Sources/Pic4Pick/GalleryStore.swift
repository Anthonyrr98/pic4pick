import SwiftUI
import CoreLocation
import Observation

enum GalleryFilter: String, CaseIterable, Identifiable {
    case latest = "最新", random = "随览", nearby = "附近", far = "远方", film = "胶片"
    var id: String { rawValue }
}

struct GalleryCache: Codable, Sendable {
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

private struct PendingLikeOperation: Codable {
    let id: UUID
    let delta: Int
    let createdAt: Date
}

private struct StoredLikes: Codable {
    let liked: Set<String>
    let pending: [String: PendingLikeOperation]
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
    private var pendingLikes: [String: PendingLikeOperation]
    private var likeUpdates: [String: PhotoLikeUpdate] = [:]
    @Published private(set) var brandTitle = "Light of Anthony"
    @Published private(set) var brandSubtitle = "PHOTOGRAPHIC ARCHIVE"
    @Published private(set) var brandLogo = ""
    @Published private(set) var catalog = GalleryCatalog.empty
    @Published private(set) var mapConfig: [String: JSONValue] = [:]
    @Published private(set) var usingBundledMapConfig = false
    @Published private(set) var updatedAt: Date?
    let config: ClientConfig?
    let spatialClient: SpatialDepthClient?
    private let defaultMapConfig: [String: JSONValue]
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
    private let reader = GalleryReader()
    private var didLoadCache = false
    var websiteURL: URL { config.flatMap { ClientConfig.httpsURL($0.websiteURL) } ?? ClientConfig.defaultWebsiteURL }

    init() {
        favorites = Set(UserDefaults.standard.stringArray(forKey: "pic4pick.favorites") ?? [])
        let storedLikes = UserDefaults.standard.data(forKey: "pic4pick.likeState.v2")
            .flatMap { try? JSONDecoder().decode(StoredLikes.self, from: $0) }
        liked = storedLikes?.liked ?? Set(UserDefaults.standard.stringArray(forKey: "pic4pick.likes") ?? [])
        pendingLikes = storedLikes?.pending ?? [:]
        config = Bundle.module.url(forResource: "ClientConfig", withExtension: "json")
            .flatMap { try? Data(contentsOf: $0) }
            .flatMap { try? JSONDecoder().decode(ClientConfig.self, from: $0) }
            .flatMap { $0.isValid ? $0 : nil }
        spatialClient = config.map { SpatialDepthClient(config: $0) }
        let bundledMapConfig = Bundle.module.url(forResource: "PublicMapConfig", withExtension: "json")
            .flatMap { try? Data(contentsOf: $0) }
            .flatMap { try? JSONDecoder().decode([String: JSONValue].self, from: $0) } ?? [:]
        defaultMapConfig = bundledMapConfig
        mapConfig = bundledMapConfig
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

    func invalidatePublicCache() {
        readGeneration += 1
        photos = []; fetchedAt = nil; loading = false
        likesUpdatedDuringRefresh.removeAll()
        refreshFeedbackRequested = false
        activeRefreshResult = nil
        showRefreshNotice(nil)
        catalog = .empty
        didLoadCache = true
        let generation = readGeneration
        Task { await reader.invalidate(generation: generation) }
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
        async let mapConfigRefresh: Void = loadMapConfig(generation: generation)
        do {
            guard let config else { throw ClientError.message("缺少有效的客户端配置。") }
            await reader.invalidate(generation: generation)
            if !didLoadCache {
                let cached = await reader.cached(source: config.supabaseURL, generation: generation)
                try Task.checkCancellation()
                guard generation == readGeneration else { return }
                didLoadCache = true
                if let (cache, cachedCatalog) = cached {
                    lastKnownPhotoIDs = Set(cache.photos.map(\.id))
                    if (0..<300).contains(Date().timeIntervalSince(cache.fetchedAt)) {
                        photos = cache.photos
                        catalog = cachedCatalog
                        fetchedAt = cache.fetchedAt
                        reshuffle()
                    }
                }
            }
            let (cache, nextCatalog) = try await reader.fetch(config: config, generation: generation)
            try Task.checkCancellation()
            guard generation == readGeneration else { return }
            let ids = Set(cache.photos.map(\.id))
            photos = cache.photos.map { photo in
                guard let likes = likesUpdatedDuringRefresh[photo.id] else { return photo }
                var updated = photo
                updated.likes = likes
                return updated
            }
            activeRefreshResult = ids.isSubset(of: lastKnownPhotoIDs) ? .noNewPhotos : .newPhotos
            lastKnownPhotoIDs = ids
            fetchedAt = cache.fetchedAt
            updatedAt = fetchedAt
            catalog = nextCatalog
            error = nil
            if randomIDs.isEmpty || Set(randomIDs) != Set(photos.map(\.id)) { reshuffle() }
            finishRefreshFeedback(activeRefreshResult)
            await reader.save(GalleryCache(source: cache.source, fetchedAt: cache.fetchedAt, photos: photos), generation: generation)
            await loadBrand(generation: generation)
        } catch is CancellationError { }
        catch let error as URLError where error.code == .cancelled { }
        catch {
            guard !Task.isCancelled, generation == readGeneration else { return }
            self.error = error.localizedDescription
            if fetchedAt.map({ Date().timeIntervalSince($0) >= 300 }) ?? true {
                photos = []
                catalog = .empty
            }
        }
        await mapConfigRefresh
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
        guard let config, let data = try? await reader.read(config: config, table: "brand_settings", params: [.init(name: "select", value: "site_title,site_subtitle,logo_data,logo_url"),
            .init(name: "id", value: "eq.camarts_brand"), .init(name: "limit", value: "1")]),
              let rows = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]], let row = rows.first else { return }
        guard generation == readGeneration else { return }
        if let title = row["site_title"] as? String, !title.isEmpty { brandTitle = title }
        if let subtitle = row["site_subtitle"] as? String, !subtitle.isEmpty { brandSubtitle = subtitle }
        brandLogo = (row["logo_data"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? row["logo_url"] as? String ?? ""
    }

    private func loadMapConfig(generation: Int) async {
        struct Response: Decodable { let data: [String: String] }
        var cloud: [String: String] = [:]
        var loaded = false
        if let config, let url = ClientConfig.httpsURL(config.apiBaseURL + "/api/public/map-config"),
           let (data, response) = try? await URLSession.shared.data(for: URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10)),
           let http = response as? HTTPURLResponse, http.statusCode == 200,
           let result = try? JSONDecoder().decode(Response.self, from: data) {
            cloud = result.data
            loaded = true
        }
        guard !Task.isCancelled, generation == readGeneration else { return }
        usingBundledMapConfig = !loaded
        let allowed = ["VITE_MAP_STYLE_PRESET", "VITE_MAP_USE_AMAP_SDK", "VITE_AMAP_MAP_STYLE", "VITE_GAODE_RASTER_STYLE"]
        var next = defaultMapConfig
        for key in allowed {
            if let value = cloud[key], !value.isEmpty { next[key] = .string(value) }
        }
        // Legacy overrides can select an engine or theme without a preset ID.
        if cloud["VITE_MAP_STYLE_PRESET"] == nil,
           cloud["VITE_MAP_USE_AMAP_SDK"] != nil || cloud["VITE_AMAP_MAP_STYLE"] != nil {
            next.removeValue(forKey: "VITE_MAP_STYLE_PRESET")
        }
        if next != mapConfig { mapConfig = next }
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
        guard let config, let photoID = UUID(uuidString: photo.id),
              let url = ClientConfig.httpsURL(config.apiBaseURL + "/api/v2/photos/\(photoID.uuidString.lowercased())/likes") else {
            notice = "点赞服务暂不可用。"
            return nil
        }
        let wasLiked = liked.contains(photo.id)
        if let prior = pendingLikes[photo.id], Date().timeIntervalSince(prior.createdAt) >= 7 * 24 * 60 * 60 {
            pendingLikes.removeValue(forKey: photo.id)
            savePendingLikes()
            notice = "上次点赞结果已无法确认。再次点按会发起新操作。"
            return nil
        }
        let operation = pendingLikes[photo.id] ?? PendingLikeOperation(id: UUID(), delta: wasLiked ? -1 : 1, createdAt: Date())
        pendingLikes[photo.id] = operation
        savePendingLikes()
        let count = photos.first(where: { $0.id == photo.id })?.likes ?? photo.likes
        let pending = PhotoLikeState(liked: operation.delta > 0, count: max(0, count + operation.delta))
        update.pending = pending
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        Task { await submitLike(id: photo.id, operation: operation, url: url, update: update) }
        return pending
    }

    private func savePendingLikes() {
        if let data = try? JSONEncoder().encode(StoredLikes(liked: liked, pending: pendingLikes)) {
            defaults.set(data, forKey: "pic4pick.likeState.v2")
        }
    }

    private func submitLike(id: String, operation: PendingLikeOperation, url: URL, update: PhotoLikeUpdate) async {
        defer { update.pending = nil }
        do {
            var request = URLRequest(url: url, timeoutInterval: 60)
            request.httpMethod = "PATCH"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["delta": operation.delta, "operationId": operation.id.uuidString])
            let (data, response) = try await URLSession.shared.data(for: request)
            if let status = (response as? HTTPURLResponse)?.statusCode, [400, 404, 409].contains(status) {
                pendingLikes.removeValue(forKey: id)
                savePendingLikes()
            }
            guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode),
                  let result = try? JSONDecoder().decode(PhotoLikeResponse.self, from: data),
                  result.success, result.data.id.lowercased() == id.lowercased(), result.data.likes >= 0 else {
                let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
                throw ClientError.message(body?["error"] as? String ?? "点赞未成功，请重试。")
            }
            if operation.delta < 0 { liked.remove(id) } else { liked.insert(id) }
            pendingLikes.removeValue(forKey: id)
            savePendingLikes()
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
