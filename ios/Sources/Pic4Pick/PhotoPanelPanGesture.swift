import SwiftUI
import UIKit

struct PhotoPanSample {
    let translation: CGPoint
    let velocity: CGPoint
    let location: CGPoint // UIWindow coordinates, never the moving image's local coordinates.
    var vertical: Double { Double(translation.y) }
    var predictedVertical: Double { Double(translation.y + velocity.y * 0.18) }
}

struct PhotoPanelInteraction {
    let expanded: Bool
    let enabled: Bool
    let changed: (PhotoPanSample) -> Void
    let ended: (PhotoPanSample) -> Void
    let cancelled: () -> Void
    var currentZoomScale: () -> Double = { 1 }
}

// The photo itself is a UIScrollView. A native, axis-filtered recognizer can
// coordinate with its zoom/pan and the enclosing horizontal page scroll view.
@MainActor final class PhotoPanelPanDriver: NSObject, UIGestureRecognizerDelegate {
    let recognizer = UIPanGestureRecognizer()
    var interaction: PhotoPanelInteraction? {
        didSet {
            let active = interaction?.enabled == true
            if recognizer.isEnabled != active { recognizer.isEnabled = active }
        }
    }
    var zoomScale: () -> Double = { 1 }
    var canBegin: () -> Bool = { true }
    var canReceiveTouch: (UITouch) -> Bool = { _ in true }
    var canScrollAlongside: (UIGestureRecognizer) -> Bool = { _ in false }
    var canPrioritizeOverScroll: (UIView) -> Bool = { _ in true }
    private let feedback = UIImpactFeedbackGenerator(style: .light)

    init(view: UIView) {
        super.init()
        recognizer.minimumNumberOfTouches = 1
        recognizer.isEnabled = false
        recognizer.maximumNumberOfTouches = 1
        recognizer.cancelsTouchesInView = false
        recognizer.addTarget(self, action: #selector(pan(_:)))
        recognizer.delegate = self
        view.addGestureRecognizer(recognizer)
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard interaction?.enabled == true, canReceiveTouch(touch) else { return false }
        feedback.prepare()
        return true
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard let interaction, interaction.enabled, canBegin() else { return false }
        let velocity = recognizer.velocity(in: recognizer.view)
        return PhotoPanelPanPolicy.accepts(horizontal: Double(velocity.x), vertical: Double(velocity.y),
            expanded: interaction.expanded, zoomScale: max(zoomScale(), interaction.currentZoomScale()), touches: recognizer.numberOfTouches)
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldBeRequiredToFailBy otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        // Scroll recognizers wait for the axis decision. A horizontal swipe or
        // zoomed photo rejects this recognizer immediately and keeps scrolling.
        guard interaction?.enabled == true, otherGestureRecognizer is UIPanGestureRecognizer,
              let scroll = otherGestureRecognizer.view as? UIScrollView else { return false }
        return canPrioritizeOverScroll(scroll) && !canScrollAlongside(otherGestureRecognizer)
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        canScrollAlongside(otherGestureRecognizer)
    }

    @objc private func pan(_ sender: UIPanGestureRecognizer) {
        guard let interaction else { return }
        let window = sender.view?.window
        let sample = PhotoPanSample(translation: sender.translation(in: window), velocity: sender.velocity(in: window), location: sender.location(in: window))
        switch sender.state {
        case .began:
            // Exactly one pulse for the recognized gesture, never per frame.
            feedback.impactOccurred(intensity: 0.65)
            interaction.changed(sample)
        case .changed:
            interaction.changed(sample)
        case .ended:
            interaction.ended(sample)
        case .cancelled, .failed:
            interaction.cancelled()
        default: break
        }
    }

    func detach() {
        interaction = nil
        recognizer.view?.removeGestureRecognizer(recognizer)
        recognizer.delegate = nil
    }
}

// Expanded photos use a simple preview instead of a zoom scroll view. This
// transparent local surface gives that preview the same downward interaction.
struct PhotoPanelGestureSurface: UIViewRepresentable {
    let interaction: PhotoPanelInteraction

    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        view.isAccessibilityElement = false
        context.coordinator.driver = PhotoPanelPanDriver(view: view)
        return view
    }
    func updateUIView(_ view: UIView, context: Context) {
        context.coordinator.driver?.interaction = interaction
        view.isUserInteractionEnabled = interaction.enabled
    }
    static func dismantleUIView(_ view: UIView, coordinator: Coordinator) { coordinator.driver?.detach() }
    @MainActor final class Coordinator { var driver: PhotoPanelPanDriver? }
}
