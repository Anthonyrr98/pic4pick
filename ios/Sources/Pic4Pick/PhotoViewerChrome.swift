import SwiftUI

struct PhotoViewerBackdrop: View {
    private struct Backdrop: Identifiable {
        let id = UUID()
        let image: UIImage
    }

    private static let fadeDuration = 0.32
    let photo: Photo?
    @EnvironmentObject private var store: GalleryStore
    @Environment(\.galleryAppearance) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @State private var backdrops: [Backdrop] = []

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                theme.background
                if !reduceTransparency {
                    ForEach(Array(backdrops.enumerated()), id: \.element.id) { index, backdrop in
                        ZStack {
                            Image(uiImage: backdrop.image).resizable().scaledToFill()
                                .frame(width: geometry.size.width, height: geometry.size.height)
                                .clipped()
                            (theme == .dark ? Color.black : Color.white)
                                .opacity(theme == .dark ? PhotoViewerBackdropStyle.darkVeilOpacity : PhotoViewerBackdropStyle.lightVeilOpacity)
                        }
                        .compositingGroup()
                        .transition(.asymmetric(insertion: .opacity, removal: .identity))
                        .zIndex(Double(index + 1))
                    }
                }
            }
            .animation(reduceMotion ? nil : (backdrops.count > 1 ? .easeInOut(duration: Self.fadeDuration) : .easeOut(duration: 0.18)),
                value: backdrops.last?.id)
        }.ignoresSafeArea().allowsHitTesting(false).accessibilityHidden(true)
        .task(id: backdrops.last?.id) {
            guard backdrops.count > 1, let current = backdrops.last else { return }
            // Keep the last background underneath until the new layer is opaque.
            try? await Task.sleep(for: .seconds(Self.fadeDuration + 0.04))
            guard !Task.isCancelled, backdrops.last?.id == current.id else { return }
            backdrops = [current]
        }
        .task(id: reduceTransparency ? nil : photo?.id) {
            guard !reduceTransparency, let photo, let config = store.config else {
                backdrops = []
                return
            }
            let candidates = photo.thumbnailURL == photo.imageURL ? [photo.imageURL] : [photo.thumbnailURL, photo.imageURL]
            for url in candidates.compactMap({ config.mediaURL($0) }) {
                let loaded = try? await ImageCache.shared.viewerBackdrop(url)
                guard !Task.isCancelled else { return }
                if let loaded {
                    let backdrop = Backdrop(image: loaded)
                    if reduceMotion { backdrops = [backdrop] }
                    else { backdrops.append(backdrop) }
                    return
                }
            }
            if !Task.isCancelled { backdrops = [] }
        }
    }
}

private enum CompactInfoStyle {
    static let sheetTopGap: CGFloat = 10
    static let cornerRadius: CGFloat = 21
    static let materialOpacity = 0.90
    static let milkOpacity = 0.26
    static let darkMilkOpacity = 0.07
    static let edgeWidth: CGFloat = 2
    static let edgeDiffusion: CGFloat = 9
    static let navigationDrop = 6.0
}

