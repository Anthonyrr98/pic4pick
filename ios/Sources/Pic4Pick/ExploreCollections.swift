import SwiftUI
import MapKit
import UIKit

struct CityCollectionsSheet: View {
    @EnvironmentObject private var store: GalleryStore
    @Environment(\.dismiss) private var dismiss
    var onFocus: (CityCollection) -> Void
    @State private var query = ""
    @State private var expanded = Set<String>()
    private func matches(_ province: ProvinceCollection) -> [CityCollection] {
        province.cities.filter { query.isEmpty || province.title.localizedCaseInsensitiveContains(query) || $0.title.localizedCaseInsensitiveContains(query) }
    }
    var body: some View {
        NavigationStack {
            List {
                ForEach(store.catalog.provinces.filter { !matches($0).isEmpty }) { province in
                    DisclosureGroup(isExpanded: Binding(get: { !query.isEmpty || expanded.contains(province.id) }, set: { next in
                        if next { expanded.insert(province.id) } else { expanded.remove(province.id) }
                    })) {
                        ForEach(matches(province)) { city in
                            NavigationLink {
                                CollectionPhotosView(title: city.title, subtitle: province.title, photoIDs: city.photoIDs).onAppear { onFocus(city) }
                            } label: {
                                HStack(spacing: 14) {
                                    if let photo = store.photos.first(where: { $0.id == city.photoIDs.first }), let config = store.config { PhotoThumbnail(photo: photo, config: config) }
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(city.title).font(.system(.headline, design: .serif))
                                        Text("\(city.photoIDs.count) 张作品").font(.caption).foregroundStyle(.secondary)
                                    }
                                }.padding(.vertical, 4)
                            }
                        }
                    } label: { HStack { Text(province.title); Spacer(); Text("\(province.totalCount)").font(.caption.monospacedDigit()).foregroundStyle(.secondary) } }
                }
                if store.catalog.provinces.isEmpty { ContentUnavailableView("暂无城市作品集", systemImage: "building.2", description: Text("城市归类规则与网站共用。")) }
            }
            .navigationTitle("城市作品集").navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, prompt: "搜索省份或城市")
            .toolbar { Button("收起") { dismiss() } }
        }
    }
}

struct CollectionPhotosView: View {
    let title: String
    let subtitle: String
    let photoIDs: [String]
    var allowsSwipeBack = false
    @EnvironmentObject private var store: GalleryStore
    @State private var selected: PhotoSelection?
    @State private var sourceScope = UUID()
    private var photos: [Photo] {
        let index = Dictionary(uniqueKeysWithValues: store.photos.map { ($0.id, $0) })
        return photoIDs.compactMap { index[$0] }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(title).font(.system(.largeTitle, design: .serif))
                Text("\(subtitle) · \(photos.count) 张作品").font(.subheadline).foregroundStyle(.secondary)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), spacing: 14)], spacing: 22) {
                    ForEach(photos) { photo in
                        GalleryTile(photo: photo, filmMode: false, developmentID: nil) { selected = PhotoSelection(id: photo.id, photos: photos) }
                    }
                }
                if photos.isEmpty { ContentUnavailableView("此处暂无公开作品", systemImage: "photo") }
            }.padding(20)
                .background {
                    if allowsSwipeBack { DiscoveryCollectionBackSwipe().frame(width: 0, height: 0) }
                }
        }.navigationTitle(title).navigationBarTitleDisplayMode(.inline)
            .photoPreview(item: $selected)
            .environment(\.photoSourceScope, sourceScope)
    }
}

struct DiscoveryCollectionBackSwipe: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        HorizontalScrollSwipe(canSwipe: { $0 == .previous }, onSwipe: { _ in dismiss() })
    }
}

struct GalleryTile: View {
    let photo: Photo
    let filmMode: Bool
    let developmentID: UUID?
    var previewsDevelopment = false
    var onOpen: () -> Void
    @EnvironmentObject private var store: GalleryStore
    @Environment(\.galleryAppearance) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var sourceToken = UUID()
    @State private var likeBounce = 0
    @ScaledMetric(relativeTo: .headline) private var titleSize: CGFloat = 14
    @ScaledMetric(relativeTo: .caption) private var locationSize: CGFloat = 11

    var body: some View {
        if filmMode { filmCard }
        else { photographicCard }
    }

