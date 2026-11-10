import Foundation
import ImageIO

actor ImageDownload {
    static let maximumBytes = 24 * 1024 * 1024
    private let session: URLSession
    private let byteLimit: Int
    private var active = 0
    private var waiting: [(id: UUID, continuation: CheckedContinuation<Bool, Never>)] = []

    init(session: URLSession = .shared, byteLimit: Int = maximumBytes) {
        self.session = session
        self.byteLimit = byteLimit
    }

    func fetch(_ url: URL) async throws -> (Data, Bool) {
        try await acquireSlot()
        defer {
            if waiting.isEmpty { active -= 1 }
            else { waiting.removeFirst().continuation.resume(returning: true) }
        }
        try Task.checkCancellation()
        let (bytes, response) = try await session.bytes(for: URLRequest(url: url, timeoutInterval: 30))
        defer { bytes.task.cancel() }
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              http.url?.scheme == "https",
              http.expectedContentLength <= byteLimit,
              http.mimeType.map({ $0.hasPrefix("image/") || $0 == "application/octet-stream" }) ?? true else {
            throw ClientError.message("图片响应无效或超过大小限制")
        }
        let task = bytes.task
        let data = try await withTaskCancellationHandler {
            var data = Data()
            if http.expectedContentLength > 0 { data.reserveCapacity(Int(http.expectedContentLength)) }
            for try await byte in bytes {
                guard data.count < byteLimit else { throw ClientError.message("图片超过大小限制") }
                data.append(byte)
            }
            return data
        } onCancel: {
            task.cancel()
        }
        try Task.checkCancellation()
        guard Self.validSource(data) != nil else { throw ClientError.message("图片格式或像素尺寸不受支持") }
        let cacheControl = http.value(forHTTPHeaderField: "Cache-Control")?.lowercased() ?? ""
        return (data, !cacheControl.contains("no-store"))
    }

    private func acquireSlot() async throws {
        try Task.checkCancellation()
        if active < 4 { active += 1; return }
        let id = UUID()
        let acquired = await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                if Task.isCancelled { continuation.resume(returning: false) }
                else { waiting.append((id, continuation)) }
            }
        } onCancel: {
            Task { await self.cancelWaiting(id) }
        }
        if !acquired { throw CancellationError() }
    }

    private func cancelWaiting(_ id: UUID) {
        guard let index = waiting.firstIndex(where: { $0.id == id }) else { return }
        waiting.remove(at: index).continuation.resume(returning: false)
    }

    nonisolated static func validSource(_ data: Data) -> CGImageSource? {
        guard data.count <= maximumBytes,
              let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetStatus(source) == .statusComplete,
              let type = CGImageSourceGetType(source) as String?,
              ["public.jpeg", "public.png", "public.heic", "public.heif", "org.webmproject.webp", "com.compuserve.gif", "public.avif", "public.tiff"].contains(type),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int, (1...20_000).contains(width),
              let height = properties[kCGImagePropertyPixelHeight] as? Int, (1...20_000).contains(height),
              width * height <= 100_000_000 else { return nil }
        return source
    }
}
