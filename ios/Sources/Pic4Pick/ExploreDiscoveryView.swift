import SwiftUI
import CoreText

struct ExploreView: View {
    var selectedTab: Binding<Int> = .constant(1)
    var showsFloatingControls = true
    var preloading = false
    @EnvironmentObject private var store: GalleryStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @State private var query = ""
    @State private var detent = ExplorePanelDetent.collapsed
    @State private var panelMotion = ExplorePanelMotion()
    @FocusState private var searching: Bool
    @State private var focus: [String: JSONValue] = ["id": .string("initial"), "initial": .bool(true)]
    @State private var mapFailed = false
    @State private var mapReady = false
    @State private var mapRetry = 0
    @State private var selectedCollection: DiscoveryCollection?

    private var cities: [ExplorePlace] {
        store.catalog.provinces.flatMap { cityPlaces(in: $0) }
    }

    private func cityPlaces(in province: ProvinceCollection) -> [ExplorePlace] {
        province.cities.map { city in
            ExplorePlace(id: "city-" + city.id, title: city.title, subtitle: province.title,
                latitude: city.latitude, longitude: city.longitude, photoIDs: city.photoIDs)
        }
    }
    private var locations: [ExplorePlace] {
        store.catalog.locations.map {
            ExplorePlace(id: "location-" + $0.id, title: $0.title, subtitle: $0.subtitle,
                latitude: $0.latitude, longitude: $0.longitude, photoIDs: $0.photoIDs)
        }
    }
    private var hasQuery: Bool { !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var isActive: Bool { selectedTab.wrappedValue == AppSection.explore.rawValue }
    private let panelShape = UnevenRoundedRectangle(topLeadingRadius: ExplorePanelLayout.cornerRadius,
        topTrailingRadius: ExplorePanelLayout.cornerRadius)
    private let inset = CGFloat(ExplorePanelLayout.horizontalInset)
    private static let titleFont: Font = {
        if let url = Bundle.module.url(forResource: "DiscoverySerif", withExtension: "otf"),
           CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil) {
            return .custom("Pic4PickDiscoverySerif-Semibold", size: 20, relativeTo: .title3)
        }
        return .system(size: 20, weight: .semibold, design: .serif)
    }()

