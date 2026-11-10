import Foundation

@main
struct AppNavigationChecks {
    static func main() {
        precondition(AppSection.allCases.map(\.rawValue) == [0, 1])
        precondition(AppSection.allCases.map(\.title) == ["图库", "发现"])
        precondition(Set(AppSection.allCases.map(\.symbol)).count == 2)
        precondition(AppSection(rawValue: 2) == nil && AppSection(rawValue: 3) == nil)
        precondition(BottomNavigationMetrics.itemHeight >= 44)
        precondition(BottomNavigationMetrics.contentClearance > BottomNavigationMetrics.height + BottomNavigationMetrics.bottomPadding)
        for viewport in [320.0, 390, 430, 844, 1024] {
            precondition(BottomNavigationMetrics.width < viewport - 40, "Floating control must not become a full-width bar")
        }
        let width = BottomNavigationMetrics.itemWidth
        precondition(BottomNavigationMetrics.selectionPosition(from: 0, translation: 24) == 24)
        precondition(BottomNavigationMetrics.selectionPosition(from: 1, translation: -24) == width - 24)
        precondition(BottomNavigationMetrics.selectionPosition(from: 0, translation: -100) == 0)
        precondition(BottomNavigationMetrics.selectionPosition(from: 0, translation: 100) == width)
        precondition(BottomNavigationMetrics.selectionPosition(from: 0, translation: -24, rightToLeft: true) == 24)
        precondition(BottomNavigationMetrics.selectionIndex(at: width * 0.4) == 0)
        precondition(BottomNavigationMetrics.selectionIndex(at: width * 0.6) == 1)
        let wideCell = 108.0
        precondition(BottomNavigationMetrics.selectionPosition(from: 1, translation: 40, rightToLeft: true,
            cellWidth: wideCell) == wideCell - 40)
        precondition(BottomNavigationMetrics.selectionPosition(from: 0, translation: 200, cellWidth: wideCell) == wideCell)
        precondition(BottomNavigationMetrics.selectionIndex(at: 48, cellWidth: wideCell) == 0)
        precondition(BottomNavigationMetrics.selectionIndex(at: 60, cellWidth: wideCell) == 1)
        let forward = GallerySwipeLayout(origin: 1, destination: 2, startPosition: 0.5, startTranslation: -12)
        precondition(forward.pages == 0...2)
        precondition(forward.position(translation: -12, signedWidth: 400) == 0.5)
        precondition(forward.position(translation: -212, signedWidth: 400) == 1)
        precondition(forward.position(translation: -1_212, signedWidth: 400) == 2)
        let reverse = GallerySwipeLayout(origin: 1, destination: 0, startPosition: 0.5, startTranslation: 12)
        precondition(reverse.pages == 0...1)
        precondition(reverse.position(translation: 12, signedWidth: 400) == 0.5)
        precondition(reverse.position(translation: 112, signedWidth: 400) == 0.25)
        let mirrored = GallerySwipeLayout(origin: 1, destination: 0, startPosition: 0.5, startTranslation: -12)
        precondition(mirrored.position(translation: -112, signedWidth: -400) == 0.25)
        precondition(GallerySwipeLayout.destination(from: 0, step: -1, count: 5) == nil)
        precondition(GallerySwipeLayout.destination(from: 4, step: 1, count: 5) == nil)
        precondition(GallerySwipeLayout.destination(from: 3, step: 1, count: 5) == 4)
        print("Gallery swipe checks passed: continuous re-grab, reversal, RTL, and category bounds.")
        print("App navigation checks passed: exactly gallery/explore, compact floating width, accessible targets and bottom clearance.")
    }
}
