import Foundation

// Shared by the entire UI scene, category animations and the spatial renderer.
struct DisplayRefreshPolicy: Sendable {
    let minimum: Float
    let maximum: Float
    let preferred: Float

    init(screenMaximum: Int, powerLimited: Bool, constrainedMaximum: Int = 60) {
        let supported = min(120, screenMaximum > 0 ? screenMaximum : 60)
        let target = Float(powerLimited ? min(max(1, constrainedMaximum), supported) : supported)
        minimum = min(80, target)
        maximum = target
        preferred = target
    }
}
