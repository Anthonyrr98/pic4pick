import Foundation

enum PhotoPanelPanPolicy {
    static func contentAllowsPanelDrag(offset: Double, topInset: Double) -> Bool {
        offset.isFinite && topInset.isFinite && offset <= -topInset + 0.5
    }
    static func accepts(horizontal: Double, vertical: Double, expanded: Bool, zoomScale: Double, touches: Int) -> Bool {
        guard horizontal.isFinite, vertical.isFinite, zoomScale.isFinite,
              touches == 1, zoomScale <= 1.01 else { return false }
        // Allow a slightly angled dismissal. Horizontal paging requires
        // horizontal dominance, so these gesture directions never overlap.
        let verticalDominance = !expanded && vertical > 0 ? 1.1 : 1.25
        guard abs(vertical) > abs(horizontal) * verticalDominance else { return false }
        // In the normal viewer, up reveals metadata and down dismisses it.
        // Expanded metadata still uses down only, to collapse before exiting.
        return expanded ? vertical > 0 : vertical != 0
    }
}
