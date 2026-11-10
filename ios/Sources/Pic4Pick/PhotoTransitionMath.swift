import Foundation

enum PhotoPagingTransition {
    static func pageStep(width: Double) -> Double { max(1, width) + 32 }

    static func progress(translation: Double, width: Double) -> Double {
        min(1, max(-1, translation / pageStep(width: width)))
    }

    static func destination(progress: Double, velocity: Double, width: Double) -> Int {
        let projected = progress + velocity * 0.14 / pageStep(width: width)
        guard abs(projected) >= 0.28, abs(progress) >= 0.035, projected * progress > 0 else { return 0 }
        return projected > 0 ? 1 : -1
    }

    static func reducedMotionOpacity(page: Int, progress: Double) -> Double {
        if page == 0 { return 1 - smooth((abs(progress) - 0.55) / 0.45) }
        guard abs(page) == 1 else { return 0 }
        return smooth(Double(page) * progress / 0.75)
    }

    private static func smooth(_ value: Double) -> Double {
        let p = min(1, max(0, value))
        return p * p * (3 - 2 * p)
    }
}

// All distances are points, velocities points/second. Shared by UIKit and Linux checks.
enum PhotoTransitionTuning {
    static let dismissMinimumDistance = 18.0
    static let dragRange = 460.0
    static let interactiveMinimumScale = 0.82
    static let backgroundFadeProgress = 0.68
    static let interactiveBackgroundFloor = 0.02
    static let returnSpringResponse = 0.34
    static let returnSpringDamping = 0.92
    static let transitionDurationRange = 0.30...0.54
    static let springTailStart = 0.70
    static let thumbnailHandoffDuration = 0.08
    static let panelSpringResponse = 0.44
    static let panelSpringDamping = 0.94
    static let panelSettleDuration = 0.44
    static let maximumVelocity = 4500.0
    static let openingDuration = 0.48
    static let cancelDuration = 0.42
    static let fallbackScale = 0.84

    static func shouldDismiss(translation: Double, velocity: Double) -> Bool {
        guard translation.isFinite, velocity.isFinite else { return false }
        // A deliberate reversal cancels even after a long downward excursion.
        return translation >= dismissMinimumDistance && velocity > -250
    }
    static func duration(distance: Double, velocity: Double) -> Double {
        min(transitionDurationRange.upperBound, max(transitionDurationRange.lowerBound, (0.30 + sqrt(max(0, distance) / 1000) * 0.16) /
            (1 + max(0, velocity) / 5000)))
    }
}

// Claim once at touch-down; an upward information gesture must never turn into
// a dismissal simply because the same finger reverses direction past its start.
struct PhotoPreviewGestureState {
    enum Owner { case information, dismissal }
    private(set) var owner: Owner?
    mutating func claim(expanded: Bool, vertical: Double, velocity: Double = 0, returning: Bool) -> Owner? {
        if let owner { return owner }
        // Native .began may report zero translation. Use its measured velocity,
        // or defer ownership, instead of locking every zero-origin gesture to dismiss.
        let direction = abs(vertical) > 0.5 ? vertical : velocity
        if !expanded && !returning && abs(direction) < 0.001 { return nil }
        let next: Owner = expanded || (!returning && direction < 0) ? .information : .dismissal
        owner = next; return next
    }
    mutating func reset() { owner = nil }
}

