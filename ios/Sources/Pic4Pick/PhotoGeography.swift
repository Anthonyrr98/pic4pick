import Foundation
import CoreLocation
import ImageIO

struct PhotoCoordinate: Sendable {
    let latitude: Double
    let longitude: Double
    let altitude: Double?
    let gps: Bool
    var key: String { "\(gps ? "gps" : "autonavi"):\(longitude),\(latitude)" }
    static func dms(_ value: Double, latitude: Bool) -> String {
        let degrees = Int(abs(value)), minutes = Int((abs(value) - Double(degrees)) * 60)
        return "\(degrees)°\(String(format: "%02d", minutes))′\(latitude ? (value >= 0 ? "N" : "S") : (value >= 0 ? "E" : "W"))"
    }
}

actor PhotoGeoReader {
    static let shared = PhotoGeoReader()
    private var cache: [(String, PhotoCoordinate)] = []
    func read(_ url: URL) async throws -> PhotoCoordinate? {
        if let index = cache.firstIndex(where: { $0.0 == url.absoluteString }) {
            let entry = cache.remove(at: index); cache.append(entry); return entry.1
        }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        // JPEG EXIF lives in the header. Avoid downloading a 100 MB original just for GPS.
        request.setValue("bytes=0-524287", forHTTPHeaderField: "Range")
        let (file, response) = try await URLSession.shared.download(for: request)
        defer { try? FileManager.default.removeItem(at: file) }
        try Task.checkCancellation()
        guard let http = response as? HTTPURLResponse, [200, 206].contains(http.statusCode),
              let source = CGImageSourceCreateWithURL(file as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any],
              let gps = properties[kCGImagePropertyGPSDictionary as String] as? [String: Any],
              let lat = gps[kCGImagePropertyGPSLatitude as String] as? NSNumber,
              let lon = gps[kCGImagePropertyGPSLongitude as String] as? NSNumber else { return nil }
        let latitude = lat.doubleValue * ((gps[kCGImagePropertyGPSLatitudeRef as String] as? String) == "S" ? -1 : 1)
        let longitude = lon.doubleValue * ((gps[kCGImagePropertyGPSLongitudeRef as String] as? String) == "W" ? -1 : 1)
        guard latitude.isFinite, longitude.isFinite, abs(latitude) <= 90, abs(longitude) <= 180 else { return nil }
        let altitude = (gps[kCGImagePropertyGPSAltitude as String] as? NSNumber).map {
            $0.doubleValue * ((gps[kCGImagePropertyGPSAltitudeRef as String] as? NSNumber)?.intValue == 1 ? -1 : 1)
        }
        let value = PhotoCoordinate(latitude: latitude, longitude: longitude, altitude: altitude, gps: true)
        cache.append((url.absoluteString, value)); if cache.count > 3 { cache.removeFirst() }
        return value
    }
}

@MainActor
final class PhotoGeography: ObservableObject {
    @Published private(set) var coordinate: PhotoCoordinate?
    @Published var mapCoordinate: PhotoCoordinate?
    @Published private(set) var altitude: Double?
    @Published private(set) var altitudeSource = ""
    @Published var address = ""
    @Published var place = ""
    private let photo: Photo
    private let geocoder = CLGeocoder()
    init(photo: Photo) {
        self.photo = photo
        if photo.hasCoordinate, let lat = photo.latitude, let lon = photo.longitude {
            coordinate = PhotoCoordinate(latitude: lat, longitude: lon, altitude: photo.altitude, gps: false)
        }
        altitude = photo.altitude; altitudeSource = photo.altitude == nil ? "" : "作品记录"
    }
    func load(config: ClientConfig?) async {
        if let url = config?.mediaURL(GalleryCatalogEngine.media(photo, detail: true).original), let exif = try? await PhotoGeoReader.shared.read(url), !Task.isCancelled {
            coordinate = exif
            mapCoordinate = nil
            if let value = exif.altitude { altitude = value; altitudeSource = "照片 EXIF" }
        }
        guard !Task.isCancelled, let coordinate else { return }
        async let terrain: Void = loadTerrain(coordinate)
        do {
            let marks = try await geocoder.reverseGeocodeLocation(CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude))
            if !Task.isCancelled, address.isEmpty, let mark = marks.first {
                address = [mark.country, mark.administrativeArea, mark.locality, mark.subLocality, mark.thoroughfare, mark.subThoroughfare]
                    .compactMap { $0 }.reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }.joined()
                place = [mark.thoroughfare, mark.subThoroughfare].compactMap { $0 }.joined()
            }
        } catch { }
        await terrain
    }
    private func loadTerrain(_ coordinate: PhotoCoordinate) async {
        guard altitude == nil, let url = URL(string: "https://api.open-meteo.com/v1/elevation?latitude=\(coordinate.latitude)&longitude=\(coordinate.longitude)") else { return }
        do {
            let (data, response) = try await URLSession.shared.data(for: URLRequest(url: url, timeoutInterval: 12))
            guard !Task.isCancelled, (response as? HTTPURLResponse)?.statusCode == 200,
                  let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let value = (object["elevation"] as? [Double])?.first, value.isFinite, altitude == nil else { return }
            altitude = value; altitudeSource = "地形估算"
        } catch { }
    }
    func stop() { geocoder.cancelGeocode() }
}
