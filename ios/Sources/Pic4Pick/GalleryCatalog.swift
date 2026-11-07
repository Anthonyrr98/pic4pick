import Foundation
import JavaScriptCore

struct CityCollection: Decodable, Identifiable, Sendable {
    let id: String
    let title: String
    let latitude: Double?
    let longitude: Double?
    let photoIDs: [String]
}
struct ProvinceCollection: Decodable, Identifiable, Sendable {
    let id: String
    let title: String
    let totalCount: Int
    let cities: [CityCollection]
}
struct LocationCollection: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let title: String
    let subtitle: String
    let latitude: Double
    let longitude: Double
    let photoIDs: [String]
}
struct GalleryCatalog: Decodable, Sendable {
    let provinces: [ProvinceCollection]
    let locations: [LocationCollection]
    let summaries: [String: GalleryPhotoSummary]
    static let empty = GalleryCatalog(provinces: [], locations: [], summaries: [:])
}
struct GalleryPhotoSummary: Decodable, Sendable {
    struct Shot: Decodable, Sendable { let yearsAgoText: String; let dateText: String }
    let badge: String
    let shot: Shot
    let time: Double
}

@MainActor
enum GalleryCatalogEngine {
    struct Media: Decodable { let original: String; let candidates: [String] }
    private static let context: JSContext? = {
        guard let context = JSContext(), let url = Bundle.module.url(forResource: "GalleryShared", withExtension: "js"),
              let script = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        let parse: @convention(block) (String, String) -> [String: Any]? = { raw, base in
            guard let url = URL(string: raw, relativeTo: URL(string: base))?.absoluteURL,
                  let c = URLComponents(url: url, resolvingAgainstBaseURL: true), let scheme = c.scheme, let hostname = c.host else { return nil }
            return ["protocol": scheme + ":", "hostname": hostname, "host": hostname + (c.port.map { ":\($0)" } ?? ""),
                "pathname": c.percentEncodedPath, "hash": c.percentEncodedFragment.map { "#" + $0 } ?? "",
                "query": (c.queryItems ?? []).map { [$0.name, $0.value ?? ""] }]
        }
        context.setObject(parse, forKeyedSubscript: "__pic4pickParseURL" as NSString)
        context.evaluateScript(script)
        return context
    }()
    static func make(_ photos: [Photo]) -> GalleryCatalog {
        guard let context, let data = try? JSONEncoder().encode(photos),
              let input = try? JSONSerialization.jsonObject(with: data),
              let result = context.objectForKeyedSubscript("Pic4PickShared")?.forProperty("catalog")?.call(withArguments: [input])?.toString(),
              let decoded = try? JSONDecoder().decode(GalleryCatalog.self, from: Data(result.utf8)) else { return .empty }
        return decoded
    }
    static func media(_ photo: Photo, detail: Bool) -> Media {
        guard let context, let data = try? JSONEncoder().encode(photo), let input = try? JSONSerialization.jsonObject(with: data),
              let result = context.objectForKeyedSubscript("Pic4PickShared")?.forProperty("media")?.call(withArguments: [input, detail])?.toString(),
              let media = try? JSONDecoder().decode(Media.self, from: Data(result.utf8)) else {
            return Media(original: photo.imageURL, candidates: [photo.thumbnailURL, photo.imageURL].filter { !$0.isEmpty })
        }
        return media
    }
}
