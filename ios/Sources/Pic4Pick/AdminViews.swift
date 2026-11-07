import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import MapKit

struct AdminHomeView: View {
    @StateObject private var admin: AdminStore
    @EnvironmentObject private var gallery: GalleryStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.galleryAppearance) private var theme
    @State private var username = ""
    @State private var password = ""
    init(config: ClientConfig) { _admin = StateObject(wrappedValue: AdminStore(config: config)) }

    var body: some View {
        NavigationStack {
            Group {
                if admin.checking { ProgressView("正在验证登录…").frame(maxWidth: .infinity, maxHeight: .infinity) }
                else if admin.authenticated { dashboard }
                else { login }
            }
            .navigationTitle("作品管理").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("完成") { dismiss() }.disabled(admin.busy) }
                if admin.authenticated {
                    ToolbarItem(placement: .primaryAction) { Button("退出登录") { admin.logout() }.disabled(admin.busy) }
                }
            }
            .task { await admin.restore() }
            .onChange(of: admin.revision) { _, _ in
                gallery.invalidatePublicCache()
                Task { await gallery.refresh() }
            }
            .onChange(of: admin.authenticated) { _, authenticated in if authenticated { password = "" } }
            .alert("管理提示", isPresented: Binding(get: { admin.message != nil }, set: { if !$0 { admin.message = nil } })) {
                Button("好", role: .cancel) { admin.message = nil }
            } message: { Text(admin.message ?? "") }
        }.environmentObject(admin).interactiveDismissDisabled(admin.busy)
            .scrollContentBackground(.hidden).background(theme.background).tint(theme.accent)
    }

    private var login: some View {
        Form {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    Image(systemName: "camera.aperture").font(.system(size: 40)).foregroundStyle(Palette.accent)
                    Text("管理你的摄影档案").font(.system(.title2, design: .serif))
                    Text("使用现有网站的管理员账号登录。").font(.subheadline).foregroundStyle(.secondary)
                }.padding(.vertical, 14)
            }
            Section("管理员登录") {
                TextField("用户名", text: $username).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField("密码", text: $password).textContentType(.password)
                Button { Task { await admin.login(username: username, password: password) } } label: {
                    HStack { Text("登录"); Spacer(); if admin.busy { ProgressView() } }
                }.disabled(admin.busy || username.trimmingCharacters(in: .whitespaces).isEmpty || password.isEmpty)
                Button("重新验证已保存的登录") { Task { await admin.restore() } }.disabled(admin.busy)
            }
        }.disabled(admin.busy)
    }

    private var dashboard: some View {
        Form {
            Section {
                Text(admin.brand["admin_title"]?.string ?? "摄影档案").font(.system(.title, design: .serif))
                Text(admin.session?.username ?? "管理员").foregroundStyle(.secondary)
                HStack {
                    ForEach(ReviewStatus.allCases) { status in
                        VStack(spacing: 6) {
                            Text("\(admin.photos.filter { $0.status == status.rawValue }.count)").font(.title2.monospacedDigit())
                            Text(status.label).font(.caption).foregroundStyle(.secondary)
                        }.frame(maxWidth: .infinity)
                    }
                }.padding(.vertical, 10)
            }
            Section("作品") {
                NavigationLink { AdminUploadView(admin: admin) } label: { Label("上传新作品", systemImage: "plus.circle") }
                NavigationLink { AdminPhotoList() } label: { Label("审核与管理作品", systemImage: "photo.stack") }
            }
            Section("配置") {
                NavigationLink { AdminSettingsView() } label: { Label("品牌、器材与网页配置", systemImage: "slider.horizontal.3") }
                NavigationLink { AdminDataView() } label: { Label("JSON 导入与导出", systemImage: "externaldrive") }
            }
            Section {
                Button { Task { await admin.reload() } } label: { Label(admin.busy ? "正在更新…" : "刷新管理数据", systemImage: "arrow.clockwise") }.disabled(admin.busy)
            }
        }.refreshable { await admin.reload() }
    }
}

