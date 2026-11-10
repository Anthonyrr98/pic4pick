import Foundation

@main struct PhotoTransitionChecks {
    static func near(_ a: Double, _ b: Double, tolerance: Double = 0.00001) { precondition(abs(a - b) < tolerance, "\(a) != \(b)") }
    static func main() {
        let screen = CGRect(x: 0, y: 0, width: 390, height: 844)
        for size in [CGSize(width: 1800, height: 1200), CGSize(width: 1200, height: 1800), CGSize(width: 700, height: 7000)] {
            let cell = CGRect(x: 203, y: 360, width: 167, height: 223)
            let cropped = PhotoTransitionState.imageRect(size: size, in: cell, fill: true)
            precondition(cropped.width >= cell.width - 0.001 && cropped.height >= cell.height - 0.001)
            let fitted = PhotoTransitionState.imageRect(size: size, in: screen, fill: false)
            precondition(fitted.width <= screen.width + 0.001 && fitted.height <= screen.height + 0.001)
            let full = PhotoTransitionState(clip: fitted, image: fitted)
            let anchor = CGPoint(x: 25, y: 60)
            for dy in [0.0, 5, 60, 170, 350, 140, 30, 0, -20] {
                let translation = CGPoint(x: dy / 4, y: dy)
                let dragged = full.dragged(translation: translation, anchor: anchor)
                let scale = dragged.values[2] / full.values[2]
                // The exact image point under the finger remains under it through pause/reversal.
                near(dragged.values[0] + Double(anchor.x) * scale, full.values[0] + Double(anchor.x) + Double(translation.x))
                near(dragged.values[1] + Double(anchor.y) * scale, full.values[1] + Double(anchor.y) + Double(translation.y))
                near(Double(dragged.inner.width / dragged.inner.height), Double(size.width / size.height))
                precondition(scale >= PhotoTransitionTuning.interactiveMinimumScale && scale <= 1)
            }
            let translation = CGPoint(x: 30, y: 180), velocity = CGPoint(x: 100, y: 800)
            let state = full.dragged(translation: translation, anchor: anchor)
            let speeds = full.dragVelocity(translation: translation, velocity: velocity, anchor: anchor)
            let dt = 0.000001
            let moved = full.dragged(translation: CGPoint(x: translation.x + velocity.x * dt, y: translation.y + velocity.y * dt), anchor: anchor)
            for i in state.values.indices { near((moved.values[i] - state.values[i]) / dt, speeds[i], tolerance: 0.001) }
            let target = PhotoTransitionState(clip: cell, image: cropped, corner: 20, backdrop: 0)
            let inFlight = target.interpolated(to: full, progress: 0.35)
            let touchAnchor = CGPoint(x: 12, y: 28)
            precondition(inFlight.dragged(translation: .zero, anchor: touchAnchor).values == inFlight.values)
            let grabbed = inFlight.dragged(translation: CGPoint(x: 8, y: 32), anchor: touchAnchor)
            let grabbedScale = grabbed.clip.width / inFlight.clip.width
            near(grabbed.clip.midY + touchAnchor.y * grabbedScale, inFlight.clip.midY + touchAnchor.y + 32)
            near(grabbed.inner.minX, inFlight.inner.minX * grabbedScale)
            near(grabbed.inner.minY, inFlight.inner.minY * grabbedScale)
            let far = full.dragged(translation: CGPoint(x: 0, y: 600), anchor: .zero)
            near(far.values[8], PhotoTransitionTuning.interactiveBackgroundFloor)
            near(full.dragVelocity(translation: CGPoint(x: 0, y: 600), velocity: CGPoint(x: 0, y: 1000), anchor: .zero)[8], 0)
            let header = CGRect(x: 0, y: 0, width: 390, height: 106)
            let top = PhotoTransitionState(clip: header, image: PhotoTransitionState.imageRect(size: size, in: header, fill: true))
            for p in stride(from: 0.0, through: 1, by: 0.025) {
                let moved = full.interpolated(to: top, progress: p)
                near(Double(moved.inner.width / moved.inner.height), Double(size.width / size.height))
                near(moved.values[8], 1)
                let reversed = top.interpolated(to: full, progress: 1 - p)
                for i in moved.values.indices { near(moved.values[i], reversed.values[i]) }
            }
            for i in state.values.indices {
                let start = PhotoTransitionSpring.value(from: state.values[i], to: target.values[i], velocity: speeds[i], time: 0, duration: 0.4)
                near(start, state.values[i])
                let initial = PhotoTransitionSpring.value(from: state.values[i], to: target.values[i], velocity: speeds[i], time: dt, duration: 0.4)
                near((initial - start) / dt, speeds[i], tolerance: 0.5)
                near(PhotoTransitionSpring.value(from: state.values[i], to: target.values[i], velocity: speeds[i], time: 0.4, duration: 0.4), target.values[i])
                // The LAST frame approaches both its target and zero velocity continuously,
                // rather than assigning a slightly different endpoint when a timer expires.
                near(PhotoTransitionSpring.value(from: start, to: target.values[i], velocity: speeds[i], time: 0.4 - dt, duration: 0.4), target.values[i], tolerance: 0.000001)
                near(PhotoTransitionSpring.velocity(from: start, to: target.values[i], initial: speeds[i], time: 0.4 - dt, duration: 0.4), 0, tolerance: 0.00001)
                // 60/120Hz evaluate the same analytic trajectory at shared timestamps.
                for frame in 0...24 {
                    let a = PhotoTransitionSpring.value(from: start, to: target.values[i], velocity: speeds[i], time: Double(frame) / 60, duration: 0.4)
                    let b = PhotoTransitionSpring.value(from: start, to: target.values[i], velocity: speeds[i], time: Double(frame * 2) / 120, duration: 0.4)
                    near(a, b)
                    if frame > 0 && frame < 24 {
                        let time = Double(frame) / 60
                        let next = PhotoTransitionSpring.value(from: start, to: target.values[i], velocity: speeds[i], time: time + dt, duration: 0.4)
                        let speed = PhotoTransitionSpring.velocity(from: start, to: target.values[i], initial: speeds[i], time: time, duration: 0.4)
                        near((next - a) / dt, speed, tolerance: 0.5)
                    }
                }
            }
        }
        precondition(!PhotoTransitionTuning.shouldDismiss(translation: 17, velocity: 0))
        precondition(PhotoTransitionTuning.shouldDismiss(translation: 18, velocity: 0))
        precondition(PhotoTransitionTuning.shouldDismiss(translation: 20, velocity: 250))
        precondition(!PhotoTransitionTuning.shouldDismiss(translation: -22, velocity: 250))
        precondition(!PhotoTransitionTuning.shouldDismiss(translation: 5, velocity: 1500))
        precondition(!PhotoTransitionTuning.shouldDismiss(translation: 180, velocity: -700))
        precondition(!PhotoTransitionTuning.shouldDismiss(translation: .nan, velocity: 1000))
        precondition(PhotoTransitionTuning.duration(distance: 600, velocity: 2000) < PhotoTransitionTuning.duration(distance: 600, velocity: 0))
        let panelDuration = PhotoTransitionTuning.panelSettleDuration
        for origin in [0.0, 0.4, 0.96] {
            for speed in [-2.0, 0, 1, 12] {
                var previous = origin
                for frame in 0...120 {
                    let time = panelDuration * Double(frame) / 120
                    let progress = PhotoTransitionSpring.panelOpeningProgress(from: origin, velocity: speed,
                        time: time, duration: panelDuration)
                    precondition(progress >= previous && progress <= 1, "Opening must not overshoot or rebound")
                    previous = progress
                }
                near(previous, 1)
                let almostDone = PhotoTransitionSpring.panelOpeningProgress(from: origin, velocity: speed,
                    time: panelDuration - 0.00001, duration: panelDuration)
                near((1 - almostDone) / 0.00001, 0, tolerance: 0.001)
            }
        }
        var gesture = PhotoPreviewGestureState()
        precondition(gesture.claim(expanded: false, vertical: 0, returning: false) == nil)
        precondition(gesture.owner == nil, "A zero-translation begin must not be locked to dismissal")
        precondition(gesture.claim(expanded: false, vertical: 0, velocity: -230, returning: false) == .information)
        gesture.reset()
        precondition(gesture.claim(expanded: false, vertical: 0, velocity: 230, returning: false) == .dismissal)
        gesture.reset()
        precondition(gesture.claim(expanded: false, vertical: -12, returning: false) == .information)
        precondition(gesture.claim(expanded: false, vertical: 160, returning: false) == .information, "Reversal cannot change ownership")
        gesture.reset()
        precondition(gesture.claim(expanded: false, vertical: 12, returning: false) == .dismissal)
        precondition(gesture.claim(expanded: false, vertical: -160, returning: false) == .dismissal)
        gesture.reset()
        precondition(gesture.claim(expanded: true, vertical: 120, returning: false) == .information)
        gesture.reset()
        precondition(gesture.claim(expanded: false, vertical: -12, returning: true) == .dismissal)
        // The native information-panel clock uses its own response/damping.
        // Its first and last frames obey the same velocity-continuity contract.
        let infoDuration = PhotoTransitionTuning.panelSettleDuration
        let infoResponse = PhotoTransitionTuning.panelSpringResponse
        let infoDamping = PhotoTransitionTuning.panelSpringDamping
        for origin in [0.0, 0.25, 0.8, 1.0] {
            for target in [0.0, 1.0] {
                let speed = target == 0 ? -1.3 : 1.3, dt = 0.000001
                let start = PhotoTransitionSpring.value(from: origin, to: target, velocity: speed, time: 0,
                    duration: infoDuration, response: infoResponse, damping: infoDamping)
                near(start, origin)
                let next = PhotoTransitionSpring.value(from: origin, to: target, velocity: speed, time: dt,
                    duration: infoDuration, response: infoResponse, damping: infoDamping)
                near((next - start) / dt, speed, tolerance: 0.001)
                near(PhotoTransitionSpring.velocity(from: origin, to: target, initial: speed, time: infoDuration - dt,
                    duration: infoDuration, response: infoResponse, damping: infoDamping), 0, tolerance: 0.000001)
            }
        }
        near(PhotoPagingTransition.reducedMotionOpacity(page: 0, progress: 0), 1)
        near(PhotoPagingTransition.reducedMotionOpacity(page: 1, progress: 0), 0)
        near(PhotoPagingTransition.reducedMotionOpacity(page: 0, progress: 1), 0)
        near(PhotoPagingTransition.reducedMotionOpacity(page: 1, progress: 1), 1)
        for p in stride(from: 0.0, through: 1, by: 0.025) {
            near(PhotoPagingTransition.reducedMotionOpacity(page: 1, progress: p), PhotoPagingTransition.reducedMotionOpacity(page: -1, progress: -p))
            near(PhotoPagingTransition.reducedMotionOpacity(page: -1, progress: p), 0)
            near(PhotoPagingTransition.reducedMotionOpacity(page: 2, progress: p), 0)
            let old = PhotoPagingTransition.reducedMotionOpacity(page: 0, progress: p)
            let next = PhotoPagingTransition.reducedMotionOpacity(page: 1, progress: p)
            precondition((1 - old) * (1 - next) < 0.04, "The page blend must not expose the backdrop between aligned images")
        }
        let travel = PhotoPagingTransition.progress(translation: 65, width: 400)
        near(PhotoPagingTransition.pageStep(width: 400), 432)
        near(travel * PhotoPagingTransition.pageStep(width: 400), 65)
        near(PhotoPagingTransition.progress(translation: -432, width: 400), -1)
        precondition(PhotoPagingTransition.destination(progress: travel, velocity: 0, width: 400) == 0)
        precondition(PhotoPagingTransition.destination(progress: travel, velocity: 500, width: 400) == 1)
        precondition(PhotoPagingTransition.destination(progress: travel, velocity: -1500, width: 400) == 0)
        print("Shared photo transition checks passed: crop, information preview, page blend and reversal, gesture ownership, release velocity, C1 spring endpoints and 60/120Hz cadence.")
    }
}