    var body: some View {
        GeometryReader { geometry in
            let layout = ExplorePanelLayout(availableHeight: Double(geometry.size.height),
                topInset: Double(geometry.safeAreaInsets.top), bottomInset: Double(geometry.safeAreaInsets.bottom))
            let index = preloading ? nil : ExploreDiscoveryIndex(
                places: hasQuery ? cities + locations : cities, photos: store.photos)
            let featured = hasQuery ? [] : (index?.featured ?? [])
            let cardWidth = CGFloat(ExplorePanelLayout.cardWidth(for: Double(geometry.size.width)))
            Color.clear
            .allowsHitTesting(false)
            .background {
                // The sheet is an overlay, so its animated height never sizes the map viewport.
                GeometryReader { mapGeometry in
                    mapSurface(layout: layout, attributionTop: geometry.safeAreaInsets.top + 3)
                        .frame(width: mapGeometry.size.width, height: mapGeometry.size.height)
                }
                .ignoresSafeArea()
            }
            .overlay(alignment: .bottom) {
                if let index {
                    discoveryPanel(layout: layout, index: index, featured: featured, cardWidth: cardWidth)
                        .frame(height: CGFloat(layout.expanded))
                        .clipShape(panelShape)
                        .background {
                            panelShape.fill(.white)
                                .shadow(color: .black.opacity(0.06), radius: 14, y: -3)
                                .onTapGesture { }
                        }
                        .modifier(ExplorePanelOffset(motion: panelMotion, layout: layout, detent: detent))
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if showsFloatingControls && !featured.isEmpty {
                    mapMenu
                        .padding(.trailing, 13)
                        .padding(.bottom, geometry.safeAreaInsets.bottom + CGFloat(BottomNavigationMetrics.bottomPadding))
                }
            }
            .ignoresSafeArea(.container, edges: [.top, .bottom])
            .background(Color.hex(0xd7dcdf).ignoresSafeArea())
        }
        .foregroundStyle(Color.hex(0x202324))
        .environment(\.galleryAppearance, .paper)
        .onChange(of: preloading) { _, warming in
            if !warming && mapFailed { retryMap() }
        }
        .onChange(of: searching) { _, focused in if focused { setDetent(.expanded) } }
        .onChange(of: selectedTab.wrappedValue) { _, tab in
            if tab != AppSection.explore.rawValue { searching = false; selectedCollection = nil }
        }
        .sheet(item: $selectedCollection) { collection in
            NavigationStack {
                Group {
                    switch collection {
                    case .province(let province):
                        provinceCities(province)
                    case .place(let place):
                        CollectionPhotosView(title: place.title, subtitle: place.subtitle, photoIDs: place.photoIDs,
                            allowsSwipeBack: true)
                    }
                }
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("完成") { selectedCollection = nil } } }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private func mapSurface(layout: ExplorePanelLayout, attributionTop: Double) -> some View {
        let map = WebsiteMap(payload: .init(config: store.mapConfig, locations: store.catalog.locations, focus: focus,
            reduceMotion: reduceMotion, active: isActive || preloading,
            compactMarkers: true, requireConfiguredStyle: true),
            baseURL: URL(string: store.config?.websiteURL ?? "https://pic.rlzhao.com")!,
            panelClearance: layout.height(at: detent),
            attributionTop: attributionTop,
            onLocation: { id in
                if let place = locations.first(where: { $0.id == "location-" + id }) { open(place) }
            }, onStatus: { status in mapReady = status == "ready"; mapFailed = status == "failure" })
        return ExploreMapMotion(map: map, motion: panelMotion, layout: layout, detent: detent)
            .id(mapRetry)
            .overlay {
                if !preloading {
                    if mapFailed {
                        VStack(spacing: 12) {
                            Text("地图暂时无法加载").font(.subheadline)
                            Button("重新加载地图", action: retryMap)
                        }.padding(20).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                    } else if !mapReady { mapLoading }
                }
            }
    }

    private func retryMap() {
        mapFailed = false
        mapReady = false
        mapRetry += 1
    }

    private var mapLoading: some View {
        ProgressView().padding(16).background(.regularMaterial, in: Capsule())
    }

    private var mapMenu: some View {
        Menu {
            Button("查看全部拍摄地点", systemImage: "arrow.up.left.and.arrow.down.right") {
                focus = ["id": .string(UUID().uuidString), "all": .bool(true)]
            }
            Button("回到初始视角", systemImage: "map") {
                focus = ["id": .string(UUID().uuidString), "initial": .bool(true)]
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color.hex(0x384852).opacity(0.82))
                .frame(width: 30, height: 30)
                .background {
                    if reduceTransparency { Circle().fill(.white) }
                    else { Circle().fill(.thinMaterial) }
                }
                .overlay { Circle().strokeBorder(.white.opacity(0.70), lineWidth: 0.7) }
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("发现地图更多操作")
    }

    private func discoveryPanel(layout: ExplorePanelLayout, index: ExploreDiscoveryIndex, featured: [ExplorePlace], cardWidth: CGFloat) -> some View {
        VStack(spacing: 0) {
            Capsule().fill(Color.hex(0xbfc1c2)).frame(width: 36, height: 5)
                .padding(.top, 4)
                .frame(maxWidth: .infinity)
                .frame(height: CGFloat(ExplorePanelLayout.handleHeight), alignment: .top)
                .contentShape(Rectangle())
                .onTapGesture { setDetent(detent == .expanded ? .collapsed : detent.higher) }
                .accessibilityLabel("发现面板")
                .accessibilityValue(detent.accessibilityTitle)
                .accessibilityAdjustableAction { direction in
                    switch direction {
                    case .increment: setDetent(detent.higher)
                    case .decrement: setDetent(detent.lower)
                    @unknown default: break
                    }
                }

            HStack(spacing: 7) {
                Image(systemName: "magnifyingglass").font(.system(size: 15, weight: .medium))
                TextField("搜索地点", text: $query, prompt: Text("搜索地点").foregroundStyle(Color.hex(0xa4a6a7)))
                    .font(.system(size: 15)).frame(maxHeight: .infinity)
                    .focused($searching).autocorrectionDisabled().submitLabel(.search)
                    .onSubmit { searching = false }
                if !query.isEmpty {
                    Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                        .accessibilityLabel("清空地点搜索")
                }
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 20).frame(height: ExplorePanelLayout.searchRowHeight)
            .background {
                Capsule().strokeBorder(Color.hex(0xdfe1e2), lineWidth: 0.55)
                    .frame(height: CGFloat(ExplorePanelLayout.searchHeight))
            }
            .padding(.horizontal, inset)

            ScrollView {
                VStack(alignment: .leading, spacing: CGFloat(ExplorePanelLayout.titleToCards)) {
                    Text(hasQuery ? "搜索结果" : "精华选粹")
                        .font(Self.titleFont).foregroundStyle(.black)
                        .padding(.horizontal, inset)
                    if hasQuery {
                        placeRows(index.results(for: query), index: index)
                    } else {
                        if featured.isEmpty {
                            if store.loading { ProgressView("正在加载作品…").padding(.horizontal, 18) }
                            else { Text(store.error == nil ? "还没有可浏览的城市作品" : "作品暂时无法加载，请稍后重试")
                                .font(.subheadline).foregroundStyle(.secondary).padding(.horizontal, 18) }
                        } else {
                            ScrollView(.horizontal) {
                                LazyHStack(spacing: CGFloat(ExplorePanelLayout.cardSpacing)) {
                                    ForEach(Array(featured.prefix(12))) { place in
                                        if let photo = index.cover(for: place) {
                                            ExploreCollectionCard(place: place, photo: photo, width: cardWidth) { open(place) }
                                        }
                                    }
                                }.padding(.horizontal, inset)
                            }.frame(height: CGFloat(ExplorePanelLayout.cardHeight)).scrollIndicators(.hidden)
                            Text("省份作品集").font(.system(size: 21, weight: .semibold, design: .serif))
                                .padding(.horizontal, 18).padding(.top, 6)
                            provinceRows(index: index)
                        }
                    }
                }
                .padding(.top, CGFloat(hasQuery ? 12 : ExplorePanelLayout.searchToTitle))
                .padding(.bottom, CGFloat(BottomNavigationMetrics.contentClearance))
                .background {
                    PhotoPanelScrollBridge(interaction: .init(expanded: detent == .expanded, enabled: true,
                        changed: { panelMotion.update(-$0.vertical) },
                        ended: { sample in
                            let next = layout.destination(from: detent, translation: sample.vertical,
                                predictedTranslation: sample.predictedVertical)
                            settlePanel(at: next, layout: layout, velocity: Double(sample.velocity.y))
                        },
                        cancelled: { settlePanel(at: detent, layout: layout, velocity: 0) }),
                        active: selectedTab.wrappedValue == AppSection.explore.rawValue && selectedCollection == nil,
                        discoveryDetent: detent)
                        .frame(width: 0, height: 0)
                }
            }
            .scrollIndicators(.hidden).scrollDismissesKeyboard(.interactively)
        }
    }

    private func setDetent(_ next: ExplorePanelDetent) {
        applyDetent(next, animation: .easeInOut(duration: 0.25))
    }

    private func settlePanel(at next: ExplorePanelDetent, layout: ExplorePanelLayout, velocity: Double) {
        // Offset increases as the panel moves down.
        let distance = layout.height(at: detent, drag: panelMotion.drag) - layout.height(at: next)
        let stop = ExplorePanelStop(distance: distance, velocity: velocity)
        applyDetent(next, animation: .timingCurve(1.0 / 3, stop.firstControlY, 2.0 / 3, 1, duration: stop.duration))
    }

    private func applyDetent(_ next: ExplorePanelDetent, animation: Animation) {
        withAnimation(reduceMotion ? nil : animation) {
            if next != detent && next != .expanded { searching = false }
            panelMotion.update(0)
            detent = next
        }
    }

    private func provinceRows(index: ExploreDiscoveryIndex) -> some View {
        LazyVStack(spacing: 0) {
            ForEach(store.catalog.provinces) { province in
                if let cover = index.cover(for: province.cities.flatMap(\.photoIDs)) {
                    Button {
                        searching = false
                        selectedCollection = .province(province)
                    } label: {
                        collectionRow(title: province.title,
                            subtitle: "\(province.cities.count) 个城市 · \(province.totalCount) 张作品", cover: cover)
                    }.buttonStyle(.plain)
                }
            }
        }.padding(.horizontal, 18)
    }

    private func provinceCities(_ province: ProvinceCollection) -> some View {
        let index = ExploreDiscoveryIndex(places: cityPlaces(in: province), photos: store.photos)
        return ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(index.places) { city in
                    if let cover = index.cover(for: city) {
                        NavigationLink {
                            CollectionPhotosView(title: city.title, subtitle: city.subtitle, photoIDs: city.photoIDs,
                                allowsSwipeBack: true)
                                .onAppear { focusMap(on: city) }
                        } label: {
                            collectionRow(title: city.title, subtitle: "\(city.photoIDs.count) 张作品", cover: cover)
                        }.buttonStyle(.plain)
                    }
                }
            }.padding(.horizontal, 18)
                .background { DiscoveryCollectionBackSwipe().frame(width: 0, height: 0) }
        }
        .navigationTitle(province.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func placeRows(_ places: [ExplorePlace], index: ExploreDiscoveryIndex) -> some View {
        LazyVStack(spacing: 0) {
            ForEach(places) { place in
                Button { open(place) } label: {
                    collectionRow(title: place.title, subtitle: place.subtitle, cover: index.cover(for: place))
                }.buttonStyle(.plain)
            }
            if places.isEmpty {
                Text("没有找到相关地点").font(.subheadline).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 20)
            }
        }.padding(.horizontal, 18)
    }

    private func collectionRow(title: String, subtitle: String, cover: Photo?) -> some View {
        HStack(spacing: 12) {
            if let cover, let config = store.config {
                PhotoThumbnail(photo: cover, config: config)
            }
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.system(size: 16, weight: .medium))
                Text(subtitle).font(.system(size: 12)).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
        }.padding(.vertical, 10).contentShape(Rectangle())
    }

    private func open(_ place: ExplorePlace) {
        guard selectedTab.wrappedValue == AppSection.explore.rawValue else { return }
        searching = false
        focusMap(on: place)
        selectedCollection = .place(place)
    }

    private func focusMap(on place: ExplorePlace) {
        if place.hasCoordinate {
            focus = ["id": .string(UUID().uuidString), "latitude": .number(place.latitude!),
                "longitude": .number(place.longitude!), "zoom": .number(11)]
        }
    }
}

@MainActor private final class ExplorePanelMotion: ObservableObject {
    @Published private(set) var drag = 0.0

