import SwiftUI
import Security

enum AdminVault {
    static func query(_ server: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.rlzhao.pic4pick.admin",
         kSecAttrAccount as String: server]
    }
    static func read(server: String) throws -> AdminSession? {
        var query = query(server); query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw AdminFailure.message("钥匙串暂不可用，请解锁手机后重试。") }
        return try JSONDecoder().decode(AdminSession.self, from: data)
    }
    static func save(_ session: AdminSession, server: String) throws {
        let data = try JSONEncoder().encode(session)
        let attributes: [String: Any] = [kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let status = SecItemUpdate(query(server) as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            guard SecItemAdd(query(server).merging(attributes) { _, new in new } as CFDictionary, nil) == errSecSuccess else {
                throw AdminFailure.message("无法安全保存登录状态，请重试。")
            }
        } else if status != errSecSuccess { throw AdminFailure.message("无法更新登录状态。") }
    }
    static func remove(server: String) { SecItemDelete(query(server) as CFDictionary) }
}

@MainActor
final class AdminStore: ObservableObject {
    let config: ClientConfig
    let api: AdminAPI
    @Published private(set) var authenticated = false
    @Published private(set) var checking = true
    @Published private(set) var busy = false
    @Published private(set) var photos: [Photo] = []
    @Published private(set) var brand: [String: JSONValue] = [:]
    @Published private(set) var gear: [JSONValue] = []
    @Published var message: String?
    @Published private(set) var revision = 0
    private(set) var session: AdminSession?
    var token: String { session?.token ?? "" }

    init(config: ClientConfig) { self.config = config; api = AdminAPI(config: config) }

    func restore() async {
        checking = true
        defer { checking = false }
        do {
            guard let saved = try AdminVault.read(server: config.apiBaseURL) else { return }
            session = saved
            _ = try await api.call("/api/auth/verify", method: "POST", token: saved.token)
            authenticated = true
            await reload()
        } catch { handle(error) }
    }

    func login(username: String, password: String) async {
        await work {
            let result = try await self.api.call("/api/auth/login", method: "POST", body: ["username": .string(username.trimmingCharacters(in: .whitespacesAndNewlines)), "password": .string(password)])
            let token = result["token"].string
            guard !token.isEmpty else { throw AdminFailure.message("登录接口未返回令牌。") }
            let session = AdminSession(token: token, username: result["username"].string.isEmpty ? username : result["username"].string)
            try AdminVault.save(session, server: self.config.apiBaseURL)
            self.session = session; self.authenticated = true
            try await self.readPhotos()
            await self.readAuxiliary()
        }
    }

    func logout() {
        AdminVault.remove(server: config.apiBaseURL)
        session = nil; authenticated = false; photos = []; brand = [:]; gear = []
    }

    private func handle(_ error: Error) {
        if let error = error as? AdminFailure, error.requiresLogin { logout() }
        if !Task.isCancelled { message = error.localizedDescription }
    }

    @discardableResult func work(_ operation: () async throws -> Void) async -> Bool {
        guard !busy else { return false }
        busy = true; message = nil
        defer { busy = false }
        do { try await operation(); return true }
        catch { handle(error); return false }
    }

    private func readPhotos() async throws { photos = try await api.photos(token: token) }
    private func readAuxiliary() async {
        do {
            brand = try await api.publicRows("brand_settings", fields: "logo_data,logo_url,site_title,site_subtitle,admin_title,admin_subtitle", id: "camarts_brand").array.first?.object ?? [:]
            gear = try await api.publicRows("gear_presets", fields: "type,name").array
        } catch { message = "作品已读取；品牌或器材暂未更新，请刷新重试。" }
    }
    func reload() async {
        await work { try await self.readPhotos(); await self.readAuxiliary() }
    }
    func didMutate() async {
        revision += 1
        do { try await readPhotos() } catch { message = "作品已保存；列表更新失败，请下拉刷新。" }
    }

    func update(_ photo: Photo, draft: PhotoDraft) async -> Bool {
        await work {
            _ = try await self.api.call("/api/admin/photos/\(photo.id)/update", method: "POST", body: draft.payload(), token: self.token)
            self.revision += 1
            do { try await self.readPhotos() } catch { self.message = "修改已保存；列表更新失败，请下拉刷新。" }
        }
    }

