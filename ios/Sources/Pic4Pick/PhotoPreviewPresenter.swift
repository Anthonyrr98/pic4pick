import SwiftUI
import UIKit
import OSLog

@MainActor enum PhotoPreviewDiagnostics {
    private static let logger = Logger(subsystem: "com.rlzhao.pic4pick", category: "PhotoPreview")
    static func event(_ message: @autoclosure () -> String) {
        #if DEBUG
        let detail = message()
        logger.debug("PhotoPreview: \(detail, privacy: .private)")
        #endif
    }
}

extension View {
    func photoPreview(item: Binding<PhotoSelection?>) -> some View {
        // Read the binding while SwiftUI tracks dependencies. Reading it only in
        // an asynchronous coordinator callback can miss subsequent open requests.
        let requestID = item.wrappedValue?.presentationID
        return background { PhotoPreviewPresenter(selection: item, requestID: requestID).frame(width: 0, height: 0) }
    }
}

private struct PhotoPreviewPresenter: UIViewControllerRepresentable {
    @Binding var selection: PhotoSelection?
    let requestID: UUID?
    @EnvironmentObject private var store: GalleryStore
    @EnvironmentObject private var location: LocationStore
    @Environment(\.galleryAppearance) private var appearance

    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIViewController(context: Context) -> AnchorController {
        let anchor = AnchorController()
        anchor.ready = { [weak coordinator = context.coordinator] in coordinator?.synchronize() }
        context.coordinator.anchor = anchor
        return anchor
    }
    func updateUIViewController(_ anchor: AnchorController, context: Context) {
        _ = selection // Keep the native bridge's binding dependency synchronous too.
        PhotoPreviewDiagnostics.event(requestID == nil ? "request cleared" : "open request received")
        context.coordinator.configuration = self
        // UIKit presentation must run outside SwiftUI's view-update transaction.
        DispatchQueue.main.async { [weak coordinator = context.coordinator] in coordinator?.synchronize() }
    }
    static func dismantleUIViewController(_ anchor: AnchorController, coordinator: Coordinator) {
        coordinator.configuration = nil
        coordinator.session?.close()
    }

    @MainActor final class AnchorController: UIViewController {
        var ready: (() -> Void)?
        override func loadView() { view = UIView(); view.backgroundColor = .clear; view.isUserInteractionEnabled = false }
        override func viewDidAppear(_ animated: Bool) { super.viewDidAppear(animated); ready?() }
    }
    @MainActor final class Coordinator {
        weak var anchor: AnchorController?
        var configuration: PhotoPreviewPresenter?
        var session: PhotoPreviewSession?
        func synchronize() {
            guard let configuration, let anchor, anchor.view.window != nil else { return }
            if let existing = session, existing.phase == .finished {
                existing.dismissalCompleted()
                session = nil
            }
            guard let selection = configuration.selection else { session?.close(); return }
            if let session {
                PhotoPreviewDiagnostics.event("active session: \(String(describing: session.phase))")
                return
            }
            var presenter: UIViewController = anchor
            while let parent = presenter.parent { presenter = parent }
            while let presented = presenter.presentedViewController { presenter = presented }
            guard !presenter.isBeingDismissed, !presenter.isBeingPresented else { return }
            let session = PhotoPreviewSession(selection: selection)
            session.isPhotoAvailable = { [weak store = configuration.store] id in store?.containsPhoto(withID: id) == true }
            let viewer = PhotoViewer(photos: selection.photos, initialID: selection.id, transition: session)
                .environmentObject(configuration.store).environmentObject(configuration.location)
                .environment(\.galleryAppearance, configuration.appearance)
            let host = UIHostingController(rootView: viewer)
            host.modalPresentationStyle = .custom; host.transitioningDelegate = session
            host.modalPresentationCapturesStatusBarAppearance = true
            host.view.backgroundColor = .clear
            host.view.accessibilityViewIsModal = true
            session.controller = host
            let binding = configuration.$selection
            let owner = session.owner
            session.didClose = { [weak self] in
                // Reset the binding even if SwiftUI replaced the representable/coordinator.
                if binding.wrappedValue?.presentationID == selection.presentationID { binding.wrappedValue = nil }
                if self?.session?.owner == owner { self?.session = nil }
                // A new selection queued during the old dismissal can now be presented.
                DispatchQueue.main.async { [weak self] in self?.synchronize() }
            }
            self.session = session
            presenter.present(host, animated: true)
        }
    }
}
