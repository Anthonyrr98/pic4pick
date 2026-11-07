import Foundation
import ImageIO
import CoreGraphics

actor SpatialDepthClient {
    private let config: ClientConfig
    private let session: URLSession
    private var cache: [(key: String, depth: SpatialDepth)] = []

    init(config: ClientConfig) {
        self.config = config
        // Signed URLs and depth bytes are never persisted to disk.
        let settings = URLSessionConfiguration.ephemeral
        settings.urlCache = nil
        settings.timeoutIntervalForRequest = 25
        settings.timeoutIntervalForResource = 65
        session = URLSession(configuration: settings)
    }

    private func request(_ url: URL, publicRead: Bool = false, body: Data? = nil) -> URLRequest {
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 60)
        if publicRead {
            request.setValue(config.publicKey, forHTTPHeaderField: "apikey")
            request.setValue("public", forHTTPHeaderField: "Accept-Profile")
            if !config.publicKey.hasPrefix("sb_publishable_") { request.setValue("Bearer " + config.publicKey, forHTTPHeaderField: "Authorization") }
        }
        if let body { request.httpMethod = "POST"; request.httpBody = body; request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        return request
    }

    private func fetch(_ request: URLRequest) async throws -> Data {
        try Task.checkCancellation()
        let (data, response) = try await session.data(for: request)
        try Task.checkCancellation()
        guard let http = response as? HTTPURLResponse else { throw SpatialFailure.message("空间照片读取失败。") }
        guard (200..<300).contains(http.statusCode) else { throw SpatialFailure.http(http.statusCode) }
        return data
    }

    private func metadata(_ photoID: String) async throws -> SpatialMetadata? {
        guard UUID(uuidString: photoID) != nil else { throw SpatialFailure.message("无效的照片编号。") }
        var url = URLComponents(string: config.supabaseURL + "/rest/v1/photo_spatial")!
        url.queryItems = [.init(name: "select", value: "photo_id,generation,status,storage_backend,depth_path,width,height"),
                          .init(name: "photo_id", value: "eq." + photoID), .init(name: "limit", value: "1")]
        let rows = try JSONDecoder().decode([SpatialMetadata].self, from: await fetch(request(url.url!, publicRead: true)))
        guard let row = rows.first else { return nil }
        guard row.photoID == photoID else { throw SpatialFailure.message("空间照片编号不匹配。") }
        return row
    }

    private func signedURL(_ row: SpatialMetadata) async throws -> URL {
        let data: Data
        let raw: String
        if row.storageBackend == "oss" {
            data = try await fetch(request(URL(string: config.apiBaseURL + "/api/photos/\(row.photoID)/spatial-depth")!))
            struct Signature: Decodable { let signedUrl: String; let generation: String }
            let value = try JSONDecoder().decode(Signature.self, from: data)
            guard value.generation == row.generation else { throw SpatialFailure.message("照片已更新，请重新打开空间场景。") }
            raw = value.signedUrl
        } else {
            guard row.storageBackend == nil || row.storageBackend == "supabase" else { throw SpatialFailure.message("暂不支持此景深存储。") }
            data = try await fetch(request(URL(string: config.supabaseURL + "/storage/v1/object/sign/spatial-depth/" + row.depthPath!)!,
                publicRead: true, body: Data("{\"expiresIn\":300}".utf8)))
            struct Signature: Decodable { let signedURL: String }
            let value = try JSONDecoder().decode(Signature.self, from: data)
            raw = value.signedURL.hasPrefix("/") ? config.supabaseURL + "/storage/v1" + value.signedURL : value.signedURL
        }
        guard let url = URL(string: raw), url.scheme == "https", url.host != nil else { throw SpatialFailure.message("景深链接无效。") }
        return url
    }

    func depth(photoID: String, poll: Bool, onPending: @escaping @Sendable () async -> Void = {}) async throws -> SpatialDepth? {
        let deadline = ContinuousClock.now.advanced(by: .seconds(30))
        while true {
            try Task.checkCancellation()
            guard let row = try await metadata(photoID) else {
                // RLS returns no row for a hidden/removed photo. Do not reuse cached depth.
                cache.removeAll { $0.key.hasPrefix(photoID + ":") }
                if !poll { return nil }
                throw SpatialFailure.message("这张作品的空间数据尚不可用，请稍后重试。")
            }
            if row.status == "failed" { throw SpatialFailure.message("这张作品的空间效果暂未生成成功，请稍后再试。") }
            if row.status == "ready" {
                guard row.validReady else { throw SpatialFailure.message("空间照片数据异常，请稍后重试。") }
                if let index = cache.firstIndex(where: { $0.key == row.cacheKey }) {
                    let cached = cache.remove(at: index)
                    if cached.depth.width == row.width && cached.depth.height == row.height { cache.append(cached); return cached.depth }
                }
                let png: Data
                do { png = try await fetch(request(try await signedURL(row))) }
                catch SpatialFailure.http(let code) where code == 401 || code == 403 {
                    // Refresh one expired signature, without an unbounded retry loop.
                    png = try await fetch(request(try await signedURL(row)))
                }
                let depth = try Self.decode(png, width: row.width!, height: row.height!)
                try Task.checkCancellation()
                cache.removeAll { $0.key.hasPrefix(photoID + ":") }
                cache.append((row.cacheKey, depth))
                if cache.count > 3 { cache.removeFirst(cache.count - 3) }
                return depth
            }
            guard poll else { return nil }
            await onPending()
            guard ContinuousClock.now < deadline else { throw SpatialFailure.message("空间照片正在后台准备，请稍后重试。") }
            try await Task.sleep(for: .seconds(3))
        }
    }

    func clearCache() { cache.removeAll() }

    static func decode(_ data: Data, width: Int, height: Int) throws -> SpatialDepth {
        guard data.count <= 1_048_576, data.starts(with: [137, 80, 78, 71, 13, 10, 26, 10]),
              width > 0 && width <= 1024 && height > 0 && height <= 1024,
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              properties[kCGImagePropertyPixelWidth] as? Int == width,
              properties[kCGImagePropertyPixelHeight] as? Int == height,
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw SpatialFailure.message("景深图尺寸或格式不匹配。") }
        var values = [UInt8](repeating: 0, count: width * height)
        let decoded = values.withUnsafeMutableBytes { bytes -> Bool in
            guard let context = CGContext(data: bytes.baseAddress, width: width, height: height, bitsPerComponent: 8,
                bytesPerRow: width, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return false }
            context.interpolationQuality = .none
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard decoded else { throw SpatialFailure.message("无法读取景深图。") }
        return SpatialDepth(width: width, height: height, values: values)
    }
}

enum SpatialFailure: LocalizedError {
    case message(String)
    case http(Int)
    var errorDescription: String? {
        switch self {
        case .message(let value): value
        case .http(let code): "空间照片读取失败（\(code)），请检查网络后重试。"
        }
    }
}
