import Foundation

struct Photo: Identifiable, Codable, Sendable {
    let id: String
    let title: String
    let location: String
    let country: String
    let category: String
    let tags: String
    let imageURL: String
    let thumbnailURL: String
    let latitude: Double?
    let longitude: Double?
    let altitude: Double?
    let rating: Double?
    let rejectReason: String
    let camera: String
    let lens: String
    let focal: String
    let aperture: String
    let shutter: String
    let iso: String
    let filmStock: String
    let shotDate: String
    let createdAt: String
    let status: String
    let hidden: Bool
    var likes: Int

    enum CodingKeys: String, CodingKey {
        case id, title, location, country, category, tags, latitude, longitude, camera, lens
        case focal, aperture, shutter, iso, status, hidden, likes
        case altitude, rating
        case rejectReason = "reject_reason"
        case imageURL = "image_url", thumbnailURL = "thumbnail_url", filmStock = "film_stock"
        case shotDate = "shot_date", createdAt = "created_at"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func text(_ key: CodingKeys) -> String {
            if let value = try? c.decode(String.self, forKey: key) { return value }
            if let value = try? c.decode(Double.self, forKey: key) { return String(value) }
            return ""
        }
        func number(_ key: CodingKeys) -> Double? {
            if let value = try? c.decode(Double.self, forKey: key) { return value }
            return Double(text(key))
        }
        id = try c.decode(String.self, forKey: .id)
        imageURL = try c.decode(String.self, forKey: .imageURL)
        title = text(.title); location = text(.location); country = text(.country)
        category = text(.category); tags = text(.tags); thumbnailURL = text(.thumbnailURL)
        latitude = number(.latitude); longitude = number(.longitude)
        altitude = number(.altitude); rating = number(.rating); rejectReason = text(.rejectReason)
        camera = text(.camera); lens = text(.lens); focal = text(.focal)
        aperture = text(.aperture); shutter = text(.shutter); iso = text(.iso)
        let explicit = text(.filmStock).trimmingCharacters(in: .whitespacesAndNewlines)
        filmStock = explicit.isEmpty ? Self.legacyFilmStock(tags) : explicit
        shotDate = text(.shotDate); createdAt = text(.createdAt); status = text(.status)
        // Fail closed for missing visibility metadata.
        hidden = (try? c.decode(Bool.self, forKey: .hidden)) ?? true
        likes = max(0, Int(number(.likes) ?? 0))
    }

    static func legacyFilmStock(_ tags: String) -> String {
        for part in tags.split(separator: ",") {
            let value = part.trimmingCharacters(in: .whitespacesAndNewlines)
            if value.lowercased().hasPrefix("film_stock:") {
                return String(value.dropFirst(11)).trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
        return ""
    }

    var isPublic: Bool { status == "approved" && !hidden }
    var isFilm: Bool { ["film", "胶片"].contains(category.lowercased()) || !filmStock.isEmpty }
    var displayTitle: String { title.isEmpty ? "无题" : title }
    var place: String { [country, location].filter { !$0.isEmpty }.joined(separator: " · ") }
    var date: String { String((shotDate.isEmpty ? createdAt : shotDate).prefix(10)) }
    var searchable: String { [title, location, country, camera, lens, filmStock, tags].joined(separator: " ") }
    var categoryLabel: String { ["latest": "最新", "random": "随览", "nearby": "附近", "far": "远方", "film": "胶片", "胶片": "胶片", "featured": "最新", "精选": "最新"][category] ?? "未分类" }
    var badge: String {
        let first = tags.split(separator: ",").first.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) } ?? ""
        if first.lowercased().hasPrefix("film_stock:") { return String(first.dropFirst(11)).trimmingCharacters(in: .whitespacesAndNewlines) }
        return first.isEmpty || ["原创作品", "精选", "未分类"].contains(first) ? categoryLabel : first
    }
    var displayRating: Int {
        let value = rating ?? 7
        return Int(min(10, max(1, (value.isFinite && value != 0 ? value : 7).rounded())))
    }
    var hasCoordinate: Bool {
        guard let latitude, let longitude else { return false }
        return latitude.isFinite && longitude.isFinite && abs(latitude) <= 90 && abs(longitude) <= 180
    }

    // Same getFilmFrameStock mapping as the web gallery, including legacy tags.
    var frameStock: String {
        let stock = filmStock.trimmingCharacters(in: .whitespacesAndNewlines)
        let patterns = [
            ("^fuji\\s*c200$", "fuji-c200"),
            ("^kodak\\s+gold\\s*200$", "kodak-gold-200"),
            ("^富士(?:胶片)?一次性相机$|^(?:fuji(?:film)?\\s+)?simple\\s*ace(?:\\s*400)?$", "fuji-simple-ace")
        ]
        return patterns.first { stock.range(of: $0.0, options: [.regularExpression, .caseInsensitive]) != nil }?.1 ?? ""
    }

    func distance(latitude lat: Double, longitude lon: Double) -> Double {
        guard hasCoordinate, let latitude, let longitude else { return .infinity }
        let p = Double.pi / 180
        let a = pow(sin((latitude - lat) * p / 2), 2)
            + cos(lat * p) * cos(latitude * p) * pow(sin((longitude - lon) * p / 2), 2)
        return 6371 * 2 * asin(sqrt(min(1, max(0, a))))
    }
}

struct ClientConfig: Codable, Sendable {
    let supabaseURL: String
    let publicKey: String
    let apiBaseURL: String
    let websiteURL: String
    let mediaBaseURL: String

    func mediaURL(_ raw: String) -> URL? {
        let value = raw.replacingOccurrences(of: "http://", with: "https://", options: [.anchored])
        guard !value.isEmpty else { return nil }
        let base = URL(string: mediaBaseURL)
        guard let url = URL(string: value, relativeTo: base)?.absoluteURL, url.scheme == "https" else { return nil }
        return url
    }
}
