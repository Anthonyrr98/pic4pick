import SwiftUI
import Photos
import MapKit

struct PhotoViewer: View {
    @EnvironmentObject private var store: GalleryStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.galleryAppearance) private var theme
    let photos: [Photo]
    let transition: PhotoPreviewSession?
    @State private var selectedID: String
    @State private var infoExpanded = false
    @State private var infoSection: PhotoInfoSection = .geography
    @State private var motion: PhotoViewerMotion
    @State private var preparedPhotoID: String?
    @State private var liveMapPhotoID: String?
    @State private var metadataTask: Task<Void, Never>?
    @State private var saving = false
    @State private var saveMessage: String?
    @StateObject private var spatial = SpatialSceneModel()

    init(photos: [Photo], initialID: String, transition: PhotoPreviewSession? = nil) {
        self.photos = photos
        self.transition = transition
        _motion = State(initialValue: PhotoViewerMotion(native: transition != nil))
        _selectedID = State(initialValue: initialID)
    }
    private var photo: Photo? { store.photos.first { $0.id == selectedID } }
    private var previewScene: UIWindowScene? { transition?.controller?.viewIfLoaded?.window?.windowScene }
    private var isSceneActive: Bool {
        if let previewScene { return previewScene.activationState == .foregroundActive }
        return scenePhase == .active
    }
    private var visiblePhotos: [Photo] {
        let publicIDs = Set(store.photos.map(\.id))
        return photos.filter { publicIDs.contains($0.id) }
    }

    var body: some View {
        GeometryReader { geometry in
            let layout = PhotoViewerLayout(availableHeight: Double(geometry.size.height), safeBottom: Double(geometry.safeAreaInsets.bottom),
                safeTop: Double(geometry.safeAreaInsets.top))
            ZStack(alignment: .bottom) {
                PhotoViewerBackdrop(photo: photo)
                // Cover the bare background too; controls and the photo's own
                // scroll view remain above this local gesture surface.
                if transition == nil {
                    PhotoPanelGestureSurface(interaction: photoPanelInteraction(layout: layout))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .allowsHitTesting(!infoExpanded).accessibilityHidden(true)
                }
                picture(layout: layout)
                    .animation(nil, value: infoExpanded)
                    .frame(width: geometry.size.width, height: CGFloat(layout.photoHeight))
                    .clipped().contentShape(Rectangle())
                    .position(x: geometry.size.width / 2, y: CGFloat(layout.photoTop + layout.photoHeight / 2))
                    .modifier(PhotoViewerMovingLayer(motion: motion, layout: layout, expanded: infoExpanded, role: .picture, sharedPhoto: transition != nil))
                    .allowsHitTesting(!infoExpanded)
                    .accessibilityHidden(infoExpanded)
                    .animation(panelAnimation, value: infoExpanded)
                if let photo {
                    Group {
                        if let transition { PhotoPanelHeaderAnchor(session: transition) }
                        else {
                            PhotoImage(photo: photo, config: store.config, cardFill: true).id(photo.id)
                                .modifier(PhotoViewerMovingLayer(motion: motion, layout: layout, expanded: infoExpanded, role: .preview))
                        }
                    }
                        .frame(width: geometry.size.width, height: CGFloat(layout.expandedPreviewHeight))
                        .clipped().allowsHitTesting(false).accessibilityHidden(true)
                        .position(x: geometry.size.width / 2,
                            y: CGFloat(layout.expandedPreviewHeight / 2 - layout.safeTop))
                    if transition == nil {
                        PhotoPanelGestureSurface(interaction: photoPanelInteraction(layout: layout))
                            .frame(width: geometry.size.width, height: CGFloat(layout.expandedPreviewHeight))
                            .position(x: geometry.size.width / 2,
                                y: CGFloat(layout.expandedPreviewHeight / 2 - layout.safeTop))
                            .allowsHitTesting(infoExpanded).accessibilityHidden(true)
                    }
                    PhotoViewerInfoPanel(photo: photo, section: $infoSection, expanded: $infoExpanded,
                        motion: motion, layout: layout, prepared: preparedPhotoID == photo.id,
                        liveMap: liveMapPhotoID == photo.id, interaction: photoPanelInteraction(layout: layout), session: transition) {
                        moreActions(photo)
                    }
                    .padding(.bottom, -geometry.safeAreaInsets.bottom)
                    .animation(panelAnimation, value: infoExpanded)
                }
                if let transition {
                    PhotoPanelPictureBridge(layout: layout, expanded: infoExpanded, session: transition,
                        interaction: photoPanelInteraction(layout: layout), motion: motion)
                        .frame(width: 0, height: 0)
                        .allowsHitTesting(false).accessibilityHidden(true)
                }
            }
            .overlay(alignment: .topLeading) {
                Button { close() } label: {
                    Image(systemName: "chevron.left").font(.system(size: 13, weight: .regular))
                        .frame(width: 28, height: 28)
                        .background {
                            Circle().fill(.ultraThinMaterial)
                                .overlay { Circle().fill(.white.opacity(theme == .dark ? 0.06 : 0.23)) }
                        }
                        .overlay {
                            Circle().strokeBorder(.white.opacity(theme == .dark ? 0.32 : 0.68), lineWidth: 0.75)
                        }
                        .frame(width: 44, height: 44).contentShape(Circle())
                }.buttonStyle(.plain).accessibilityLabel("返回图库").padding(.leading, 4).padding(.top, 4)
                    .modifier(PhotoViewerMovingLayer(motion: motion, layout: layout, expanded: infoExpanded, role: .back))
                    .allowsHitTesting(!infoExpanded)
                    .accessibilityHidden(infoExpanded)
            }
            .overlay(alignment: .topTrailing) { spatialStatus.padding(.trailing, 12).padding(.top, 4) }
        }
        .foregroundStyle(theme.ink).tint(theme.accent).preferredColorScheme(theme == .dark ? .dark : .light)
        .statusBarHidden(false)
        .accessibilityAction(.escape) { close() }
        .onAppear { transition?.select(selectedID); prepareSpatial() }
        .onDisappear { metadataTask?.cancel(); spatial.stop() }
        .task(id: photo?.id) {
            guard let id = photo?.id else { return }
            await transition?.waitUntilPresented()
            guard !Task.isCancelled, transition?.phase != .finished else { return }
            do { try await Task.sleep(for: .milliseconds(160)) } catch { return }
            guard !Task.isCancelled, photo?.id == id else { return }
            preparedPhotoID = id // Warm only native cards, never WebKit/EXIF here.
        }
        .onChange(of: photo?.id) { _, _ in
            transition?.select(selectedID)
            metadataTask?.cancel(); liveMapPhotoID = nil; preparedPhotoID = nil
            infoExpanded = false; motion.reset(); prepareSpatial()
        }
        .onChange(of: scenePhase) { _, phase in
            if transition == nil { updateSceneActivity(active: phase == .active) }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIScene.didActivateNotification)) { notification in
            if let previewScene, notification.object as? UIWindowScene === previewScene { updateSceneActivity(active: true) }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIScene.willDeactivateNotification)) { notification in
            if let previewScene, notification.object as? UIWindowScene === previewScene { updateSceneActivity(active: false) }
        }
        .onChange(of: reduceMotion) { _, _ in prepareSpatial() }
        .onChange(of: infoExpanded) { _, presented in
            if presented { spatial.stop() }
            else if spatial.content == nil && !spatial.loading { prepareSpatial() }
            if presented { preparedPhotoID = photo?.id }
            scheduleMetadataActivity()
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)) { _ in
            spatial.stop()
            Task { await store.spatialClient?.clearCache() }
        }
        .alert("保存照片", isPresented: Binding(get: { saveMessage != nil }, set: { if !$0 { saveMessage = nil } })) {
            Button("好", role: .cancel) { saveMessage = nil }
        } message: { Text(saveMessage ?? "") }
    }

    @ViewBuilder private func picture(layout: PhotoViewerLayout) -> some View {
        if let content = spatial.content, content.photoID == photo?.id {
            SpatialMetalView(content: content, tilt: spatial.tiltEnabled, calibration: spatial.calibration) { message in
                spatial.rendererFailed(message, photoID: content.photoID)
            }.id(content.photoID)
        } else if photo != nil, let transition {
            PhotoViewerPaging(photos: visiblePhotos, selectedID: $selectedID, session: transition) { item in
                pagingPhoto(item, layout: layout)
            }
        } else if photo != nil {
            let items = visiblePhotos
            let center = items.firstIndex { $0.id == selectedID } ?? 0
            TabView(selection: $selectedID) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    Group {
                        if abs(index - center) <= 2 {
                            pagingPhoto(item, layout: layout)
                        }
                        else { Color.clear }
                    }.tag(item.id)
                }
            }.tabViewStyle(.page(indexDisplayMode: .never))
        } else {
            ContentUnavailableView("作品已更新", systemImage: "photo", description: Text("此作品已不再公开，请返回图库刷新。"))
        }
    }

    private func pagingPhoto(_ item: Photo, layout: PhotoViewerLayout) -> some View {
        PhotoImage(photo: item, config: store.config, detail: true,
            isSelectedPage: item.id == selectedID,
            panelInteraction: transition == nil && item.id == selectedID ? photoPanelInteraction(layout: layout) : nil,
            transition: transition)
    }

    private func photoPanelInteraction(layout: PhotoViewerLayout) -> PhotoPanelInteraction {
        PhotoPanelInteraction(expanded: infoExpanded, enabled: spatial.content == nil && !spatial.loading,
            changed: { sample in
                let translation = sample.vertical
                let unclaimed = motion.gesture.owner == nil
                guard let route = motion.gesture.claim(expanded: infoExpanded || transition?.hasInformationMotion == true, vertical: translation,
                    velocity: Double(sample.velocity.y), returning: transition?.phase == .settling) else { return }
                if unclaimed { PhotoPreviewDiagnostics.event("gesture \(String(describing: route))") }
                if route == .information, let transition {
                    if !transition.isInformationDragging { metadataTask?.cancel() }
                    if preparedPhotoID != photo?.id { preparedPhotoID = photo?.id }
                    if transition.dragInformation(sample, layout: layout) { return }
                }
                if route == .dismissal, let transition {
                    if !transition.isDragging { metadataTask?.cancel() }
                    if transition.drag(sample) { return }
                }
                if !motion.values.dragging { metadataTask?.cancel() }
                if route == .dismissal { motion.update(infoDrag: 0, dismissDrag: translation) }
                else {
                    if preparedPhotoID != photo?.id { preparedPhotoID = photo?.id }
                    motion.update(infoDrag: -translation, dismissDrag: 0)
                }
            },
            ended: { sample in
                if let transition, transition.isInformationDragging {
                    infoExpanded = transition.endInformation(sample); motion.reset(); scheduleMetadataActivity(); return
                }
                if let transition, transition.isDragging { transition.endDrag(sample); motion.reset(); scheduleMetadataActivity(); return }
                let translation = sample.vertical, predicted = sample.predictedVertical
                if motion.gesture.owner != .information && PhotoPanelPanPolicy.shouldDismiss(expanded: infoExpanded, translation: translation, predictedTranslation: predicted) {
                    spatial.stop()
                    close()
                } else {
                    let destination = layout.destination(expanded: infoExpanded, translation: translation, predictedTranslation: predicted)
                    let changesState = destination != infoExpanded
                    withAnimation(panelAnimation) {
                        infoExpanded = destination; motion.reset()
                    }
                    if !changesState { scheduleMetadataActivity() }
                }
            }, cancelled: {
                if let transition, transition.isInformationDragging { infoExpanded = transition.endInformation(nil, cancelled: true) }
                transition?.cancelDrag()
                withAnimation(panelAnimation) { motion.reset() }
                scheduleMetadataActivity()
            }, currentZoomScale: { transition?.currentZoomScale ?? 1 })
    }

    private var panelAnimation: Animation? {
        reduceMotion ? nil : .spring(response: PhotoTransitionTuning.panelSpringResponse,
            dampingFraction: PhotoTransitionTuning.panelSpringDamping)
    }

    private func close() {
        spatial.stop()
        if let transition { transition.close() } else { dismiss() }
    }

    private func updateSceneActivity(active: Bool) {
        if active {
            prepareSpatial()
            scheduleMetadataActivity()
        } else {
            transition?.cancelDrag()
            metadataTask?.cancel()
            liveMapPhotoID = nil
            spatial.stop()
        }
    }

    private func scheduleMetadataActivity() {
        metadataTask?.cancel()
        let expectedID = photo?.id
        let activate = infoExpanded && isSceneActive
        let targetID = activate ? expectedID : nil
        guard liveMapPhotoID != targetID else { return }
        // Leave a quiet interval after the closing spring before updating WebKit.
        let delay = activate ? 0.45 : PhotoTransitionTuning.panelSettleDuration + 0.20
        metadataTask = Task { @MainActor in
            do { try await Task.sleep(for: .seconds(delay)) } catch { return }
            guard !Task.isCancelled, photo?.id == expectedID, (infoExpanded && isSceneActive) == activate else { return }
            liveMapPhotoID = targetID
        }
    }

    @ViewBuilder private var spatialStatus: some View {
        if spatial.loading {
            ProgressView().frame(width: 36, height: 36).background(.thinMaterial, in: Circle())
        } else if !spatial.message.isEmpty {
            Text(spatial.message).font(.caption).multilineTextAlignment(.trailing).frame(maxWidth: 230)
                .padding(10).background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private var selectedIndex: Int { visiblePhotos.firstIndex { $0.id == selectedID } ?? 0 }

    private func movePhoto(_ offset: Int) {
        let next = selectedIndex + offset
        if visiblePhotos.indices.contains(next) { selectedID = visiblePhotos[next].id }
    }

    private func prepareSpatial() {
        spatial.select(photo?.id, client: store.spatialClient, prefetch: !reduceMotion && isSceneActive && !infoExpanded)
    }

    private func moreActions(_ photo: Photo) -> some View {
        let like = store.likeState(for: photo)
        return Menu {
            if infoExpanded { Button("收起照片信息", systemImage: "chevron.down") { infoExpanded = false } }
            Button { store.toggleLike(photo) } label: {
                Label("\(like.liked ? "取消点赞" : "点赞") · \(like.count)",
                    systemImage: like.liked ? "heart.fill" : "heart")
            }.disabled(store.isUpdatingLike(photo))
            Button { store.toggleFavorite(photo) } label: {
                Label(store.favorites.contains(photo.id) ? "取消收藏" : "收藏",
                    systemImage: store.favorites.contains(photo.id) ? "bookmark.fill" : "bookmark")
            }
            if let url = store.config?.mediaURL(GalleryCatalogEngine.media(photo, detail: true).original) {
                ShareLink(item: url, subject: Text(photo.displayTitle)) { Label("分享原图链接", systemImage: "square.and.arrow.up") }
            }
            Button { Task { await save(photo) } } label: {
                Label(saving ? "正在保存…" : "保存原图到相册", systemImage: "arrow.down.to.line")
            }.disabled(saving)
            Divider()
            Button {
                infoExpanded = false
                spatial.toggle(photo: photo, config: store.config, client: store.spatialClient)
            } label: {
                Label(spatial.loading ? "取消加载" : spatial.content != nil ? "关闭空间场景" : "空间场景", systemImage: "square.3.layers.3d")
            }.disabled(reduceMotion)
            if spatial.content != nil {
                Button(spatial.tiltEnabled ? "关闭倾斜控制" : "开启倾斜控制", systemImage: "iphone.radiowaves.left.and.right") { spatial.tiltEnabled.toggle() }
                Button("重新校准", systemImage: "scope") { spatial.recenter() }
                Button("上一张", systemImage: "chevron.left") { movePhoto(-1) }.disabled(selectedIndex <= 0)
                Button("下一张", systemImage: "chevron.right") { movePhoto(1) }.disabled(selectedIndex >= visiblePhotos.count - 1)
            }
        } label: { Image(systemName: "ellipsis").font(.system(size: 16, weight: .medium)).frame(width: 44, height: 44) }
            .accessibilityLabel("更多照片操作")
    }
    private func isNearSelection(_ id: String) -> Bool {
        guard let current = visiblePhotos.firstIndex(where: { $0.id == selectedID }),
              let index = visiblePhotos.firstIndex(where: { $0.id == id }) else { return false }
        return abs(current - index) <= 1
    }

    private func save(_ photo: Photo) async {
        guard !saving, let url = store.config?.mediaURL(GalleryCatalogEngine.media(photo, detail: true).original) else { return }
        saving = true
        defer { saving = false }
        do {
            let permission = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
            guard permission == .authorized || permission == .limited else {
                throw ClientError.message("请在系统设置中允许见远方添加照片。")
            }
            // Download to disk instead of decoding a potentially 100 MB original into memory.
            let (temporary, response) = try await URLSession.shared.download(from: url)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                throw ClientError.message("原图下载失败，请稍后重试。")
            }
            defer { try? FileManager.default.removeItem(at: temporary) }
            try await PHPhotoLibrary.shared().performChanges {
                let request = PHAssetCreationRequest.forAsset()
                let options = PHAssetResourceCreationOptions()
                options.originalFilename = url.lastPathComponent
                request.addResource(with: .photo, fileURL: temporary, options: options)
            }
            saveMessage = "原图已保存到相册。"
        } catch { saveMessage = error.localizedDescription }
    }
}