private enum AdminAction: String, Identifiable {
    case approve, reject, resubmit, hide, show, delete
    var id: String { rawValue }
    var label: String { switch self {
    case .approve: "审核通过"; case .reject: "拒绝作品"; case .resubmit: "重新送审"
    case .hide: "隐藏作品"; case .show: "恢复显示"; case .delete: "永久删除"
    } }
}

struct AdminPhotoList: View {
    @EnvironmentObject private var admin: AdminStore
    @State private var status: ReviewStatus = .pending
    @State private var category = ""
    @State private var search = ""
    @State private var page = 0
    @State private var selected = Set<String>()
    @State private var action: AdminAction?
    @State private var actionIDs: [String] = []
    @State private var reason = ""
    @State private var confirmation = ""
    private var filtered: [Photo] {
        admin.photos.filter { $0.status == status.rawValue && (category.isEmpty || (category == "film" ? $0.isFilm : PhotoDraft(photo: $0).category == category))
            && (search.isEmpty || $0.searchable.localizedCaseInsensitiveContains(search)) }
    }
    private var currentPage: Int { min(page, max(0, (filtered.count - 1) / 20)) }
    private var visible: [Photo] { Array(filtered.dropFirst(currentPage * 20).prefix(20)) }
    private var selectedIDs: [String] { visible.filter { selected.contains($0.id) }.map(\.id) }

    var body: some View {
        List {
            Section {
                Picker("审核状态", selection: $status) { ForEach(ReviewStatus.allCases) { Text($0.label).tag($0) } }.pickerStyle(.segmented)
                Picker("分类", selection: $category) {
                    Text("全部分类").tag("")
                    ForEach(AdminPhotoFields.categories, id: \.0) { Text($0.1).tag($0.0) }
                }
                HStack {
                    Text("\(filtered.count) 张 · 已选 \(selectedIDs.count) 张").font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Button(selectedIDs.count == visible.count && !visible.isEmpty ? "取消全选" : "选择本页") {
                        selected = selectedIDs.count == visible.count ? [] : Set(visible.map(\.id))
                    }.font(.caption)
                }
            }
            if visible.isEmpty { ContentUnavailableView("暂无\(status.label)作品", systemImage: "photo.on.rectangle") }
            ForEach(visible) { photo in
                HStack(spacing: 12) {
                    Button { if !selected.insert(photo.id).inserted { selected.remove(photo.id) } } label: {
                        Image(systemName: selected.contains(photo.id) ? "checkmark.circle.fill" : "circle").frame(width: 28, height: 44)
                    }.buttonStyle(.borderless).accessibilityLabel("选择\(photo.displayTitle)")
                    NavigationLink { AdminPhotoEditor(photo: photo) } label: {
                        HStack(spacing: 12) {
                            AdminThumbnail(photo: photo, config: admin.config)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(photo.displayTitle).lineLimit(1)
                                Text(photo.place).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                if photo.hidden { Label("已隐藏", systemImage: "eye.slash").font(.caption2) }
                                if !photo.rejectReason.isEmpty { Text(photo.rejectReason).font(.caption).foregroundStyle(.red).lineLimit(2) }
                            }
                        }
                    }
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button(role: .destructive) { request(.delete, ids: [photo.id]) } label: { Label("删除", systemImage: "trash") }
                    Button { request(photo.hidden ? .show : .hide, ids: [photo.id]) } label: { Label(photo.hidden ? "显示" : "隐藏", systemImage: "eye") }.tint(.gray)
                    if status == .pending {
                        Button { request(.approve, ids: [photo.id]) } label: { Label("通过", systemImage: "checkmark") }.tint(.green)
                        Button { request(.reject, ids: [photo.id]) } label: { Label("拒绝", systemImage: "xmark") }.tint(.orange)
                    } else if status == .rejected {
                        Button { request(.resubmit, ids: [photo.id]) } label: { Label("重审", systemImage: "arrow.clockwise") }.tint(.blue)
                    }
                }
            }
            if filtered.count > 20 {
                HStack {
                    Button("上一页") { page = max(0, currentPage - 1); selected = [] }.disabled(currentPage == 0)
                    Spacer(); Text("\(currentPage + 1) / \(max(1, Int(ceil(Double(filtered.count) / 20))))").font(.caption); Spacer()
                    Button("下一页") { page = currentPage + 1; selected = [] }.disabled((currentPage + 1) * 20 >= filtered.count)
                }.buttonStyle(.borderless)
            }
        }
        .navigationTitle("审核与管理")
        .searchable(text: $search, prompt: "搜索标题、地点、器材、胶卷")
        .toolbar {
            Menu {
                if status == .pending { batchButton(.approve); batchButton(.reject) }
                if status == .rejected { batchButton(.resubmit) }
                batchButton(.hide); batchButton(.show); batchButton(.delete)
            } label: { Label("批量操作", systemImage: "checklist") }.disabled(selectedIDs.isEmpty || admin.busy)
        }
        .disabled(admin.busy)
        .refreshable { await admin.reload() }
        .onChange(of: status) { _, _ in reset() }.onChange(of: category) { _, _ in reset() }.onChange(of: search) { _, _ in reset() }
        .alert(action?.label ?? "确认操作", isPresented: Binding(get: { action != nil }, set: { if !$0 { action = nil } })) {
            if action == .reject { TextField("拒绝原因（选填）", text: $reason) }
            if action == .delete { TextField("输入 删除 确认", text: $confirmation) }
            Button("取消", role: .cancel) { action = nil }
            Button(action?.label ?? "确认", role: action == .delete ? .destructive : nil) { execute() }
                .disabled(action == .delete && confirmation != "删除")
        } message: { Text(action == .delete ? "永久删除选中的 \(actionIDs.count) 张作品和无引用的云端图片。此操作无法撤销。" : "将对选中的 \(actionIDs.count) 张作品执行操作。") }
    }
    private func reset() { page = 0; selected = [] }
    private func request(_ next: AdminAction, ids: [String]) { actionIDs = ids; reason = ""; confirmation = ""; action = next }
    private func batchButton(_ action: AdminAction) -> some View { Button(action.label, role: action == .delete ? .destructive : nil) { request(action, ids: selectedIDs) } }
    private func execute() {
        guard let action else { return }
        let ids = actionIDs, reason = reason
        self.action = nil
        Task {
            let patch: [String: JSONValue]?
            switch action {
            case .approve: patch = ReviewStatus.approved.patch()
            case .reject: patch = ReviewStatus.rejected.patch(reason: reason)
            case .resubmit: patch = ReviewStatus.pending.patch()
            case .hide: patch = ["hidden": .bool(true)]
            case .show: patch = ["hidden": .bool(false)]
            case .delete: patch = nil
            }
            _ = await admin.batch(ids: ids, patch: patch, delete: action == .delete)
            selected = []
        }
    }
}

