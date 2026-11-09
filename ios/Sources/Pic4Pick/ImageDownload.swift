import Foundation
import ImageIO

actor ImageDownload {
    static let maximumBytes = 24 * 1024 * 1024
    private let session: URLSession
    private let byteLimit: Int
    private var active = 0
    private var waiting: [CheckedContinuation<Void, Never>] = []

    init(session: URLSession = .shared, byteLimit: Int = maximumBytes) {
        self.session = session
        self.byteLimit = byteLimit
    }

    func fetch(_ url: URL) async throws -> (Data, Bool) {
        if active == 4 { await withCheckedContinuation { waiting.append($0) } }
        else { active += 1 }
        defer {
            if waiting.isEmpty { active -= 1 }
            else { waiting.removeFirst().resume() }
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
        var data = Data()
        if http.expectedContentLength > 0 { data.reserveCapacity(Int(http.expectedContentLength)) }
        for try await byte in bytes {
            guard data.count < byteLimit else { throw ClientError.message("图片超过大小限制") }
            data.append(byte)
        }
        guard Self.validSource(data) != nil else { throw ClientError.message("图片格式或像素尺寸不受支持") }
        let cacheControl = http.value(forHTTPHeaderField: "Cache-Control")?.lowercased() ?? ""
        return (data, !cacheControl.contains("no-store"))
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
