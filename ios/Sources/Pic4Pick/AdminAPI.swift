import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

actor AdminAPI {
    let config: ClientConfig
    private let session: URLSession
    init(config: ClientConfig, session: URLSession = .shared) { self.config = config; self.session = session }

    static func parse(_ data: Data, status: Int) throws -> JSONValue {
        guard let value = try? JSONDecoder().decode(JSONValue.self, from: data), case .object = value else {
            throw AdminFailure.response(status, "服务器未返回有效数据（\(status)）。")
        }
        guard (200..<300).contains(status), value["success"] != .bool(false) else {
            let error = value["error"].string.isEmpty ? value["message"].string : value["error"].string
            throw AdminFailure.response(status, error.isEmpty ? "管理请求失败（\(status)）。" : error)
        }
        return value
    }

    func call(_ path: String, method: String = "GET", body: [String: JSONValue]? = nil, token: String? = nil) async throws -> JSONValue {
        guard path.hasPrefix("/api/"), !path.contains(".."), let url = URL(string: config.apiBaseURL + path) else { throw AdminFailure.message("管理接口地址无效。") }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 65)
        request.httpMethod = method
        if let token {
            guard !token.isEmpty else { throw AdminFailure.response(401, "请先登录。") }
            request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        }
        if let body { request.httpBody = try JSONEncoder().encode(body); request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await session.data(for: request)
        try Task.checkCancellation()
        return try Self.parse(data, status: (response as? HTTPURLResponse)?.statusCode ?? 0)
    }

    func publicRows(_ table: String, fields: String, id: String? = nil) async throws -> JSONValue {
        guard ["brand_settings", "gear_presets"].contains(table) else { throw AdminFailure.message("配置类型无效。") }
        var url = URLComponents(string: config.supabaseURL + "/rest/v1/" + table)!
        url.queryItems = [.init(name: "select", value: fields), .init(name: "limit", value: "1000")]
        if let id { url.queryItems?.append(.init(name: "id", value: "eq." + id)) }
        var request = URLRequest(url: url.url!, timeoutInterval: 25)
        request.setValue(config.publicKey, forHTTPHeaderField: "apikey"); request.setValue("public", forHTTPHeaderField: "Accept-Profile")
        if !config.publicKey.hasPrefix("sb_publishable_") { request.setValue("Bearer " + config.publicKey, forHTTPHeaderField: "Authorization") }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw AdminFailure.message("配置读取失败，请重试。") }
        return try JSONDecoder().decode(JSONValue.self, from: data)
    }

    func photos(token: String) async throws -> [Photo] {
        let value = try await call("/api/admin/photos", token: token)["data"]
        return try JSONDecoder().decode([Photo].self, from: JSONEncoder().encode(value))
    }

    func upload(file: URL, mime: String, attempt: UploadAttempt, token: String,
                progress: @escaping @Sendable (Double) -> Void) async throws -> UploadReceipt {
        let boundary = "Pic4Pick-" + UUID().uuidString
        let multipart = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".multipart")
        defer { try? FileManager.default.removeItem(at: multipart) }
        try Self.multipart(source: file, destination: multipart, filename: attempt.filename, mime: mime, uploadID: attempt.id, boundary: boundary)
        var request = URLRequest(url: URL(string: config.apiBaseURL + "/api/upload/oss")!, timeoutInterval: 300)
        request.httpMethod = "POST"
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=" + boundary, forHTTPHeaderField: "Content-Type")
        let delegate = UploadDelegate(progress: progress)
        let (data, response) = try await session.upload(for: request, fromFile: multipart, delegate: delegate)
        let value = try Self.parse(data, status: (response as? HTTPURLResponse)?.statusCode ?? 0)
        let receipt = try JSONDecoder().decode(UploadReceipt.self, from: JSONEncoder().encode(value))
        guard URL(string: receipt.url)?.scheme == "https", receipt.uploadId == attempt.id else { throw AdminFailure.message("上传结果不完整，请重试。") }
        return receipt
    }

    static func multipart(source: URL, destination: URL, filename: String, mime: String, uploadID: String, boundary: String) throws {
        guard UUID(uuidString: uploadID) != nil, !filename.contains("\r"), !filename.contains("\n"), !filename.contains("\""),
              ["image/jpeg", "image/png", "image/webp", "image/heic", "image/gif"].contains(mime) else { throw AdminFailure.message("上传文件信息无效。") }
        guard FileManager.default.createFile(atPath: destination.path, contents: nil) else { throw AdminFailure.message("无法准备上传临时文件。") }
        let output = try FileHandle(forWritingTo: destination)
        let input = try FileHandle(forReadingFrom: source)
        defer { try? input.close(); try? output.close() }
        func write(_ text: String) throws { try output.write(contentsOf: Data(text.utf8)) }
        try write("--\(boundary)\r\nContent-Disposition: form-data; name=\"filename\"\r\n\r\n\(filename)\r\n")
        try write("--\(boundary)\r\nContent-Disposition: form-data; name=\"uploadId\"\r\n\r\n\(uploadID)\r\n")
        try write("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\nContent-Type: \(mime)\r\n\r\n")
        while let chunk = try input.read(upToCount: 1024 * 1024), !chunk.isEmpty { try output.write(contentsOf: chunk) }
        try write("\r\n--\(boundary)--\r\n")
    }
}

private final class UploadDelegate: NSObject, URLSessionTaskDelegate, Sendable {
    let progress: @Sendable (Double) -> Void
    init(progress: @escaping @Sendable (Double) -> Void) { self.progress = progress }
    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64,
                    totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        if totalBytesExpectedToSend > 0 { progress(min(0.9, Double(totalBytesSent) / Double(totalBytesExpectedToSend) * 0.9)) }
    }
}
