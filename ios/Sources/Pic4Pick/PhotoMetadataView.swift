import SwiftUI
import MapKit
import Combine

struct PhotoMetadataView: View {
    let photo: Photo
    var section: PhotoInfoSection = .parameters
    var embedded = false
    var immersive = false
    var active = true
    let mapActive: Bool
    let prewarmMap: Bool
    var scrollSpaceID: UUID?
    let scrollViewport: Double
    let onVisibleSectionChange: (PhotoInfoSection) -> Void
    @StateObject private var geography: PhotoGeography
    @EnvironmentObject private var store: GalleryStore
    @Environment(\.galleryAppearance) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.dismiss) private var dismiss
    @State private var mapFailed = false
    @State private var mapMounted = false
    init(photo: Photo, section: PhotoInfoSection = .parameters, embedded: Bool = false, immersive: Bool = false,
        active: Bool = true, mapActive: Bool? = nil, prewarmMap: Bool = false, scrollSpaceID: UUID? = nil,
        scrollViewport: Double = 0, onVisibleSectionChange: @escaping (PhotoInfoSection) -> Void = { _ in }) {
        self.photo = photo; self.section = section; self.embedded = embedded; self.immersive = immersive
        self.active = active
        self.mapActive = mapActive ?? active
        self.prewarmMap = prewarmMap
        self.scrollSpaceID = scrollSpaceID
        self.scrollViewport = scrollViewport
        self.onVisibleSectionChange = onVisibleSectionChange
        _mapMounted = State(initialValue: immersive && WebsiteMap.hasCachedPhotoMap(id: photo.id))
        _geography = StateObject(wrappedValue: PhotoGeography(photo: photo))
    }
    private var shot: GalleryPhotoSummary.Shot? { store.catalog.summaries[photo.id]?.shot }
    private var solidCards: Bool { reduceTransparency || contrast == .increased }
    var body: some View {
        Group {
            if embedded { content }
            else {
                NavigationStack {
                    ScrollView { content }
                        .background(theme.background)
                        .navigationTitle(section.title).navigationBarTitleDisplayMode(.inline)
                        .toolbar { Button("完成") { dismiss() } }
                }.presentationDetents([.medium, .large])
            }
        }
        .foregroundStyle(theme.ink)
        .onChange(of: mapActive || prewarmMap, initial: true) { _, shouldMount in
            if shouldMount { mapMounted = true }
        }
        .task(id: (immersive ? "continuous" : section.rawValue) + "-" + String(active)) {
            if active && (immersive || section == .geography) {
                await geography.load(config: store.config)
            } else { geography.stop() }
        }
        .onDisappear { geography.stop() }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 18) {
            if !immersive { Text(photo.displayTitle).font(.system(.title2, design: .serif)) }
            if immersive {
                geographyContent
                    .padding(.top, 24)
                    .id(PhotoInfoSection.geography.rawValue)
                parametersContent.id(PhotoInfoSection.parameters.rawValue)
                    .onGeometryChange(for: PhotoInfoSection.self) { [scrollSpaceID, scrollViewport] geometry in
                        guard let scrollSpaceID else { return .geography }
                        let frame = geometry.frame(in: .named(scrollSpaceID))
                        return PhotoInfoSection.visible(parametersTop: Double(frame.minY), parametersBottom: Double(frame.maxY),
                            viewport: scrollViewport)
                    } action: { current in
                        onVisibleSectionChange(current)
                    }
            }
            else if section == .geography { geographyContent }
            else { parametersContent }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(immersive ? 24 : 18)
    }

    @ViewBuilder private var geographyContent: some View {
        if let point = geography.coordinate {
            if immersive {
                let frame = RoundedRectangle(cornerRadius: 23)
                let mapInset: CGFloat = 5
                locationMap(point, height: 182)
                    .overlay(alignment: .top) {
                        Text(photo.place.isEmpty ? "拍摄地点" : photo.place)
                            .font(.system(size: 15)).lineLimit(2)
                            .frame(maxWidth: .infinity)
                            .padding(.horizontal, 18).padding(.top, 14).padding(.bottom, 26)
                            .background {
                                LinearGradient(colors: [theme.surface, theme.surface.opacity(0)],
                                    startPoint: .top, endPoint: .bottom)
                            }
                            .allowsHitTesting(false)
                    }
                    .padding(mapInset)
                    .clipShape(frame.inset(by: mapInset))
                    .background(theme.surface.opacity(0.45), in: frame)
            } else {
                locationMap(point)
                Text(geography.place.isEmpty ? photo.place : geography.place).font(.headline)
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 18), GridItem(.flexible())], spacing: immersive ? 18 : 12) {
                card("纬度", PhotoCoordinate.dms(point.latitude, latitude: true), String(format: "%.6f", point.latitude))
                card("经度", PhotoCoordinate.dms(point.longitude, latitude: false), String(format: "%.6f", point.longitude))
                card("海拔高度", geography.altitude.map { "\(Int($0.rounded())) m" } ?? "未知", geography.altitudeSource)
                let target = point.gps ? (latitude: point.latitude, longitude: point.longitude)
                    : PhotoBearing.gpsFromAMap(latitude: point.latitude, longitude: point.longitude)
                let targetLocation = CLLocation(latitude: target.latitude, longitude: target.longitude)
                // Older records mix EXIF and map-picked coordinates. Treat their
                // datum offset as uncertainty when EXIF cannot confirm the point.
                let targetUncertainty = point.gps ? 0 : targetLocation.distance(
                    from: CLLocation(latitude: point.latitude, longitude: point.longitude))
                PhotoDistanceCard(target: targetLocation, targetUncertainty: targetUncertainty,
                    immersive: immersive, active: active, solid: solidCards)
                if immersive {
                    ratingCard
                    card("拍摄于", shot?.yearsAgoText ?? "未知", shot?.dateText ?? "拍摄日期未设置")
                }
            }
            if !geography.address.isEmpty { DisclosureGroup("查看完整地址") { Text(geography.address).font(.subheadline) } }
        } else { Label("这张照片没有记录坐标", systemImage: "mappin.slash").font(.subheadline).foregroundStyle(.secondary) }
    }

    private var parametersContent: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 18), GridItem(.flexible())], spacing: immersive ? 18 : 12) {
            if !immersive || geography.coordinate == nil {
                ratingCard
                card("拍摄于", shot?.yearsAgoText ?? "未知", shot?.dateText ?? "拍摄日期未设置")
            }
            if !photo.isFilm {
                card("光圈", photo.aperture, "", icon: .aperture)
                card("快门", photo.shutter, "", icon: .shutter)
                card("焦距", photo.focal, "", icon: .focalLength)
                card("感光度", photo.iso, "", icon: .iso)
            }
            card("相机", photo.camera, "", modelName: true,
                artwork: photo.isFilm && photo.camera.lowercased().replacingOccurrences(of: " ", with: "") == "nikonfm2" ? "nikon-fm2" : nil)
            card("镜头", photo.lens, "", modelName: true)
            card("分类", photo.categoryLabel, photo.badge)
            if photo.isFilm {
                card("胶卷类型", photo.filmStock, "",
                    artwork: photo.frameStock == "fuji-c200" ? "fuji-c200-artwork" : nil,
                    artworkRotation: .degrees(90), artworkScale: 1.42)
            } else { card("喜欢", "\(photo.likes)", "次") }
        }
    }
    private func locationMap(_ point: PhotoCoordinate, height: CGFloat = 220) -> some View {
        let mapPoint = geography.mapCoordinate ?? point
        let marker = WebsiteMapMarker(id: photo.id, title: photo.displayTitle,
            latitude: mapPoint.latitude, longitude: mapPoint.longitude)
        return Group {
            if !mapMounted && !mapActive && !prewarmMap {
                ZStack {
                    theme.surface.opacity(0.5)
                    Label("地图", systemImage: "map").font(.caption).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if mapFailed {
                if immersive {
                    VStack(spacing: 10) {
                        Text("地图暂时无法加载").font(.caption).foregroundStyle(.secondary)
                        Button("重试地图") { mapFailed = false }.font(.caption)
                    }.frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                Map(initialPosition: .region(.init(center: .init(latitude: point.latitude, longitude: point.longitude), span: .init(latitudeDelta: 0.03, longitudeDelta: 0.03)))) {
                    Marker(photo.displayTitle, coordinate: .init(latitude: point.latitude, longitude: point.longitude))
                }
                }
            } else {
                WebsiteMap(payload: .init(content: .init(config: store.mapConfig, locations: [marker],
                    active: mapActive, photoDetailCard: immersive, resolveAddress: active,
                    photoMarkerURL: immersive ? store.config?.mediaURL(photo.thumbnailURL.isEmpty ? photo.imageURL : photo.thumbnailURL)?.absoluteString : nil),
                    camera: .init(focus: ["id": .string(point.key + mapPoint.key), "latitude": .number(mapPoint.latitude), "longitude": .number(mapPoint.longitude), "zoom": .number(immersive ? 10 : 15)],
                    geocode: ["id": .string(point.key), "latitude": .number(point.latitude), "longitude": .number(point.longitude), "coordinateSystem": .string(point.gps ? "gps" : "autonavi")], reduceMotion: reduceMotion)),
                    baseURL: store.websiteURL, onAddress: { result in
                        geography.address = result["address"]?.string ?? ""
                        geography.place = result["label"]?.string ?? ""
                        if case .number(let lat) = result["latitude"], case .number(let lon) = result["longitude"] {
                            geography.mapCoordinate = PhotoCoordinate(latitude: lat, longitude: lon, altitude: nil, gps: false)
                        }
                    }, onStatus: { if $0 == "failure" { mapFailed = true } })
            }
        }.frame(height: height).clipShape(RoundedRectangle(cornerRadius: immersive ? 0 : theme.radius))
            .overlay(alignment: .bottomTrailing) {
                if !immersive {
                Button {
                    let item = MKMapItem(placemark: MKPlacemark(coordinate: .init(latitude: point.latitude, longitude: point.longitude)))
                    item.name = photo.displayTitle; item.openInMaps()
                } label: { Image(systemName: "arrow.up.right.square").padding(10).background(.regularMaterial, in: Circle()) }.padding(8)
                }
            }
    }
    @ViewBuilder private var ratingCard: some View {
        let rating = photo.displayRating
        let maximum = 10
        if immersive {
            VStack(alignment: .leading, spacing: 4) {
                Text("评级").font(PhotoParameterTypography.label).foregroundStyle(.secondary)
                GeometryReader { geometry in
                    let center = CGPoint(x: geometry.size.width / 2, y: geometry.size.height / 2)
                    let diameter = min(geometry.size.width, geometry.size.height)
                    let starSize = diameter * 0.17
                    let radius = (diameter - starSize) / 2
                    ZStack {
                        ForEach(0..<maximum, id: \.self) { index in
                            let angle = Double(index) * 2 * .pi / Double(maximum) - .pi / 2
                            Image(systemName: "star.fill")
                                .font(.system(size: starSize))
                                .foregroundStyle(theme.ink.opacity(index < rating ? 0.62 : 0.18))
                                .position(x: center.x + radius * cos(angle), y: center.y + radius * sin(angle))
                        }
                        Text(rating.formatted())
                            .font(.system(size: diameter * 0.28, weight: .medium))
                            .foregroundStyle(PhotoParameterTypography.ink(theme, solid: solidCards))
                            .position(center)
                    }
                }
            }
            .detailCard(theme, square: true, solid: solidCards)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("评级")
            .accessibilityValue("\(rating) 分，满分 \(maximum) 分")
        } else {
            card("评级", "\(rating) / \(maximum)", String(repeating: "★", count: rating))
        }
    }

    private func card(_ label: String, _ value: String, _ subtitle: String,
        modelName: Bool = false, artwork: String? = nil, artworkRotation: Angle = .zero,
        artworkScale: CGFloat = 1, icon: PhotoParameterIcon? = nil) -> some View {
        let usesModelTypography = immersive && modelName
        return VStack(alignment: .leading, spacing: 10) {
            Text(label).font(immersive ? PhotoParameterTypography.label : .caption).foregroundStyle(.secondary)
            Text(value.isEmpty ? "未记录" : value)
                .font(usesModelTypography ? PhotoParameterTypography.modelName
                    : immersive ? PhotoParameterTypography.value : .system(.title3, design: .serif))
                .foregroundStyle(immersive ? PhotoParameterTypography.ink(theme, solid: solidCards) : theme.ink)
                .lineLimit(usesModelTypography && artwork == nil ? 4 : 2)
                .minimumScaleFactor(usesModelTypography ? 1 : 0.65)
            if immersive && !usesModelTypography && artwork == nil { Spacer(minLength: 8) }
            if !subtitle.isEmpty {
                Text(subtitle).font(immersive ? .footnote : .caption2).foregroundStyle(.secondary).lineLimit(3)
            }
            if let artwork {
                ParameterArtwork(name: artwork, fillsRemainingSpace: immersive,
                    rotation: artworkRotation, scale: artworkScale).id(artwork)
            }
            if immersive, let icon {
                icon.foregroundStyle(PhotoParameterTypography.ink(theme, solid: solidCards))
                    .accessibilityHidden(true)
            }
        }.detailCard(theme, square: immersive, solid: solidCards)
    }
}

private enum PhotoParameterIcon: View {
    case aperture, shutter, focalLength, iso

    var body: some View {
        Group {
            switch self {
            case .aperture:
                Image(systemName: "camera.aperture").resizable().scaledToFit()
            case .shutter:
                Image(systemName: "timer").resizable().scaledToFit()
            case .focalLength:
                Path { path in
                    path.move(to: CGPoint(x: 37, y: 13))
                    path.addLine(to: CGPoint(x: 3, y: 20))
                    path.addLine(to: CGPoint(x: 37, y: 27))
                    path.move(to: CGPoint(x: 22, y: 16))
                    path.addQuadCurve(to: CGPoint(x: 22, y: 24), control: CGPoint(x: 25, y: 20))
                    path.move(to: CGPoint(x: 31, y: 14))
                    path.addQuadCurve(to: CGPoint(x: 31, y: 26), control: CGPoint(x: 34, y: 20))
                }
                .stroke(style: StrokeStyle(lineWidth: 2.6, lineCap: .round, lineJoin: .round))
            case .iso:
                Text(verbatim: "ISO")
                    .font(.system(size: 17, weight: .semibold))
                    .frame(width: 40, height: 27)
                    .overlay { RoundedRectangle(cornerRadius: 2).strokeBorder(lineWidth: 2.6) }
            }
        }
        .frame(width: 40, height: 40)
    }
}

private enum PhotoParameterTypography {
    static let label = Font.caption.weight(.semibold)
    static let value = Font.system(size: 27, weight: .regular)
    static let modelName = Font.system(size: 21, weight: .regular)

    static func ink(_ theme: GalleryAppearance, solid: Bool) -> Color {
        theme == .paper && !solid ? .hex(0x4b4b53) : theme.ink
    }
}

private struct PhotoDistanceCard: View {
    let target: CLLocation
    let targetUncertainty: CLLocationDistance
    let immersive: Bool
    let active: Bool
    let solid: Bool
    @EnvironmentObject private var location: LocationStore
    @Environment(\.galleryAppearance) private var theme
    @StateObject private var direction = PhotoDirectionTracker()
    private var tracksDirection: Bool { immersive && active }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("距离").font(immersive ? PhotoParameterTypography.label : .caption).foregroundStyle(.secondary)
            if let current = direction.location ?? location.location {
                let distance = target.distance(from: current)
                Text("\(Int((distance / 1000).rounded()).formatted()) km")
                    .font(immersive ? PhotoParameterTypography.value : .title3)
                    .foregroundStyle(immersive ? PhotoParameterTypography.ink(theme, solid: solid) : theme.ink)
                    .lineLimit(1).minimumScaleFactor(0.6)
                if immersive {
                    Spacer(minLength: 8)
                    if direction.location == nil {
                        Label("正在获取当前位置", systemImage: "location.circle")
                            .font(.caption2).foregroundStyle(.secondary)
                    } else if distance > max(1, (current.horizontalAccuracy + targetUncertainty) * 4) {
                        arrow(from: current.coordinate)
                    } else {
                        Label("坐标精度不足以判断方向", systemImage: "location.circle")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                } else {
                    Text("距你当前的位置").font(.caption2).foregroundStyle(.secondary)
                }
            } else {
                Button("开启定位") { location.request() }.font(.subheadline)
                if let message = location.message { Text(message).font(.caption2).foregroundStyle(.secondary) }
            }
        }
        .detailCard(theme, square: immersive, solid: solid)
        // The photo viewer already tracks foreground state for its UIKit presentation.
        .onAppear { direction.setActive(tracksDirection) }
        .onChange(of: tracksDirection) { _, enabled in direction.setActive(enabled) }
        .onDisappear { direction.setActive(false) }
    }

    private func arrow(from current: CLLocationCoordinate2D) -> some View {
        let bearing = PhotoBearing.degrees(fromLatitude: current.latitude, longitude: current.longitude,
            toLatitude: target.coordinate.latitude, longitude: target.coordinate.longitude)
        return PhotoBearingArrow(bearing: bearing, headingUpdates: direction.headingUpdates)
    }
}

