import SwiftUI
import UIKit

private struct PhotoSourceScopeKey: EnvironmentKey { static let defaultValue: UUID? = nil }
extension EnvironmentValues {
    var photoSourceScope: UUID? {
        get { self[PhotoSourceScopeKey.self] }
        set { self[PhotoSourceScopeKey.self] = newValue }
    }
}

@MainActor final class PhotoTransitionSource {
    static let shared = PhotoTransitionSource()
    @MainActor final class Entry {
        let id: String
        let token: UUID
        let scope: UUID?
        weak var view: UIImageView?
        var capture: (() -> UIImage?)?
        var owners = Set<UUID>()
        init(id: String, token: UUID, scope: UUID?, view: UIImageView) {
            self.id = id; self.token = token; self.scope = scope; self.view = view
        }
        func state(in container: UIView, imageSize: CGSize) -> PhotoTransitionState? {
            guard let view, let window = view.window, window === container.window,
                  view.bounds.width > 1, view.bounds.height > 1 else { return nil }
            let frame = view.convert(view.bounds, to: window)
            var visible = frame.intersection(window.bounds)
            var parent = view.superview
            while let ancestor = parent, ancestor !== window {
                guard !ancestor.isHidden, ancestor.alpha > 0.01 else { return nil }
                if ancestor.clipsToBounds { visible = visible.intersection(ancestor.convert(ancestor.bounds, to: window)) }
                parent = ancestor.superview
            }
            // Partial edge cells cannot be an exact endpoint without animating their ancestor's clip.
            // Fall back rather than flying to a stale or mostly-offscreen cell.
            guard !visible.isNull, visible.width >= frame.width - 1, visible.height >= frame.height - 1,
                  [frame.minX, frame.minY, frame.width, frame.height].allSatisfy(\.isFinite) else { return nil }
            let rect = container.convert(frame, from: window)
            let image = PhotoTransitionState.imageRect(size: imageSize, in: rect, fill: view.contentMode == .scaleAspectFill)
            return PhotoTransitionState(clip: rect, image: image, corner: Double(view.layer.cornerRadius), backdrop: 0)
        }
        func hide(owner: UUID) { owners.insert(owner); view?.isHidden = true }
        func reveal(owner: UUID) { owners.remove(owner); if owners.isEmpty { view?.isHidden = false } }
        func displayedImage() -> UIImage? { capture?() ?? view?.image }
    }
    private var entries: [UUID: Entry] = [:]
    private var activated: UUID?
    func register(id: String, token: UUID, scope: UUID?, view: UIImageView, capture: (() -> UIImage?)? = nil) {
        if let entry = entries[token], entry.id == id, entry.scope == scope {
            if entry.view !== view {
                entry.view?.isHidden = false
                entry.view = view
                view.isHidden = !entry.owners.isEmpty
            }
            entry.capture = capture
            return
        }
        entries[token] = Entry(id: id, token: token, scope: scope, view: view)
        entries[token]?.capture = capture
    }
    func unregister(_ token: UUID, view: UIView) {
        guard let entry = entries[token], entry.view === view else { return }
        // SwiftUI can dismantle the old film branch before mounting the replacement.
        // Keep its ownership across that gap so a hidden source cannot flash back on.
        if entry.owners.isEmpty { entries.removeValue(forKey: token) }
        else { entry.view = nil; entry.capture = nil }
    }
    func activate(_ token: UUID) { activated = token }
    func deactivate(_ token: UUID) { if activated == token { activated = nil } }
    func consume(id: String) -> Entry? {
        defer { activated = nil }
        guard let activated, let entry = entries[activated], entry.id == id else { return nil }
        return entry
    }
    func find(id: String, preferred: UUID?, scope: UUID?, container: UIView, size: CGSize) -> Entry? {
        entries = entries.filter { $0.value.view != nil || !$0.value.owners.isEmpty }
        if let preferred, let entry = entries[preferred], entry.id == id, entry.state(in: container, imageSize: size) != nil { return entry }
        return entries.values.first { $0.id == id && $0.scope == scope && $0.state(in: container, imageSize: size) != nil }
    }
}

