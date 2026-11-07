import Foundation

// Used only by ImageCache's background actor. Store compressed downloads, not
// decoded bitmaps, so previews and detail views can share the same source bytes.
struct DiskImageCache {
    let directory: URL
    let capacity: Int
    let maxAge: TimeInterval

    private struct Metadata: Codable {
        let storedAt: Date
        let byteCount: Int
    }

    init(directory: URL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("pic4pick-images-v1", isDirectory: true),
        capacity: Int = 512 * 1024 * 1024, maxAge: TimeInterval = 7 * 24 * 60 * 60) {
        self.directory = directory
        self.capacity = capacity
        self.maxAge = maxAge
    }

    func data(forKey key: String, now: Date = Date()) -> Data? {
        guard let file = fileURL(key) else { return nil }
        guard let metadataData = try? Data(contentsOf: file.appendingPathExtension("json")),
              let metadata = try? JSONDecoder().decode(Metadata.self, from: metadataData),
              now.timeIntervalSince(metadata.storedAt) >= 0,
              now.timeIntervalSince(metadata.storedAt) < maxAge,
              let data = try? Data(contentsOf: file), data.count == metadata.byteCount else {
            remove(key)
            return nil
        }
        // Modification time tracks use; storedAt remains unchanged for expiry.
        try? FileManager.default.setAttributes([.modificationDate: now], ofItemAtPath: file.path)
        return data
    }

    func store(_ data: Data, forKey key: String, now: Date = Date()) {
        guard let file = fileURL(key) else { return }
        guard !data.isEmpty, data.count <= capacity else { remove(key); return }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let metadata = try JSONEncoder().encode(Metadata(storedAt: now, byteCount: data.count))
            try data.write(to: file, options: .atomic)
            try metadata.write(to: file.appendingPathExtension("json"), options: .atomic)
            try FileManager.default.setAttributes([.modificationDate: now], ofItemAtPath: file.path)
            trim(now: now)
        } catch {
            // A full disk or a system cache purge must not prevent viewing.
            remove(key)
        }
    }

    func remove(_ key: String) {
        guard let file = fileURL(key) else { return }
        try? FileManager.default.removeItem(at: file)
        try? FileManager.default.removeItem(at: file.appendingPathExtension("json"))
    }

    private func fileURL(_ key: String) -> URL? {
        // Callers use a SHA-256 digest, never raw URLs or photo titles as paths.
        guard !key.isEmpty, key.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }) else { return nil }
        return directory.appendingPathComponent(key).appendingPathExtension("image")
    }

    private func trim(now: Date) {
        let manager = FileManager.default
        guard let files = try? manager.contentsOfDirectory(at: directory,
            includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey], options: .skipsHiddenFiles) else { return }
        var entries: [(key: String, size: Int, usedAt: Date)] = []
        for file in files where file.pathExtension == "image" {
            let key = file.deletingPathExtension().lastPathComponent
            guard let bytes = try? Data(contentsOf: file.appendingPathExtension("json")),
                  let metadata = try? JSONDecoder().decode(Metadata.self, from: bytes),
                  now.timeIntervalSince(metadata.storedAt) >= 0,
                  now.timeIntervalSince(metadata.storedAt) < maxAge,
                  let values = try? file.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey]),
                  values.fileSize == metadata.byteCount else { remove(key); continue }
            entries.append((key, metadata.byteCount + bytes.count, values.contentModificationDate ?? .distantPast))
        }
        var total = entries.reduce(0) { $0 + $1.size }
        for entry in entries.sorted(by: { $0.usedAt < $1.usedAt }) where total > capacity {
            remove(entry.key)
            total -= entry.size
        }
    }
}
