import SwiftUI
import UIKit

@MainActor private final class PhotoTransitionSurface: UIView {
    let imageView = UIImageView()
    private var panelHandle: UIImageView?
    init(image: UIImage) {
        super.init(frame: .zero)
        isUserInteractionEnabled = false; clipsToBounds = true
        layer.cornerCurve = .continuous
        imageView.image = image; imageView.contentMode = .scaleToFill
        imageView.bounds = CGRect(origin: .zero, size: image.size)
        addSubview(imageView)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    func renderPanelHandle(progress: Double) {
        guard progress > 0.65 else { panelHandle?.alpha = 0; return }
        let handle: UIImageView
        if let panelHandle { handle = panelHandle }
        else {
            let configuration = UIImage.SymbolConfiguration(pointSize: 28, weight: .medium)
            handle = UIImageView(image: UIImage(systemName: "chevron.compact.down", withConfiguration: configuration))
            handle.tintColor = .white
            addSubview(handle)
            panelHandle = handle
        }
        handle.center = CGPoint(x: bounds.midX, y: bounds.maxY - 22)
        handle.alpha = 0.8 * min(1, (progress - 0.65) / 0.35)
    }

    func render(_ state: PhotoTransitionState) {
        // No layout pass, SwiftUI updates, image decoding or implicit animation in the hot path.
        transform = .identity
        bounds = CGRect(origin: .zero, size: state.clip.size)
        center = CGPoint(x: state.values[0], y: state.values[1])
        let scale = state.values[6] / max(1, imageView.bounds.width)
        imageView.transform = CGAffineTransform(scaleX: scale, y: scale)
        imageView.center = CGPoint(x: state.values[4], y: state.values[5])
        layer.cornerRadius = max(0, state.values[7])
        alpha = min(1, max(0, state.values[9]))
    }
    func renderDrag(_ state: PhotoTransitionState, base: PhotoTransitionState) {
        let scale = state.values[2] / base.values[2]
        // Fixed image/bounds during the entire touch: compositing transforms only.
        transform = CGAffineTransform(scaleX: scale, y: scale)
        center = CGPoint(x: state.values[0], y: state.values[1])
        layer.cornerRadius = max(0, state.values[7] / scale)
        alpha = min(1, max(0, state.values[9]))
    }
}

@MainActor private final class PhotoSpringClock: NSObject {
    private var link: CADisplayLink?
    private var started = 0.0
    private var elapsed = 0.0
    private let duration: Double
    private let from: PhotoTransitionState
    private let to: PhotoTransitionState
    private let velocity: [Double]
    private let response: Double
    private let damping: Double
    private let update: (PhotoTransitionState) -> Void
    private var completion: (() -> Void)?
    @MainActor private final class Proxy: NSObject {
        weak var owner: PhotoSpringClock?
        @objc func tick(_ link: CADisplayLink) { owner?.tick(link) }
    }
    init(from: PhotoTransitionState, to: PhotoTransitionState, velocity: [Double], duration: Double,
         screen: UIScreen, response: Double = PhotoTransitionTuning.returnSpringResponse,
         damping: Double = PhotoTransitionTuning.returnSpringDamping,
         update: @escaping (PhotoTransitionState) -> Void, completion: @escaping () -> Void) {
        self.from = from; self.to = to; self.velocity = velocity; self.duration = duration
        self.update = update; self.completion = completion
        self.response = response; self.damping = damping
        super.init()
        let proxy = Proxy(); proxy.owner = self
        let link = CADisplayLink(target: proxy, selector: #selector(Proxy.tick(_:)))
        link.preferredFrameRateRange = DisplayRefreshPreference.range(for: screen)
        self.link = link; started = CACurrentMediaTime()
        link.add(to: .main, forMode: .common)
    }
    private func tick(_ link: CADisplayLink) {
        let time = max(0, link.targetTimestamp - started)
        elapsed = time
        if time >= duration { finish(); return }
        var state = from
        for index in state.values.indices {
            state.values[index] = PhotoTransitionSpring.value(from: from.values[index], to: to.values[index],
                velocity: velocity[index], time: time, duration: duration, response: response, damping: damping)
        }
        update(state)
    }
    var instantaneousVelocity: [Double] {
        let time = elapsed
        return from.values.indices.map { PhotoTransitionSpring.velocity(from: from.values[$0], to: to.values[$0], initial: velocity[$0], time: time, duration: duration, response: response, damping: damping) }
    }
    func stop() { link?.invalidate(); link = nil; completion = nil }
    func finish() {
        link?.invalidate(); link = nil
        update(to)
        let done = completion; completion = nil; done?()
    }
}

@MainActor final class PhotoPreviewSession: NSObject, UIViewControllerTransitioningDelegate {
    enum Phase { case waiting, opening, visible, dragging, settling, closing, finished }
    enum ContentState { case photo, information, returningToGrid }
    private(set) var contentState: ContentState = .photo {
        didSet { if oldValue != contentState { PhotoPreviewDiagnostics.event("content \(String(describing: contentState))") } }
    }
    private(set) var panelProgress = 0.0
    private weak var headerView: UIView?
    private var panelBase: PhotoTransitionState?
    private var panelTarget: PhotoTransitionState?
    private var panelLayout: PhotoViewerLayout?
    private var panelClock: PhotoSpringClock?
    private var panelDragOrigin: Double?
    private var panelDragTranslation = 0.0
    private var requestedInformation = false
    private weak var panelMotion: PhotoViewerMotion?
    private var rootPan: PhotoPanelPanDriver?
    private var rootInteraction: PhotoPanelInteraction?
    private weak var touchedContentScroll: UIScrollView?
    var isInformationDragging: Bool { panelDragOrigin != nil }
    var hasInformationMotion: Bool { panelProgress > 0.00001 || panelClock != nil || isInformationDragging }
    let owner = UUID()
    let selection: PhotoSelection
    private(set) var phase: Phase = .waiting {
        didSet { if oldValue != phase { PhotoPreviewDiagnostics.event("phase \(String(describing: phase))") } }
    }
    private(set) var currentID: String
    weak var controller: UIViewController?
    private weak var container: UIView?
    private final class Endpoint {
        weak var imageView: PhotoZoomBitmapView?
        weak var scroll: UIScrollView?
        init(_ view: PhotoZoomBitmapView, scroll: UIScrollView) { imageView = view; self.scroll = scroll }
    }
    private var endpoints: [String: Endpoint] = [:]
    private var hiddenSource: PhotoTransitionSource.Entry?
    private weak var hiddenFullImage: PhotoZoomBitmapView?
    private var surface: PhotoTransitionSurface?
    private var current: PhotoTransitionState?
    private var dragBase: PhotoTransitionState?
    private var dragOrigin = CGPoint.zero
    private var ignoringResizedGesture = false
    private var closeAfterOpening = false
    private var isPaging = false
    private var closeAfterPaging = false
    private var reportedClose = false
    private var anchor = CGPoint.zero
    private var releaseVelocity = [Double](repeating: 0, count: 10)
    private var clock: PhotoSpringClock?
    private var openingCompletion: (() -> Void)?
    private static let openingAnimationKey = "photo-opening"
    private let sourceImage: UIImage?
    private var presentationWaiters: [CheckedContinuation<Void, Never>] = []
    var didClose: (() -> Void)?
    var isPhotoAvailable: (String) -> Bool = { _ in true }
    var isDragging: Bool { phase == .dragging || ignoringResizedGesture }
    var isStable: Bool { phase == .visible && panelProgress == 0 && !isPaging }
    var currentZoomScale: Double { Double(endpoints[currentID]?.scroll?.zoomScale ?? 1) }
    var canStartPaging: Bool { isStable && !hasInformationMotion && currentZoomScale <= 1.001 }