private struct PhotoBearingArrow: View {
    let bearing: Double
    let headingUpdates: AnyPublisher<PhotoDirectionTracker.Heading?, Never>
    @State private var heading: PhotoDirectionTracker.Heading?

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "location.north.circle")
                .font(.system(size: 35))
                .rotationEffect(.degrees(bearing - (heading?.degrees ?? 0)))
            if heading == nil {
                Text("航向不确定 · 北朝上").font(.caption2)
            } else if heading?.usesMagneticNorth == true {
                Text("磁北估算").font(.caption2)
            }
        }
        .foregroundStyle(.secondary)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("拍摄地方向，真北顺时针 \(Int(bearing.rounded()) % 360) 度")
        .onReceive(headingUpdates) { heading = $0 }
    }
}

private struct ParameterArtwork: View {
    let name: String
    let fillsRemainingSpace: Bool
    let rotation: Angle
    let scale: CGFloat
    @State private var image: UIImage?
    @State private var loaded = false

    var body: some View {
        Group {
            if image != nil || !loaded {
                Color.clear
                    .frame(minHeight: 0, idealHeight: 80, maxHeight: fillsRemainingSpace ? .infinity : 80)
                    .overlay {
                        if let image {
                            Image(uiImage: image)
                                .resizable()
                                .scaledToFit()
                                .rotationEffect(rotation)
                                .scaleEffect(scale)
                                .frame(minHeight: 0, maxHeight: 80)
                                .accessibilityHidden(true)
                        }
                    }
            }
        }
        .task {
            let bitmap = await ImageCache.shared.bundledArtwork(name)
            guard !Task.isCancelled else { return }
            image = bitmap
            loaded = true
        }
    }
}

private extension View {
    @ViewBuilder func detailCard(_ theme: GalleryAppearance, square: Bool, solid: Bool) -> some View {
        if square {
            let shape = RoundedRectangle(cornerRadius: 20)
            Color.clear.aspectRatio(1, contentMode: .fit)
                .overlay(alignment: .topLeading) { self.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).padding(18) }
                .background {
                    if solid {
                        shape.fill(theme.surface)
                    } else {
                        shape.fill(LinearGradient(colors: [theme.surface.opacity(0.72), theme.surface.opacity(0.60)],
                            startPoint: .topLeading, endPoint: .bottomTrailing))
                    }
                }
                .overlay {
                    shape.strokeBorder(LinearGradient(colors: [.white.opacity(0.86), .white.opacity(0.38), .white.opacity(0.74)],
                        startPoint: .top, endPoint: .bottom), lineWidth: 1)
                        .allowsHitTesting(false)
                }
                .clipShape(shape)
        } else {
            frame(maxWidth: .infinity, minHeight: 110, alignment: .topLeading).padding(14)
                .background(theme.surface, in: RoundedRectangle(cornerRadius: theme.radius))
        }
    }
}
