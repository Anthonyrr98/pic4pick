import Foundation

struct GalleryCache: Codable, Sendable {
    let source: String
    let fetchedAt: Date
    let photos: [Photo]
    var snapshotID: UUID? = nil
}

struct GalleryDiskCache {
    private struct Confirmation: Codable {
        let snapshotID: UUID
        let fetchedAt: Date
    }

    let url: URL?
    private var confirmationURL: URL? { url?.appendingPathExtension("freshness") }
    private var stored: GalleryCache?

    init(url: URL?) { self.url = url }

    mutating func load(source: String) -> GalleryCache? {
        guard let url, let data = try? Data(contentsOf: url),
              let cache = try? JSONDecoder().decode(GalleryCache.self, from: data),
              cache.source == source else { return nil }
        stored = cache
        guard let snapshotID = cache.snapshotID, let confirmationURL,
              let data = try? Data(contentsOf: confirmationURL),
              let confirmation = try? JSONDecoder().decode(Confirmation.self, from: data),
              confirmation.snapshotID == snapshotID, confirmation.fetchedAt > cache.fetchedAt else { return cache }
        return GalleryCache(source: cache.source, fetchedAt: confirmation.fetchedAt, photos: cache.photos,
            snapshotID: snapshotID)
    }

    mutating func save(_ cache: GalleryCache) {
        guard let url, let confirmationURL else { return }
        let encoder = JSONEncoder()
        do {
            if let stored, let snapshotID = stored.snapshotID, stored.source == cache.source,
               stored.photos == cache.photos, stored.fetchedAt <= cache.fetchedAt,
               FileManager.default.fileExists(atPath: url.path) {
                // A timestamp can extend only the exact snapshot it confirmed.
                let confirmation = Confirmation(snapshotID: snapshotID, fetchedAt: cache.fetchedAt)
                try encoder.encode(confirmation).write(to: confirmationURL, options: .atomic)
            } else {
                var snapshot = cache
                snapshot.snapshotID = UUID()
                try encoder.encode(snapshot).write(to: url, options: .atomic)
                stored = snapshot
            }
        } catch { }
    }

    mutating func invalidate() {
        stored = nil
        if let url { try? FileManager.default.removeItem(at: url) }
        if let confirmationURL { try? FileManager.default.removeItem(at: confirmationURL) }
    }
}
