import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import ImageIO

struct AdminSettingsView: View {
    @EnvironmentObject private var admin: AdminStore
    @State private var titles: [String: String] = [:]
    @State private var logoURL = ""
    @State private var logo: PhotosPickerItem?
    @State private var gearType = "camera"
    @State private var gearName = ""
    private let textFields = [("site_title", "图库标题"), ("site_subtitle", "图库副标题"), ("admin_title", "管理标题"), ("admin_subtitle", "管理副标题")]
    var body: some View {
        Form {
            Section("品牌文案") {
                ForEach(textFields, id: \.0) { field in
                    TextField(field.1, text: binding(field.0))
                }
                Button("保存品牌文案") {
                    Task { _ = await admin.saveBrand(Dictionary(uniqueKeysWithValues: textFields.map { ($0.0, .string(titles[$0.0] ?? "")) })) }
                }
                Button("填入默认文案") { titles = ["site_title": "CAMARTS", "site_subtitle": "PHOTOGRAPHY", "admin_title": "CAMARTS", "admin_subtitle": "ADMIN PANEL"] }
            }
            Section("品牌 Logo") {
                BrandLogoPreview(value: admin.brand["logo_data"]?.string ?? "", url: admin.brand["logo_url"]?.string ?? "")
                PhotosPicker(selection: $logo, matching: .images, preferredItemEncoding: .current) { Label("从相册上传 Logo", systemImage: "photo") }
                Text("JPG、PNG 或 WebP，文件最大 1 MB。").font(.caption).foregroundStyle(.secondary)
                TextField("Logo HTTPS 地址", text: $logoURL).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                Button("保存 Logo 地址") {
                    Task {
                        let value = logoURL.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard URL(string: value)?.scheme == "https", URL(string: value)?.host != nil else { admin.message = "Logo 地址必须为完整 HTTPS 地址。"; return }
                        _ = await admin.saveBrand(["logo_url": .string(value), "logo_data": .null, "logo_mime": .null])
                    }
                }.disabled(logoURL.isEmpty)
                Button("恢复默认 Logo") { Task { _ = await admin.saveBrand(["logo_url": .null, "logo_data": .null, "logo_mime": .null]) } }
            }
            Section("常用器材") {
                ForEach(Array(admin.gear.enumerated()), id: \.offset) { _, entry in
                    LabeledContent(entry["type"].string == "camera" ? "相机" : "镜头", value: entry["name"].string)
                }
                Picker("类型", selection: $gearType) { Text("相机").tag("camera"); Text("镜头").tag("lens") }
                TextField("器材名称", text: $gearName)
                Button("添加器材预设") { Task { if await admin.saveGear(type: gearType, name: gearName) { gearName = "" } } }
                    .disabled(gearName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            Section("网页服务与地图") {
                NavigationLink("网页连接与地图样式") { AdminEnvironmentView() }
                NavigationLink("最近点赞记录") { AdminLikeEventsView() }
            }
        }
        .navigationTitle("管理配置").navigationBarTitleDisplayMode(.inline).disabled(admin.busy)
        .onAppear {
            for field in textFields { titles[field.0] = admin.brand[field.0]?.string ?? "" }
            logoURL = admin.brand["logo_url"]?.string ?? ""
        }
        .onChange(of: logo) { _, value in
            guard let value else { return }
            Task {
                await admin.work {
                    guard let data = try await value.loadTransferable(type: Data.self), data.count <= 1024 * 1024,
                          let source = CGImageSourceCreateWithData(data as CFData, nil), let type = CGImageSourceGetType(source) else { throw AdminFailure.message("Logo 需要是 1 MB 以内的图片。") }
                    let mime: String
                    switch type as String {
                    case "public.jpeg": mime = "image/jpeg"
                    case "public.png": mime = "image/png"
                    case "org.webmproject.webp": mime = "image/webp"
                    default: throw AdminFailure.message("Logo 请使用 JPG、PNG 或 WebP。")
                    }
                    _ = try await admin.api.call("/api/admin/brand-settings/camarts_brand", method: "PUT", body: ["logo_data": .string("data:\(mime);base64," + data.base64EncodedString()), "logo_mime": .string(mime), "logo_url": .null], token: admin.token)
                    await admin.didMutate()
                }
                await admin.reload()
            }
        }
    }
    private func binding(_ key: String) -> Binding<String> { .init(get: { titles[key] ?? "" }, set: { titles[key] = $0 }) }
}

private struct BrandLogoPreview: View {
    let value: String
    let url: String
    var body: some View {
        Group {
            if let base64 = value.split(separator: ",", maxSplits: 1).last, value.hasPrefix("data:image/"),
               let data = Data(base64Encoded: String(base64)), let image = UIImage(data: data) {
                Image(uiImage: image).resizable().scaledToFit()
            } else if let url = URL(string: url), url.scheme == "https" {
                AsyncImage(url: url) { image in image.resizable().scaledToFit() } placeholder: { ProgressView() }
            } else { Image(systemName: "camera.aperture").resizable().scaledToFit().foregroundStyle(Palette.accent) }
        }.frame(maxWidth: .infinity).frame(height: 100).padding(.vertical, 8)
    }
}

struct AdminEnvironmentView: View {
    @EnvironmentObject private var admin: AdminStore
    @State private var original: [String: JSONValue] = [:]
    @State private var fields: [String: String] = [:]
    @State private var preset = "street"
    @State private var loaded = false
    @State private var confirmReset = false
    private var presets: [JSONValue] {
        guard let url = Bundle.module.url(forResource: "AdminMapPresets", withExtension: "json"),
              let data = try? Data(contentsOf: url), let rows = try? JSONDecoder().decode([JSONValue].self, from: data) else { return [] }
        return rows
    }
    var body: some View {
        Form {
            Section {
                Text("这里管理网站使用的服务配置和地图样式。保存后由网站重新读取生效；不会切换本机 App 的连接，也不会改变 Apple 地图底图。")
                    .font(.caption).foregroundStyle(.secondary)
                Button(loaded ? "重新读取云端配置" : "读取云端配置") { Task { await load() } }
            }
            Section("网页连接") {
                ForEach(AdminSettingsContract.envFields, id: \.0) { field in
                    VStack(alignment: .leading, spacing: 5) {
                        Text(field.1).font(.caption).foregroundStyle(.secondary)
                        TextField(field.1, text: .init(get: { fields[field.0] ?? "" }, set: { fields[field.0] = $0 }))
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                    }
                }
            }.disabled(!loaded)
            Section("网页地图样式") {
                Picker("样式", selection: $preset) {
                    ForEach(presets, id: \.["id"].string) { row in Text(row["label"].string).tag(row["id"].string) }
                }
            }.disabled(!loaded)
            Section {
                Button("保存配置") { Task { await save() } }.disabled(!loaded)
                Button("重置网页配置", role: .destructive) { confirmReset = true }.disabled(!loaded)
            }
        }
        .navigationTitle("网页服务与地图").navigationBarTitleDisplayMode(.inline).disabled(admin.busy)
        .task { await load() }
        .confirmationDialog("恢复网站默认连接与地图配置？", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("重置", role: .destructive) {
                Task {
                    if await admin.work({ _ = try await admin.api.call("/api/admin/app-settings/env_config", method: "PUT", body: ["data": .object([:])], token: admin.token) }) {
                        original = [:]; fields = [:]; preset = "street"; loaded = true; admin.message = "网页配置已重置。"
                    }
                }
            }
        }
    }
    private func load() async {
        await admin.work {
            let result = try await admin.api.call("/api/admin/app-settings/env_config", token: admin.token)
            original = result["data"]["data"].object
            fields = Dictionary(uniqueKeysWithValues: AdminSettingsContract.envFields.map { ($0.0, original[$0.0]?.string ?? "") })
            let selected = original["VITE_MAP_STYLE_PRESET"]?.string ?? ""
            preset = presets.contains { $0["id"].string == selected } ? selected : "street"
            loaded = true
        }
    }
    private func save() async {
        guard loaded else { return }
        await admin.work {
            var next = original
            for (key, _) in AdminSettingsContract.envFields { next[key] = .string((fields[key] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)) }
            if let item = presets.first(where: { $0["id"].string == preset }) {
                next["VITE_MAP_STYLE_PRESET"] = .string(preset)
                next["VITE_MAP_USE_AMAP_SDK"] = .string(item["kind"].string == "amap-js" ? "true" : "")
                next["VITE_AMAP_MAP_STYLE"] = .string(item["amapStyle"].string)
                next["VITE_GAODE_RASTER_STYLE"] = .string(item["rasterStyle"] == .number(6) ? "6" : item["rasterStyle"] == .number(7) ? "7" : "8")
            }
            try AdminSettingsContract.validateEnv(next)
            _ = try await admin.api.call("/api/admin/app-settings/env_config", method: "PUT", body: ["data": .object(next)], token: admin.token)
            original = next; admin.message = "网页连接与地图样式已保存。"
        }
    }
}

struct AdminLikeEventsView: View {
    @EnvironmentObject private var admin: AdminStore
    @State private var rows: [JSONValue] = []
    @State private var offset = 0
    @State private var more = true
    var body: some View {
        List {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                VStack(alignment: .leading, spacing: 5) {
                    Text(admin.photos.first { $0.id == row["photo_id"].string }?.displayTitle ?? "摄影作品")
                    Text(row["created_at"].string).font(.caption).foregroundStyle(.secondary)
                    Text(row["ip"].string).font(.caption2.monospaced()).foregroundStyle(.secondary)
                }
            }
            if more { Button("加载更多") { Task { await load() } }.disabled(admin.busy) }
            if rows.isEmpty && !more { ContentUnavailableView("暂无点赞记录", systemImage: "heart") }
        }.navigationTitle("最近点赞").task { if rows.isEmpty { await load() } }
    }
    private func load() async {
        await admin.work {
            let result = try await admin.api.call("/api/admin/like-events?limit=50&offset=\(offset)", token: admin.token)
            let page = result["data"].array
            rows += page; offset += page.count; more = page.count == 50
        }
    }
}

struct AdminJSONDocument: FileDocument {
    static let readableContentTypes: [UTType] = [.json]
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

struct AdminDataView: View {
    @EnvironmentObject private var admin: AdminStore
    @State private var export = false
    @State private var importing = false
    @State private var confirm = false
    @State private var rows: [JSONValue] = []
    @State private var document = AdminJSONDocument(data: Data())
    var body: some View {
        Form {
            Section("导出") {
                Text("导出当前读取的 \(admin.photos.count) 条作品记录，包含状态、胶卷、EXIF 和云端图片地址，不包含图片文件或登录令牌。")
                    .font(.caption).foregroundStyle(.secondary)
                Button("导出作品 JSON") {
                    do {
                        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
                        document = AdminJSONDocument(data: try encoder.encode(admin.photos)); export = true
                    } catch { admin.message = error.localizedDescription }
                }.disabled(admin.photos.isEmpty)
            }
            Section("导入") {
                Text("选择作品 JSON 数组文件。相同 ID 会更新已有记录；新 ID 会新增作品。导入前请保存备份。")
                    .font(.caption).foregroundStyle(.secondary)
                Button("选择 JSON 文件") { importing = true }
            }
        }
        .navigationTitle("作品数据").disabled(admin.busy)
        .fileExporter(isPresented: $export, document: document, contentType: .json, defaultFilename: "Pic4Pick-\(Date().formatted(.iso8601.year().month().day().dateSeparator(.dash)))") { result in
            if case .failure(let error) = result { admin.message = error.localizedDescription }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
            do {
                let url = try result.get(), access = url.startAccessingSecurityScopedResource()
                defer { if access { url.stopAccessingSecurityScopedResource() } }
                guard (try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0) <= 10 * 1024 * 1024 else { throw AdminFailure.message("JSON 文件不能超过 10 MB。") }
                let value = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
                guard case .array(let array) = value, !array.isEmpty, array.count <= 1000 else { throw AdminFailure.message("需要包含 1～1000 条作品的 JSON 数组。") }
                rows = array; confirm = true
            } catch { admin.message = error.localizedDescription }
        }
        .alert("确认导入 \(rows.count) 条作品？", isPresented: $confirm) {
            Button("取消", role: .cancel) { rows = [] }
            Button("导入并更新记录") { let snapshot = rows; Task { _ = await admin.importPhotos(snapshot); rows = [] } }
        } message: { Text("相同 ID 的已有作品会被文件中的数据更新。此操作会写入云端图库。") }
    }
}
