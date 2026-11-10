import Foundation
import JavaScriptCore

struct CityCollection: Decodable, Equatable, Identifiable, Sendable {
    let id: String
    let title: String
    let latitude: Double?
    let longitude: Double?
    let photoIDs: [String]
}
struct ProvinceCollection: Decodable, Equatable, Identifiable, Sendable {
    let id: String
    let title: String
    let totalCount: Int
    let cities: [CityCollection]

    var discoveryPlaces: [ExplorePlace] {
        cities.map { city in
            ExplorePlace(id: "city-" + city.id, title: city.title, subtitle: title,
                latitude: city.latitude, longitude: city.longitude, photoIDs: city.photoIDs)
        }
    }
}
struct LocationCollection: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let title: String
    let subtitle: String
    let latitude: Double
    let longitude: Double
    let photoIDs: [String]

    var discoveryPlace: ExplorePlace {
        ExplorePlace(id: "location-" + id, title: title, subtitle: subtitle,
            latitude: latitude, longitude: longitude, photoIDs: photoIDs)
    }

    var mapMarker: WebsiteMapMarker {
        WebsiteMapMarker(id: id, title: title, latitude: latitude, longitude: longitude)
    }
}
struct GalleryCatalog: Decodable, Equatable, Sendable {
    let provinces: [ProvinceCollection]
    let locations: [LocationCollection]
    let summaries: [String: GalleryPhotoSummary]
    static let empty = GalleryCatalog(provinces: [], locations: [], summaries: [:])
}
struct GalleryPhotoSummary: Decodable, Equatable, Sendable {
    struct Shot: Decodable, Equatable, Sendable { let yearsAgoText: String; let dateText: String }
    let badge: String
    let shot: Shot
    let time: Double
}

final class GalleryCatalogEngine {
    struct Media: Decodable { let original: String; let candidates: [String] }
    private struct MediaKey: Hashable {
        let imageURL: String
        let thumbnailURL: String
        let detail: Bool
    }
    @MainActor private static let mediaEngine = GalleryCatalogEngine()
    @MainActor private static var mediaCache: [MediaKey: Media] = [:]
    private lazy var context: JSContext? = {
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
    func make(_ photos: [Photo]) -> GalleryCatalog {
        guard let context, let data = try? JSONEncoder().encode(photos),
              let input = try? JSONSerialization.jsonObject(with: data),
              let result = context.objectForKeyedSubscript("Pic4PickShared")?.forProperty("catalog")?.call(withArguments: [input])?.toString(),
              let decoded = try? JSONDecoder().decode(GalleryCatalog.self, from: Data(result.utf8)) else { return .empty }
        return decoded
    }
    @MainActor static func media(_ photo: Photo, detail: Bool) -> Media {
        let key = MediaKey(imageURL: photo.imageURL, thumbnailURL: photo.thumbnailURL, detail: detail)
        if let cached = mediaCache[key] { return cached }
        let input = ["image_url": key.imageURL, "thumbnail_url": key.thumbnailURL]
        guard let context = mediaEngine.context,
              let result = context.objectForKeyedSubscript("Pic4PickShared")?.forProperty("media")?.call(withArguments: [input, detail])?.toString(),
              let media = try? JSONDecoder().decode(Media.self, from: Data(result.utf8)) else {
            return Media(original: photo.imageURL, candidates: [photo.thumbnailURL, photo.imageURL].filter { !$0.isEmpty })
        }
        if mediaCache.count >= 1024, let keyToEvict = mediaCache.keys.first {
            mediaCache.removeValue(forKey: keyToEvict)
        }
        mediaCache[key] = media
        return media
    }
}
