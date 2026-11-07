import Foundation

enum AppSection: Int, CaseIterable, Identifiable, Sendable {
    case gallery = 0
    case explore = 1

    var id: Int { rawValue }
    var title: String { self == .gallery ? "图库" : "发现" }
    var symbol: String { self == .gallery ? "rectangle.split.2x1.fill" : "map.fill" }
}

enum BottomNavigationMetrics {
    static let itemWidth = 71.0
    static let itemHeight = 44.0
    static let selectionHeight = 35.0
    static let padding = 3.0
    // Bring the glass surface slightly into the bottom safe-area inset.
    static let bottomPadding = -5.0
    static let contentClearance = 80.0
    static var width: Double { itemWidth * Double(AppSection.allCases.count) + padding * 2 }
    static var height: Double { itemHeight }
}
