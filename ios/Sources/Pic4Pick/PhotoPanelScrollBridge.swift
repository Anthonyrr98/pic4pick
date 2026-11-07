import SwiftUI
import UIKit
import WebKit

// Attach to the existing SwiftUI scroll view without replacing its delegate.
struct PhotoPanelScrollBridge: UIViewRepresentable {
    let interaction: PhotoPanelInteraction
    let active: Bool
    var discoveryDetent: ExplorePanelDetent?
    func makeUIView(context: Context) -> Anchor {
        let view = Anchor(); view.isUserInteractionEnabled = false; return view
    }
    func updateUIView(_ view: Anchor, context: Context) {
        view.interaction = interaction; view.active = active
        view.discoveryDetent = discoveryDetent
        view.attach()
        DispatchQueue.main.async { [weak view] in view?.attach() }
    }
    static func dismantleUIView(_ view: Anchor, coordinator: ()) { view.detach() }
    @MainActor final class Anchor: UIView {
        var interaction: PhotoPanelInteraction?
        var active = false
        var discoveryDetent: ExplorePanelDetent? {
            didSet {
                if oldValue == .expanded, discoveryDetent != .expanded, let scroll {
                    scroll.setContentOffset(CGPoint(x: scroll.contentOffset.x, y: -scroll.adjustedContentInset.top), animated: false)
                }
            }
        }
        private var discovery: Bool { discoveryDetent != nil }
        private var driver: PhotoPanelPanDriver?
        private weak var scroll: UIScrollView?
        private var distanceToTop: CGFloat = 0
        private var previousBounces: Bool?
        private var pullFromScroll = false
        override func didMoveToWindow() { super.didMoveToWindow(); attach() }
        func attach() {
            guard window != nil else { return }
            var ancestor = superview
            while let candidate = ancestor, !(candidate is UIScrollView) { ancestor = candidate.superview }
            guard let target = ancestor as? UIScrollView else { return }
            // The discovery header and floating controls are siblings of the list.
            // Attach above them and scope the touch to the rounded panel.
            var host: UIView = target
            if discovery {
                while !(host.next is UIViewController), let parent = host.superview { host = parent }
            }
            if scroll !== target || driver?.recognizer.view !== host {
                detach()
                scroll = target
                let driver = PhotoPanelPanDriver(view: host)
                driver.canBegin = { [weak self, weak target] in
                    guard let self, self.active, let target else { return false }
                    if let detent = self.discoveryDetent {
                        return detent != .collapsed || (self.driver?.recognizer.velocity(in: target).y ?? 0) < 0
                    }
                    // In photo details, collapse only when the pull starts at the top.
                    return target.contentOffset.y <= -target.adjustedContentInset.top + 0.5
                }
                driver.canReceiveTouch = { [weak self, weak target] touch in
                    guard let self, let target else { return false }
                    if self.discovery { return self.receiveDiscoveryTouch(touch, in: target) }
                    var view = touch.view
                    while let current = view, current !== target {
                        // A map remains independently pannable/zoomable inside the panel.
                        if current is WKWebView { return false }
                        view = current.superview
                    }
                    return true
                }
                driver.canScrollAlongside = { [weak self, weak target] other in
                    // Let the outer list consume a downward pull until it gets back to its top.
                    self?.pullFromScroll == true && self?.interaction?.expanded == true && other === target?.panGestureRecognizer
                }
                if discovery {
                    driver.canPrioritizeOverScroll = { [weak target] other in
                        guard let target else { return false }
                        return other === target || other.isDescendant(of: target)
                    }
                }
                self.driver = driver
            }
            driver?.recognizer.cancelsTouchesInView = discovery
            guard active, let interaction else {
                restoreBounce()
                driver?.interaction = nil
                return
            }
            driver?.interaction = discovery ? .init(expanded: interaction.expanded, enabled: interaction.enabled,
                changed: { [weak self] sample in
                    guard let self else { return }
                    self.interaction?.changed(self.panelSample(sample))
                },
                ended: { [weak self] sample in
                    guard let self else { return }
                    let panelSample = self.panelSample(sample)
                    self.restoreBounce()
                    self.interaction?.ended(panelSample)
                },
                cancelled: { [weak self] in
                    self?.restoreBounce()
                    self?.interaction?.cancelled()
                }) : interaction
        }

        private func receiveDiscoveryTouch(_ touch: UITouch, in scroll: UIScrollView) -> Bool {
            guard let window = scroll.window, let touchedView = touch.view else { return false }
            let listFrame = scroll.convert(scroll.bounds, to: window)
            let headerHeight = ExplorePanelLayout.handleHeight + ExplorePanelLayout.searchRowHeight
            let panelFrame = CGRect(x: listFrame.minX, y: listFrame.minY - headerHeight,
                width: listFrame.width, height: listFrame.height + headerHeight)
            let shape = UnevenRoundedRectangle(topLeadingRadius: ExplorePanelLayout.cornerRadius,
                topTrailingRadius: ExplorePanelLayout.cornerRadius)
            guard shape.path(in: panelFrame).contains(touch.location(in: window)) else { return false }
            pullFromScroll = touchedView === scroll || touchedView.isDescendant(of: scroll)
            distanceToTop = pullFromScroll ? max(0, scroll.contentOffset.y + scroll.adjustedContentInset.top) : 0
            return true
        }

        private func panelSample(_ sample: PhotoPanSample) -> PhotoPanSample {
            guard pullFromScroll, interaction?.expanded == true, let scroll else { return sample }
            let pull = ExplorePanelLayout.collapsePull(translation: sample.vertical, distanceToTop: Double(distanceToTop))
            let top = -scroll.adjustedContentInset.top
            guard pull > 0, scroll.contentOffset.y <= top + 0.5 else {
                return PhotoPanSample(translation: CGPoint(x: sample.translation.x, y: 0),
                    velocity: .zero, location: sample.location)
            }
            if previousBounces == nil {
                previousBounces = scroll.bounces
                scroll.bounces = false
                if scroll.contentOffset.y < top - 0.5 {
                    scroll.setContentOffset(CGPoint(x: scroll.contentOffset.x, y: top), animated: false)
                }
            }
            return PhotoPanSample(translation: CGPoint(x: sample.translation.x, y: CGFloat(pull)),
                velocity: sample.velocity, location: sample.location)
        }

        private func restoreBounce() {
            if let previousBounces { scroll?.bounces = previousBounces }
            previousBounces = nil
        }

        func detach() {
            restoreBounce()
            driver?.detach()
            driver = nil
            scroll = nil
        }
    }
}
