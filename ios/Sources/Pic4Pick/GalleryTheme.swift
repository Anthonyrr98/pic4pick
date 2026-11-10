import SwiftUI

// Fixed normal appearance and the automatic film-category darkroom only.
enum GalleryAppearance {
    case paper, dark
    var background: Color { self == .paper ? .hex(0xf5f5f2) : .hex(0x25241f) }
    var surface: Color { self == .paper ? .white : .hex(0x302e28) }
    var ink: Color { self == .paper ? .hex(0x1e2729) : .hex(0xd9d2c4) }
    var accent: Color { self == .paper ? .hex(0x48645e) : .hex(0xbe754c) }
    var selectionFill: Color { self == .paper ? .hex(0x384852) : .hex(0xe1d9ca) }
    var selectionForeground: Color { self == .paper ? .white : .hex(0x1e2729) }
    var radius: CGFloat { self == .paper ? 20 : 6 }
}
extension Color {
    static func hex(_ number: UInt32) -> Color {
        .init(red: Double((number >> 16) & 255) / 255, green: Double((number >> 8) & 255) / 255, blue: Double(number & 255) / 255)
    }
}
private struct GalleryAppearanceKey: EnvironmentKey { static let defaultValue = GalleryAppearance.paper }
extension EnvironmentValues {
    var galleryAppearance: GalleryAppearance {
        get { self[GalleryAppearanceKey.self] }
        set { self[GalleryAppearanceKey.self] = newValue }
    }
}

struct FloatingGlassControl: View {
    let symbol: String
    @Environment(\.galleryAppearance) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast

    private var solidSurface: Bool { reduceTransparency || contrast == .increased }

    var body: some View {
        Group {
            if #available(iOS 26.0, *), !solidSurface {
                icon.glassEffect(.regular.interactive(!reduceMotion), in: Circle())
            } else {
                icon.background {
                    if solidSurface { Circle().fill(theme.surface) }
                    else { Circle().fill(.regularMaterial) }
                }
                .overlay {
                    Circle().strokeBorder(theme.ink.opacity(contrast == .increased ? 0.65 : 0.18))
                        .allowsHitTesting(false)
                }
            }
        }
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
    }

    private var icon: some View {
        Image(systemName: symbol)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(theme.ink)
            .frame(width: 34, height: 34)
    }
}

struct GalleryScrollEdgeBlur: View {
    let edge: VerticalEdge
    var fullStrengthFraction: CGFloat = 0
    @Environment(\.galleryAppearance) private var theme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        Group {
            if reduceTransparency {
                Rectangle().fill(theme.background)
            } else {
                Rectangle().fill(.regularMaterial)
                    .overlay { theme.background.opacity(0.20) }
            }
        }
        .mask {
            let fade = 1 - fullStrengthFraction
            LinearGradient(stops: [
                .init(color: .white, location: 0),
                .init(color: .white, location: fullStrengthFraction),
                .init(color: .white.opacity(0.78), location: fullStrengthFraction + 0.24 * fade),
                .init(color: .white.opacity(0.32), location: fullStrengthFraction + 0.66 * fade),
                .init(color: .clear, location: 1)
            ], startPoint: edge == .top ? .top : .bottom, endPoint: edge == .top ? .bottom : .top)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

struct GalleryBackdrop: View {
    let photo: Photo?
    let film: Bool
    @EnvironmentObject private var store: GalleryStore
    @Environment(\.galleryAppearance) private var theme
    @State private var image: (photoID: String, bitmap: UIImage)?
    @State private var filmArtwork: UIImage?
    var body: some View {
        GeometryReader { proxy in
            ZStack {
                theme.background
                if film, let filmArtwork {
                    Image(uiImage: filmArtwork).resizable().scaledToFill().frame(width: proxy.size.width, height: proxy.size.height).clipped()
                    Color.black.opacity(0.35)
                } else if !film, photo != nil, let image, store.containsPhoto(withID: image.photoID) {
                    Image(uiImage: image.bitmap).resizable().scaledToFill().frame(width: proxy.size.width, height: proxy.size.height).clipped().blur(radius: 18)
                    theme.background.opacity(theme == .dark ? 0.78 : 0.80)
                }
            }
        }.ignoresSafeArea().allowsHitTesting(false)
        .task {
            filmArtwork = await ImageCache.shared.bundledArtwork("film-desktop")
        }
        .task(id: film ? nil : photo?.id) {
            guard !film else { return }
            if let photo, let url = store.config?.mediaURL(photo.thumbnailURL.isEmpty ? photo.imageURL : photo.thumbnailURL) {
                let loaded = try? await ImageCache.shared.load(url, size: 900)
                guard !Task.isCancelled else { return }
                // Keep the previous image visible until the replacement is ready.
                if let loaded { image = (photo.id, loaded) }
            } else {
                image = nil
            }
        }
    }
}

struct BrandMark: View {
    let value: String
    var size: CGFloat = 42
    var circular = false
    @State private var image: UIImage?
    var body: some View {
        Group {
            if let image { Image(uiImage: image).resizable().scaledToFit() }
            else { Image(systemName: "camera.aperture").resizable().scaledToFit() }
        }.frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: circular ? size / 2 : 0))
        .overlay { if circular { Circle().strokeBorder(.white.opacity(0.5), lineWidth: 1) } }
        .task(id: value) {
            image = nil
            let loaded: UIImage?
            if value.hasPrefix("data:image/") {
                loaded = await ImageCache.shared.inlineBrandImage(value)
            } else if let url = URL(string: value), url.scheme == "https" {
                loaded = try? await ImageCache.shared.load(url, size: 180)
            } else { return }
            guard !Task.isCancelled else { return }
            image = loaded
        }
    }
}
