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

    static func selectionPosition(from index: Int, translation: Double = 0, rightToLeft: Bool = false,
                                  cellWidth: Double = itemWidth) -> Double {
        let logicalTranslation = rightToLeft ? -translation : translation
        let lastPosition = Double(AppSection.allCases.count - 1) * cellWidth
        return min(max(0, Double(index) * cellWidth + logicalTranslation), lastPosition)
    }

    static func selectionIndex(at position: Double, cellWidth: Double = itemWidth) -> Int {
        Int((position / cellWidth).rounded())
    }
}

struct GallerySwipeLayout {
    let origin: Int
    let destination: Int
    let startPosition: Double
    let startTranslation: Double

    private var lower: Double { min(startPosition, Double(origin), Double(destination)) }
    private var upper: Double { max(startPosition, Double(origin), Double(destination)) }
    var pages: ClosedRange<Int> { Int(lower.rounded(.down))...Int(upper.rounded(.up)) }

    func position(translation: Double, signedWidth: Double) -> Double {
        min(upper, max(lower, startPosition - (translation - startTranslation) / signedWidth))
    }

    static func destination(from origin: Int, step: Int, count: Int) -> Int? {
        let target = origin + step
        return (0..<count).contains(target) ? target : nil
    }
}
