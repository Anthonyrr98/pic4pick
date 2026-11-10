import SwiftUI

struct FloatingBottomNavigation: View {
    @Binding var selectedTab: Int
    @Environment(\.galleryAppearance) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.layoutDirection) private var layoutDirection
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.colorSchemeContrast) private var contrast
    @ScaledMetric(relativeTo: .caption) private var labelSize: CGFloat = 12
    @GestureState private var dragPosition: Double?

    private var cellWidth: CGFloat {
        let iconSpace: CGFloat = typeSize.isAccessibilitySize ? 0 : 23
        return max(CGFloat(BottomNavigationMetrics.itemWidth), labelSize * 2 + iconSpace + 12)
    }
    private var cellHeight: CGFloat {
        max(CGFloat(BottomNavigationMetrics.itemHeight), ceil(labelSize * 1.25) + (typeSize.isAccessibilitySize ? 24 : 10))
    }
    private var solidSurface: Bool { reduceTransparency || contrast == .increased }

    var body: some View {
        Group {
            if #available(iOS 26.0, *), !solidSurface {
                buttons.glassEffect(.regular.interactive(!reduceMotion), in: Capsule())
            } else {
                buttons.background {
                    if solidSurface { Capsule().fill(theme.surface) }
                    else { Capsule().fill(.ultraThinMaterial) }
                }
                .shadow(color: .black.opacity(0.10), radius: 10, y: 4)
                .overlay {
                    Capsule().strokeBorder(contrast == .increased ? theme.ink : .white.opacity(reduceTransparency ? 0.24 : 0.60),
                        lineWidth: contrast == .increased ? 1 : 0.7)
                        .allowsHitTesting(false)
                }
            }
        }
        .fixedSize(horizontal: true, vertical: true)
        // Own the entire glass surface, including padding between the buttons.
        // A material/glass background alone does not consume those taps.
        .contentShape(.interaction, Capsule())
        .highPriorityGesture(selectionDrag)
        .onTapGesture { }
        .sensoryFeedback(.selection, trigger: selectedTab)
        .accessibilityElement(children: .contain).accessibilityLabel("主导航")
    }

    private var buttons: some View {
        HStack(spacing: 0) {
            ForEach(AppSection.allCases) { section in
                let selected = selectedTab == section.rawValue
                Button { selectedTab = section.rawValue } label: {
                    tabLabel(section)
                        .foregroundStyle(theme.ink.opacity(solidSurface ? 1 : 0.78))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(section.title)
                .accessibilityAddTraits(selected ? [.isSelected] : [])
                .accessibilityIdentifier("bottom-tab-\(section.rawValue)")
            }
        }
        .overlay {
            // Reveal the selected foreground only where the moving capsule covers it.
            HStack(spacing: 0) {
                ForEach(AppSection.allCases) { tabLabel($0) }
            }
            .foregroundStyle(solidSurface ? theme.selectionForeground : theme.ink)
            .mask(alignment: .leading) { movingCapsule(.white) }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
        .background(alignment: .leading) {
            movingCapsule(theme.selectionFill.opacity(solidSurface ? 1 : 0.24))
                .allowsHitTesting(false).accessibilityHidden(true)
        }
        .animation(reduceMotion || dragPosition != nil ? nil : .smooth(duration: AppPageLayer.fadeDuration), value: selectionPosition)
        .padding(.horizontal, CGFloat(BottomNavigationMetrics.padding))
        // Limit animation to the control, never to the entire gallery/map tree.
        .animation(reduceMotion ? nil : .smooth(duration: AppPageLayer.fadeDuration), value: selectedTab)
    }

    private func tabLabel(_ section: AppSection) -> some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 2)) : AnyLayout(HStackLayout(spacing: 7))
        return layout {
            Image(systemName: section.symbol).font(.system(size: 16, weight: .medium))
            Text(section.title).font(.system(size: labelSize, weight: .semibold))
        }
        .frame(width: cellWidth, height: cellHeight)
    }

    private func movingCapsule(_ color: Color) -> some View {
        Capsule().fill(color)
            .frame(width: cellWidth, height: cellHeight - 9)
            .offset(x: CGFloat(selectionPosition) * (layoutDirection == .rightToLeft ? -1 : 1))
    }

    private var selectionPosition: Double {
        dragPosition ?? BottomNavigationMetrics.selectionPosition(from: selectedTab, cellWidth: Double(cellWidth))
    }

    private var selectionDrag: some Gesture {
        DragGesture(minimumDistance: 5)
            .updating($dragPosition) { value, position, transaction in
                guard abs(value.translation.width) > abs(value.translation.height) else { return }
                transaction.animation = nil
                position = positionAfterDrag(value.translation.width)
            }
            .onEnded { value in
                guard abs(value.translation.width) > abs(value.translation.height) else { return }
                let projectedPosition = positionAfterDrag(value.predictedEndTranslation.width)
                let destination = BottomNavigationMetrics.selectionIndex(at: projectedPosition, cellWidth: Double(cellWidth))
                if destination != selectedTab { selectedTab = destination }
            }
    }

    private func positionAfterDrag(_ translation: CGFloat) -> Double {
        BottomNavigationMetrics.selectionPosition(from: selectedTab, translation: Double(translation),
            rightToLeft: layoutDirection == .rightToLeft, cellWidth: Double(cellWidth))
    }
}
