import SwiftUI

enum Palette {
    static let paper = Color(red: 0.97, green: 0.96, blue: 0.93)
    static let ink = Color(red: 0.14, green: 0.15, blue: 0.14)
    static let accent = Color(red: 0.58, green: 0.31, blue: 0.19)
}

@main
struct Pic4PickApp: App {
    @StateObject private var store = GalleryStore()
    @StateObject private var location = LocationStore()
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            RootView()
                .background { AppRefreshPreference().allowsHitTesting(false).accessibilityHidden(true) }
                .environmentObject(store).environmentObject(location)
                .task(id: phase) {
                    guard phase == .active else { return }
                    await store.refreshOnForeground()
                    while !Task.isCancelled {
                        try? await Task.sleep(for: .seconds(60))
                        guard !Task.isCancelled else { return }
                        await store.refresh()
                    }
                }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var store: GalleryStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var selectedTab = 0
    @State private var keyboardVisible = false
    @State private var hasMountedExplore = false
    @State private var hasOpenedExplore = false
    @State private var skipExplorePreload = false
    private var theme: GalleryAppearance { selectedTab == 0 && store.filter == .film ? .dark : .paper }
    private var canPreloadExplore: Bool {
        scenePhase == .active && !store.loading && !keyboardVisible && !hasMountedExplore && !skipExplorePreload
    }
    private var navigationSelection: Binding<Int> {
        Binding(get: { selectedTab }, set: { destination in
            if destination == AppSection.explore.rawValue {
                hasMountedExplore = true
                hasOpenedExplore = true
            }
            selectedTab = destination
        })
    }
    var body: some View {
        ZStack {
            GalleryView(selectedTab: $selectedTab)
                .modifier(AppPageLayer(active: selectedTab == AppSection.gallery.rawValue))
            Group {
                if hasMountedExplore {
                    ExploreView(selectedTab: $selectedTab, preloading: !hasOpenedExplore)
                } else { Color.clear }
            }
            .modifier(AppPageLayer(active: selectedTab == AppSection.explore.rawValue, fades: true))
        }
        .background(theme.background.ignoresSafeArea())
        .overlay(alignment: .bottom) {
            if !keyboardVisible {
                FloatingBottomNavigation(selectedTab: navigationSelection)
                    .padding(.bottom, CGFloat(BottomNavigationMetrics.bottomPadding))
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in keyboardVisible = true }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in keyboardVisible = false }
        .task(id: canPreloadExplore) {
            guard canPreloadExplore else { return }
            try? await Task.sleep(for: .seconds(1))
            let power = ProcessInfo.processInfo
            guard !Task.isCancelled, canPreloadExplore, !power.isLowPowerModeEnabled,
                  power.thermalState != .serious, power.thermalState != .critical else { return }
            hasMountedExplore = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)) { _ in
            WebsiteMap.clearCachedPhotoMap()
            if !hasOpenedExplore {
                skipExplorePreload = true
                hasMountedExplore = false
            }
        }
        .environment(\.galleryAppearance, theme).tint(theme.accent).preferredColorScheme(theme == .dark ? .dark : .light)
        .alert("提示", isPresented: Binding(get: { store.notice != nil }, set: { if !$0 { store.notice = nil } })) {
            Button("好", role: .cancel) { store.notice = nil }
        } message: { Text(store.notice ?? "") }
    }
}

@MainActor struct PhotoSelection: Identifiable {
    let id: String
    let presentationID = UUID()
    let photos: [Photo]
    let source: PhotoTransitionSource.Entry?
    init(id: String, photos: [Photo]) {
        self.id = id; self.photos = photos
        source = PhotoTransitionSource.shared.consume(id: id)
    }
}