    private func open() {
        PhotoPreviewDiagnostics.event("thumbnail tapped")
        PhotoTransitionSource.shared.activate(sourceToken)
        defer { PhotoTransitionSource.shared.deactivate(sourceToken) }
        onOpen()
    }

    private var filmCard: some View {
        // Film retains its complete composition and the stock-specific outer edges.
        Button(action: open) {
            PhotoImage(photo: photo, config: store.config, developmentID: developmentID,
                previewsDevelopment: previewsDevelopment, sourceToken: sourceToken)
                .frame(maxWidth: .infinity).background(theme.surface)
        }.buttonStyle(.plain).accessibilityLabel("打开\(photo.displayTitle)")
    }

    private var photographicCard: some View {
        // Reserve the final size before image loading, so rows never jump in height.
        Color.black
            .aspectRatio(PhotoPresentationPolicy.cardAspectRatio, contentMode: .fit)
            .overlay {
                Button(action: open) {
                    PhotoImage(photo: photo, config: store.config, cardFill: true, sourceToken: sourceToken)
                        // Cropping only affects drawing; also bound the button's hit region.
                        .contentShape(Rectangle())
                }.buttonStyle(.plain)
                    .accessibilityLabel("打开\(photo.displayTitle)，\(photo.place)")
            }
            .overlay {
                LinearGradient(stops: [
                    .init(color: .clear, location: 0.35),
                    .init(color: .black.opacity(0.16), location: 0.58),
                    .init(color: .black.opacity(0.86), location: 1),
                ], startPoint: .top, endPoint: .bottom)
                .allowsHitTesting(false).accessibilityHidden(true)
            }
            .overlay(alignment: .topLeading) {
                Text(photo.badge).font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.white).lineLimit(1)
                    .padding(.horizontal, 9).padding(.vertical, 5)
                    .background(.black.opacity(0.55), in: Capsule())
                    .padding(12).allowsHitTesting(false)
            }
            .overlay(alignment: .bottomLeading) { caption.padding(12) }
            .clipShape(RoundedRectangle(cornerRadius: theme.radius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: theme.radius, style: .continuous)
                    .strokeBorder(.white.opacity(0.12), lineWidth: 0.8).allowsHitTesting(false)
            }
            .shadow(color: .black.opacity(0.12), radius: 6, x: 0, y: 4)
    }

    private var caption: some View {
        VStack(alignment: .leading, spacing: 3) {
            Button(action: open) {
                Text(photo.displayTitle).font(.system(size: titleSize, weight: .semibold))
                    .foregroundStyle(.white).lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }.buttonStyle(.plain).accessibilityHidden(true)
            HStack(spacing: 4) {
                Button(action: open) {
                    Text(photo.place).font(.system(size: locationSize))
                        .foregroundStyle(.white.opacity(0.78)).lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }.buttonStyle(.plain).accessibilityHidden(true)
                likeButton
            }
        }
    }

    private var likeButton: some View {
        let state = store.likeState(for: photo)
        return Button {
            if store.toggleLike(photo)?.liked == true && !reduceMotion { likeBounce += 1 }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: state.liked ? "heart.fill" : "heart")
                    .keyframeAnimator(initialValue: 1.0, trigger: likeBounce) { heart, scale in
                        heart.scaleEffect(CGFloat(scale))
                    } keyframes: { _ in
                        CubicKeyframe(1.16, duration: 0.09)
                        CubicKeyframe(1, duration: 0.14)
                    }
                Text("\(state.count)").frame(minWidth: 14)
            }
                .font(.system(size: 11)).monospacedDigit()
                .foregroundStyle(state.liked ? Color.hex(0xffb5c1) : .white.opacity(0.9))
                .padding(.horizontal, 8).frame(height: 28)
                .background(.black.opacity(0.32), in: Capsule())
                .overlay { Capsule().strokeBorder(.white.opacity(state.liked ? 0.7 : 0.45), lineWidth: 0.8).allowsHitTesting(false) }
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        // The store rejects duplicate taps while saving. Keep the button's
        // appearance stable so server confirmation cannot undim the heart.
        .buttonStyle(.plain)
            .accessibilityLabel("\(state.liked ? "取消点赞" : "点赞")\(photo.displayTitle)，\(state.count) 次")
    }
}
