import SwiftUI

struct FloatingBottomNavigation: View {
    @Binding var selectedTab: Int
    @Environment(\.galleryAppearance) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.layoutDirection) private var layoutDirection
    @ScaledMetric(relativeTo: .caption) private var labelSize: CGFloat = 12

    var body: some View {
        Group {
            if #available(iOS 26.0, *), !reduceTransparency {
                buttons.glassEffect(.regular.interactive(!reduceMotion), in: Capsule())
            } else {
                buttons.background {
                    if reduceTransparency { Capsule().fill(theme.surface) }
                    else { Capsule().fill(.ultraThinMaterial) }
                }
                .shadow(color: .black.opacity(0.10), radius: 10, y: 4)
            }
        }
        .overlay {
            Capsule().strokeBorder(.white.opacity(reduceTransparency ? 0.24 : 0.60), lineWidth: 0.7)
                .allowsHitTesting(false)
        }
        .fixedSize(horizontal: true, vertical: true)
        // Own the entire glass surface, including padding between the buttons.
        // A material/glass background alone does not consume those taps.
        .contentShape(.interaction, Capsule())
        .onTapGesture { }
        .accessibilityElement(children: .contain).accessibilityLabel("主导航")
    }

    private var buttons: some View {
        HStack(spacing: 0) {
            ForEach(AppSection.allCases) { section in
                let active = selectedTab == section.rawValue
                Button { selectedTab = section.rawValue } label: {
                    HStack(spacing: 7) {
                        Image(systemName: section.symbol).font(.system(size: 16, weight: .medium))
                        Text(section.title).font(.system(size: labelSize, weight: active ? .semibold : .medium))
                            .lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .foregroundStyle(active ? Color.white : theme.ink.opacity(0.68))
                    .frame(width: CGFloat(BottomNavigationMetrics.itemWidth), height: CGFloat(BottomNavigationMetrics.itemHeight))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(section.title)
                .accessibilityAddTraits(active ? [.isSelected] : [])
                .accessibilityIdentifier("bottom-tab-\(section.rawValue)")
            }
        }
        .background(alignment: .leading) {
            // One persistent capsule moves between the two fixed button cells.
            // Keep it outside the conditional button labels so it never gets
            // removed/recreated when the selected destination changes.
            Capsule().fill(Color.hex(0x384852).opacity(reduceTransparency ? 0.88 : 0.37))
                .frame(width: CGFloat(BottomNavigationMetrics.itemWidth), height: CGFloat(BottomNavigationMetrics.selectionHeight))
                .offset(x: selectionOffset)
                .animation(reduceMotion ? nil : .smooth(duration: AppPageLayer.fadeDuration), value: selectedTab)
                .allowsHitTesting(false).accessibilityHidden(true)
        }
        .padding(.horizontal, CGFloat(BottomNavigationMetrics.padding))
        // Limit animation to the control, never to the entire gallery/map tree.
        .animation(reduceMotion ? nil : .smooth(duration: AppPageLayer.fadeDuration), value: selectedTab)
    }

    private var selectionOffset: CGFloat {
        let index = AppSection.allCases.firstIndex { $0.rawValue == selectedTab } ?? 0
        let direction: CGFloat = layoutDirection == .rightToLeft ? -1 : 1
        return direction * CGFloat(index) * CGFloat(BottomNavigationMetrics.itemWidth)
    }
}
