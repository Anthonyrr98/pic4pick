import SwiftUI
import WebKit

struct WebsiteMapMarker: Encodable, Equatable {
    let id: String
    let title: String
    let latitude: Double
    let longitude: Double
}

struct WebsiteMapPayload {
    struct Content: Encodable, Equatable {
        var config: [String: JSONValue]
        var locations: [WebsiteMapMarker]
        var userLocation: [String: JSONValue]?
        var active = true
        var compactMarkers = false
        var requireConfiguredStyle = false
        var photoDetailCard = false
        var resolveAddress = true
        var photoMarkerURL: String?
    }

    struct Camera: Encodable, Equatable {
        var focus: [String: JSONValue]
        var geocode: [String: JSONValue]?
        var reduceMotion = false
    }

    var content: Content
    var camera: Camera
}

private struct WebsiteMapUpdate: Encodable {
    let content: WebsiteMapPayload.Content?
    let camera: WebsiteMapPayload.Camera?
}

struct MapPanelParallax: Equatable {
    struct Settle: Equatable {
        let id = UUID()
        let duration: Double
        let easing: String
    }

    var offset = 0.0
    var settle: Settle?
    var visibleClearance: Double?
}

struct WebsiteMap: UIViewRepresentable {
    let payload: WebsiteMapPayload
    let baseURL: URL
    var panelClearance = 0.0
    var attributionTop = 0.0
    var panelParallax = MapPanelParallax()
    var onLocation: @MainActor (String) -> Void = { _ in }
    var onNearbyLocations: @MainActor ([String]) -> Void = { _ in }
    var onAddress: @MainActor ([String: JSONValue]) -> Void = { _ in }
    var onStatus: @MainActor (String) -> Void = { _ in }

    private struct CachedPhotoMap {
        let id: String
        let documentURL: URL
        let web: WKWebView
        let coordinator: Coordinator
    }

    @MainActor private static var cachedPhotoMap: CachedPhotoMap?
    private static let mapDocument = Task.detached(priority: .userInitiated) { () -> String? in
        guard let url = Bundle.module.url(forResource: "GalleryMap", withExtension: "html") else { return nil }
        return try? String(contentsOf: url, encoding: .utf8)
    }

    @MainActor static func hasCachedPhotoMap(id: String) -> Bool {
        cachedPhotoMap?.id == id
    }

    @MainActor static func clearCachedPhotoMap() {
        guard let cached = cachedPhotoMap else { return }
        cachedPhotoMap = nil
        cached.coordinator.dispose(cached.web)
    }

    private var photoMapID: String? {
        payload.content.photoDetailCard ? payload.content.locations.first?.id : nil
    }

    private var documentURL: URL {
        // WebKit canonicalizes an HTTPS origin to a URL with a root path.
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else { return baseURL }
        if components.percentEncodedPath.isEmpty { components.percentEncodedPath = "/" }
        if components.port == 443 { components.port = nil }
        return components.url ?? baseURL
    }

    func makeCoordinator() -> Coordinator {
        if let cached = Self.cachedPhotoMap, cached.id == photoMapID, cached.documentURL == documentURL,
           cached.coordinator.sent?.content.config == payload.content.config {
            Self.cachedPhotoMap = nil
            cached.coordinator.parent = self
            cached.coordinator.reusedWeb = cached.web
            return cached.coordinator
        }
        return Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> WKWebView {
        if let web = context.coordinator.reusedWeb {
            context.coordinator.reusedWeb = nil
            web.removeFromSuperview()
            return web
        }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(ScriptHandler(coordinator: context.coordinator), name: "pic4pickMap")
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = context.coordinator
        web.scrollView.isScrollEnabled = false; web.isOpaque = true
        web.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.web = web
        let coordinator = context.coordinator
        let documentURL = documentURL
        Task { @MainActor [weak web, weak coordinator] in
            let html = await Self.mapDocument.value
            guard let web, let coordinator, coordinator.web === web else { return }
            if let html { web.loadHTMLString(html, baseURL: documentURL) }
            else { coordinator.parent?.onStatus("failure") }
        }
        return web
    }
    func updateUIView(_ web: WKWebView, context: Context) { context.coordinator.parent = self; context.coordinator.send() }
    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        if let parent = coordinator.parent, let id = parent.photoMapID, coordinator.canPark {
            clearCachedPhotoMap()
            coordinator.park(web)
            cachedPhotoMap = CachedPhotoMap(id: id, documentURL: parent.documentURL, web: web, coordinator: coordinator)
        } else {
            coordinator.dispose(web)
        }
    }

