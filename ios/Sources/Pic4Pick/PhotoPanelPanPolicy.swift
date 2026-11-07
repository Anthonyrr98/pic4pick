import Foundation

enum PhotoPanelPanPolicy {
    static func contentAllowsPanelDrag(offset: Double, topInset: Double) -> Bool {
        offset.isFinite && topInset.isFinite && offset <= -topInset + 0.5
    }
    static func accepts(horizontal: Double, vertical: Double, expanded: Bool, zoomScale: Double, touches: Int) -> Bool {
        guard horizontal.isFinite, vertical.isFinite, zoomScale.isFinite,
              touches == 1, zoomScale <= 1.01,
              abs(vertical) > abs(horizontal) * 1.25 else { return false }
        // In the normal viewer, up reveals metadata and down dismisses it.
        // Expanded metadata still uses down only, to collapse before exiting.
        return expanded ? vertical > 0 : vertical != 0
    }

    static func shouldDismiss(expanded: Bool, translation: Double, predictedTranslation: Double) -> Bool {
        guard !expanded, translation.isFinite, predictedTranslation.isFinite, translation >= 18 else { return false }
        return translation >= 64 || predictedTranslation >= 150
    }
}
