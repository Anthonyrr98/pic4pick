import SwiftUI
import UIKit

struct PhotoViewerPaging<Page: View>: View {
    let photos: [Photo]
    @Binding var selectedID: String
    let session: PhotoPreviewSession
    @ViewBuilder var page: (Photo) -> Page

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.layoutDirection) private var layoutDirection
    @State private var motion = PhotoPagingMotion()
    @State private var gestureID: UUID?

    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let center = photos.firstIndex { $0.id == selectedID } ?? 0
            let direction = layoutDirection == .rightToLeft ? -1.0 : 1.0
            let travel = PhotoPagingTransition.pageStep(width: width) * direction
            ZStack {
                ForEach(Array(photos.enumerated()).filter { abs($0.offset - center) <= 2 }, id: \.element.id) { index, photo in
                    let position = index - center
                    PhotoPagingPage(content: page(photo), motion: motion, id: photo.id,
                        index: index, center: center, travel: reduceMotion ? 0 : travel)
                        .frame(width: width, height: geometry.size.height)
                        .allowsHitTesting(position == 0)
                        .accessibilityHidden(position != 0)
                        .zIndex(position == 0 ? 0 : 1)
                }
            }
            .frame(width: width, height: geometry.size.height)
            .background {
                PhotoPagingGesture(session: session,
                    canBegin: { photos.count > 1 && session.canStartPaging },
                    handle: { state, sample in
                        handle(state, sample: sample, width: width, direction: direction)
                    })
                    .allowsHitTesting(false)
            }
            .onChange(of: width) { _, _ in reset() }
            .onChange(of: center) { _, value in
                if gestureID == nil { motion.recenter(on: value) }
            }
        }
        .onDisappear { reset() }
        .accessibilityScrollAction { edge in
            let forward = layoutDirection == .rightToLeft ? edge == .trailing : edge == .leading
            guard edge == .leading || edge == .trailing else { return }
            guard let destination = neighbor(forward ? 1 : -1), session.beginPaging() else { return }
            let id = UUID()
            gestureID = id
            settle(to: forward ? 1 : -1, destination: destination, id: id)
        }
    }

    private func handle(_ state: UIGestureRecognizer.State, sample: PhotoPanSample, width: Double, direction: Double) {
        if state == .began {
            guard session.beginPaging() else { return }
            gestureID = UUID()
        }
        guard let id = gestureID else { return }
        switch state {
        case .began, .changed:
            let p = PhotoPagingTransition.progress(translation: -sample.translation.x * direction, width: width)
            motion.move(to: neighbor(p > 0 ? 1 : -1) == nil ? 0 : p)
        case .ended:
            let velocity = -sample.velocity.x * direction
            let offset = PhotoPagingTransition.destination(progress: motion.progress,
                velocity: velocity, width: width)
            let destination = neighbor(offset)
            settle(to: destination == nil ? 0 : offset, destination: destination, id: id,
                velocity: velocity / PhotoPagingTransition.pageStep(width: width))
        case .cancelled, .failed:
            settle(to: 0, destination: nil, id: id)
        default: break
        }
    }

    private func neighbor(_ offset: Int) -> String? {
        guard offset != 0, let current = photos.firstIndex(where: { $0.id == selectedID }),
              photos.indices.contains(current + offset) else { return nil }
        return photos[current + offset].id
    }

    private func settle(to target: Int, destination: String?, id: UUID, velocity: Double = 0) {
        let delta = Double(target) - motion.progress
        let distance = abs(delta)
        let duration = 0.20 + 0.14 * distance
        let speedTowardTarget = delta < 0 ? -velocity : velocity
        let initialSlope = min(3, max(0, speedTowardTarget * duration / max(0.01, distance)))
        motion.settle(to: Double(target), duration: duration, initialSlope: initialSlope) {
            guard gestureID == id else { return }
            reset(selecting: destination)
        }
    }

    private func reset(selecting destination: String? = nil) {
        guard gestureID != nil else { return }
        let nextID = destination.flatMap { session.isPhotoAvailable($0) ? $0 : nil } ?? selectedID
        let center = photos.firstIndex { $0.id == nextID } ?? 0
        var transaction = Transaction(animation: nil)
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            gestureID = nil
            // The incoming page is already centered. Keep its native transform
            // identical as the selected index takes ownership of that position.
            motion.recenter(on: center)
            selectedID = nextID
            session.select(nextID)
        }
        session.endPaging()
    }
}

@MainActor private final class PhotoPagingMotion {
    private final class Page {
        weak var view: UIView?
        let index: Int
        init(view: UIView, index: Int) { self.view = view; self.index = index }
    }

    private var pages: [String: Page] = [:]
    private var center: Int?
    private var travel: CGFloat = 0
    private var animator: UIViewPropertyAnimator?
    private(set) var progress = 0.0

    func register(_ view: UIView, id: String, index: Int, center: Int, travel: CGFloat) {
        if self.center == nil { self.center = center }
        let page = Page(view: view, index: index)
        pages[id] = page
        if self.travel != travel {
            self.travel = travel
            UIView.performWithoutAnimation { render() }
        } else {
            UIView.performWithoutAnimation { render(page) }
        }
    }

