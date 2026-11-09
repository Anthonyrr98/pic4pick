import Foundation

@main
struct DiskImageCacheChecks {
    static func main() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let start = Date(timeIntervalSince1970: 1_800_000_000)
        var cache = DiskImageCache(directory: root, capacity: 1100, maxAge: 100)
        let first = Data(repeating: 1, count: 400)
        let second = Data(repeating: 2, count: 400)
        precondition(cache.data(forKey: "a", now: start) == nil)
        cache.store(first, forKey: "a", now: start)
        let reopened = DiskImageCache(directory: root, capacity: 1100, maxAge: 100)
        precondition(reopened.data(forKey: "a", now: start) == first, "Cache must survive a new instance")
        cache.store(second, forKey: "b", now: start.addingTimeInterval(1))
        precondition(cache.data(forKey: "a", now: start.addingTimeInterval(2)) == first)
        cache.store(first, forKey: "c", now: start.addingTimeInterval(3))
        precondition(cache.data(forKey: "b", now: start.addingTimeInterval(4)) == nil, "Evict least recently read entry")
        precondition(cache.data(forKey: "a", now: start.addingTimeInterval(4)) == first)
        precondition(cache.data(forKey: "c", now: start.addingTimeInterval(4)) == first)
        precondition(cache.data(forKey: "a", now: start.addingTimeInterval(100)) == nil, "Reads must not extend freshness")
        cache.store(Data(repeating: 3, count: 1200), forKey: "d", now: start)
        precondition(cache.data(forKey: "d", now: start) == nil)
        try Data([0]).write(to: root.appendingPathComponent("c.image"))
        precondition(cache.data(forKey: "c", now: start.addingTimeInterval(5)) == nil, "Truncated entries must be discarded")
        cache.store(first, forKey: "e", now: start)
        try Data("invalid".utf8).write(to: root.appendingPathComponent("e.image.json"))
        precondition(cache.data(forKey: "e", now: start) == nil)
        cache.store(first, forKey: "../escape", now: start)
        precondition(cache.data(forKey: "../escape", now: start) == nil)
        let blocked = root.appendingPathComponent("blocked")
        try Data([1]).write(to: blocked)
        var unavailable = DiskImageCache(directory: blocked)
        unavailable.store(first, forKey: "f", now: start)
        precondition(unavailable.data(forKey: "f", now: start) == nil)
        print("Disk image cache checks passed: persistence, LRU capacity, expiry, corruption, invalid paths and unavailable storage.")
    }
}