    func beginPaging() -> Bool {
        guard canStartPaging else { return false }
        isPaging = true
        return true
    }

    func endPaging() {
        isPaging = false
        if closeAfterPaging {
            closeAfterPaging = false
            DispatchQueue.main.async { [weak self] in self?.close() }
        }
    }

    init(selection: PhotoSelection) {
        self.selection = selection; currentID = selection.id
        sourceImage = selection.source?.displayedImage()
        super.init()
    }
    func seed(for id: String) -> UIImage? { id == selection.id ? sourceImage : nil }
    func waitUntilPresented() async {
        guard phase == .waiting || phase == .opening, !Task.isCancelled else { return }
        await withCheckedContinuation { presentationWaiters.append($0) }
    }
    func register(id: String, imageView: PhotoZoomBitmapView, scroll: UIScrollView) {
        endpoints[id] = Endpoint(imageView, scroll: scroll)
        if id == currentID, phase == .visible, let container, let image = imageView.image { maskSource(container: container, size: image.size) }
    }
    func unregister(id: String, imageView: PhotoZoomBitmapView) {
        if endpoints[id]?.imageView === imageView { endpoints.removeValue(forKey: id) }
    }
    func select(_ id: String) {
        guard id != currentID, phase == .visible || phase == .settling || phase == .dragging else { return }
        if phase != .visible {
            ignoringResizedGesture = phase == .dragging
            clock?.stop(); clock = nil; removeSurface(); controller?.view.alpha = 1; phase = .visible
        }
        if panelBase != nil { removeSurface() }
        panelClock?.stop(); panelClock = nil; panelDragOrigin = nil
        panelBase = nil; panelTarget = nil; panelProgress = 0; requestedInformation = false; contentState = .photo
        renderPanelLayers()
        hiddenSource?.reveal(owner: owner); hiddenSource = nil
        currentID = id
        if let container, let image = endpoints[id]?.imageView?.image { maskSource(container: container, size: image.size) }
    }
    func registerHeader(_ view: UIView) {
        guard headerView !== view else { return }
        headerView = view; panelTarget = nil; refreshPanelGeometry()
    }
    func headerGeometryChanged() { panelTarget = nil; refreshPanelGeometry() }
    func unregisterHeader(_ view: UIView) { if headerView === view { headerView = nil } }
    func refreshPanelGeometry() { if panelProgress > 0 { updatePanelProgress(panelProgress) } }
    func configurePanel(layout: PhotoViewerLayout, expanded: Bool, interaction: PhotoPanelInteraction, motion: PhotoViewerMotion) {
        guard phase != .closing && phase != .finished else { return }
        panelMotion = motion
        rootInteraction = interaction
        attachRootPan()
        let changed = panelLayout?.height != layout.height || panelLayout?.safeTop != layout.safeTop || panelLayout?.safeBottom != layout.safeBottom
        panelLayout = layout
        if changed { panelTarget = nil }
        if expanded != requestedInformation, !isInformationDragging {
            requestedInformation = expanded
            if phase == .visible { settleInformation(to: expanded, velocity: 0) }
        }
    }
    private func attachRootPan() {
        guard phase != .closing && phase != .finished, let controller else { return }
        if rootPan == nil {
            let driver = PhotoPanelPanDriver(view: controller.view)
            driver.recognizer.cancelsTouchesInView = true
            driver.zoomScale = { [weak self] in self?.currentZoomScale ?? 1 }
            driver.canReceiveTouch = { [weak self, weak controller] touch in
                guard let self, let controller else { return false }
                self.touchedContentScroll = nil
                var ancestor = touch.view
                // Use the outer information scroller, rather than the nested
                // WebKit scroller, so every card/blank/map area has one rule.
                while let view = ancestor, view !== controller.view {
                    if let scroll = view as? UIScrollView, !(scroll is PhotoScrollView) {
                        self.touchedContentScroll = scroll
                    }
                    ancestor = view.superview
                }
                if self.requestedInformation {
                    PhotoPreviewDiagnostics.event(self.touchedContentScroll == nil ? "information touch chrome" : "information touch content scroll")
                }
                return true
            }
            driver.canBegin = { [weak self] in
                guard let self, !self.isPaging else { return false }
                guard self.requestedInformation || self.hasInformationMotion,
                      let scroll = self.touchedContentScroll else { return true }
                // Upward motion belongs to metadata scrolling, even while the
                // information panel's logical target is being synchronized.
                let velocity = self.rootPan?.recognizer.velocity(in: self.controller?.view.window).y ?? 0
                if velocity < 0 { return false }
                return PhotoPanelPanPolicy.contentAllowsPanelDrag(offset: Double(scroll.contentOffset.y),
                    topInset: Double(scroll.adjustedContentInset.top))
            }
            rootPan = driver
        }
        rootPan?.interaction = rootInteraction
    }
    private func renderPanelLayers() {
        // Only the tiny offset/opacity modifiers subscribe. Metadata and paging
        // remain in the original hosting graph and never rebuild for a touch frame.
        panelMotion?.updatePanelProgress(panelProgress)
    }
    @discardableResult func dragInformation(_ sample: PhotoPanSample, layout: PhotoViewerLayout) -> Bool {
        guard phase == .visible else { return false }
        panelLayout = layout
        if panelDragOrigin == nil {
            let interrupted = panelClock != nil
            panelClock?.stop(); panelClock = nil
            panelDragOrigin = panelProgress
            panelDragTranslation = interrupted ? sample.vertical : 0
        }
        let travel = max(1, layout.expandedPanel - layout.collapsedPanel)
        updatePanelProgress((panelDragOrigin ?? 0) - (sample.vertical - panelDragTranslation) / travel)
        return true
    }
    func endInformation(_ sample: PhotoPanSample?, cancelled: Bool = false) -> Bool {
        guard let origin = panelDragOrigin, let layout = panelLayout else { return requestedInformation }
        var destination = requestedInformation
        var velocity = 0.0
        if let sample {
            _ = dragInformation(sample, layout: layout)
            let travel = max(1, layout.expandedPanel - layout.collapsedPanel)
            velocity = -Double(sample.velocity.y) / travel
            if !cancelled {
                destination = layout.destination(expanded: origin > 0.5,
                    translation: sample.vertical - panelDragTranslation,
                    predictedTranslation: sample.predictedVertical - panelDragTranslation)
            }
        }
        panelDragOrigin = nil; requestedInformation = destination
        settleInformation(to: destination, velocity: velocity)
        return destination
    }
    private func settleInformation(to expanded: Bool, velocity: Double) {
        guard phase == .visible, let screen = container?.window?.screen else { return }
        panelClock?.stop(); panelClock = nil
        var from = PhotoTransitionState(clip: CGRect(x: 0, y: 0, width: 1, height: 1), image: CGRect(x: 0, y: 0, width: 1, height: 1))
        from.values[0] = panelProgress
        var target = from; target.values[0] = expanded ? 1 : 0
        var speeds = Array(repeating: 0.0, count: 10); speeds[0] = velocity
        if UIAccessibility.isReduceMotionEnabled { updatePanelProgress(target.values[0]); return }
        panelClock = PhotoSpringClock(from: from, to: target, velocity: speeds,
            duration: PhotoTransitionTuning.panelSettleDuration, screen: screen,
            response: PhotoTransitionTuning.panelSpringResponse, damping: PhotoTransitionTuning.panelSpringDamping,
            update: { [weak self] in self?.updatePanelProgress($0.values[0]) }, completion: { [weak self] in self?.panelClock = nil })
    }
    func updatePanelProgress(_ progress: Double) {
        guard phase == .visible else { return }
        panelProgress = min(1, max(0, progress))
        renderPanelLayers()
        if panelProgress == 0 {
            if panelBase != nil { removeSurface() }
            panelBase = nil; panelTarget = nil; contentState = .photo
            return
        }
        guard let container, let headerView, headerView.window != nil,
              let image = surface?.imageView.image ?? endpoints[currentID]?.imageView?.image else { return }
        if panelBase == nil {
            guard let full = fullState(in: container, size: image.size) else { return }
            panelBase = full
            installSurface(image: image, state: full, in: container)
        }
        if panelTarget == nil {
            let clip = headerView.convert(headerView.bounds, to: container)
            guard clip.width > 1, clip.height > 1 else { return }
            panelTarget = PhotoTransitionState(clip: clip,
                image: PhotoTransitionState.imageRect(size: image.size, in: clip, fill: true))
        }
        guard let destination = panelTarget, let panelBase else { return }
        contentState = .information
        // One bitmap moves upward and is continuously clipped; there is no second preview photo.
        render(panelBase.interpolated(to: destination, progress: panelProgress))
    }
    private func source(in container: UIView, size: CGSize) -> PhotoTransitionSource.Entry? {
        guard isPhotoAvailable(currentID) else { return nil }
        return PhotoTransitionSource.shared.find(id: currentID, preferred: selection.source?.token,
            scope: selection.source?.scope, container: container, size: size)
    }
    private func maskSource(container: UIView, size: CGSize) {
        let next = source(in: container, size: size)
        if next !== hiddenSource { hiddenSource?.reveal(owner: owner); hiddenSource = next }
        hiddenSource?.hide(owner: owner)
    }
    private func fullState(in container: UIView, size: CGSize) -> PhotoTransitionState? {
        guard let endpoint = endpoints[currentID], let view = endpoint.imageView,
              let scroll = endpoint.scroll, view.window != nil else { return nil }
        let content = PhotoTransitionState.imageRect(size: size, in: view.bounds, fill: false)
        let image = view.convert(content, to: container)
        let viewport = scroll.convert(scroll.bounds, to: container)
        let clip = image.intersection(viewport)
        guard !clip.isNull, clip.width > 1, clip.height > 1 else { return nil }
        return PhotoTransitionState(clip: clip, image: image)
    }
    private func installSurface(image: UIImage, state: PhotoTransitionState, in container: UIView) {
        surface?.removeFromSuperview()
        let overlay = PhotoTransitionSurface(image: image); container.addSubview(overlay)
        surface = overlay
        hiddenFullImage = endpoints[currentID]?.imageView
        hiddenFullImage?.isHidden = true
        render(state)
    }
    private func render(_ state: PhotoTransitionState) {
        current = state
        CATransaction.begin(); CATransaction.setDisableActions(true)
        if phase == .dragging, let dragBase { surface?.renderDrag(state, base: dragBase) }
        else { surface?.render(state) }
        surface?.renderPanelHandle(progress: phase == .visible && panelBase != nil ? panelProgress : 0)
        // Keep the recognizer's hosting hierarchy hit-testable until touch-up.
        controller?.view.alpha = min(1, max(phase == .dragging ? PhotoTransitionTuning.interactiveBackgroundFloor : 0, state.values[8]))
        CATransaction.commit()
    }
    private func removeSurface() {
        // Swap the exact endpoint and the real image within a single transaction.
        CATransaction.begin(); CATransaction.setDisableActions(true)
        hiddenFullImage?.isHidden = false; hiddenFullImage = nil
        surface?.removeFromSuperview(); surface = nil
        CATransaction.commit()
        current = nil; dragBase = nil
    }
    private func animate(to target: PhotoTransitionState, velocity: [Double]? = nil, duration: Double, completion: @escaping () -> Void) {
        guard let from = current, let screen = container?.window?.screen else { completion(); return }
        clock?.stop()
        if UIAccessibility.isReduceMotionEnabled {
            UIView.animate(withDuration: 0.18, animations: { self.render(target) }) { _ in completion() }
            return
        }
        clock = PhotoSpringClock(from: from, to: target, velocity: velocity ?? Array(repeating: 0, count: 10),
            duration: duration, screen: screen, update: { [weak self] in self?.render($0) }, completion: { [weak self] in
                self?.clock = nil; completion()
            })
    }
    private func animateOpening(to target: PhotoTransitionState, completion: @escaping () -> Void) {
        let duration = PhotoTransitionTuning.openingDuration
        guard !UIAccessibility.isReduceMotionEnabled, let from = current, let surface,
              let host = controller?.view, let screen = container?.window?.screen else {
            animate(to: target, duration: duration, completion: completion)
            return
        }

        // Opening has no gesture velocity. Sample the shared spring once and
        // let Core Animation interpolate on the render server as the viewer mounts.
        let frameRate = DisplayRefreshPreference.range(for: screen)
        let steps = max(1, Int(ceil(duration * Double(frameRate.maximum))))
        let samples = (0...steps).map { step in
            let time = duration * Double(step) / Double(steps)
            let progress = PhotoTransitionSpring.value(from: 0, to: 1, velocity: 0, time: time, duration: duration)
            return from.interpolated(to: target, progress: progress)
        }
        func keyframes(_ path: String, _ values: [Any]) -> CAKeyframeAnimation {
            let animation = CAKeyframeAnimation(keyPath: path)
            animation.values = values
            animation.duration = duration
            return animation
        }
        func install(_ animations: [CAAnimation], on layer: CALayer) {
            let group = CAAnimationGroup()
            group.animations = animations
            group.duration = duration
            group.timingFunction = CAMediaTimingFunction(name: .linear)
            group.preferredFrameRateRange = frameRate
            layer.add(group, forKey: Self.openingAnimationKey)
        }
        func opacity(_ value: Double) -> Double { min(1, max(0, value)) }

        openingCompletion = completion
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        CATransaction.setCompletionBlock { [weak self] in self?.finishOpeningAnimation() }
        render(target)
        install([
            keyframes("position", samples.map { NSValue(cgPoint: CGPoint(x: $0.values[0], y: $0.values[1])) }),
            keyframes("bounds", samples.map { NSValue(cgRect: CGRect(origin: .zero, size: $0.clip.size)) }),
            keyframes("cornerRadius", samples.map { max(0, $0.values[7]) }),
            keyframes("opacity", samples.map { opacity($0.values[9]) })
        ], on: surface.layer)
        let imageWidth = max(1, surface.imageView.bounds.width)
        install([
            keyframes("position", samples.map { NSValue(cgPoint: CGPoint(x: $0.values[4], y: $0.values[5])) }),
            keyframes("transform.scale", samples.map { $0.values[6] / imageWidth })
        ], on: surface.imageView.layer)
        install([keyframes("opacity", samples.map { opacity($0.values[8]) })], on: host.layer)
        CATransaction.commit()
    }
    private func removeOpeningAnimations() {
        surface?.layer.removeAnimation(forKey: Self.openingAnimationKey)
        surface?.imageView.layer.removeAnimation(forKey: Self.openingAnimationKey)
        controller?.view.layer.removeAnimation(forKey: Self.openingAnimationKey)
    }
    private func finishOpeningAnimation() {
        guard let completion = openingCompletion else { return }
        openingCompletion = nil
        removeOpeningAnimations()
        completion()
    }
    func beginPresentation(context: UIViewControllerContextTransitioning) {
        guard let to = context.viewController(forKey: .to) else {
            context.completeTransition(false)
            dismissalCompleted()
            return
        }
        let container = context.containerView; self.container = container; controller = to
        let frame = context.finalFrame(for: to)
        to.view.frame = frame.isEmpty ? container.bounds : frame
        to.view.backgroundColor = .clear
        to.view.alpha = 0
        container.addSubview(to.view); to.view.layoutIfNeeded()
        phase = .opening; to.view.isUserInteractionEnabled = false
        if let image = sourceImage, let start = source(in: container, size: image.size)?.state(in: container, imageSize: image.size) {
            maskSource(container: container, size: image.size)
            installSurface(image: image, state: start, in: container)
        }
        // SwiftUI mounts its native zoom endpoint on the next main-loop iteration.
        DispatchQueue.main.async { [self] in completePresentation(context: context, to: to, attempt: 0) }
    }
    private func completePresentation(context: UIViewControllerContextTransitioning, to: UIViewController, attempt: Int) {
        let container = context.containerView
        to.view.layoutIfNeeded()
        let image = sourceImage ?? endpoints[currentID]?.imageView?.image
        guard let image, let full = fullState(in: container, size: image.size) else {
            if attempt < 4 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0 / 120) { [self] in
                    completePresentation(context: context, to: to, attempt: attempt + 1)
                }
            } else {
                // No decoded image/layout yet: do not invent either endpoint.
                removeSurface()
                UIView.animate(withDuration: 0.22, animations: { to.view.alpha = 1 }) { _ in
                    self.presentationFinished(context: context, to: to)
                }
            }
            return
        }
        if surface == nil {
            var start = full; start.values[8] = 0; start.values[9] = 0
            installSurface(image: image, state: start, in: container)
        } else {
            hiddenFullImage = endpoints[currentID]?.imageView; hiddenFullImage?.isHidden = true
        }
        animateOpening(to: full) { [weak self] in
            self?.handOffOpeningSurface(context: context, to: to)
        }
    }
    private func handOffOpeningSurface(context: UIViewControllerContextTransitioning, to: UIViewController) {
        guard !UIAccessibility.isReduceMotionEnabled, let surface,
              let endpoint = endpoints[currentID]?.imageView, endpoint.window != nil,
              let image = surface.imageView.image, image.hasOpaqueBitmap, endpoint.image === image else {
            removeSurface(); to.view.alpha = 1; presentationFinished(context: context, to: to)
            return
        }
        // Keep the cover in the presented view through UIKit's presentation
        // completion, when the paging hierarchy can be laid out again.
        UIView.performWithoutAnimation {
            to.view.alpha = 1
            hiddenFullImage?.isHidden = false
            endpoint.isHidden = false
            let center = surface.superview?.convert(surface.center, to: to.view) ?? surface.center
            to.view.addSubview(surface)
            surface.center = center
            context.completeTransition(true)
        }
        UIView.animate(withDuration: PhotoTransitionTuning.thumbnailHandoffDuration, delay: 0, options: .curveLinear) {
            surface.alpha = 0
        } completion: { [self] _ in
            removeSurface()
            activateViewer(to)
        }
    }
    private func presentationFinished(context: UIViewControllerContextTransitioning, to: UIViewController) {
        context.completeTransition(true)
        activateViewer(to)
    }
    private func activateViewer(_ to: UIViewController) {
        attachRootPan()
        phase = .visible; to.view.isUserInteractionEnabled = true
        resumePresentationWaiters()
        if closeAfterOpening { DispatchQueue.main.async { [weak self] in self?.close() } }
    }
    private func resumePresentationWaiters() {
        let waiters = presentationWaiters
        presentationWaiters.removeAll()
        for waiter in waiters { waiter.resume() }
    }
    @discardableResult func drag(_ sample: PhotoPanSample) -> Bool {
        if ignoringResizedGesture { return true }
        guard phase == .visible || phase == .settling || phase == .dragging,
              panelProgress <= 0.00001,
              let container, let image = surface?.imageView.image ?? endpoints[currentID]?.imageView?.image else { return false }
        if phase != .dragging {
            let wasSettling = phase == .settling
            clock?.stop(); clock = nil
            let state = wasSettling ? current : fullState(in: container, size: image.size)
            guard let state else { return false }
            maskSource(container: container, size: image.size)
            if surface == nil { installSurface(image: image, state: state, in: container) }
            else { surface?.render(state) }
            dragBase = state
            // A new touch during cancellation picks up precisely the displayed state.
            dragOrigin = wasSettling ? sample.translation : .zero
            let point = container.convert(sample.location, from: container.window)
            let originalTouch = CGPoint(x: point.x - sample.translation.x + dragOrigin.x, y: point.y - sample.translation.y + dragOrigin.y)
            anchor = state.clip.contains(originalTouch) ? CGPoint(x: originalTouch.x - state.clip.midX, y: originalTouch.y - state.clip.midY) : .zero
            phase = .dragging
        }
        guard let base = dragBase else { return false }
        let delta = CGPoint(x: sample.translation.x - dragOrigin.x, y: sample.translation.y - dragOrigin.y)
        render(base.dragged(translation: delta, anchor: anchor))
        releaseVelocity = base.dragVelocity(translation: delta, velocity: sample.velocity, anchor: anchor)
        return true
    }
    func endDrag(_ sample: PhotoPanSample, cancelled: Bool = false) {
        if ignoringResizedGesture { ignoringResizedGesture = false; return }
        guard phase == .dragging else { return }
        _ = drag(sample)
        let distance = Double(sample.translation.y - dragOrigin.y)
        if !cancelled && PhotoTransitionTuning.shouldDismiss(translation: distance, velocity: Double(sample.velocity.y)) { close() }
        else { cancelDrag() }
    }
    func cancelDrag() {
        if ignoringResizedGesture { ignoringResizedGesture = false; return }
        guard phase == .dragging else { return }
        guard let container, let image = surface?.imageView.image,
              let target = fullState(in: container, size: image.size) else { close(); return }
        phase = .settling
        animate(to: target, velocity: releaseVelocity, duration: PhotoTransitionTuning.cancelDuration) { [self] in
            removeSurface(); controller?.view.alpha = 1; phase = .visible
        }
    }
    func close() {
        if phase == .waiting || phase == .opening { closeAfterOpening = true; return }
        if isPaging { closeAfterPaging = true; return }
        guard phase == .visible || phase == .dragging || phase == .settling else { return }
        if phase == .visible { releaseVelocity = Array(repeating: 0, count: 10) }
        if phase == .settling, let clock { releaseVelocity = clock.instantaneousVelocity }
        clock?.stop(); clock = nil
        panelClock?.stop(); panelClock = nil; panelDragOrigin = nil
        contentState = .returningToGrid
        phase = .closing
        controller?.dismiss(animated: true) { [weak self] in self?.dismissalCompleted() }
    }
    func beginDismissal(context: UIViewControllerContextTransitioning) {
        let container = context.containerView; self.container = container
        let image = surface?.imageView.image ?? endpoints[currentID]?.imageView?.image
        guard let image else {
            UIView.animate(withDuration: 0.2, animations: { self.controller?.view.alpha = 0 }) { _ in self.finish(context) }
            return
        }
        if surface == nil, let full = fullState(in: container, size: image.size) { installSurface(image: image, state: full, in: container) }
        guard var target = current else { finish(context); return }
        maskSource(container: container, size: image.size)
        if let destination = hiddenSource?.state(in: container, imageSize: image.size) { target = destination }
        else {
            // The source was removed, scrolled away or is on another page: stay on the natural path.
            target = target.dragged(translation: CGPoint(x: releaseVelocity[0] * 0.035, y: max(28, releaseVelocity[1] * 0.035)), anchor: .zero)
            for index in 2...6 { target.values[index] *= PhotoTransitionTuning.fallbackScale }
            target.values[8] = 0; target.values[9] = 0
        }
        let distance = hypot(target.values[0] - (current?.values[0] ?? 0), target.values[1] - (current?.values[1] ?? 0)) +
            hypot(target.values[2] - (current?.values[2] ?? 0), target.values[3] - (current?.values[3] ?? 0)) * 0.5
        animate(to: target, velocity: releaseVelocity,
            duration: PhotoTransitionTuning.duration(distance: distance, velocity: max(0, releaseVelocity[1]))) { [self] in
                validateDismissalEndpoint(context: context, expected: target, attempt: 0)
            }
    }
    private func validateDismissalEndpoint(context: UIViewControllerContextTransitioning, expected: PhotoTransitionState, attempt: Int) {
        guard let container, let image = surface?.imageView.image else { finish(context); return }
        let latest = hiddenSource?.state(in: container, imageSize: image.size)
        if let latest, isPhotoAvailable(currentID) {
            let changed = zip(latest.values.prefix(8), expected.values.prefix(8)).contains { abs($0.0 - $0.1) > 0.5 }
            if changed {
                if attempt < 2 {
                    animate(to: latest, duration: 0.20) { [self] in validateDismissalEndpoint(context: context, expected: latest, attempt: attempt + 1) }
                } else {
                    // A constantly moving/reloading list has no stable endpoint. Never snap to it.
                    var faded = current ?? expected; faded.values[9] = 0
                    animate(to: faded, duration: 0.16) { [self] in finish(context) }
                }
                return
            }
        } else if expected.values[9] > 0 {
            var faded = current ?? expected; faded.values[8] = 0; faded.values[9] = 0
            animate(to: faded, duration: 0.16) { [self] in finish(context) }
            return
        }
        if let latest, expected.values[9] > 0 {
            // Geometry is exact before exposing the real card. Dissolve only at this
            // identical endpoint so its actual bitmap, caption and gradient join without a final-frame pop.
            render(latest)
            hiddenSource?.reveal(owner: owner)
            UIView.animate(withDuration: PhotoTransitionTuning.thumbnailHandoffDuration, delay: 0,
                options: [.curveLinear, .beginFromCurrentState]) { self.surface?.alpha = 0 } completion: { _ in self.finish(context) }
        } else { finish(context) }
    }
    private func finish(_ context: UIViewControllerContextTransitioning) {
        rootPan?.detach(); rootPan = nil; rootInteraction = nil
        clock?.stop(); clock = nil
        panelClock?.stop(); panelClock = nil
        hiddenSource?.reveal(owner: owner); hiddenSource = nil
        removeSurface(); controller?.view.removeFromSuperview()
        panelBase = nil; panelProgress = 0
        phase = .finished; context.completeTransition(true)
    }
    func dismissalCompleted() {
        guard !reportedClose else { return }
        reportedClose = true; phase = .finished
        resumePresentationWaiters()
        rootPan?.detach(); rootPan = nil; rootInteraction = nil
        openingCompletion = nil
        removeOpeningAnimations()
        clock?.stop(); clock = nil
        panelClock?.stop(); panelClock = nil
        hiddenSource?.reveal(owner: owner); hiddenSource = nil
        removeSurface()
        let done = didClose; didClose = nil; done?()
    }
    func geometryChanged() {
        // Rotation/resizing invalidates the gesture's base geometry. Never use stale coordinates.
        if phase == .opening { finishOpeningAnimation(); clock?.finish() }
        else if phase == .closing { clock?.finish() }
        else if phase == .dragging || phase == .settling {
            ignoringResizedGesture = phase == .dragging
            clock?.stop(); clock = nil; removeSurface(); controller?.view.alpha = 1; phase = .visible
        }
        else if phase == .visible, panelProgress > 0 {
            panelBase = nil
            DispatchQueue.main.async { [weak self] in self?.refreshPanelGeometry() }
        }
    }
    func animationController(forPresented presented: UIViewController, presenting: UIViewController, source: UIViewController) -> UIViewControllerAnimatedTransitioning? {
        PhotoPreviewAnimator(session: self, presenting: true)
    }
    func animationController(forDismissed dismissed: UIViewController) -> UIViewControllerAnimatedTransitioning? {
        PhotoPreviewAnimator(session: self, presenting: false)
    }
    func presentationController(forPresented presented: UIViewController, presenting: UIViewController?, source: UIViewController) -> UIPresentationController? {
        PhotoPreviewPresentation(presentedViewController: presented, presenting: presenting, session: self)
    }
}