struct AdminThumbnail: View {
    let photo: Photo
    let config: ClientConfig
    @State private var image: UIImage?
    var body: some View {
        Group { if let image { Image(uiImage: image).resizable().scaledToFit() } else { Image(systemName: "photo").foregroundStyle(.secondary) } }
            .frame(width: 68, height: 68).background(.quaternary, in: RoundedRectangle(cornerRadius: 7))
            .task(id: photo.id) {
                if let url = config.mediaURL(photo.thumbnailURL.isEmpty ? photo.imageURL : photo.thumbnailURL) {
                    image = try? await ImageCache.shared.load(url, size: 240)
                }
            }
    }
}

struct AdminPhotoEditor: View {
    @EnvironmentObject private var admin: AdminStore
    @Environment(\.dismiss) private var dismiss
    let photo: Photo
    @State private var draft: PhotoDraft
    init(photo: Photo) { self.photo = photo; _draft = State(initialValue: PhotoDraft(photo: photo)) }
    var body: some View {
        Form {
            Section {
                PhotoImage(photo: photo, config: admin.config).frame(maxHeight: 240)
                LabeledContent("状态", value: ReviewStatus(rawValue: photo.status)?.label ?? photo.status)
                if !photo.rejectReason.isEmpty { Text("拒绝原因：" + photo.rejectReason).font(.caption).foregroundStyle(.red) }
                Text("审核、隐藏和删除请返回列表操作。").font(.caption).foregroundStyle(.secondary)
            }
            AdminPhotoFields(draft: $draft)
        }.navigationTitle("编辑作品").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button(admin.busy ? "保存中…" : "保存") { Task { if await admin.update(photo, draft: draft) { dismiss() } } }.disabled(admin.busy) }
            .disabled(admin.busy)
    }
}

