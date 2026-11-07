import Foundation

@main
struct PhotoChecks {
    static func main() throws {
        func check(_ condition: Bool) { precondition(condition) }
        func photo(_ additions: [String: Any]) throws -> Photo {
            var row: [String: Any] = ["id": "test", "image_url": "https://example.com/photo.jpg", "status": "approved", "hidden": false]
            additions.forEach { row[$0.key] = $0.value }
            return try JSONDecoder().decode(Photo.self, from: JSONSerialization.data(withJSONObject: row))
        }
        for (stock, expected) in [("Fuji C200", "fuji-c200"), ("  fuji c200  ", "fuji-c200"),
            ("Kodak Gold 200", "kodak-gold-200"), ("富士一次性相机", "fuji-simple-ace"),
            ("富士胶片一次性相机", "fuji-simple-ace"), ("FUJIFILM SIMPLE ACE 400", "fuji-simple-ace"),
            ("未知胶卷", "")] {
            let value = try photo(["film_stock": stock, "category": "film"])
            precondition(value.frameStock == expected, "胶卷映射错误: \(stock)")
            precondition(value.isFilm)
        }
        let legacy = try photo(["tags": "城市, film_stock:Kodak Gold 200"])
        precondition(legacy.badge == "城市")
        let unscored = try photo(["rating": 0])
        let rated = try photo(["rating": 4.4])
        precondition(unscored.displayRating == 7 && rated.displayRating == 4)
        precondition(legacy.frameStock == "kodak-gold-200" && legacy.isFilm)
        try check(photo(["film_stock": "Fuji C200", "tags": "film_stock:Kodak Gold 200"]).frameStock == "fuji-c200")
        try check(photo([:]).isPublic)
        try check(!photo(["status": "pending"]).isPublic)
        try check(!photo(["hidden": true]).isPublic)
        try check(!photo(["hidden": NSNull()]).isPublic)
        let coordinate = try photo(["latitude": "30.25", "longitude": "120.15", "iso": 200, "likes": 4])
        precondition(coordinate.hasCoordinate && coordinate.iso == "200.0")
        precondition(coordinate.distance(latitude: 30.25, longitude: 120.15) < 0.001)
        try check(!photo(["latitude": 100, "longitude": 120]).hasCoordinate)
        let roundTrip = try JSONDecoder().decode(Photo.self, from: JSONEncoder().encode(legacy))
        precondition(roundTrip.filmStock == legacy.filmStock && roundTrip.isPublic)
        let config = ClientConfig(supabaseURL: "https://example.supabase.co", publicKey: "test", apiBaseURL: "https://api.example.com",
            websiteURL: "https://example.com", mediaBaseURL: "https://media.example.com")
        precondition(config.mediaURL("/a.jpg")?.absoluteString == "https://media.example.com/a.jpg")
        precondition(config.mediaURL("http://example.com/a.jpg")?.scheme == "https")
        precondition(config.mediaURL("file:///etc/passwd") == nil)
        precondition(config.mediaURL("") == nil)
        if CommandLine.arguments.count > 1 {
            let live = try JSONDecoder().decode([Photo].self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
            precondition(!live.isEmpty && live.allSatisfy(\.isPublic))
            print("线上照片模型解析通过：\(live.count) 张。")
        }
        print("通过：胶卷匹配、旧标签、可见性、数据容错、坐标、缓存编解码、媒体 URL。")
    }
}
