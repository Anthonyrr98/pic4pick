import SwiftUI

// Keep categories in the same fixed header as the brand, outside the photo scroll view.
struct GalleryFilterBar: View {
    @EnvironmentObject private var store: GalleryStore
    let onSelect: (GalleryFilter) -> Void
    @Environment(\.galleryAppearance) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        categoryButtons
            .padding(4).frame(maxWidth: .infinity).frame(height: 52)
            .background {
                if reduceTransparency { Capsule().fill(theme.surface) }
                else { categorySurface }
            }
            .accessibilityElement(children: .contain).accessibilityLabel("作品分类")
    }

    private var categorySurface: some View {
        Capsule().fill(.ultraThinMaterial)
            .overlay { Capsule().fill(theme.surface.opacity(0.24)) }
            .mask {
                LinearGradient(stops: [
                    .init(color: .white, location: 0),
                    .init(color: .white, location: 0.58),
                    .init(color: .white.opacity(0.52), location: 0.78),
                    .init(color: .clear, location: 1)
                ], startPoint: .top, endPoint: .bottom)
            }
            .allowsHitTesting(false)
    }

    private var categoryButtons: some View {
        HStack(spacing: 0) {
            ForEach(GalleryFilter.allCases) { filter in
                Button { onSelect(filter) } label: {
                    Text(filter.rawValue)
                        .font(.system(size: 15, weight: store.filter == filter ? .semibold : .medium))
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .foregroundStyle(store.filter == filter ? (reduceTransparency ? Color.white : theme.ink) : theme.ink.opacity(0.64))
                        .offset(y: !reduceMotion && store.filter == filter && filter != .film ? -1 : 0)
                        .animation(reduceMotion ? nil : .easeOut(duration: 0.35), value: store.filter == filter)
                        .contentShape(Capsule())
                }
                .buttonStyle(CategoryPressStyle())
                .accessibilityAddTraits(store.filter == filter ? [.isSelected] : [])
            }
        }
        .background {
            CategorySelectionIndicator(
                selectedIndex: GalleryFilter.allCases.firstIndex(of: store.filter) ?? 0,
                count: GalleryFilter.allCases.count,
                reduceMotion: reduceMotion,
                translucent: !reduceTransparency,
                tint: theme.accent
            )
        }
    }
}

private struct CategoryPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.14), value: configuration.isPressed)
    }
}
