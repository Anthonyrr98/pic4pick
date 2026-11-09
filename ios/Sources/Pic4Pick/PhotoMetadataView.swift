import SwiftUI
import MapKit

struct PhotoMetadataView: View {
    let photo: Photo
    var section: PhotoInfoSection = .parameters
    var embedded = false
    var immersive = false
    var active = true
    var scrollSpaceID: UUID?
    @StateObject private var geography: PhotoGeography
    @EnvironmentObject private var store: GalleryStore
    @EnvironmentObject private var location: LocationStore
    @Environment(\.galleryAppearance) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dismiss) private var dismiss
    @State private var mapFailed = false
    @State private var mapMounted = false
    init(photo: Photo, section: PhotoInfoSection = .parameters, embedded: Bool = false, immersive: Bool = false, active: Bool = true, scrollSpaceID: UUID? = nil) {
        self.photo = photo; self.section = section; self.embedded = embedded; self.immersive = immersive
        self.active = active
        self.scrollSpaceID = scrollSpaceID
        _geography = StateObject(wrappedValue: PhotoGeography(photo: photo))
    }
    private var shot: GalleryPhotoSummary.Shot? { store.catalog.summaries[photo.id]?.shot }
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
        .task(id: (immersive ? "continuous" : section.rawValue) + "-" + String(active)) {
            if active && (immersive || section == .geography) {
                mapMounted = true
                await geography.load(config: store.config)
            } else { geography.stop() }
        }
        .onDisappear { geography.stop() }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 18) {
            if !immersive { Text(photo.displayTitle).font(.system(.title2, design: .serif)) }
            if immersive {
                geographyContent.id(PhotoInfoSection.geography.rawValue)
                    .background { PhotoInfoSectionAnchor(section: .geography, spaceID: scrollSpaceID) }
                parametersContent.id(PhotoInfoSection.parameters.rawValue)
                    .background { PhotoInfoSectionAnchor(section: .parameters, spaceID: scrollSpaceID) }
            }
            else if section == .geography { geographyContent }
            else { parametersContent }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(immersive ? 24 : 18)
    }

    @ViewBuilder private var geographyContent: some View {
        if let point = geography.coordinate {
            if immersive {
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
                    .padding(5)
                    .background(theme.surface.opacity(0.45))
                    .clipShape(RoundedRectangle(cornerRadius: 23))
            } else {
                locationMap(point)
                Text(geography.place.isEmpty ? photo.place : geography.place).font(.headline)
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 18), GridItem(.flexible())], spacing: immersive ? 18 : 12) {
                card("纬度", PhotoCoordinate.dms(point.latitude, latitude: true), String(format: "%.6f", point.latitude))
                card("经度", PhotoCoordinate.dms(point.longitude, latitude: false), String(format: "%.6f", point.longitude))
                card("海拔高度", geography.altitude.map { "\(Int($0.rounded())) m" } ?? "未知", geography.altitudeSource)
                VStack(alignment: .leading, spacing: 10) {
                    Text("距离").font(.caption).foregroundStyle(.secondary)
                    if let current = location.location {
                        let distance = CLLocation(latitude: point.latitude, longitude: point.longitude).distance(from: current) / 1000
                        Text("\(Int(distance.rounded()).formatted()) km")
                            .font(immersive ? .system(size: 28, weight: .medium) : .title3).lineLimit(1).minimumScaleFactor(0.6)
                        if !immersive { Text("距你当前的位置").font(.caption2).foregroundStyle(.secondary) }
                    } else {
                        Button("开启定位") { location.request() }.font(.subheadline)
                        if let message = location.message { Text(message).font(.caption2).foregroundStyle(.secondary) }
                    }
                    if immersive {
                        Spacer(minLength: 8)
                        Image(systemName: "location.north.circle").font(.system(size: 35)).foregroundStyle(.secondary)
                    }
                }.detailCard(theme, square: immersive)
                if immersive {
                    card("评级", "\(photo.displayRating) / 10", String(repeating: "★", count: photo.displayRating))
                    card("拍摄于", shot?.yearsAgoText ?? "未知", shot?.dateText ?? "拍摄日期未设置")
                }
            }
            if !geography.address.isEmpty { DisclosureGroup("查看完整地址") { Text(geography.address).font(.subheadline) } }
        } else { Label("这张照片没有记录坐标", systemImage: "mappin.slash").font(.subheadline).foregroundStyle(.secondary) }
    }

    private var parametersContent: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 18), GridItem(.flexible())], spacing: immersive ? 18 : 12) {
            if !immersive || geography.coordinate == nil {
                card("评级", "\(photo.displayRating) / 10", String(repeating: "★", count: photo.displayRating))
                card("拍摄于", shot?.yearsAgoText ?? "未知", shot?.dateText ?? "拍摄日期未设置")
            }
            if !photo.isFilm {
                card("光圈", photo.aperture, ""); card("快门", photo.shutter, "")
                card("焦距", photo.focal, ""); card("感光度", photo.iso, "")
            }
            card("相机", photo.camera, "", artwork: photo.isFilm && photo.camera.lowercased().replacingOccurrences(of: " ", with: "") == "nikonfm2" ? "nikon-fm2" : nil)
            card("镜头", photo.lens, "")
            card("分类", photo.categoryLabel, photo.badge)
            if photo.isFilm { card("胶卷类型", photo.filmStock, "", artwork: photo.frameStock == "fuji-c200" ? "fuji-c200-artwork" : nil) }
            else { card("喜欢", "\(photo.likes)", "次") }
        }
    }
    private func locationMap(_ point: PhotoCoordinate, height: CGFloat = 220) -> some View {
        let mapPoint = geography.mapCoordinate ?? point
        let group = LocationCollection(id: photo.id, title: photo.displayTitle, subtitle: photo.place,
            latitude: mapPoint.latitude, longitude: mapPoint.longitude, photoIDs: [photo.id])
        return Group {
            if !mapMounted && !active {
                ZStack {
                    theme.surface.opacity(0.5)
                    Label("地图", systemImage: "map").font(.caption).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if mapFailed {
                if immersive {
                    VStack(spacing: 10) {
                        Text("地图暂时无法加载").font(.caption).foregroundStyle(.secondary)
                        Button("重试默认地图") { mapFailed = false }.font(.caption)
                    }.frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                Map(initialPosition: .region(.init(center: .init(latitude: point.latitude, longitude: point.longitude), span: .init(latitudeDelta: 0.03, longitudeDelta: 0.03)))) {
                    Marker(photo.displayTitle, coordinate: .init(latitude: point.latitude, longitude: point.longitude))
                }
                }
            } else {
                WebsiteMap(payload: .init(config: store.mapConfig, locations: [group], focus: ["id": .string(point.key + mapPoint.key), "latitude": .number(mapPoint.latitude), "longitude": .number(mapPoint.longitude), "zoom": .number(immersive ? 10 : 15)],
                    geocode: ["id": .string(point.key), "latitude": .number(point.latitude), "longitude": .number(point.longitude), "coordinateSystem": .string(point.gps ? "gps" : "autonavi")], reduceMotion: reduceMotion,
                    active: active, photoDetailCard: immersive,
                    photoMarkerURL: immersive ? store.config?.mediaURL(photo.thumbnailURL.isEmpty ? photo.imageURL : photo.thumbnailURL)?.absoluteString : nil),
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
    private func card(_ label: String, _ value: String, _ subtitle: String, artwork: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value.isEmpty ? "未记录" : value)
                .font(immersive ? .system(size: 28, weight: .medium) : .system(.title3, design: .serif))
                .lineLimit(2).minimumScaleFactor(0.65)
            if immersive { Spacer(minLength: 8) }
            if !subtitle.isEmpty { Text(subtitle).font(.caption2).foregroundStyle(.secondary).lineLimit(3) }
            if let artwork, let url = Bundle.module.url(forResource: artwork, withExtension: "png"), let image = UIImage(contentsOfFile: url.path) {
                Image(uiImage: image).resizable().scaledToFit().frame(height: 80)
            }
        }.detailCard(theme, square: immersive)
    }
}

private extension View {
    @ViewBuilder func detailCard(_ theme: GalleryAppearance, square: Bool = false) -> some View {
        if square {
            Color.clear.aspectRatio(1, contentMode: .fit)
                .overlay(alignment: .topLeading) { self.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).padding(18) }
                .background(theme.surface.opacity(0.83), in: RoundedRectangle(cornerRadius: 20))
                .overlay { RoundedRectangle(cornerRadius: 20).strokeBorder(.white.opacity(0.5), lineWidth: 1) }
                .clipShape(RoundedRectangle(cornerRadius: 20))
        } else {
            frame(maxWidth: .infinity, minHeight: 110, alignment: .topLeading).padding(14)
                .background(theme.surface, in: RoundedRectangle(cornerRadius: theme.radius))
        }
    }
}