    func update(_ value: Double) {
        if drag != value { drag = value }
    }
}

private struct ExplorePanelOffset: ViewModifier {
    @ObservedObject var motion: ExplorePanelMotion
    let layout: ExplorePanelLayout
    let detent: ExplorePanelDetent

    func body(content: Content) -> some View {
        // Keep the list at a fixed size. Only its position follows the finger.
        let visibleHeight = layout.height(at: detent, drag: motion.drag)
        content.offset(y: CGFloat(layout.expanded - visibleHeight))
    }
}

private struct ExploreMapMotion: View {
    let map: WebsiteMap
    @ObservedObject var motion: ExplorePanelMotion
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let layout: ExplorePanelLayout
    let detent: ExplorePanelDetent

    var body: some View {
        ExploreMapParallax(map: map, offset: reduceMotion ? 0 : layout.mapOffset(at: detent, drag: motion.drag))
    }
}

private struct ExploreMapParallax: View, Animatable {
    let map: WebsiteMap
    nonisolated var offset: Double

    nonisolated var animatableData: Double {
        get { offset }
        set { offset = newValue }
    }

    var body: some View {
        var surface = map
        surface.panelParallax = offset
        return surface
    }
}

private enum DiscoveryCollection: Identifiable {
    case province(ProvinceCollection)
    case place(ExplorePlace)

    var id: String {
        switch self {
        case .province(let province): "province-" + province.id
        case .place(let place): place.id
        }
    }
}

private struct ExploreCollectionCard: View {
    let place: ExplorePlace
    let photo: Photo
    let width: CGFloat
    let onOpen: () -> Void
    @EnvironmentObject private var store: GalleryStore

    var body: some View {
        Button(action: onOpen) {
            Color.hex(0xe5e8e8).frame(width: width, height: CGFloat(ExplorePanelLayout.cardHeight))
                .overlay { PhotoImage(photo: photo, config: store.config, cardFill: true).contentShape(Rectangle()) }
                .overlay(alignment: .bottomLeading) {
                    LinearGradient(colors: [.clear, .black.opacity(0.65)], startPoint: .center, endPoint: .bottom)
                        .overlay(alignment: .bottomLeading) {
                            Text(place.title).font(.system(size: 18, weight: .semibold, design: .serif))
                                .foregroundStyle(.white).lineLimit(1).padding(14)
                        }.allowsHitTesting(false)
                }
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .contentShape(RoundedRectangle(cornerRadius: 18))
        }.buttonStyle(.plain).accessibilityLabel("浏览\(place.title)作品集")
    }
}