    @MainActor private final class ScriptHandler: NSObject, WKScriptMessageHandler {
        private weak var coordinator: Coordinator?
        init(coordinator: Coordinator) { self.coordinator = coordinator }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            coordinator?.userContentController(controller, didReceive: message)
        }
    }

    @MainActor final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var parent: WebsiteMap?
        weak var web: WKWebView?
        var reusedWeb: WKWebView?
        var ready = false
        private var mapLoaded = false
        private var initialDocumentAllowed = false
        var sent: WebsiteMapPayload?
        private var updateInFlight = false
        var sentClearance: Double?
        var sentAttributionTop: Double?
        var sentParallax = MapPanelParallax()
        var parallaxInFlight = false
        var canPark: Bool { ready && mapLoaded && sent != nil && !updateInFlight }
        init(parent: WebsiteMap) { self.parent = parent }

        func park(_ web: WKWebView) {
            parent = nil
            sent?.content.active = false
            web.evaluateJavaScript("window.Pic4PickMap?.parkPhotoMap()")
        }

        func dispose(_ web: WKWebView) {
            parent = nil; ready = false; self.web = nil
            web.configuration.userContentController.removeScriptMessageHandler(forName: "pic4pickMap")
            web.evaluateJavaScript("window.Pic4PickMap?.dispose()")
            web.stopLoading(); web.navigationDelegate = nil
        }

        func send() {
            guard ready, let web, let parent else { return }
            sendParallax()
            // Discovery keeps its map and camera when covered. Send any pending
            // changes on return, without treating tab visibility as map data.
            let payload = parent.payload
            guard payload.content.active || !payload.content.compactMarkers else { return }
            if payload.content.photoDetailCard, !payload.content.active, sent?.content.active == false { return }
            let clearance = parent.panelClearance
            let attributionTop = parent.attributionTop
            if sentClearance != clearance || sentAttributionTop != attributionTop {
                sentClearance = clearance
                sentAttributionTop = attributionTop
                web.callAsyncJavaScript("window.Pic4PickMap.setPanelLayout(clearance, attributionTop); return true",
                    arguments: ["clearance": clearance, "attributionTop": attributionTop], in: nil, in: .page, completionHandler: nil)
            }
            guard !updateInFlight else { return }
            let update = WebsiteMapUpdate(content: sent?.content == payload.content ? nil : payload.content,
                camera: sent?.camera == payload.camera ? nil : payload.camera)
            guard update.content != nil || update.camera != nil,
                  let data = try? JSONEncoder().encode(update),
                  let object = try? JSONSerialization.jsonObject(with: data) else { return }
            if sent?.content.config != payload.content.config { mapLoaded = false }
            sent = payload
            updateInFlight = true
            web.callAsyncJavaScript("window.Pic4PickMap.updateParts(update); return true", arguments: ["update": object], in: nil, in: .page) { [weak self] result in
                guard let self, self.ready else { return }
                self.updateInFlight = false
                switch result {
                case .success: self.send()
                case .failure: self.sent = nil; self.reportFailure()
                }
            }
        }

        private func sendParallax() {
            // Drag sends the latest sample. A new settle sends its destination and timing once.
            guard let parent else { return }
            let next = parent.panelParallax
            guard let web, parent.payload.content.compactMarkers, !parallaxInFlight, next != sentParallax else { return }
            let settle = parent.payload.content.active && sent != nil && next.settle != sentParallax.settle ? next.settle : nil
            sentParallax = next
            parallaxInFlight = true
            web.callAsyncJavaScript("window.Pic4PickMap.setPanelParallax(offset, duration, easing, clearance); return true",
                arguments: ["offset": next.offset, "duration": (settle?.duration ?? 0) * 1000,
                    "easing": settle?.easing ?? "linear", "clearance": next.visibleClearance ?? parent.panelClearance],
                in: nil, in: .page) { [weak self] _ in
                self?.parallaxInFlight = false
                self?.sendParallax()
            }
        }
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            let origin = message.frameInfo.securityOrigin
            guard let parent, message.frameInfo.isMainFrame,
                  origin.protocol == "https", origin.host == parent.baseURL.host,
                  (origin.port == 0 ? 443 : origin.port) == (parent.baseURL.port ?? 443),
                  let values = message.body as? [String: Any],
                  let data = try? JSONSerialization.data(withJSONObject: values), data.count <= 16_000,
                  let type = values["type"] as? String else { return }
            switch type {
            case "documentReady": ready = true; send()
            case "ready": mapLoaded = true; parent.onStatus("ready")
            case "failure": reportFailure()
            case "location":
                if let id = values["id"] as? String, parent.payload.content.locations.contains(where: { $0.id == id }) { parent.onLocation(id) }
            case "nearbyLocations":
                guard parent.payload.content.active, parent.payload.content.compactMarkers,
                      let ids = values["ids"] as? [String], !ids.isEmpty, ids.count <= 80 else { return }
                let publicIDs = Set(parent.payload.content.locations.map(\.id))
                guard ids.allSatisfy(publicIDs.contains) else { return }
                parent.onNearbyLocations(ids)
            case "address":
                guard let result = try? JSONDecoder().decode([String: JSONValue].self, from: data),
                      result["id"] == parent.payload.camera.geocode?["id"] else { return }
                parent.onAddress(result)
            default: break
            }
        }
        private func reportFailure() {
            mapLoaded = false
            if let parent { parent.onStatus("failure") }
            else if WebsiteMap.cachedPhotoMap?.coordinator === self { WebsiteMap.clearCachedPhotoMap() }
        }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { reportFailure() }
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { reportFailure() }
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let parent else { return .cancel }
            if action.navigationType == .linkActivated {
                if action.sourceFrame.isMainFrame, let url = action.request.url, url.scheme == "https" {
                    await UIApplication.shared.open(url)
                }
                return .cancel
            }
            guard !initialDocumentAllowed, action.targetFrame?.isMainFrame == true,
                  let url = action.request.url,
                  url.absoluteString == "about:blank" || url == parent.documentURL else { return .cancel }
            initialDocumentAllowed = true
            return .allow
        }
    }
}