private struct PhotoInfoScrollFrost: View {
    let edge: VerticalEdge
    @Environment(\.galleryAppearance) private var theme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        Group {
            if reduceTransparency { theme.background }
            else { Rectangle().fill(.thinMaterial) }
        }
        .mask {
            LinearGradient(stops: [
                .init(color: .white, location: 0),
                .init(color: .white.opacity(0.94), location: 0.34),
                .init(color: .white.opacity(0.58), location: 0.62),
                .init(color: .white.opacity(0.18), location: 0.85),
                .init(color: .clear, location: 1)
            ], startPoint: edge == .top ? .top : .bottom, endPoint: edge == .top ? .bottom : .top)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

struct PhotoViewerInfoPanel<Actions: View>: View {
    let photo: Photo
    @Binding var section: PhotoInfoSection
    @Binding var expanded: Bool
    let motion: PhotoViewerMotion
    let layout: PhotoViewerLayout
    let prepared: Bool
    let liveMap: Bool
    let interaction: PhotoPanelInteraction
    let session: PhotoPreviewSession?
    let actions: () -> Actions
    @EnvironmentObject private var store: GalleryStore
    @Environment(\.galleryAppearance) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @GestureState private var dragging = false
    @State private var handleCompleted = false
    @State private var scrollSpace = UUID()
    @State private var scrollRequest = 0
    @State private var automaticSectionUpdateAfter = ContinuousClock.now
    @Namespace private var sectionIndicator
    private var locationTitle: String {
        let city = photo.location.trimmingCharacters(in: .whitespacesAndNewlines)
        if !city.isEmpty { return city }
        let country = photo.country.trimmingCharacters(in: .whitespacesAndNewlines)
        return country.isEmpty ? "未记录地点" : country
    }

    init(photo: Photo, section: Binding<PhotoInfoSection>, expanded: Binding<Bool>, motion: PhotoViewerMotion,
        layout: PhotoViewerLayout, prepared: Bool, liveMap: Bool, interaction: PhotoPanelInteraction, session: PhotoPreviewSession? = nil,
        @ViewBuilder actions: @escaping () -> Actions) {
        self.photo = photo; _section = section; _expanded = expanded; self.motion = motion; self.layout = layout
        self.prepared = prepared; self.liveMap = liveMap; self.interaction = interaction; self.actions = actions
        self.session = session
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            if prepared {
                VStack(spacing: 0) {
                    handle(expanded: true).frame(height: CGFloat(layout.expandedHandleHeight))
                    ScrollViewReader { proxy in
                        ScrollView {
                            PhotoMetadataView(photo: photo, section: section, embedded: true, immersive: true,
                                active: liveMap, scrollSpaceID: scrollSpace)
                                .id(photo.id).padding(.bottom, CGFloat(70 + layout.safeBottom))
                                .background {
                                    if session == nil { PhotoPanelScrollBridge(interaction: interaction, active: expanded) }
                                }
                        }
                        .coordinateSpace(name: scrollSpace).scrollIndicators(.hidden)
                        .overlay(alignment: .top) {
                            PhotoInfoScrollFrost(edge: .top).frame(height: 76)
                        }
                        .onChange(of: scrollRequest, initial: true) { _, request in
                            guard expanded, request > 0 else { return }
                            withAnimation(sectionAnimation) {
                                proxy.scrollTo(section.rawValue, anchor: .top)
                            }
                        }
                        .onPreferenceChange(PhotoInfoSectionPositions.self) { positions in
                            guard expanded, ContinuousClock.now >= automaticSectionUpdateAfter,
                                  let top = positions["parameters"], let bottom = positions["parameters-bottom"] else { return }
                            let current = PhotoInfoSection.visible(parametersTop: Double(top), parametersBottom: Double(bottom),
                                viewport: layout.expandedPanel - layout.expandedHandleHeight)
                            if section != current {
                                section = current
                                PhotoPreviewDiagnostics.event("metadata section \(current.rawValue)")
                            }
                        }
                    }
                }
                .frame(height: CGFloat(layout.expandedPanel))
                .animation(nil, value: expanded)
                .modifier(PhotoViewerMovingLayer(motion: motion, layout: layout, expanded: expanded, role: .fullPanel))
                .allowsHitTesting(expanded).accessibilityHidden(!expanded)
            }

            VStack(spacing: 0) {
                handle(expanded: false).frame(height: 28)
                VStack(spacing: 0) {
                    Text(locationTitle)
                        .font(.system(size: 14, weight: .light))
                        .foregroundStyle(theme.ink.opacity(theme == .dark ? 0.67 : 0.49))
                        .lineLimit(1).minimumScaleFactor(0.75)
                        .frame(maxWidth: .infinity).frame(height: 46).padding(.horizontal, 16)
                        .padding(.top, 2)
                    Spacer(minLength: 0)
                    tabs(floating: false).padding(.leading, 74).padding(.trailing, -8)
                }
                .padding(.bottom, CGFloat(max(0, layout.safeBottom - CompactInfoStyle.navigationDrop)))
                .background {
                    let sheet = UnevenRoundedRectangle(topLeadingRadius: CompactInfoStyle.cornerRadius,
                        topTrailingRadius: CompactInfoStyle.cornerRadius, style: .circular)
                    Group {
                        if reduceTransparency { sheet.fill(theme.surface) }
                        else {
                            sheet.fill(.ultraThinMaterial).opacity(CompactInfoStyle.materialOpacity)
                                .overlay {
                                    CompactPhotoLocationMap(photo: photo, config: store.config,
                                        active: !expanded, session: session)
                                        .id(photo.id)
                                }
                                .overlay {
                                    sheet.fill(.white.opacity(theme == .dark ? CompactInfoStyle.darkMilkOpacity : CompactInfoStyle.milkOpacity))
                                }
                                .mask {
                                    sheet.fill(.white)
                                        .blur(radius: CompactInfoStyle.edgeDiffusion)
                                        .overlay {
                                            sheet.fill(LinearGradient(stops: [
                                                .init(color: .white, location: 0.16),
                                                .init(color: .clear, location: 0.56)
                                            ], startPoint: .top, endPoint: .bottom))
                                        }
                                        .mask {
                                            LinearGradient(stops: [
                                                .init(color: .white, location: 0.18),
                                                .init(color: .white.opacity(0.66), location: 0.55),
                                                .init(color: .white.opacity(0.12), location: 1)
                                            ], startPoint: .top, endPoint: .bottom)
                                        }
                                }
                        }
                    }
                    .overlay {
                        sheet.strokeBorder(
                            LinearGradient(stops: [
                                .init(color: .white.opacity(theme == .dark ? 0.45 : 0.91), location: 0),
                                .init(color: .white.opacity(theme == .dark ? 0.20 : 0.56), location: 0.13),
                                .init(color: .clear, location: 0.54)
                            ], startPoint: .top, endPoint: .bottom),
                            lineWidth: CompactInfoStyle.edgeWidth)
                    }
                    .padding(.bottom, -12)
                    .onTapGesture { }
                }
                .padding(.top, CompactInfoStyle.sheetTopGap)
            }
            .frame(height: CGFloat(layout.collapsedPanel)).padding(.horizontal, 22)
            .modifier(PhotoViewerMovingLayer(motion: motion, layout: layout, expanded: expanded, role: .compactPanel))
            .allowsHitTesting(!expanded).accessibilityHidden(expanded)

            tabs(floating: true)
                .padding(.leading, 92).padding(.trailing, 18)
                .padding(.bottom, CGFloat(max(8, layout.safeBottom - 4))).padding(.top, 20)
                .background(alignment: .bottom) {
                    PhotoInfoScrollFrost(edge: .bottom).frame(height: CGFloat(84 + layout.safeBottom))
                }
                .modifier(PhotoViewerMovingLayer(motion: motion, layout: layout, expanded: expanded, role: .footer))
                .allowsHitTesting(expanded).accessibilityHidden(!expanded)
        }
        // Anchor the compact panel even before the expanded content is mounted.
        .frame(height: CGFloat(layout.expandedPanel), alignment: .bottom)
        .animation(session == nil ? panelAnimation : nil, value: expanded)
        .onChange(of: dragging) { _, active in
            if active {
                handleCompleted = false
                UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.65)
            } else if !handleCompleted { interaction.cancelled() }
        }
    }

