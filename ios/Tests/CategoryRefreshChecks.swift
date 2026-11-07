import Foundation

@main
struct CategoryRefreshChecks {
    static func main() {
        let proMotion = DisplayRefreshPolicy(screenMaximum: 120, powerLimited: false)
        precondition(proMotion.minimum == 80 && proMotion.maximum == 120 && proMotion.preferred == 120)
        for limit in [30, 60, 80, 120, 144] {
            for constrained in [false, true] {
                let policy = DisplayRefreshPolicy(screenMaximum: limit, powerLimited: constrained)
                precondition(policy.minimum > 0 && policy.minimum <= policy.preferred)
                precondition(policy.preferred <= policy.maximum && policy.maximum <= Float(min(120, limit)))
                if constrained { precondition(policy.maximum <= 60) }
            }
        }
        let unknown = DisplayRefreshPolicy(screenMaximum: 0, powerLimited: false)
        precondition(unknown.preferred == 60)
        for limit in [30, 60, 80, 120, 144] {
            let spatial = DisplayRefreshPolicy(screenMaximum: limit, powerLimited: false, constrainedMaximum: 30)
            precondition(spatial.preferred == Float(min(120, limit)))
            let limited = DisplayRefreshPolicy(screenMaximum: limit, powerLimited: true, constrainedMaximum: 30)
            precondition(limited.maximum <= 30)
        }
        print("Global refresh checks passed: UI and spatial 120Hz preference, standard displays, power/thermal fallback.")
    }
}