struct PhotoTransitionState {
    // Center x/y, clip width/height, inner-image center x/y and width, corner, backdrop, image alpha.
    var values: [Double]
    let aspect: Double
    init(clip: CGRect, image: CGRect, corner: Double = 0, backdrop: Double = 1, alpha: Double = 1) {
        aspect = Double(image.width / max(0.001, image.height))
        values = [Double(clip.midX), Double(clip.midY), Double(clip.width), Double(clip.height),
            Double(image.midX - clip.minX), Double(image.midY - clip.minY), Double(image.width), corner, backdrop, alpha]
    }
    var clip: CGRect { CGRect(x: values[0] - values[2] / 2, y: values[1] - values[3] / 2, width: max(0.01, values[2]), height: max(0.01, values[3])) }
    var inner: CGRect { CGRect(x: values[4] - values[6] / 2, y: values[5] - values[6] / aspect / 2, width: max(0.01, values[6]), height: max(0.01, values[6] / aspect)) }
    static func imageRect(size: CGSize, in rect: CGRect, fill: Bool) -> CGRect {
        let x = rect.width / max(1, size.width), y = rect.height / max(1, size.height)
        let scale = fill ? max(x, y) : min(x, y)
        let width = size.width * scale, height = size.height * scale
        return CGRect(x: rect.midX - width / 2, y: rect.midY - height / 2, width: width, height: height)
    }
    func interpolated(to target: PhotoTransitionState, progress: Double) -> PhotoTransitionState {
        let p = min(1, max(0, progress))
        var state = self
        for index in values.indices { state.values[index] = values[index] + (target.values[index] - values[index]) * p }
        return state
    }
    func dragged(translation: CGPoint, anchor: CGPoint) -> PhotoTransitionState {
        var state = self
        let progress = min(1, max(0, Double(translation.y) / PhotoTransitionTuning.dragRange))
        let scale = 1 - (1 - PhotoTransitionTuning.interactiveMinimumScale) * progress
        state.values[0] += Double(translation.x) + Double(anchor.x) * (1 - scale)
        state.values[1] += Double(translation.y) + Double(anchor.y) * (1 - scale)
        for index in 2...6 { state.values[index] *= scale }
        state.values[7] = max(values[7], progress * 18)
        let fade = min(1, progress / PhotoTransitionTuning.backgroundFadeProgress)
        let floor = PhotoTransitionTuning.interactiveBackgroundFloor
        state.values[8] = values[8] * (floor + (1 - floor) * (1 - fade * fade * (3 - 2 * fade)))
        return state
    }
    func dragVelocity(translation: CGPoint, velocity: CGPoint, anchor: CGPoint) -> [Double] {
        var result = Array(repeating: 0.0, count: values.count)
        let vx = min(PhotoTransitionTuning.maximumVelocity, max(-PhotoTransitionTuning.maximumVelocity, Double(velocity.x)))
        let vy = min(PhotoTransitionTuning.maximumVelocity, max(-PhotoTransitionTuning.maximumVelocity, Double(velocity.y)))
        let active = translation.y > 0 && Double(translation.y) < PhotoTransitionTuning.dragRange
        let ds = active ? -(1 - PhotoTransitionTuning.interactiveMinimumScale) * vy / PhotoTransitionTuning.dragRange : 0
        result[0] = vx - Double(anchor.x) * ds; result[1] = vy - Double(anchor.y) * ds
        for index in 2...6 { result[index] = values[index] * ds }
        result[7] = active ? 18 * vy / PhotoTransitionTuning.dragRange : 0
        let fade = min(1, max(0, Double(translation.y) / PhotoTransitionTuning.dragRange / PhotoTransitionTuning.backgroundFadeProgress))
        result[8] = -values[8] * (1 - PhotoTransitionTuning.interactiveBackgroundFloor) * 6 * fade * (1 - fade) * vy /
            (PhotoTransitionTuning.dragRange * PhotoTransitionTuning.backgroundFadeProgress)
        return result
    }
}

enum PhotoTransitionSpring {
    static func panelOpeningProgress(from: Double, velocity: Double, time: Double, duration: Double) -> Double {
        let progress = min(1, max(0, time / duration))
        let remaining = 1 - progress
        let distance = 1 - from
        // A cubic with zero end velocity stays monotonic when the initial
        // tangent is between zero and three times the remaining travel.
        let tangent = min(3 * distance, max(0, velocity * duration))
        return from + distance * progress * progress * (3 - 2 * progress)
            + tangent * progress * remaining * remaining
    }

    private static func omega(_ duration: Double, response: Double) -> Double {
        2 * Double.pi / min(response, duration * 0.76)
    }
    private static func tail(time: Double, duration: Double) -> (weight: Double, velocity: Double) {
        let start = PhotoTransitionTuning.springTailStart
        let p = min(1, max(0, (time / duration - start) / (1 - start)))
        let smooth = p * p * p * (10 + p * (-15 + 6 * p))
        let slope = 30 * p * p * (p - 1) * (p - 1) / (duration * (1 - start))
        return (1 - smooth, -slope)
    }
    // Analytic damped spring: exact starting position AND velocity, independent of frame cadence.
    // A single normalized UIViewPropertyAnimator velocity cannot express crop, size and center velocities.
    static func value(from: Double, to: Double, velocity: Double, time: Double, duration: Double,
                      response: Double = PhotoTransitionTuning.returnSpringResponse, damping: Double = PhotoTransitionTuning.returnSpringDamping) -> Double {
        if time <= 0 { return from }
        if time >= duration { return to }
        let omega = omega(duration, response: response)
        let wd = omega * sqrt(1 - damping * damping)
        let displacement = from - to
        let b = (velocity + damping * omega * displacement) / wd
        let physical = exp(-damping * omega * time) * (displacement * cos(wd * time) + b * sin(wd * time))
        return to + physical * tail(time: time, duration: duration).weight
    }
    static func velocity(from: Double, to: Double, initial: Double, time: Double, duration: Double,
                         response: Double = PhotoTransitionTuning.returnSpringResponse, damping: Double = PhotoTransitionTuning.returnSpringDamping) -> Double {
        if time <= 0 { return initial }
        if time >= duration { return 0 }
        let omega = omega(duration, response: response), decay = damping * omega
        let wd = omega * sqrt(1 - damping * damping)
        let a = from - to, b = (initial + decay * a) / wd
        let physical = exp(-decay * time) * (a * cos(wd * time) + b * sin(wd * time))
        let speed = exp(-decay * time) * ((b * wd - decay * a) * cos(wd * time) - (a * wd + decay * b) * sin(wd * time))
        let tail = tail(time: time, duration: duration)
        return speed * tail.weight + physical * tail.velocity
    }
}
