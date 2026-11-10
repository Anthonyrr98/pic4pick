import CoreLocation
import Combine
import SwiftUI
import UIKit

@MainActor
final class PhotoDirectionTracker: NSObject, ObservableObject, @MainActor CLLocationManagerDelegate {
    struct Heading: Equatable {
        let degrees: CLLocationDirection
        let usesMagneticNorth: Bool
    }

    @Published private(set) var location: CLLocation?
    private let heading = CurrentValueSubject<Heading?, Never>(nil)
    var headingUpdates: AnyPublisher<Heading?, Never> { heading.removeDuplicates().eraseToAnyPublisher() }
    private let manager = CLLocationManager()
    private let maximumHeadingError: CLLocationDirection = 25
    private var active = false
    private var updating = false
    private var magneticDeclination: CLLocationDirection?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 5
        manager.headingFilter = 1
    }

    func setActive(_ active: Bool) {
        self.active = active
        updateTracking()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        updateTracking()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard updating, let fix = locations.last, fix.horizontalAccuracy >= 0,
              abs(fix.timestamp.timeIntervalSinceNow) <= 20 else { return }
        location = fix
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading sample: CLHeading) {
        guard updating, !updateOrientation() else { return }
        if !(0...maximumHeadingError).contains(sample.headingAccuracy) {
            heading.send(nil)
        } else if sample.trueHeading >= 0 {
            if sample.magneticHeading >= 0 {
                magneticDeclination = sample.trueHeading - sample.magneticHeading
            }
            heading.send(Heading(degrees: sample.trueHeading, usesMagneticNorth: false))
        } else if sample.magneticHeading >= 0 {
            heading.send(Heading(degrees: sample.magneticHeading + (magneticDeclination ?? 0),
                usesMagneticNorth: magneticDeclination == nil))
        } else {
            heading.send(nil)
        }
    }

    func locationManagerShouldDisplayHeadingCalibration(_ manager: CLLocationManager) -> Bool {
        updating && heading.value == nil
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard updating else { return }
        if (error as? CLError)?.code == .denied { updateTracking() }
    }

    private func updateTracking() {
        let authorized = manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse
        let next = active && authorized
        guard next != updating else { return }
        updating = next
        if next {
            manager.startUpdatingLocation()
            if CLLocationManager.headingAvailable() {
                _ = updateOrientation()
                manager.startUpdatingHeading()
            }
        } else {
            manager.stopUpdatingHeading()
            manager.stopUpdatingLocation()
            heading.send(nil)
            location = nil
            magneticDeclination = nil
        }
    }

    // Core Location uses physical device orientation. UIKit's landscape names
    // describe the interface and are reversed relative to the device.
    private func updateOrientation() -> Bool {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        let orientation: CLDeviceOrientation
        switch scene?.interfaceOrientation {
        case .landscapeLeft: orientation = .landscapeRight
        case .landscapeRight: orientation = .landscapeLeft
        case .portraitUpsideDown: orientation = .portraitUpsideDown
        case .portrait: orientation = .portrait
        default: return false
        }
        guard manager.headingOrientation != orientation else { return false }
        manager.headingOrientation = orientation
        heading.send(nil)
        return true
    }
}
