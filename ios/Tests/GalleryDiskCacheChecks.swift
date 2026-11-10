import Foundation

@main struct GalleryDiskCacheChecks {
    static func main() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("gallery.json")
        let initial = Date(timeIntervalSince1970: 1_700_000_000)
        let later = initial.addingTimeInterval(60)
        let photo = try JSONDecoder().decode(Photo.self, from: Data(
            #"{"id":"old","image_url":"https://example.com/photo.jpg","status":"approved","hidden":false}"#.utf8))
        let legacy = GalleryCache(source: "gallery", fetchedAt: initial, photos: [photo])
        try JSONEncoder().encode(legacy).write(to: url)
        var disk = GalleryDiskCache(url: url)
        precondition(disk.load(source: "gallery")?.fetchedAt == initial)

        disk.save(legacy)
        let original = try Data(contentsOf: url)
        disk.save(GalleryCache(source: "gallery", fetchedAt: later, photos: [photo]))
        let unchanged = try Data(contentsOf: url)
        precondition(unchanged == original)

        var reopened = GalleryDiskCache(url: url)
        precondition(reopened.load(source: "other") == nil)
        precondition(reopened.load(source: "gallery")?.fetchedAt == later)

        // A sidecar for the previous snapshot cannot extend a replacement snapshot.
        let replacementTime = later.addingTimeInterval(-10)
        reopened.save(GalleryCache(source: "gallery", fetchedAt: replacementTime, photos: []))
        let replacement = reopened.load(source: "gallery")
        precondition(replacement?.photos.isEmpty == true && replacement?.fetchedAt == replacementTime)

        reopened.invalidate()
        precondition(reopened.load(source: "gallery") == nil)
        precondition(!FileManager.default.fileExists(atPath: url.appendingPathExtension("freshness").path))
        print("Gallery cache checks passed: legacy migration, timestamp-only refresh, replacement, and invalidation.")
    }
}
