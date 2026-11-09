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
                    ExploreView(selectedTab: $selectedTab, showsFloatingControls: !keyboardVisible,
                        preloading: !hasOpenedExplore)
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
            let current = store.filter
            let pages = swipe.map { [current, $0.filter] } ?? [current]
            let edge = swipe.map { CGFloat($0.direction.rawValue) * (layoutDirection == .rightToLeft ? -1 : 1) } ?? 0
            ZStack {
                ForEach(pages, id: \.self) { filter in
                    let isCurrent = filter == current
                    let theme: GalleryAppearance = !favoritesOnly && filter == .film ? .dark : .paper
                    let photos = isCurrent ? currentPhotos : store.displayed(location: location.location, filter: filter)
                    photoList(filter: filter, photos: photos, isCurrent: isCurrent, width: width, topInset: topInset)
                        .environment(\.galleryAppearance, theme)
                        .foregroundStyle(theme.ink)
                        .background { if theme != activeTheme { theme.background } }
                        .frame(width: width, height: geometry.size.height)
                        .offset(x: isCurrent ? 0 : edge * width)
                        .transition(.identity)
                        .allowsHitTesting(isCurrent && swipe?.settling != true)
                        .accessibilityHidden(!isCurrent)
                }
            }
            // One offset keeps the two page edges together during the drag and settle.
            .modifier(GalleryPageOffset(motion: pageMotion, width: width, edge: edge))
            .clipped()
            .onChange(of: width) { _, _ in resetSwipe() }
        }
    }

    private func photoList(filter: GalleryFilter, photos: [Photo], isCurrent: Bool, width: CGFloat, topInset: CGFloat) -> some View {
        let filmMode = !favoritesOnly && filter == .film
        let limit = isCurrent ? displayedCount : 12
        return ScrollView(.vertical, showsIndicators: true) {
            VStack(alignment: .leading, spacing: 18) {
                if searchVisible { searchField(active: isCurrent) }
                if let error = store.error {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("暂时无法更新作品", systemImage: "wifi.exclamationmark").font(.headline)
                        Text(error).font(.caption).foregroundStyle(.secondary)
                        Button("重新加载") { Task { await store.refresh() } }.buttonStyle(.bordered)
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
                                previewsDevelopment: filmMode && !isCurrent) {
                                guard isCurrent, swipe == nil, selectedTab.wrappedValue == AppSection.gallery.rawValue else { return }
                                selected = PhotoSelection(id: photo.id, photos: photos)
                            }.onAppear { if isCurrent && index == displayedCount - 1 && displayedCount < photos.count { displayedCount += 12 } }
                        }
                    }
                    Text("已显示 \(min(limit, photos.count)) / \(photos.count) 张作品").font(.caption).foregroundStyle(.secondary)
                    if limit < photos.count { Button("加载更多") { displayedCount += 12 } }
                }
            }
            .padding(.horizontal, 20).padding(.top, favoritesOnly ? 12 : 2)
            .background {
                if isCurrent {
                    swipeGesture(width: width)
                        .frame(width: 0, height: 0)
                }
            }
        }
        .defaultScrollAnchor(.top)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .scrollBounceBehavior(.always, axes: .vertical)
        .contentMargins(.top, topInset, for: .scrollContent)
        .contentMargins(.top, topInset, for: .scrollIndicators)
        .contentMargins(.bottom, CGFloat(BottomNavigationMetrics.contentClearance), for: .scrollContent)
    }

    private func swipeGesture(width: CGFloat) -> HorizontalScrollSwipe {
        HorizontalScrollSwipe(
            canSwipe: { swipeDestination($0) != nil },
            onSwipe: { direction in
                guard let filter = swipeDestination(direction) else { return }
                UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.6)
                if swipe != nil { finishSwipe(commit: true, width: width) }
                else { selectFilter(filter) }
            },
            onDrag: reduceMotion ? nil : { direction, translation in trackSwipe(direction, translation: translation) },
            onCancel: { finishSwipe(commit: false, width: width) },
            onPullRefresh: {
                guard selectedTab.wrappedValue == AppSection.gallery.rawValue, swipe == nil else { return }
                Task { await store.refresh(feedback: .pull) }
            })
    }

    private func swipeDestination(_ direction: HorizontalScrollSwipe.Direction) -> GalleryFilter? {
        guard !favoritesOnly, selectedTab.wrappedValue == AppSection.gallery.rawValue, selected == nil, !searchFocused,
              swipe?.settling != true else { return nil }
        let filters = GalleryFilter.allCases
        guard let current = filters.firstIndex(of: store.filter) else { return nil }
        let next = current + direction.rawValue
        return filters.indices.contains(next) ? filters[next] : nil
    }

    private func trackSwipe(_ direction: HorizontalScrollSwipe.Direction, translation: CGFloat) {
        if swipe == nil {
            guard let filter = swipeDestination(direction) else { return }
            if filter == .random { store.reshuffle() }
            swipe = GalleryPageSwipe(filter: filter, direction: direction)
        }
        if swipe?.settling == false { pageMotion.update(translation) }
    }

    private func finishSwipe(commit: Bool, width: CGFloat) {
        guard let pending = swipe, !pending.settling else { return }
        let edge = CGFloat(pending.direction.rawValue) * (layoutDirection == .rightToLeft ? -1 : 1)
        swipe?.settling = true
        withAnimation(.easeOut(duration: 0.23), completionCriteria: .removed) {
            pageMotion.update(commit ? -edge * width : 0)
        } completion: {
            guard swipe?.id == pending.id else { return }
            var transaction = Transaction(animation: nil)
            transaction.disablesAnimations = true
            withTransaction(transaction) {
                if commit { selectFilter(pending.filter, randomPrepared: true) }
                else { resetSwipe() }
            }
        }
    }

    private func resetSwipe() {
        swipe = nil
        pageMotion.update(0)
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
            } else {
                Text(store.search.isEmpty ? "搜索地点、相机、胶卷…" : store.search)
                    .foregroundStyle(store.search.isEmpty ? .secondary : .primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if !store.search.isEmpty {
                Button { store.search = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                    .accessibilityLabel("清空搜索")
            }
        }.padding(12).background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

}

private struct GalleryPageSwipe {
    let id = UUID()
    let filter: GalleryFilter
    let direction: HorizontalScrollSwipe.Direction
    var settling = false
}

@MainActor private final class GalleryPageMotion: ObservableObject {
    @Published private(set) var translation: CGFloat = 0

    func update(_ value: CGFloat) {
        if translation != value { translation = value }
    }
}

private struct GalleryPageOffset: ViewModifier {
    @ObservedObject var motion: GalleryPageMotion
    let width: CGFloat
    let edge: CGFloat

    func body(content: Content) -> some View {
        let travel = min(width, max(0, -edge * motion.translation))
        content.offset(x: -edge * travel)
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
