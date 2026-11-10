import Foundation

@main
struct ExploreDiscoveryChecks {
    static func main() throws {
        for height in [0.0, 180, 260, 375, 759, 852, 1024, 1366, .infinity] {
            let layout = ExplorePanelLayout(availableHeight: height)
            precondition(layout.collapsed.isFinite && layout.expanded.isFinite)
            precondition(layout.collapsed >= 0 && layout.middle >= layout.collapsed && layout.expanded >= layout.middle)
            if height.isFinite { precondition(layout.expanded <= height) }
            precondition(layout.height(at: .collapsed, drag: -10_000) == layout.collapsed)
            precondition(layout.height(at: .collapsed, drag: 10_000) == layout.expanded)
            precondition(layout.height(at: .expanded, drag: -10_000) == layout.collapsed)
            precondition(layout.height(at: .expanded, drag: 10_000) == layout.expanded)
        }
        let layout = ExplorePanelLayout(availableHeight: 759)
        precondition(layout.mapOffset(at: .collapsed, drag: 0) == 0)
        precondition(abs(layout.mapOffset(at: .collapsed, drag: 100) + 50) < 0.001)
        precondition(abs(layout.mapOffset(at: .middle, drag: -40) - layout.mapOffset(at: .middle, drag: 0) - 20) < 0.001)
        precondition(layout.mapOffset(at: .expanded, drag: 500) == (layout.collapsed - layout.expanded) / 2)
        let portrait = ExplorePanelLayout(availableHeight: 759, topInset: 51, bottomInset: 34)
        precondition(abs(portrait.collapsed / 844 - 0.24) < 0.005)
        precondition(abs(portrait.middle / 844 - 0.632) < 0.005)
        precondition(portrait.expanded == 769)
        precondition(ExplorePanelLayout.cardWidth(for: 390) == 169)
        precondition(layout.destination(from: .collapsed, translation: -10, predictedTranslation: -20) == .collapsed)
        precondition(layout.destination(from: .collapsed, translation: -20, predictedTranslation: -160) == .middle)
        precondition(layout.destination(from: .expanded, translation: 30, predictedTranslation: 200) == .middle)
        precondition(layout.destination(from: .expanded, translation: 5, predictedTranslation: 10) == .expanded)
        // Short drags settle in the adjacent stop.
        precondition(layout.destination(from: .expanded, translation: 55, predictedTranslation: 55) == .middle)
        precondition(layout.destination(from: .middle, translation: 55, predictedTranslation: 55) == .collapsed)
        precondition(layout.destination(from: .middle, translation: -55, predictedTranslation: -55) == .expanded)
        let downToMiddle = layout.expanded - layout.middle
        let upToMiddle = layout.middle - layout.collapsed
        for delta in [-2.0, -1, 0, 1, 2] {
            precondition(abs(layout.height(at: .expanded, drag: -downToMiddle + delta) - (layout.middle + delta)) < 0.001)
            precondition(abs(layout.height(at: .collapsed, drag: upToMiddle + delta) - (layout.middle + delta)) < 0.001)
        }
        let justBelowMiddle = downToMiddle + 5
        let justAboveMiddle = -upToMiddle - 5
        precondition(layout.destination(from: .expanded, translation: justBelowMiddle, predictedTranslation: justBelowMiddle) == .middle)
        precondition(layout.destination(from: .collapsed, translation: justAboveMiddle, predictedTranslation: justAboveMiddle) == .middle)
        precondition(layout.destination(from: .expanded, translation: 500, predictedTranslation: 500) == .collapsed)
        precondition(layout.destination(from: .collapsed, translation: -500, predictedTranslation: -500) == .expanded)
        // The list consumes the first part of a pull. Only the excess can collapse the sheet.
        precondition(ExplorePanelLayout.collapsePull(translation: -55, distanceToTop: 0) == 0)
        precondition(ExplorePanelLayout.collapsePull(translation: 120, distanceToTop: 120) == 0)
        let pull = ExplorePanelLayout.collapsePull(translation: 175, distanceToTop: 120)
        precondition(pull == 55)
        precondition(layout.destination(from: .expanded, translation: pull, predictedTranslation: pull) == .middle)

        let stop = ExplorePanelStop(distance: -150, velocity: -900)
        precondition(abs(3 * stop.firstControlY * 150 / stop.duration - 900) < 0.001)
        precondition(ExplorePanelStop(distance: 150, velocity: -900).firstControlY == 0)
        let quickStop = ExplorePanelStop(distance: 10, velocity: 2500)
        precondition(quickStop.duration < stop.duration && quickStop.firstControlY == 1)
        precondition(ExplorePanelStop(distance: 0, velocity: 900).firstControlY == 0)

        func photo(_ id: String, rating: Int, hidden: Bool = false) throws -> Photo {
            let row: [String: Any] = ["id": id, "image_url": "https://example.com/\(id).jpg",
                "status": "approved", "hidden": hidden, "rating": rating]
            return try JSONDecoder().decode(Photo.self, from: JSONSerialization.data(withJSONObject: row))
        }
        let beijing = ExplorePlace(id: "bj", title: "Beijing 北京", subtitle: "中国 华北", latitude: 39.9, longitude: 116.4,
            photoIDs: ["low", "best", "tie", "private"])
        let empty = ExplorePlace(id: "empty", title: "空相册", subtitle: "", latitude: nil, longitude: nil, photoIDs: ["deleted"])
        let hidden = ExplorePlace(id: "hidden", title: "私有相册", subtitle: "", latitude: 1, longitude: 1, photoIDs: ["private"])
        let landmark = ExplorePlace(id: "landmark", title: "北京景点", subtitle: "", latitude: 39.9, longitude: 116.4,
            photoIDs: ["tie"])
        let index = ExploreDiscoveryIndex(places: [beijing, empty, hidden, beijing], photos: [
            try photo("low", rating: 4), try photo("best", rating: 9), try photo("tie", rating: 9),
            try photo("private", rating: 10, hidden: true)], additionalSearchPlaces: [landmark, beijing])
        precondition(index.places.count == 3)
        precondition(index.cover(for: beijing)?.id == "best", "Choose a public cover and keep original order for tied ratings")
        precondition(index.featured.map(\.id) == ["bj"])
        precondition(index.results(for: "  beijing  华北 ").map(\.id) == ["bj"])
        precondition(index.results(for: "北京").map(\.id) == ["bj", "landmark"])
        precondition(index.cover(for: landmark)?.id == "tie")
        precondition(index.results(for: "北京 上海").isEmpty)
        precondition(index.results(for: "空相册").isEmpty)
        precondition(beijing.hasCoordinate && !empty.hasCoordinate)
        let invalid = ExplorePlace(id: "invalid", title: "", subtitle: "", latitude: .nan, longitude: 181, photoIDs: [])
        precondition(!invalid.hasCoordinate)
        print("Discovery checks passed: panel limits/drag snapping, search, stable public covers, empty albums and coordinates.")
    }
}
