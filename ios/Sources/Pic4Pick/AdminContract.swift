import Foundation

enum JSONValue: Codable, Sendable, Equatable {
    case string(String), number(Double), bool(Bool), array([JSONValue]), object([String: JSONValue]), null
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([JSONValue].self) { self = .array(v) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
    var string: String { if case .string(let v) = self { v } else { "" } }
    var object: [String: JSONValue] { if case .object(let v) = self { v } else { [:] } }
    var array: [JSONValue] { if case .array(let v) = self { v } else { [] } }
    subscript(_ key: String) -> JSONValue { object[key] ?? .null }
}

enum AdminFailure: LocalizedError {
    case message(String)
    case response(Int, String)
    var errorDescription: String? {
        switch self { case .message(let m), .response(_, let m): m }
    }
    var requiresLogin: Bool { if case .response(let status, _) = self { status == 401 || status == 403 } else { false } }
}

enum ReviewStatus: String, CaseIterable, Identifiable, Codable, Sendable {
    case pending, approved, rejected
    var id: String { rawValue }
    var label: String { switch self { case .pending: "待审核"; case .approved: "已通过"; case .rejected: "已拒绝" } }
    func patch(reason: String = "") -> [String: JSONValue] {
        let value = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        return ["status": .string(rawValue), "reject_reason": self == .rejected && !value.isEmpty ? .string(value) : .null]
    }
}

struct PhotoDraft: Codable, Sendable, Equatable {
    var title = "", country = "", location = "", category = "latest", tags = ""
    var camera = "", lens = "", focal = "", aperture = "", shutter = "", iso = "", filmStock = ""
    var latitude = "", longitude = "", altitude = "", rating = "", shotDate = ""
    init() {}
    init(photo: Photo) {
        title = photo.title; country = photo.country; location = photo.location
        category = ["", "featured", "精选"].contains(photo.category) ? "latest" : photo.category == "胶片" ? "film" : photo.category
        tags = photo.tags; camera = photo.camera; lens = photo.lens; focal = photo.focal
        aperture = photo.aperture; shutter = photo.shutter; iso = photo.iso; filmStock = photo.filmStock
        latitude = photo.latitude.map(String.init(describing:)) ?? ""
        longitude = photo.longitude.map(String.init(describing:)) ?? ""
        altitude = photo.altitude.map(String.init(describing:)) ?? ""
        rating = photo.rating.map(String.init(describing:)) ?? ""
        shotDate = String(photo.shotDate.prefix(10))
    }
    func payload() throws -> [String: JSONValue] {
        func text(_ value: String) -> JSONValue { .string(value.trimmingCharacters(in: .whitespacesAndNewlines)) }
        func number(_ value: String, name: String, range: ClosedRange<Double>? = nil) throws -> JSONValue {
            if value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return .null }
            guard let n = Double(value.trimmingCharacters(in: .whitespacesAndNewlines)), n.isFinite, range?.contains(n) != false else { throw AdminFailure.message("\(name)格式或范围不正确。") }
            return .number(n)
        }
        let stock = filmStock.trimmingCharacters(in: .whitespacesAndNewlines)
        // Remove obsolete stock tags so clearing/changing a stock never restores an old frame.
        let cleanedTags = tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.lowercased().hasPrefix("film_stock:") }.joined(separator: ",")
        if !shotDate.isEmpty {
            let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "yyyy-MM-dd"; formatter.isLenient = false
            guard let date = formatter.date(from: shotDate), formatter.string(from: date) == shotDate else {
                throw AdminFailure.message("拍摄日期请使用 YYYY-MM-DD 格式。")
            }
        }
        return ["title": text(title), "country": text(country), "location": text(location),
            "category": .string(stock.isEmpty ? category : "film"), "tags": .string(cleanedTags),
            "camera": text(camera), "lens": text(lens), "focal": text(focal), "aperture": text(aperture),
            "shutter": text(shutter), "iso": text(iso), "film_stock": stock.isEmpty ? .null : .string(stock),
            "shot_date": shotDate.isEmpty ? .null : .string(shotDate),
            "latitude": try number(latitude, name: "纬度", range: -90...90),
            "longitude": try number(longitude, name: "经度", range: -180...180),
            "altitude": try number(altitude, name: "海拔"), "rating": try number(rating, name: "评分", range: 0...5)]
    }
}

struct AdminSession: Codable, Sendable { let token: String; let username: String }
struct UploadReceipt: Codable, Sendable { let url: String; let thumbnailUrl: String?; let uploadId: String? }
struct UploadAttempt: Codable, Sendable {
    let id: String
    let filename: String
    var receipt: UploadReceipt?
}

enum AdminSettingsContract {
    static let envFields: [(String, String)] = [
        ("VITE_SUPABASE_URL", "Supabase URL"), ("VITE_SUPABASE_ANON_KEY", "Supabase 公开 Key"),
        ("VITE_API_BASE_URL", "网页后端地址"), ("VITE_ALIYUN_OSS_BACKEND_URL", "网页上传地址"),
        ("VITE_AMAP_WEB_KEY", "高德 Web Key"), ("VITE_AMAP_SECURITY_JS_CODE", "高德安全码"),
        ("VITE_AMAP_WEB_SERVICE_KEY", "高德服务 Key")]
    static func validateEnv(_ values: [String: JSONValue]) throws {
        let key = values["VITE_SUPABASE_ANON_KEY"]?.string ?? ""
        if key.hasPrefix("sb_secret_") { throw AdminFailure.message("客户端只能使用 Supabase 公开 Key。") }
        let parts = key.split(separator: ".")
        if parts.count == 3 {
            var base = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
            base += String(repeating: "=", count: (4 - base.count % 4) % 4)
            if let data = Data(base64Encoded: base), let payload = try? JSONDecoder().decode(JSONValue.self, from: data),
               payload["role"].string == "service_role" { throw AdminFailure.message("不能将 service_role Key 保存到公开网页配置。") }
        }
        for key in ["VITE_SUPABASE_URL", "VITE_API_BASE_URL", "VITE_ALIYUN_OSS_BACKEND_URL"] {
            let raw = values[key]?.string ?? ""
            if !raw.isEmpty && (URL(string: raw)?.scheme != "https" || URL(string: raw)?.host == nil) {
                throw AdminFailure.message("\(key) 必须为完整 HTTPS 地址。")
            }
        }
    }
}
