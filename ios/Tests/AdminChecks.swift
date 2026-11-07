import Foundation

@main
struct AdminChecks {
    static func main() async throws {
        func expectFailure(_ action: () throws -> Void) {
            do { try action(); preconditionFailure("Expected validation failure") } catch { }
        }
        let source: [String: Any] = ["id": "11111111-1111-4111-8111-111111111111", "image_url": "https://example.com/original.jpg",
            "tags": "城市,film_stock:Kodak Gold 200", "category": "film", "status": "rejected", "hidden": false,
            "reject_reason": "需修订", "altitude": 8.4, "rating": 4]
        let photo = try JSONDecoder().decode(Photo.self, from: JSONSerialization.data(withJSONObject: source))
        var draft = PhotoDraft(photo: photo)
        precondition(draft.filmStock == "Kodak Gold 200" && photo.rejectReason == "需修订")
        var payload = try draft.payload()
        precondition(payload["film_stock"] == .string("Kodak Gold 200") && payload["category"] == .string("film"))
        precondition(payload["tags"] == .string("城市") && payload["altitude"] == .number(8.4))
        draft.filmStock = ""; draft.category = "latest"
        payload = try draft.payload()
        precondition(payload["film_stock"] == .null && payload["tags"] == .string("城市"))
        draft.latitude = " 30.25 "; draft.longitude = "120.15"; draft.shotDate = "2026-11-03"
        payload = try draft.payload(); precondition(payload["latitude"] == .number(30.25))
        draft.latitude = "91"; expectFailure { _ = try draft.payload() }
        draft.latitude = "nan"; expectFailure { _ = try draft.payload() }
        draft.latitude = ""; draft.rating = "6"; expectFailure { _ = try draft.payload() }
        draft.rating = ""; draft.shotDate = "2026-02-30"; expectFailure { _ = try draft.payload() }
        precondition(ReviewStatus.approved.patch()["reject_reason"] == .null)
        precondition(ReviewStatus.rejected.patch(reason: "  原因 ")["reject_reason"] == .string("原因"))
        precondition(ReviewStatus.pending.patch()["status"] == .string("pending"))
        expectFailure { try AdminSettingsContract.validateEnv(["VITE_SUPABASE_ANON_KEY": .string("sb_secret_test")]) }
        expectFailure { try AdminSettingsContract.validateEnv(["VITE_SUPABASE_ANON_KEY": .string("x.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.x")]) }
        expectFailure { try AdminSettingsContract.validateEnv(["VITE_API_BASE_URL": .string("http://localhost")]) }
        try AdminSettingsContract.validateEnv(["VITE_SUPABASE_ANON_KEY": .string("sb_publishable_test")])
        expectFailure { _ = try AdminAPI.parse(Data("<html>down</html>".utf8), status: 502) }
        expectFailure { _ = try AdminAPI.parse(Data("{\"success\":false,\"error\":\"失败\"}".utf8), status: 200) }
        do { _ = try AdminAPI.parse(Data("{\"error\":\"登录失效\"}".utf8), status: 401) }
        catch { precondition((error as? AdminFailure)?.requiresLogin == true) }
        let json: JSONValue = .object(["data": .array([.number(0), .bool(false), .null, .string("胶片")])])
        let decoded = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(json))
        precondition(decoded == json)

        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("pic4pick-admin-check-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let original = directory.appendingPathComponent("test.jpg"), multipart = directory.appendingPathComponent("body")
        let bytes = Data([0, 255, 13, 10, 127, 42])
        try bytes.write(to: original)
        let id = "11111111-1111-4111-8111-111111111111"
        try AdminAPI.multipart(source: original, destination: multipart, filename: "\(id).jpg", mime: "image/jpeg", uploadID: id, boundary: "CHECK")
        let body = try Data(contentsOf: multipart)
        precondition(body.range(of: bytes) != nil && body.suffix(13) == Data("\r\n--CHECK--\r\n".utf8))
        precondition(body.range(of: Data("name=\"uploadId\"\r\n\r\n\(id)".utf8)) != nil)
        expectFailure { try AdminAPI.multipart(source: original, destination: multipart, filename: "bad\r\n.jpg", mime: "image/jpeg", uploadID: id, boundary: "CHECK") }

        if CommandLine.arguments.count > 1 {
            let base = CommandLine.arguments[1]
            let config = ClientConfig(supabaseURL: base, publicKey: "sb_publishable_test", apiBaseURL: base,
                websiteURL: "https://example.com", mediaBaseURL: "https://example.com")
            let api = AdminAPI(config: config)
            let login = try await api.call("/api/auth/login", method: "POST", body: ["username": .string("fixture"), "password": .string("fixture-password")])
            precondition(login["token"].string == "fixture-token")
            let rows = try await api.photos(token: "fixture-token")
            precondition(rows.count == 1 && rows[0].filmStock == "Kodak Gold 200")
            do { _ = try await api.photos(token: "expired"); preconditionFailure("Expired token accepted") }
            catch { precondition((error as? AdminFailure)?.requiresLogin == true) }
            let attempt = UploadAttempt(id: id, filename: "\(id).jpg")
            let receipt = try await api.upload(file: original, mime: "image/jpeg", attempt: attempt, token: "fixture-token", progress: { _ in })
            precondition(receipt.uploadId == id)
            var fields = try PhotoDraft(photo: rows[0]).payload()
            fields["id"] = .string(id); fields["upload_id"] = .string(id); fields["image_url"] = .string(receipt.url)
            fields["thumbnail_url"] = .string(receipt.thumbnailUrl ?? receipt.url); fields.merge(ReviewStatus.pending.patch()) { _, next in next }
            _ = try await api.call("/api/admin/photos", method: "POST", body: fields, token: "fixture-token")
            _ = try await api.call("/api/admin/photos/\(id)/update", method: "POST", body: ReviewStatus.approved.patch(), token: "fixture-token")
            let removal = try await api.call("/api/admin/photos/\(id)", method: "DELETE", token: "fixture-token")
            precondition(removal["cleanup"]["pending"] == .bool(true))
            print("通过：原生 HTTP 登录、鉴权失效、上传 multipart、稳定 ID 提交、审核和清理状态契约（本地夹具）。")
        }
        print("通过：胶卷与旧标签、坐标／日期／评分、审核状态、公开配置密钥限制、错误响应、JSON 编解码与二进制 multipart。")
    }
}