struct PhotoTransitionThumbnail: UIViewRepresentable {
    let image: UIImage
    let id: String
    let token: UUID
    let scope: UUID?
    let fill: Bool
    let corner: CGFloat
    func makeUIView(context: Context) -> UIImageView {
        let view = UIImageView(); view.clipsToBounds = true
        view.isAccessibilityElement = false
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        view.setContentHuggingPriority(.defaultLow, for: .vertical)
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        context.coordinator.token = token
        return view
    }
    func updateUIView(_ view: UIImageView, context: Context) {
        view.image = image; view.contentMode = fill ? .scaleAspectFill : .scaleAspectFit
        view.layer.cornerRadius = corner; view.layer.cornerCurve = .continuous
        PhotoTransitionSource.shared.register(id: id, token: token, scope: scope, view: view)
    }
    func makeCoordinator() -> Coordinator { Coordinator() }
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UIImageView, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? image.size.width, height: proposal.height ?? image.size.height)
    }
    static func dismantleUIView(_ view: UIImageView, coordinator: Coordinator) {
        if let token = coordinator.token { PhotoTransitionSource.shared.unregister(token, view: view) }
    }
    @MainActor final class Coordinator { var token: UUID? }
}

// A film can still be developing when tapped. Capture its currently displayed
// native subtree once at presentation, rather than substituting the final film bitmap.
// This snapshot is never taken during a pan or a release animation.
struct PhotoDevelopingTransitionThumbnail<Content: View>: UIViewControllerRepresentable {
    let image: UIImage
    let id: String
    let token: UUID
    let scope: UUID?
    let content: Content
    func makeUIViewController(context: Context) -> CellController {
        CellController(image: image, content: content, token: token)
    }
    func updateUIViewController(_ controller: CellController, context: Context) {
        controller.imageView.image = image
        withTransaction(context.transaction) { controller.host.rootView = content }
        PhotoTransitionSource.shared.register(id: id, token: token, scope: scope, view: controller.imageView,
            capture: { [weak controller] in controller?.capture() })
    }
    static func dismantleUIViewController(_ controller: CellController, coordinator: ()) {
        PhotoTransitionSource.shared.unregister(controller.token, view: controller.imageView)
    }
    func sizeThatFits(_ proposal: ProposedViewSize, uiViewController: CellController, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? image.size.width, height: proposal.height ?? image.size.height)
    }
    @MainActor final class CellController: UIViewController {
        let imageView = UIImageView()
        let host: UIHostingController<Content>
        let token: UUID
        init(image: UIImage, content: Content, token: UUID) {
            self.host = UIHostingController(rootView: content); self.token = token
            super.init(nibName: nil, bundle: nil)
            imageView.image = image
            host.safeAreaRegions = []
        }
        required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
        override func loadView() {
            imageView.contentMode = .scaleAspectFit; imageView.clipsToBounds = true
            imageView.isUserInteractionEnabled = false
            imageView.setContentHuggingPriority(.defaultLow, for: .horizontal)
            imageView.setContentHuggingPriority(.defaultLow, for: .vertical)
            imageView.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            imageView.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
            view = imageView
            addChild(host); host.view.backgroundColor = .clear
            host.view.frame = imageView.bounds; host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            imageView.addSubview(host.view); host.didMove(toParent: self)
        }
        func capture() -> UIImage? {
            guard imageView.window != nil, imageView.bounds.width > 1, imageView.bounds.height > 1 else { return nil }
            let format = UIGraphicsImageRendererFormat()
            format.scale = imageView.window?.screen.scale ?? 2
            var success = false
            let image = UIGraphicsImageRenderer(size: imageView.bounds.size, format: format).image { _ in
                success = imageView.drawHierarchy(in: imageView.bounds, afterScreenUpdates: false)
            }
            return success ? image : nil
        }
    }
}
