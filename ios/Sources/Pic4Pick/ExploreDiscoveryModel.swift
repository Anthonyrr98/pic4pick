import Foundation

struct ExplorePlace: Identifiable, Sendable {
    let id: String
    let title: String
    let subtitle: String
    let latitude: Double?
    let longitude: Double?
    let photoIDs: [String]

    var hasCoordinate: Bool {
        guard let latitude, let longitude else { return false }
        return latitude.isFinite && longitude.isFinite && abs(latitude) <= 90 && abs(longitude) <= 180
    }

    func matches(_ query: String) -> Bool {
        let words = query.split(whereSeparator: \.isWhitespace)
        let text = title + " " + subtitle
        return words.allSatisfy { text.localizedStandardContains(String($0)) }
    }
}

struct ExploreDiscoveryIndex {
    let places: [ExplorePlace]
    private let photos: [String: Photo]

    init(places: [ExplorePlace], photos: [Photo]) {
        self.photos = Dictionary(photos.filter(\.isPublic).map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        var seen = Set<String>()
        self.places = places.filter { seen.insert($0.id).inserted }
    }

    func cover(for place: ExplorePlace) -> Photo? {
        cover(for: place.photoIDs)
    }

    func cover(for photoIDs: [String]) -> Photo? {
        // Keep album order when ratings tie, and never expose removed/private photos.
        var best: Photo?
        for id in photoIDs {
            if let photo = photos[id], best.map({ photo.displayRating > $0.displayRating }) ?? true {
                best = photo
            }
        }
        return best
    }

    var featured: [ExplorePlace] {
        let rated: [(place: ExplorePlace, rating: Int)] = places.compactMap { place in
            cover(for: place).map { (place, $0.displayRating) }
        }
        return rated.sorted { a, b in
            if a.rating != b.rating { return a.rating > b.rating }
            return a.place.title.localizedStandardCompare(b.place.title) == .orderedAscending
        }.map(\.place)
    }

    func results(for query: String) -> [ExplorePlace] {
        places.filter { $0.matches(query) && cover(for: $0) != nil }
    }
}

enum ExplorePanelDetent: Int {
    case collapsed, middle, expanded

    var lower: Self { Self(rawValue: rawValue - 1) ?? self }
    var higher: Self { Self(rawValue: rawValue + 1) ?? self }

    var accessibilityTitle: String {
        switch self {
        case .collapsed: "已收起"
        case .middle: "半展开"
        case .expanded: "全展开"
        }
    }
}

struct ExplorePanelStop {
    let duration: Double
    let firstControlY: Double

    init(distance: Double, velocity: Double) {
        let travel = abs(distance)
        let forwardSpeed = max(0, distance < 0 ? -velocity : velocity)
        let preferredDuration = min(0.30, 0.14 + travel / 1800)
        // A cubic with x controls at 1/3 and 2/3 uses linear time. Its
        // first y control sets release speed and its last y control stops at rest.
        let longestMonotonicDuration = forwardSpeed > 0 ? 3 * travel / forwardSpeed : preferredDuration
        duration = min(preferredDuration, max(0.10, longestMonotonicDuration))
        firstControlY = travel > 0 ? min(1, forwardSpeed * duration / (3 * travel)) : 0
    }
}

struct ExplorePanelLayout {
    static let horizontalInset = 16.0
    static let handleHeight = 12.0
    static let searchRowHeight = 44.0
    static let cornerRadius = 34.0
    static let searchHeight = 36.0
    static let searchToTitle = 22.0
    static let titleToCards = 17.0
    static let cardSpacing = 14.0
    static let cardHeight = 154.0

    let collapsed: Double
    let middle: Double
    let expanded: Double

    init(availableHeight: Double, topInset: Double = 0, bottomInset: Double = 0) {
        let height = max(0, availableHeight.isFinite ? availableHeight : 0)
        let fullHeight = height + topInset + bottomInset
        collapsed = min(height * 0.48 + bottomInset, max(172, fullHeight * 0.24))
        let mapClearance = max(topInset + 24, fullHeight * 0.082)
        expanded = max(collapsed, fullHeight - mapClearance)
        middle = min(expanded, max(collapsed, fullHeight * 0.632))
    }

    static func cardWidth(for viewport: Double) -> Double {
        min(220, max(100, (viewport - 2 * horizontalInset - cardSpacing - 6) / 2))
    }

    func height(at detent: ExplorePanelDetent) -> Double {
        switch detent {
        case .collapsed: collapsed
        case .middle: middle
        case .expanded: expanded
        }
    }

    func height(at detent: ExplorePanelDetent, drag: Double) -> Double {
        min(expanded, max(collapsed, height(at: detent) + drag))
    }

    func mapOffset(at detent: ExplorePanelDetent, drag: Double) -> Double {
        (collapsed - height(at: detent, drag: drag)) * 0.5
    }

    func destination(from detent: ExplorePanelDetent, translation: Double, predictedTranslation: Double) -> ExplorePanelDetent {
        let travelToMiddle = height(at: detent) - middle
        let crossedMiddle = (detent == .expanded && translation > travelToMiddle)
            || (detent == .collapsed && translation < travelToMiddle)
        // Once the finger crosses the middle, measure the snap threshold from there.
        let anchor = crossedMiddle ? .middle : detent
        let travel = crossedMiddle ? translation - travelToMiddle : translation
        let current = height(at: anchor)
        let down = current - height(at: anchor.lower)
        let up = height(at: anchor.higher) - current
        if down > 0, travel >= min(48, down * 0.2) { return anchor.lower }
        if up > 0, travel <= -min(48, up * 0.2) { return anchor.higher }
        let projectedTravel = predictedTranslation - translation
        if projectedTravel > 60, down > 0 { return anchor.lower }
        if projectedTravel < -60, up > 0 { return anchor.higher }
        return anchor
    }

    static func collapsePull(translation: Double, distanceToTop: Double) -> Double {
        max(0, translation - distanceToTop)
    }
}
