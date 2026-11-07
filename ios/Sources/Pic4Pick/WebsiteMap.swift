import SwiftUI
import WebKit

struct WebsiteMapPayload: Encodable, Equatable {
    var config: [String: JSONValue]
    var locations: [LocationCollection]
    var focus: [String: JSONValue]
    var userLocation: [String: JSONValue]?
    var geocode: [String: JSONValue]?
    var reduceMotion = false
    var active = true
    var compactMarkers = false
    var requireConfiguredStyle = false
    var photoDetailCard = false
    var photoMarkerURL: String?
}

struct WebsiteMap: UIViewRepresentable {
    let payload: WebsiteMapPayload
    let baseURL: URL
    var panelClearance = 0.0
    var attributionTop = 0.0
    var panelParallax = 0.0
    var onLocation: @MainActor (String) -> Void = { _ in }
    var onAddress: @MainActor ([String: JSONValue]) -> Void = { _ in }
    var onStatus: @MainActor (String) -> Void = { _ in }

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(context.coordinator, name: "pic4pickMap")
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = context.coordinator
        web.scrollView.isScrollEnabled = false; web.isOpaque = true
        web.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.web = web
        if let url = Bundle.module.url(forResource: "GalleryMap", withExtension: "html"), let html = try? String(contentsOf: url, encoding: .utf8) {
            web.loadHTMLString(html, baseURL: baseURL)
        } else { Task { @MainActor in onStatus("failure") } }
        return web
    }
    func updateUIView(_ web: WKWebView, context: Context) { context.coordinator.parent = self; context.coordinator.send() }
    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        web.configuration.userContentController.removeScriptMessageHandler(forName: "pic4pickMap")
        web.evaluateJavaScript("window.Pic4PickMap?.update({active:false})")
        web.stopLoading(); web.navigationDelegate = nil
    }
    @MainActor final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var parent: WebsiteMap
        weak var web: WKWebView?
        var ready = false
        var sent: WebsiteMapPayload?
        var sentClearance: Double?
        var sentAttributionTop: Double?
        var sentParallax = 0.0
        var parallaxInFlight = false
        init(parent: WebsiteMap) { self.parent = parent }
        func send() {
            guard ready, let web else { return }
            // Discovery keeps its map and camera when covered. Send any pending
            // changes on return, without treating tab visibility as map data.
            guard parent.payload.active || !parent.payload.compactMarkers else { return }
            sendParallax()
            let clearance = parent.panelClearance
            let attributionTop = parent.attributionTop
            if sentClearance != clearance || sentAttributionTop != attributionTop {
                sentClearance = clearance
                sentAttributionTop = attributionTop
                web.callAsyncJavaScript("window.Pic4PickMap.setPanelLayout(clearance, attributionTop); return true",
                    arguments: ["clearance": clearance, "attributionTop": attributionTop], in: nil, in: .page, completionHandler: nil)
            }
            guard sent != parent.payload,
                  let data = try? JSONEncoder().encode(parent.payload),
                  let object = try? JSONSerialization.jsonObject(with: data) else { return }
            sent = parent.payload
            web.callAsyncJavaScript("window.Pic4PickMap.update(payload); return true", arguments: ["payload": object], in: nil, in: .page) { [weak self] result in
                if case .failure = result { self?.parent.onStatus("failure") }
            }
        }

        private func sendParallax() {
            // Keep at most one update in flight. A slow WebKit frame can skip
            // straight to the latest position without replaying old samples.
            let offset = parent.panelParallax
            guard let web, parent.payload.compactMarkers, parent.payload.active,
                  !parallaxInFlight, offset != sentParallax else { return }
            sentParallax = offset
            parallaxInFlight = true
            web.callAsyncJavaScript("window.Pic4PickMap.setPanelParallax(offset); return true",
                arguments: ["offset": offset], in: nil, in: .page) { [weak self] _ in
                self?.parallaxInFlight = false
                self?.sendParallax()
            }
        }
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame, let values = message.body as? [String: Any], let type = values["type"] as? String else { return }
            switch type {
            case "documentReady": ready = true; send()
            case "ready": parent.onStatus("ready")
            case "failure": parent.onStatus("failure")
            case "location":
                if let id = values["id"] as? String, parent.payload.locations.contains(where: { $0.id == id }) { parent.onLocation(id) }
            case "address":
                guard let data = try? JSONSerialization.data(withJSONObject: values), data.count < 16000,
                      let result = try? JSONDecoder().decode([String: JSONValue].self, from: data),
                      result["id"] == parent.payload.geocode?["id"] else { return }
                parent.onAddress(result)
            default: break
            }
        }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { parent.onStatus("failure") }
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { parent.onStatus("failure") }
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            if action.navigationType == .linkActivated {
                if let url = action.request.url, url.scheme == "https" { await UIApplication.shared.open(url) }
                return .cancel
            }
            return ["about", "https"].contains(action.request.url?.scheme ?? "") ? .allow : .cancel
        }
    }
}
