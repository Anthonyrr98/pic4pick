import Foundation

@main
struct CategoryIndicatorChecks {
    static func main() {
        for screen in [320.0, 390, 430, 844, 1024] {
            let available = screen - 40 - 8
            for index in 0..<5 {
                let layout = CategoryIndicatorLayout(containerWidth: available, count: 5, selectedIndex: index)
                precondition(abs(layout.width * 5 - available) < 0.00001)
                precondition(abs(layout.offset - Double(index) * layout.width) < 0.00001)
                precondition(layout.offset >= 0 && layout.offset + layout.width <= available + 0.00001)
                let rtl = CategoryIndicatorLayout(containerWidth: available, count: 5, selectedIndex: index, rightToLeft: true)
                precondition(abs(rtl.offset - Double(4 - index) * layout.width) < 0.00001)
            }
        }
        // No queued transitions or intermediate selection state: the newest tap wins.
        let sequence = [0, 4, 1, 3, 0, 2, 1]
        let offsets = sequence.map { CategoryIndicatorLayout(containerWidth: 342, count: 5, selectedIndex: $0).offset }
        precondition(abs(offsets.last! - 68.4) < 0.00001)
        let empty = CategoryIndicatorLayout(containerWidth: .nan, count: 0, selectedIndex: 99)
        precondition(empty.width == 0 && empty.offset == 0)
        let clamped = CategoryIndicatorLayout(containerWidth: 100, count: 5, selectedIndex: 99)
        precondition(clamped.offset == 80)
        print("Category indicator checks passed: five categories, portrait/landscape, RTL and rapid selections.")
    }
}