struct GalleryView: View {
    var selectedTab: Binding<Int> = .constant(0)
    @EnvironmentObject private var store: GalleryStore
    @EnvironmentObject private var location: LocationStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.layoutDirection) private var layoutDirection
    @State private var displayedCount = 12
    @State private var headerHeight: CGFloat = 128
    @State private var developmentID = UUID()
    @State private var showingSearch = false
    @FocusState private var searchFocused: Bool
    var favoritesOnly = false
    @State private var selected: PhotoSelection?
    @State private var sourceScope = UUID()
    @State private var swipe: GalleryPageSwipe?
    @State private var pageMotion = GalleryPageMotion()
    private var photos: [Photo] { store.displayed(favoritesOnly: favoritesOnly, location: location.location) }
    private var filmMode: Bool { !favoritesOnly && store.filter == .film }
    private var searchVisible: Bool { showingSearch || !store.search.isEmpty }
    private var activeTheme: GalleryAppearance { filmMode ? .dark : .paper }

    var body: some View {
        let photos = photos
        NavigationStack {
            GeometryReader { geometry in
                galleryViewport(photos: photos, topSafeArea: geometry.safeAreaInsets.top)
            }
            .background { GalleryBackdrop(photo: photos.first, film: filmMode) }
            .navigationTitle(favoritesOnly ? "我的收藏" : "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(favoritesOnly ? .visible : .hidden, for: .navigationBar)
            .toolbarBackground(favoritesOnly ? .automatic : .hidden, for: .navigationBar)
            .toolbar {
                if favoritesOnly {
                    Button(action: toggleSearch) {
                        Image(systemName: searchVisible ? "xmark" : "magnifyingglass")
                    }.accessibilityLabel(searchVisible ? "关闭搜索" : "搜索作品")
                }
            }
            .onChange(of: store.search) { _, _ in displayedCount = 12 }
            .onChange(of: reduceMotion) { _, _ in resetSwipe() }
            .onChange(of: searchFocused) { _, focused in if focused { resetSwipe() } }
            .onChange(of: selectedTab.wrappedValue) { _, tab in
                // Do not carry a photo presentation into another tab if a tap
                // was already queued when the navigation button was released.
                if tab != AppSection.gallery.rawValue { selected = nil; resetSwipe() }
            }
            .photoPreview(item: $selected)
        }
        .environment(\.galleryAppearance, activeTheme)
        .environment(\.photoSourceScope, sourceScope)
        .tint(activeTheme.accent)
        .foregroundStyle(activeTheme.ink)
    }

    private func galleryViewport(photos: [Photo], topSafeArea: CGFloat) -> some View {
        let topInset = favoritesOnly ? 0 : headerHeight
        return photoPages(currentPhotos: photos, topInset: topInset)
            .overlay(alignment: .bottom) {
                if !favoritesOnly && !searchFocused {
                    GalleryScrollEdgeBlur(edge: .bottom).frame(height: 54)
                }
            }
            .ignoresSafeArea(.container, edges: favoritesOnly ? [] : .bottom)
            .overlay(alignment: .top) {
                if !favoritesOnly {
                    let capsuleBottom = topSafeArea + max(0, headerHeight - GalleryPageHeader.bottomPadding)
                    let fadeHeight = searchVisible ? GalleryPageHeader.bottomPadding : 32
                    let height = capsuleBottom + fadeHeight
                    // Cover the entire category capsule before starting the fade.
                    GalleryScrollEdgeBlur(edge: .top, fullStrengthFraction: capsuleBottom / height)
                        .frame(height: height)
                        .offset(y: -topSafeArea)
                }
            }
            .overlay(alignment: .top) { GalleryRefreshOverlay().padding(.top, topInset) }
            .overlay(alignment: .top) {
                if !favoritesOnly {
                    GalleryPageHeader(showsFilters: true,
                        searchVisible: searchVisible, onSearch: toggleSearch,
                        onShuffle: store.filter == .random ? { store.reshuffle() } : nil,
                        onSelectFilter: { selectFilter($0) })
                        .onGeometryChange(for: CGFloat.self, of: { $0.size.height }) { height in
                            if height > 0 { headerHeight = height }
                        }
                        .contentShape(Rectangle())
                        .onTapGesture { }
                }
            }
    }

    private func photoPages(currentPhotos: [Photo], topInset: CGFloat) -> some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let filters = GalleryFilter.allCases
            let current = filters.firstIndex(of: store.filter) ?? 0
            let pages = swipe?.layout.pages ?? (current...current)
            let signedWidth = width * (layoutDirection == .rightToLeft ? -1 : 1)
            ZStack {
                ForEach(pages, id: \.self) { index in
                    let filter = filters[index]
                    let isCurrent = index == current
                    let theme: GalleryAppearance = !favoritesOnly && filter == .film ? .dark : .paper
                    let photos = isCurrent ? currentPhotos : store.displayed(location: location.location, filter: filter)
                    photoList(filter: filter, photos: photos, isCurrent: isCurrent, width: width, topInset: topInset)
                        .environment(\.galleryAppearance, theme)
                        .foregroundStyle(theme.ink)
                        .background { if theme != activeTheme { theme.background } }
                        .frame(width: width, height: geometry.size.height)
                        .offset(x: CGFloat(index - current) * signedWidth)
                        .transition(.identity)
                        .accessibilityHidden(!isCurrent || swipe != nil)
                }
            }
            // One offset keeps the two page edges together during the drag and settle.
            .modifier(GalleryPageOffset(motion: pageMotion, signedWidth: signedWidth, current: current, moving: swipe != nil))
            .clipped()
            .onChange(of: width) { _, _ in resetSwipe() }
        }
    }

    private func photoList(filter: GalleryFilter, photos: [Photo], isCurrent: Bool, width: CGFloat, topInset: CGFloat) -> some View {
        let filmMode = !favoritesOnly && filter == .film
        let limit = isCurrent ? displayedCount : 12
        let canInteract = isCurrent && swipe == nil
        return ScrollView(.vertical, showsIndicators: true) {
            VStack(alignment: .leading, spacing: 18) {
                if searchVisible { searchField(active: isCurrent) }
                if let error = store.error {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("暂时无法更新作品", systemImage: "wifi.exclamationmark").font(.headline)
                        Text(error).font(.caption).foregroundStyle(.secondary)
                        Button("重新加载") {
                            guard canInteract else { return }
                            Task { await store.refresh() }
                        }.buttonStyle(.bordered)
                    }.padding().frame(maxWidth: .infinity, alignment: .leading).background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
                }
                if !favoritesOnly && [.nearby, .far].contains(filter), location.location == nil {
                    Text(location.message ?? "正在定位；暂按时间排列。")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if photos.isEmpty {
                    if store.loading { Color.clear.frame(height: 220) }
                    else {
                        ContentUnavailableView(favoritesOnly ? "把喜欢的光留下" : "这里还没有作品",
                            systemImage: favoritesOnly ? "bookmark" : "photo.on.rectangle.angled",
                            description: Text(favoritesOnly ? "在照片详情中点按书签，作品会保存在这里。" : "试试其他分类、清空搜索，或下拉刷新。"))
                    }
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), spacing: 14)], alignment: .leading, spacing: 22) {
                        ForEach(Array(photos.prefix(limit).enumerated()), id: \.element.id) { index, photo in
                            GalleryTile(photo: photo, filmMode: filmMode, developmentID: isCurrent ? developmentID : nil,
                                canInteract: canInteract) {
                                guard canInteract, selectedTab.wrappedValue == AppSection.gallery.rawValue else { return }
                                selected = PhotoSelection(id: photo.id, photos: photos)
                            }.onAppear { if isCurrent && index == displayedCount - 1 && displayedCount < photos.count { displayedCount += 12 } }
                        }
                    }
                    Text("已显示 \(min(limit, photos.count)) / \(photos.count) 张作品").font(.caption).foregroundStyle(.secondary)
                    if limit < photos.count {
                        Button("加载更多") { if canInteract { displayedCount += 12 } }
                    }
                }
            }
            .padding(.horizontal, 20).padding(.top, favoritesOnly ? 12 : 2)
            .background {
                swipeGesture(width: width, source: filter)
                    .frame(width: 0, height: 0)
            }
        }
        .defaultScrollAnchor(.top)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .contentShape(Rectangle())
        .scrollBounceBehavior(.always, axes: .vertical)
        .contentMargins(.top, topInset, for: .scrollContent)
        .contentMargins(.top, topInset, for: .scrollIndicators)
        .contentMargins(.bottom, CGFloat(BottomNavigationMetrics.contentClearance), for: .scrollContent)
    }

    private func swipeGesture(width: CGFloat, source: GalleryFilter) -> HorizontalScrollSwipe {
        HorizontalScrollSwipe(
            canSwipe: { swipeDestination($0) != nil },
            onSwipe: { direction in
                guard let destination = swipeDestination(direction) else { return }
                UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.6)
                selectFilter(GalleryFilter.allCases[destination])
            },
            onDrag: reduceMotion ? nil : { direction, event in trackSwipe(direction, event: event, width: width, source: source) },
            onPullRefresh: {
                guard selectedTab.wrappedValue == AppSection.gallery.rawValue, swipe == nil, source == store.filter else { return }
                Task { await store.refresh(feedback: .pull) }
            })
    }

    private var swipeOrigin: Int { swipe?.landing ?? GalleryFilter.allCases.firstIndex(of: store.filter) ?? 0 }

    private func swipeDestination(_ direction: HorizontalScrollSwipe.Direction) -> Int? {
        guard !favoritesOnly, selectedTab.wrappedValue == AppSection.gallery.rawValue, selected == nil, !searchFocused,
              swipe == nil || swipe?.landing != nil else { return nil }
        return GallerySwipeLayout.destination(from: swipeOrigin, step: direction.rawValue, count: GalleryFilter.allCases.count)
    }

    private func trackSwipe(_ direction: HorizontalScrollSwipe.Direction, event: HorizontalScrollSwipe.DragEvent,
                            width: CGFloat, source: GalleryFilter) {
        guard width > 0 else { return }
        let signedWidth = Double(width) * (layoutDirection == .rightToLeft ? -1 : 1)
        if case let .began(translation) = event {
            guard let destination = swipeDestination(direction) else { return }
            let origin = swipeOrigin
            let interrupted = swipe != nil
            let layout = GallerySwipeLayout(origin: origin, destination: destination,
                startPosition: interrupted ? pageMotion.position : Double(origin),
                startTranslation: interrupted ? Double(translation) : 0)
            if GalleryFilter.allCases[destination] == .random, store.filter != .random,
               swipe?.layout.pages.contains(destination) != true { store.reshuffle() }
            pageMotion.stop()
            pageMotion.move(to: layout.position(translation: Double(translation), signedWidth: signedWidth))
            swipe = GalleryPageSwipe(layout: layout, source: source)
            return
        }
        guard let swipe, swipe.source == source, swipe.landing == nil else { return }
        switch event {
        case let .changed(translation):
            pageMotion.move(to: swipe.layout.position(translation: Double(translation), signedWidth: signedWidth))
        case let .ended(translation, velocity, commit, screen):
            pageMotion.move(to: swipe.layout.position(translation: Double(translation), signedWidth: signedWidth))
            if commit { UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.6) }
            finishSwipe(swipe, commit: commit, velocity: -Double(velocity) / signedWidth, screen: screen)
        case let .cancelled(screen):
            finishSwipe(swipe, commit: false, velocity: 0, screen: screen)
        case .began: break
        }
    }

    private func finishSwipe(_ pending: GalleryPageSwipe, commit: Bool, velocity: Double, screen: UIScreen?) {
        let landing = commit ? pending.layout.destination : pending.layout.origin
        swipe?.landing = landing
        pageMotion.settle(at: landing, velocity: velocity, pages: pending.layout.pages, screen: screen) {
            var transaction = Transaction(animation: nil)
            transaction.disablesAnimations = true
            withTransaction(transaction) {
                let filter = GalleryFilter.allCases[landing]
                if filter != store.filter { selectFilter(filter, randomPrepared: true) }
                else { resetSwipe() }
            }
        }
    }

    private func resetSwipe() {
        pageMotion.stop()
        swipe = nil
    }

    private func selectFilter(_ filter: GalleryFilter, randomPrepared: Bool = false) {
        resetSwipe()
        if store.filter != filter {
            displayedCount = 12
            developmentID = UUID()
        }
        store.filter = filter
        if filter == .random && !randomPrepared { store.reshuffle() }
        if filter == .nearby || filter == .far { location.request() }
    }

    private func toggleSearch() {
        showingSearch = !searchVisible
        if !showingSearch { store.search = "" }
        searchFocused = showingSearch
    }

    private func searchField(active: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            if active {
                TextField("搜索地点、相机、胶卷…", text: $store.search)
                    .focused($searchFocused).submitLabel(.search).autocorrectionDisabled()
                    .allowsHitTesting(swipe == nil)
            } else {
                Text(store.search.isEmpty ? "搜索地点、相机、胶卷…" : store.search)
                    .foregroundStyle(store.search.isEmpty ? .secondary : .primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if !store.search.isEmpty {
                Button { if active && swipe == nil { store.search = "" } } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                }
                    .accessibilityLabel("清空搜索")
            }
        }.padding(12).background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

}