    func unregister(_ view: UIView, id: String) {
        if pages[id]?.view === view { pages.removeValue(forKey: id) }
    }

    func move(to progress: Double) {
        self.progress = progress
        UIView.performWithoutAnimation { render() }
    }

    func settle(to target: Double, duration: Double, initialSlope: Double, completion: @escaping () -> Void) {
        guard progress != target else { completion(); return }
        let curve = UICubicTimingParameters(controlPoint1: CGPoint(x: 0.24, y: 0.24 * initialSlope),
            controlPoint2: CGPoint(x: 0.54, y: 1))
        let animator = UIViewPropertyAnimator(duration: duration, timingParameters: curve)
        self.animator = animator
        animator.addAnimations { [weak self] in
            self?.progress = target
            self?.render()
        }
        animator.addCompletion { [weak self] position in
            self?.animator = nil
            if position == .end { completion() }
        }
        animator.startAnimation()
    }

    func recenter(on center: Int) {
        animator?.stopAnimation(true)
        animator = nil
        self.center = center
        move(to: 0)
    }

    private func render() {
        for page in pages.values { render(page) }
    }

    private func render(_ page: Page) {
        guard let view = page.view, let center else { return }
        let position = page.index - center
        let transform = CGAffineTransform(translationX: travel * (Double(position) - progress), y: 0)
        let alpha = travel == 0
            ? PhotoPagingTransition.reducedMotionOpacity(page: position, progress: progress)
            : (abs(position) <= 1 ? 1.0 : 0.0)
        if view.transform != transform { view.transform = transform }
        if view.alpha != alpha { view.alpha = alpha }
    }
}

private struct PhotoPagingPage<Content: View>: UIViewControllerRepresentable {
    let content: Content
    let motion: PhotoPagingMotion
    let id: String
    let index: Int
    let center: Int
    let travel: CGFloat

    func makeUIViewController(context: Context) -> PageController {
        PageController(content: content, motion: motion, id: id)
    }
    func updateUIViewController(_ controller: PageController, context: Context) {
        controller.host.rootView = content
        motion.register(controller.host.view, id: id, index: index, center: center, travel: travel)
    }
    static func dismantleUIViewController(_ controller: PageController, coordinator: ()) {
        controller.motion.unregister(controller.host.view, id: controller.id)
    }

    final class PageController: UIViewController {
        let host: UIHostingController<Content>
        let motion: PhotoPagingMotion
        let id: String

        init(content: Content, motion: PhotoPagingMotion, id: String) {
            host = UIHostingController(rootView: content)
            self.motion = motion
            self.id = id
            super.init(nibName: nil, bundle: nil)
        }
        required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

        override func loadView() {
            view = UIView()
            addChild(host)
            host.safeAreaRegions = []
            host.view.backgroundColor = .clear
            view.addSubview(host.view)
            host.didMove(toParent: self)
        }
        override func viewDidLayoutSubviews() {
            super.viewDidLayoutSubviews()
            host.view.bounds.size = view.bounds.size
            host.view.center = CGPoint(x: view.bounds.midX, y: view.bounds.midY)
        }
    }
}

private struct PhotoPagingGesture: UIViewRepresentable {
    let session: PhotoPreviewSession
    let canBegin: () -> Bool
    let handle: (UIGestureRecognizer.State, PhotoPanSample) -> Void

    func makeUIView(context: Context) -> Anchor { Anchor() }
    func updateUIView(_ view: Anchor, context: Context) {
        view.session = session
        view.canBegin = canBegin
        view.handle = handle
        view.attach()
    }
    static func dismantleUIView(_ view: Anchor, coordinator: ()) { view.detach() }

    final class Anchor: UIView, UIGestureRecognizerDelegate {
        weak var session: PhotoPreviewSession?
        var canBegin: () -> Bool = { false }
        var handle: (UIGestureRecognizer.State, PhotoPanSample) -> Void = { _, _ in }
        private lazy var pan: UIPanGestureRecognizer = {
            let pan = UIPanGestureRecognizer(target: self, action: #selector(panned(_:)))
            pan.maximumNumberOfTouches = 1
            pan.delegate = self
            return pan
        }()

        override func didMoveToWindow() {
            super.didMoveToWindow()
            if window == nil { detach() } else { attach() }
        }

        func attach() {
            guard window != nil, let host = session?.controller?.view, pan.view !== host else { return }
            detach()
            host.addGestureRecognizer(pan)
        }

        func detach() { pan.view?.removeGestureRecognizer(pan) }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            window != nil && bounds.contains(touch.location(in: self))
        }

        override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            let velocity = pan.velocity(in: window)
            return canBegin() && abs(velocity.x) > abs(velocity.y) * 1.3
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
            shouldBeRequiredToFailBy otherGestureRecognizer: UIGestureRecognizer) -> Bool {
            (otherGestureRecognizer.view as? PhotoScrollView)?.panGestureRecognizer === otherGestureRecognizer
        }

        @objc private func panned(_ pan: UIPanGestureRecognizer) {
            handle(pan.state, PhotoPanSample(translation: pan.translation(in: window),
                velocity: pan.velocity(in: window), location: pan.location(in: window)))
        }
    }
}