    private var panelAnimation: Animation? {
        reduceMotion ? nil : .spring(response: PhotoTransitionTuning.panelSpringResponse,
            dampingFraction: PhotoTransitionTuning.panelSpringDamping)
    }

    private var sectionAnimation: Animation? {
        reduceMotion ? nil : .easeInOut(duration: 0.28)
    }

    private func handle(expanded: Bool) -> some View {
        Image(systemName: expanded ? "chevron.compact.down" : "chevron.compact.up")
            .font(.system(size: expanded ? 28 : 34, weight: expanded ? .medium : .regular))
            .foregroundStyle(.white.opacity(expanded ? 0.8 : 0.64))
            .offset(y: expanded ? 0 : 2)
            .frame(maxWidth: .infinity, maxHeight: .infinity).contentShape(Rectangle())
            .highPriorityGesture(DragGesture(minimumDistance: 8, coordinateSpace: .global)
                .updating($dragging) { _, state, _ in state = true }
                .onChanged { interaction.changed(sample($0)) }
                .onEnded { value in
                    handleCompleted = true
                    interaction.ended(sample(value))
                })
            .onTapGesture { self.expanded.toggle() }
            .accessibilityLabel("照片信息面板").accessibilityValue(expanded ? "已展开" : "已收起")
            .accessibilityAdjustableAction { self.expanded = $0 == .increment }
    }

