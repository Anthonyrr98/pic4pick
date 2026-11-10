import Foundation

actor GalleryReader {
    private let catalog = GalleryCatalogEngine()
    private var diskCache = GalleryDiskCache(url: FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)
        .first?.appendingPathComponent("pic4pick-photos-v1.json"))
    private var catalogSnapshot: (photos: [Photo], year: Int, timeZone: TimeZone, value: GalleryCatalog)?
    private var generation = 0

    func cached(source: String, generation: Int) -> (GalleryCache, GalleryCatalog)? {
        guard generation == self.generation, let cache = diskCache.load(source: source) else { return nil }
        let photos = cache.photos.filter(\.isPublic)
        let cleanCache = GalleryCache(source: cache.source, fetchedAt: cache.fetchedAt, photos: photos)
        let age = Date().timeIntervalSince(cache.fetchedAt)
        return (cleanCache, (0..<300).contains(age) ? catalogForPhotos(photos) : .empty)
    }

    func invalidate(generation: Int) {
        guard generation > self.generation else { return }
        self.generation = generation
        catalogSnapshot = nil
        diskCache.invalidate()
    }

    func fetch(config: ClientConfig, generation: Int) async throws -> (GalleryCache, GalleryCatalog) {
        let fields = "id,title,location,country,category,tags,image_url,thumbnail_url,latitude,longitude,altitude,rating,camera,lens,focal,aperture,shutter,iso,film_stock,shot_date,created_at,status,hidden,likes"
        var cursor: String?
        var photos: [Photo] = []
        while true {
            try Task.checkCancellation()
            guard generation == self.generation else { throw CancellationError() }
            var params = [URLQueryItem(name: "select", value: fields), .init(name: "status", value: "eq.approved"),
                          .init(name: "hidden", value: "eq.false"), .init(name: "limit", value: "200"),
                          .init(name: "order", value: "id.asc")]
            if let cursor { params.append(.init(name: "id", value: "gt." + cursor)) }
            let data = try await read(config: config, table: "photos", params: params)
            let page = try JSONDecoder().decode([Photo].self, from: data)
            guard let last = page.last else { break }
            guard UUID(uuidString: last.id) != nil, last.id != cursor else {
                throw ClientError.message("作品分页返回了无效游标。")
            }
            photos.append(contentsOf: page.filter(\.isPublic))
            cursor = last.id
        }
        try Task.checkCancellation()
        guard generation == self.generation else { throw CancellationError() }
        photos.sort { $0.createdAt == $1.createdAt ? $0.id < $1.id : $0.createdAt > $1.createdAt }
        let cache = GalleryCache(source: config.supabaseURL, fetchedAt: Date(), photos: photos)
        return (cache, catalogForPhotos(photos))
    }

    func save(_ cache: GalleryCache, generation: Int) {
        guard generation == self.generation, !Task.isCancelled else { return }
        diskCache.save(cache)
    }

    func brand(config: ClientConfig) async throws -> (title: String?, subtitle: String?, logo: String)? {
        let data = try await read(config: config, table: "brand_settings", params: [
            .init(name: "select", value: "site_title,site_subtitle,logo_data,logo_url"),
            .init(name: "id", value: "eq.camarts_brand"), .init(name: "limit", value: "1")
        ])
        guard let rows = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]],
              let row = rows.first else { return nil }
        let logo = (row["logo_data"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? row["logo_url"] as? String ?? ""
        return (row["site_title"] as? String, row["site_subtitle"] as? String, logo)
    }

    private func catalogForPhotos(_ photos: [Photo]) -> GalleryCatalog {
        let timeZone = TimeZone.current
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let year = calendar.component(.year, from: Date())
        if let catalogSnapshot, catalogSnapshot.year == year, catalogSnapshot.timeZone == timeZone,
           catalogSnapshot.photos == photos { return catalogSnapshot.value }
        let value = catalog.make(photos)
        if photos.isEmpty || !value.summaries.isEmpty { catalogSnapshot = (photos, year, timeZone, value) }
        return value
    }

    private func read(config: ClientConfig, table: String, params: [URLQueryItem]) async throws -> Data {
        try Task.checkCancellation()
        guard var components = URLComponents(string: config.supabaseURL + "/rest/v1/" + table) else {
            throw ClientError.message("作品服务地址无效。")
        }
        components.queryItems = params
        guard let url = components.url else { throw ClientError.message("作品请求地址无效。") }
        var request = URLRequest(url: url, timeoutInterval: 25)
        request.setValue(config.publicKey, forHTTPHeaderField: "apikey")
        request.setValue("public", forHTTPHeaderField: "Accept-Profile")
        if !config.publicKey.hasPrefix("sb_publishable_") { request.setValue("Bearer " + config.publicKey, forHTTPHeaderField: "Authorization") }
        let (data, response) = try await URLSession.shared.data(for: request)
        try Task.checkCancellation()
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw ClientError.message(body?["message"] as? String ?? "作品请求失败，请稍后重试。")
        }
        return data
    }
}