private struct GalleryPageSwipe {
    let layout: GallerySwipeLayout
    let source: GalleryFilter
    var landing: Int?
}

@MainActor private final class GalleryPageMotion: ObservableObject {
    @Published private(set) var position = 0.0
    private var link: CADisplayLink?
    private var frame: ((CFTimeInterval) -> Void)?

    @MainActor private final class ClockTarget: NSObject {
        weak var motion: GalleryPageMotion?
        init(_ motion: GalleryPageMotion) { self.motion = motion }
        @objc func tick(_ link: CADisplayLink) {
            guard let motion else { link.invalidate(); return }
            motion.frame?(link.targetTimestamp)
        }
    }

    func move(to value: Double) {
        if position != value { position = value }
    }

    func stop() {
        link?.invalidate()
        link = nil
        frame = nil
    }

    func settle(at index: Int, velocity: Double, pages: ClosedRange<Int>, screen: UIScreen?, completion: @escaping () -> Void) {
        stop()
        let from = position, target = Double(index)
        guard from != target else { completion(); return }
        let start = CACurrentMediaTime()
        let duration = min(0.30, 0.16 + abs(target - from) * 0.12)
        let speed = min(12, max(-12, velocity))
        frame = { [weak self] time in
            guard let self else { return }
            let elapsed = time - start
            let value = PhotoTransitionSpring.value(from: from, to: target, velocity: speed, time: elapsed, duration: duration)
            move(to: min(Double(pages.upperBound), max(Double(pages.lowerBound), value)))
            if elapsed >= duration { stop(); completion() }
        }
        let link = CADisplayLink(target: ClockTarget(self), selector: #selector(ClockTarget.tick(_:)))
        link.preferredFrameRateRange = DisplayRefreshPreference.range(for: screen)
        self.link = link
        link.add(to: .main, forMode: .common)
    }
}

private struct GalleryPageOffset: ViewModifier {
    @ObservedObject var motion: GalleryPageMotion
    let signedWidth: CGFloat
    let current: Int
    let moving: Bool

    func body(content: Content) -> some View {
        content.offset(x: moving ? -CGFloat(motion.position - Double(current)) * signedWidth : 0)
    }
}

struct PhotoCard: View {
    @EnvironmentObject private var store: GalleryStore
    let photo: Photo
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            PhotoImage(photo: photo, config: store.config)
                .background(Color.secondary.opacity(0.06))
                .accessibilityLabel(photo.displayTitle)
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(photo.displayTitle).font(.system(.title3, design: .serif)).foregroundStyle(.primary)
                    Text(photo.place.isEmpty ? photo.date : photo.place).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if photo.isFilm {
                    Text(photo.filmStock.isEmpty ? "FILM" : photo.filmStock)
                        .font(.system(size: 9, design: .monospaced)).foregroundStyle(Palette.accent).lineLimit(1)
                }
                if store.favorites.contains(photo.id) { Image(systemName: "bookmark.fill").font(.caption).foregroundStyle(Palette.accent) }
            }
        }.contentShape(Rectangle())
    }
}
