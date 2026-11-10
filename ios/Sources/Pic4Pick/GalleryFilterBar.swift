import SwiftUI

// Keep categories in the same fixed header as the brand, outside the photo scroll view.
struct GalleryFilterBar: View {
    @EnvironmentObject private var store: GalleryStore
    let onSelect: (GalleryFilter) -> Void
    @Environment(\.galleryAppearance) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.colorSchemeContrast) private var contrast
    @ScaledMetric(relativeTo: .subheadline) private var labelSize: CGFloat = 15

    private var usesGrid: Bool { typeSize >= .xxxLarge }
    private var solidSurface: Bool { reduceTransparency || contrast == .increased }

    var body: some View {
        Group {
            if usesGrid {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 3), spacing: 4) {
                    ForEach(GalleryFilter.allCases) { categoryButton($0) }
                }
            } else {
                categoryButtons
            }
        }
            .padding(4).frame(maxWidth: .infinity).frame(minHeight: 52)
            .background {
                if usesGrid { RoundedRectangle(cornerRadius: 22).fill(theme.surface) }
                else if solidSurface { Capsule().fill(theme.surface) }
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
            ForEach(GalleryFilter.allCases) { categoryButton($0) }
        }
        .background {
            CategorySelectionIndicator(
                selectedIndex: GalleryFilter.allCases.firstIndex(of: store.filter) ?? 0,
                count: GalleryFilter.allCases.count,
                reduceMotion: reduceMotion,
                translucent: !solidSurface,
                tint: solidSurface ? theme.selectionFill : theme.accent
            )
        }
    }

    private func categoryButton(_ filter: GalleryFilter) -> some View {
        let selected = store.filter == filter
        let selectedInk = solidSurface || usesGrid ? theme.selectionForeground : theme.ink
        return Button { onSelect(filter) } label: {
            Text(filter.rawValue)
                .font(.system(size: labelSize, weight: selected ? .semibold : .medium))
                .lineLimit(usesGrid ? 2 : 1)
                .padding(.vertical, usesGrid ? 4 : 0)
                .frame(maxWidth: .infinity, minHeight: 44)
                .foregroundStyle(selected ? selectedInk : theme.ink.opacity(solidSurface ? 1 : 0.80))
                .offset(y: !usesGrid && !reduceMotion && selected && filter != .film ? -1 : 0)
                .animation(reduceMotion ? nil : .easeOut(duration: 0.35), value: selected)
                .background {
                    if usesGrid && selected { Capsule().fill(theme.selectionFill) }
                }
                .contentShape(Capsule())
        }
        .buttonStyle(CategoryPressStyle())
        .accessibilityAddTraits(selected ? [.isSelected] : [])
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