    func batch(ids: [String], patch: [String: JSONValue]?, delete: Bool = false) async -> Bool {
        let snapshot = Array(Set(ids)).filter { id in photos.contains { $0.id == id } }
        return await work {
            var failures = 0, pending = 0, completed = 0
            for id in snapshot {
                do {
                    let result = try await self.api.call("/api/admin/photos/\(id)" + (delete ? "" : "/update"),
                        method: delete ? "DELETE" : "POST", body: patch, token: self.token)
                    if result["cleanup"]["pending"] == .bool(true) { pending += 1 }
                    completed += 1
                } catch {
                    if let error = error as? AdminFailure, error.requiresLogin { throw error }
                    failures += 1
                }
            }
            if completed > 0 { self.revision += 1 }
            do { try await self.readPhotos() } catch { self.message = "操作已提交，列表刷新失败，请重试。" }
            self.message = "完成 \(completed) 项" + (failures > 0 ? "，失败 \(failures) 项，可重新选择重试。" : "。")
                + (pending > 0 ? "\(pending) 项云端图片清理等待后台重试。" : "")
        }
    }

    func saveBrand(_ patch: [String: JSONValue]) async -> Bool {
        await work {
            _ = try await self.api.call("/api/admin/brand-settings/camarts_brand", method: "PUT", body: patch, token: self.token)
            self.revision += 1; await self.readAuxiliary(); self.message = "品牌配置已保存。"
        }
    }
    func saveGear(type: String, name: String) async -> Bool {
        await work {
            _ = try await self.api.call("/api/admin/gear-presets", method: "POST", body: ["type": .string(type), "name": .string(name.trimmingCharacters(in: .whitespacesAndNewlines))], token: self.token)
            await self.readAuxiliary(); self.message = "器材预设已保存。"
        }
    }

    func importPhotos(_ rows: [JSONValue]) async -> Bool {
        await work {
            guard !rows.isEmpty && rows.count <= 1000 else { throw AdminFailure.message("导入文件需要包含 1～1000 条作品。") }
            // Validate the entire file before the first write.
            let data = try JSONEncoder().encode(JSONValue.array(rows))
            let decoded = try JSONDecoder().decode([Photo].self, from: data)
            let known = Set(["id", "title", "country", "location", "category", "tags", "camera", "lens", "focal", "aperture", "shutter", "iso", "film_stock", "shot_date", "created_at", "image_url", "thumbnail_url", "latitude", "longitude", "altitude", "rating", "status", "hidden", "reject_reason", "likes"])
            guard decoded.allSatisfy({ UUID(uuidString: $0.id) != nil && self.config.mediaURL($0.imageURL) != nil && ReviewStatus(rawValue: $0.status) != nil }),
                  Set(decoded.map(\.id)).count == decoded.count else { throw AdminFailure.message("导入作品的 ID、状态或图片地址无效。") }
            let payloads = try zip(rows, decoded).map { row, photo -> [String: JSONValue] in
                var payload = row.object.filter { known.contains($0.key) }
                payload.merge(try PhotoDraft(photo: photo).payload()) { _, normalized in normalized }
                payload["image_url"] = .string(self.config.mediaURL(photo.imageURL)!.absoluteString)
                if !photo.thumbnailURL.isEmpty {
                    guard let url = self.config.mediaURL(photo.thumbnailURL) else { throw AdminFailure.message("导入的预览图片地址无效。") }
                    payload["thumbnail_url"] = .string(url.absoluteString)
                }
                return payload
            }
            var completed = 0
            for payload in payloads {
                do {
                    _ = try await self.api.call("/api/admin/photos/upsert", method: "POST", body: payload, token: self.token)
                    completed += 1
                } catch {
                    if completed > 0 { self.revision += 1 }
                    if let failure = error as? AdminFailure, failure.requiresLogin { throw failure }
                    try? await self.readPhotos()
                    throw AdminFailure.message("已导入 \(completed)/\(rows.count) 条；剩余失败：\(error.localizedDescription)。可重新导入同一文件。")
                }
            }
            self.revision += 1; try await self.readPhotos(); self.message = "已导入 \(completed) 条作品。"
        }
    }
}