@MainActor private final class PhotoPreviewAnimator: NSObject, UIViewControllerAnimatedTransitioning {
    let session: PhotoPreviewSession
    let presenting: Bool
    init(session: PhotoPreviewSession, presenting: Bool) { self.session = session; self.presenting = presenting }
    func transitionDuration(using transitionContext: UIViewControllerContextTransitioning?) -> TimeInterval { 0.55 }
    func animateTransition(using context: UIViewControllerContextTransitioning) {
        if presenting { session.beginPresentation(context: context) } else { session.beginDismissal(context: context) }
    }
}

@MainActor private final class PhotoPreviewPresentation: UIPresentationController {
    let session: PhotoPreviewSession
    private var lastSize = CGSize.zero
    init(presentedViewController: UIViewController, presenting: UIViewController?, session: PhotoPreviewSession) {
        self.session = session; super.init(presentedViewController: presentedViewController, presenting: presenting)
    }
    override var shouldRemovePresentersView: Bool { false }
    override var shouldPresentInFullscreen: Bool { true }
    override var frameOfPresentedViewInContainerView: CGRect { containerView?.bounds ?? .zero }
    override func containerViewWillLayoutSubviews() {
        super.containerViewWillLayoutSubviews()
        let size = containerView?.bounds.size ?? .zero
        if lastSize != .zero && lastSize != size { session.geometryChanged() }
        lastSize = size
        presentedView?.frame = frameOfPresentedViewInContainerView
    }
    override func dismissalTransitionDidEnd(_ completed: Bool) {
        super.dismissalTransitionDidEnd(completed)
        if completed { session.dismissalCompleted() }
    }
}
