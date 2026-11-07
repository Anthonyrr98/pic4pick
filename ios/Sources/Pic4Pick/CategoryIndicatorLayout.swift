import Foundation

// The filter buttons share equal widths; the single indicator follows that layout.
struct CategoryIndicatorLayout: Sendable {
    let width: Double
    let offset: Double

    init(containerWidth: Double, count: Int, selectedIndex: Int, rightToLeft: Bool = false) {
        let count = max(1, count)
        let available = containerWidth.isFinite ? max(0, containerWidth) : 0
        let index = min(count - 1, max(0, selectedIndex))
        width = available / Double(count)
        offset = width * Double(rightToLeft ? count - 1 - index : index)
    }
}
