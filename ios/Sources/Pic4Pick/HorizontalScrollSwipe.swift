import SwiftUI
import UIKit

// Attach to the vertical scroll view so it can reject horizontal pans before scrolling.
struct HorizontalScrollSwipe: UIViewRepresentable {
    enum Direction: Int { case previous = -1, next = 1 }

    @Environment(\.layoutDirection) private var layoutDirection
    let canSwipe: (Direction) -> Bool
    let onSwipe: (Direction) -> Void
    var onDrag: ((Direction, CGFloat) -> Void)? = nil
    var onCancel: () -> Void = {}
    var onPullRefresh: (() -> Void)? = nil

    func makeUIView(context: Context) -> Anchor {
        let view = Anchor()
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ view: Anchor, context: Context) {
        view.rightToLeft = layoutDirection == .rightToLeft
        view.canSwipe = canSwipe
        view.onSwipe = onSwipe
        view.onDrag = onDrag
        view.onCancel = onCancel
        view.onPullRefresh = onPullRefresh
        view.attach()
    }

    static func dismantleUIView(_ view: Anchor, coordinator: ()) { view.detach() }

    @MainActor final class Anchor: UIView, UIGestureRecognizerDelegate {
        var rightToLeft = false
        var canSwipe: (Direction) -> Bool = { _ in false }
        var onSwipe: (Direction) -> Void = { _ in }
        var onDrag: ((Direction, CGFloat) -> Void)?
        var onCancel: () -> Void = {}
        var onPullRefresh: (() -> Void)?
        private var dragDirection: Direction?
        private var pullStartedAtTop = false
        private weak var refreshScroll: UIScrollView?
        private lazy var pan: UIPanGestureRecognizer = {
            let recognizer = UIPanGestureRecognizer(target: self, action: #selector(swiped(_:)))
            recognizer.maximumNumberOfTouches = 1
            recognizer.delegate = self
            return recognizer
        }()

        override func didMoveToWindow() {
            super.didMoveToWindow()
            if window == nil { detach() } else { attach() }
        }

        func attach() {
            guard window != nil else { return }
            var ancestor = superview
            while let view = ancestor, !(view is UIScrollView) { ancestor = view.superview }
            guard let scroll = ancestor as? UIScrollView else { return }
            if pan.view !== scroll {
                detach()
                scroll.addGestureRecognizer(pan)
            }
            if onPullRefresh != nil, refreshScroll !== scroll {
                refreshScroll = scroll
                scroll.panGestureRecognizer.addTarget(self, action: #selector(scrolled(_:)))
            }
        }

        func detach() {
            refreshScroll?.panGestureRecognizer.removeTarget(self, action: #selector(scrolled(_:)))
            refreshScroll = nil
            pan.view?.removeGestureRecognizer(pan)
            pullStartedAtTop = false
        }

        @objc private func scrolled(_ recognizer: UIPanGestureRecognizer) {
            guard let scroll = recognizer.view as? UIScrollView else { return }
            switch recognizer.state {
            case .began:
                pullStartedAtTop = scroll.contentOffset.y + scroll.adjustedContentInset.top <= 1
            case .ended:
                let translation = recognizer.translation(in: scroll.window)
                if pullStartedAtTop, translation.y >= 72, translation.y > abs(translation.x) * 1.5 {
                    onPullRefresh?()
                }
                pullStartedAtTop = false
            case .cancelled, .failed:
                pullStartedAtTop = false
            default: break
            }
        }

        override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            let velocity = pan.velocity(in: pan.view?.window)
            return abs(velocity.x) > abs(velocity.y) * 1.5 && canSwipe(direction(for: velocity.x))
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
            shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
            // Vertical pans begin as soon as the horizontal recognizer rejects them.
            other === (pan.view as? UIScrollView)?.panGestureRecognizer
        }

        @objc private func swiped(_ recognizer: UIPanGestureRecognizer) {
            // The scroll view itself can move while this gesture is active.
            let window = recognizer.view?.window
            let translation = recognizer.translation(in: window)
            let velocity = recognizer.velocity(in: window)
            switch recognizer.state {
            case .began:
                if let onDrag {
                    let direction = direction(for: velocity.x)
                    dragDirection = direction
                    onDrag(direction, translation.x)
                }
                return
            case .changed:
                if let dragDirection { onDrag?(dragDirection, translation.x) }
                return
            case .cancelled, .failed:
                if dragDirection != nil { onCancel() }
                dragDirection = nil
                return
            case .ended: break
            default: return
            }
            defer { dragDirection = nil }
            let travel = abs(translation.x)
            let speed = velocity.x * (translation.x < 0 ? -1 : 1)
            let destination = direction(for: translation.x)
            guard travel > abs(translation.y) * 1.5,
                  travel >= 72 || (travel >= 40 && speed >= 480), canSwipe(destination),
                  dragDirection == nil || dragDirection == destination else {
                if dragDirection != nil { onCancel() }
                return
            }
            onSwipe(destination)
        }

        private func direction(for horizontal: CGFloat) -> Direction {
            (horizontal < 0) != rightToLeft ? .next : .previous
        }
    }
}