struct AdminUploadView: View {
    @EnvironmentObject private var admin: AdminStore
    @StateObject private var upload: AdminUploadModel
    @State private var picker: PhotosPickerItem?
    @State private var importFile = false
    init(admin: AdminStore) { _upload = StateObject(wrappedValue: AdminUploadModel(admin: admin)) }
    var body: some View {
        Form {
            Section("照片") {
                if let image = upload.preview { Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 240) }
                if let asset = upload.asset {
                    Text(asset.name).lineLimit(1)
                    Text(ByteCountFormatter.string(fromByteCount: Int64(asset.size), countStyle: .file) + " · 保留原始文件")
                        .font(.caption).foregroundStyle(.secondary)
                }
                PhotosPicker(selection: $picker, matching: .images, preferredItemEncoding: .current) { Label("从相册选择", systemImage: "photo.on.rectangle") }
                    .disabled(upload.uploading || upload.loadingFile || admin.busy)
                Button { importFile = true } label: { Label("从文件选择", systemImage: "folder") }.disabled(upload.uploading || upload.loadingFile || admin.busy)
                if upload.loadingFile { ProgressView("正在读取原图与拍摄信息…") }
                Text("支持 JPG、PNG、HEIC、WebP 和 GIF，最大 100 MB。会自动读取照片中的 EXIF；选择胶卷后自动归入胶片分类。")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Group {
                AdminPhotoFields(draft: $upload.draft)
                if upload.asset != nil {
                    Section {
                        Button(role: .destructive) { upload.clear(); picker = nil } label: { Text("清空草稿") }
                    }
                }
            }.disabled(upload.uploading || upload.loadingFile || admin.busy)
            Section {
                if upload.uploading {
                    ProgressView(value: upload.progress)
                    Text(upload.stage).font(.caption)
                    Button("取消上传", role: .destructive) { upload.cancel() }
                } else {
                    if !upload.stage.isEmpty { Text(upload.stage).font(.caption).foregroundStyle(.secondary) }
                    Button("上传并送审") { upload.submit() }.disabled(upload.asset == nil || upload.loadingFile || admin.busy)
                    Text("提交成功后进入待审核列表。上传失败会保留草稿，重试不会重复创建作品。")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("上传新作品").navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(upload.uploading)
        .onChange(of: picker) { _, next in upload.choose(next) }
        .onDisappear { upload.persist() }
        .onChange(of: upload.draft) { _, _ in upload.persist() }
        .fileImporter(isPresented: $importFile, allowedContentTypes: [.image]) { result in
            switch result {
            case .success(let url): Task { await upload.chooseFile(url) }
            case .failure(let error): admin.message = error.localizedDescription
            }
        }
    }
}

struct AdminPhotoFields: View {
    static let categories = [("latest", "最新"), ("random", "随览"), ("nearby", "附近"), ("far", "远方"), ("film", "胶片")]
    @EnvironmentObject private var admin: AdminStore
    @Binding var draft: PhotoDraft
    @State private var map = false
    private var stocks: [String] { Array(Set(["Fuji C200", "Kodak Gold 200", "富士一次性相机"] + admin.photos.map(\.filmStock).filter { !$0.isEmpty })).sorted() }
    var body: some View {
        Section("作品信息") {
            TextField("标题", text: $draft.title)
            TextField("国家 / 省份", text: $draft.country)
            TextField("拍摄地点", text: $draft.location)
            Picker("分类", selection: $draft.category) { ForEach(Self.categories, id: \.0) { Text($0.1).tag($0.0) } }
            TextField("标签（逗号分隔）", text: $draft.tags)
            TextField("拍摄日期 YYYY-MM-DD", text: $draft.shotDate).keyboardType(.numbersAndPunctuation)
        }
        Section("器材与胶卷") {
            TextField("相机", text: $draft.camera)
            gearMenu("camera", label: "选择相机预设", value: $draft.camera)
            TextField("镜头", text: $draft.lens)
            gearMenu("lens", label: "选择镜头预设", value: $draft.lens)
            TextField("焦距，例如 50mm", text: $draft.focal)
            TextField("光圈，例如 f/2.8", text: $draft.aperture)
            TextField("快门，例如 1/125s", text: $draft.shutter)
            TextField("ISO", text: $draft.iso).keyboardType(.numbersAndPunctuation)
            TextField("胶卷（可自填）", text: $draft.filmStock)
                .onChange(of: draft.filmStock) { _, value in if !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { draft.category = "film" } }
            Menu("选择胶卷") {
                Button("无胶卷") { draft.filmStock = "" }
                ForEach(stocks, id: \.self) { stock in Button(stock) { draft.filmStock = stock; draft.category = "film" } }
            }
            TextField("评分 0～5（可留空）", text: $draft.rating).keyboardType(.decimalPad)
        }
        Section("拍摄坐标") {
            TextField("纬度 -90～90", text: $draft.latitude).keyboardType(.numbersAndPunctuation)
            TextField("经度 -180～180", text: $draft.longitude).keyboardType(.numbersAndPunctuation)
            TextField("海拔（米）", text: $draft.altitude).keyboardType(.numbersAndPunctuation)
            Button("在地图中搜索并选点") { map = true }
        }.sheet(isPresented: $map) { AdminLocationPicker(draft: $draft) }
    }
    @ViewBuilder private func gearMenu(_ type: String, label: String, value: Binding<String>) -> some View {
        let names = admin.gear.filter { $0["type"].string == type }.map { $0["name"].string }.sorted()
        if !names.isEmpty { Menu(label) { ForEach(names, id: \.self) { name in Button(name) { value.wrappedValue = name } } } }
    }
}

struct AdminLocationPicker: View {
    @Binding var draft: PhotoDraft
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var place = ""
    @State private var results: [MKMapItem] = []
    @State private var position: MapCameraPosition = .automatic
    @State private var center = CLLocationCoordinate2D(latitude: 30.25, longitude: 120.15)
    @State private var searching = false
    @State private var error = ""
    @State private var searchTask: Task<Void, Never>?
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack {
                    TextField("搜索地点", text: $query).textFieldStyle(.roundedBorder).onSubmit { search() }
                    Button("搜索") { search() }.disabled(searching || query.isEmpty)
                }.padding()
                if !error.isEmpty { Text(error).font(.caption).foregroundStyle(.red) }
                Map(position: $position).onMapCameraChange(frequency: .onEnd) { center = $0.region.center }
                    .overlay { Image(systemName: "plus.circle.fill").foregroundStyle(Palette.accent).font(.title) }
                if !results.isEmpty {
                    List(Array(results.enumerated()), id: \.offset) { _, item in
                        Button(item.name ?? "选择地点") {
                            let coordinate = item.placemark.coordinate
                            center = coordinate; place = item.name ?? place
                            position = .region(.init(center: coordinate, span: .init(latitudeDelta: 0.02, longitudeDelta: 0.02)))
                        }
                    }.frame(maxHeight: 160)
                }
                Text("移动地图，将准星对准拍摄地点。").font(.caption).foregroundStyle(.secondary).padding(8)
            }
            .navigationTitle("拍摄位置").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("使用此位置") {
                    draft.latitude = String(center.latitude); draft.longitude = String(center.longitude)
                    if !place.isEmpty { draft.location = place }
                    dismiss()
                } }
            }
            .onAppear {
                place = draft.location
                if let lat = Double(draft.latitude), let lon = Double(draft.longitude), abs(lat) <= 90, abs(lon) <= 180 { center = .init(latitude: lat, longitude: lon) }
                position = .region(.init(center: center, span: .init(latitudeDelta: 0.05, longitudeDelta: 0.05)))
            }
            .onDisappear { searchTask?.cancel() }
        }
    }
    private func search() {
        searchTask?.cancel(); searching = true; error = ""
        searchTask = Task {
            defer { searching = false }
            do {
                let request = MKLocalSearch.Request(); request.naturalLanguageQuery = query
                let response = try await MKLocalSearch(request: request).start()
                try Task.checkCancellation(); results = response.mapItems
                if results.isEmpty { error = "没有找到地点，请尝试其他名称。" }
            } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
        }
    }
}
