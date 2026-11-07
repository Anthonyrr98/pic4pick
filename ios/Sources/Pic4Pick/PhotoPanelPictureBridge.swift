import SwiftUI
import UIKit

// Geometry/configuration only. No per-frame SwiftUI -> UIKit round trip.
struct PhotoPanelPictureBridge: UIViewRepresentable {
    let layout: PhotoViewerLayout
    let expanded: Bool
    let session: PhotoPreviewSession
    let interaction: PhotoPanelInteraction
    let motion: PhotoViewerMotion
    func makeUIView(context: Context) -> UIView { let view = UIView(); view.isUserInteractionEnabled = false; return view }
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UIView, context: Context) -> CGSize? { .zero }
    func updateUIView(_ view: UIView, context: Context) { session.configurePanel(layout: layout, expanded: expanded, interaction: interaction, motion: motion) }
}

struct PhotoPanelHeaderAnchor: UIViewRepresentable {
    let session: PhotoPreviewSession
    func makeUIView(context: Context) -> Anchor {
        let view = Anchor(); view.session = session; view.isUserInteractionEnabled = false
        return view
    }
    func updateUIView(_ view: Anchor, context: Context) { session.registerHeader(view) }
    static func dismantleUIView(_ view: Anchor, coordinator: ()) { view.session?.unregisterHeader(view) }
    @MainActor final class Anchor: UIView {
        weak var session: PhotoPreviewSession?
        private var lastFrame = CGRect.null
        override func didMoveToWindow() { super.didMoveToWindow(); session?.registerHeader(self); notifyGeometry() }
        override func layoutSubviews() { super.layoutSubviews(); notifyGeometry() }
        private func notifyGeometry() {
            guard let window else { return }
            let frame = convert(bounds, to: window)
            guard frame != lastFrame else { return }
            lastFrame = frame; session?.headerGeometryChanged()
        }
    }
}
