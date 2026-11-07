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
        print("App navigation checks passed: exactly gallery/explore, compact floating width, accessible targets and bottom clearance.")
    }
}