    private func sample(_ value: DragGesture.Value) -> PhotoPanSample {
        PhotoPanSample(translation: CGPoint(x: value.translation.width, y: value.translation.height),
            velocity: CGPoint(x: (value.predictedEndTranslation.width - value.translation.width) / 0.18,
                y: (value.predictedEndTranslation.height - value.translation.height) / 0.18), location: value.location)
    }

    private func tabs(floating: Bool) -> some View {
        HStack(spacing: 4) {
            ForEach(PhotoInfoSection.allCases) { tab in
                Button {
                    if expanded && section == tab { expanded = false }
                    else {
                        section = tab; expanded = true
                        automaticSectionUpdateAfter = .now.advanced(by: .milliseconds(450))
                        scrollRequest += 1
                    }
                } label: {
                    Text(tab.title).font(.system(size: 15, weight: !floating || section == tab ? .semibold : .medium))
                        .lineLimit(1).minimumScaleFactor(0.8).frame(maxWidth: .infinity).frame(minHeight: 44)
                        .background {
                            if floating && section == tab {
                                Capsule().fill(.black.opacity(0.23)).frame(maxWidth: 104, maxHeight: 34)
                                    .matchedGeometryEffect(id: "selectedSection", in: sectionIndicator)
                            }
                        }
                        .contentShape(Rectangle())
                        .foregroundStyle(floating && section == tab ? Color.white : theme.ink.opacity(0.8))
                }
                .accessibilityAddTraits(expanded && section == tab ? [.isSelected] : [])
                .accessibilityHint(expanded && section == tab ? "收起照片信息" : "展开并查看" + tab.title)
            }
            actions().frame(width: 44, height: 44)
                .foregroundStyle(theme.ink.opacity(floating ? 0.56 : 0.8))
                .background {
                    if floating {
                        Circle().fill(theme.surface.opacity(0.9))
                            .overlay { Circle().strokeBorder(.white.opacity(theme == .dark ? 0.20 : 0.65), lineWidth: 0.5) }
                            .padding(6)
                    }
                }
                .padding(.leading, floating ? 28 : 34)
        }
        .buttonStyle(.plain).foregroundStyle(theme.ink.opacity(0.8))
        .animation(floating ? sectionAnimation : nil, value: section)
    }
}

struct PhotoInfoSectionPositions: PreferenceKey {
    static let defaultValue: [String: CGFloat] = [:]
    static func reduce(value: inout [String: CGFloat], nextValue: () -> [String: CGFloat]) {
        value.merge(nextValue(), uniquingKeysWith: { _, latest in latest })
    }
}

struct PhotoInfoSectionAnchor: View {
    let section: PhotoInfoSection
    let spaceID: UUID?
    var body: some View {
        GeometryReader { geometry in
            if let spaceID {
                let frame = geometry.frame(in: .named(spaceID))
                Color.clear.preference(key: PhotoInfoSectionPositions.self,
                    value: [section.rawValue: frame.minY, section.rawValue + "-bottom": frame.maxY])
            }
        }.allowsHitTesting(false).accessibilityHidden(true)
    }
}
