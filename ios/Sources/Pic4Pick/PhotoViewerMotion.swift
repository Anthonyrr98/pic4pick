import SwiftUI

// The root viewer intentionally stores this reference in @State, not
// @StateObject: only the small transform modifiers subscribe to motion updates.
@MainActor final class PhotoViewerMotion: ObservableObject {
    struct Values: Equatable {
        var infoDrag = 0.0
        var dismissDrag = 0.0
        var dragging = false
        var panelProgress: Double?
    }
    @Published private(set) var values = Values()
    var gesture = PhotoPreviewGestureState()

    init(native: Bool = false) { values.panelProgress = native ? 0 : nil }
    func updatePanelProgress(_ progress: Double) {
        var next = values; next.panelProgress = progress
        if next != values { values = next }
    }

    func update(infoDrag: Double, dismissDrag: Double) {
        let next = Values(infoDrag: infoDrag, dismissDrag: dismissDrag, dragging: true)
        if next != values { values = next }
    }
    func reset() {
        gesture.reset()
        var next = Values(); next.panelProgress = values.panelProgress
        if values != next { values = next }
    }
}

struct PhotoViewerMovingLayer: ViewModifier {
    enum Role: Sendable { case picture, preview, back, fullPanel, compactPanel, footer }
    @ObservedObject var motion: PhotoViewerMotion
    let layout: PhotoViewerLayout
    let expanded: Bool
    let role: Role
    var sharedPhoto = false

    func body(content: Content) -> some View {
        let values = motion.values
        let progress = values.panelProgress ?? layout.expansion(expanded: expanded, drag: values.infoDrag)
        let dismissal = min(values.dismissDrag, layout.height * 0.5)
        let offset: Double = switch role {
            case .picture: sharedPhoto ? 0 : dismissal * 0.55
            case .compactPanel: dismissal * 0.3
            case .fullPanel: (layout.expandedPanel - layout.collapsedPanel) * (1 - progress)
            default: 0
        }
        // Offset/opacity only: no frame, padding, card sizing or map resize here.
        content.offset(y: CGFloat(offset))
            .modifier(LayerOpacity(progress: progress, role: role, sharedPhoto: sharedPhoto))
    }

    private struct LayerOpacity: AnimatableModifier, Sendable {
        var progress: Double
        let role: Role
        let sharedPhoto: Bool

        nonisolated var animatableData: Double {
            get { progress }
            set { progress = newValue }
        }

        func body(content: Content) -> some View {
            let progress = min(1, max(0, progress))
            let opacity: Double = switch role {
                case .picture: sharedPhoto ? 1 : 1 - progress
                case .back: 1 - progress
                case .preview: progress
                case .footer: progress * PhotoViewerLayout.informationBlend(progress: progress)
                case .fullPanel: PhotoViewerLayout.informationBlend(progress: progress)
                case .compactPanel: PhotoViewerLayout.compactInformationOpacity(progress: progress)
            }
            content.opacity(opacity)
        }
    }
}
