import SwiftUI
import WebKit
import SafariServices

@MainActor
final class WebsiteState: ObservableObject {
    @Published var error: String?
    @Published var loading = true
    weak var webView: WKWebView?
}

struct WebsiteView: View {
    let url: URL
    let title: String
    @Environment(\.dismiss) private var dismiss
    @StateObject private var state = WebsiteState()

    var body: some View {
        NavigationStack {
            WebContent(url: url, state: state)
                .overlay(alignment: .top) { if state.loading { ProgressView().padding(12).background(.regularMaterial, in: Capsule()) } }
                .overlay {
                    if let error = state.error {
                        VStack(spacing: 16) {
                            ContentUnavailableView("页面未能打开", systemImage: "wifi.exclamationmark", description: Text(error))
                            Button("重试") { state.error = nil; state.webView?.load(URLRequest(url: url)) }.buttonStyle(.borderedProminent)
                            Link("在 Safari 中打开", destination: url)
                        }.frame(maxWidth: .infinity, maxHeight: .infinity).background(.background)
                    }
                }
                .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("完成") { dismiss() } }
                    ToolbarItemGroup(placement: .primaryAction) {
                        Button { state.webView?.goBack() } label: { Image(systemName: "chevron.left") }.accessibilityLabel("上一页")
                        Button { state.webView?.reload() } label: { Image(systemName: "arrow.clockwise") }.accessibilityLabel("刷新页面")
                    }
                }
        }
    }
}

struct WebContent: UIViewRepresentable {
    let url: URL
    @ObservedObject var state: WebsiteState
    func makeCoordinator() -> Coordinator { Coordinator(state: state, host: url.host) }
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        web.allowsBackForwardNavigationGestures = true
        web.isInspectable = false
        state.webView = web
        web.load(URLRequest(url: url))
        return web
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}

    @MainActor final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let state: WebsiteState
        let host: String?
        init(state: WebsiteState, host: String?) { self.state = state; self.host = host }
        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { state.loading = true; state.error = nil }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { state.loading = false }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            if (error as NSError).code != NSURLErrorCancelled { state.error = error.localizedDescription; state.loading = false }
        }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { state.error = error.localizedDescription; state.loading = false }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let url = navigationAction.request.url else { return .cancel }
            if navigationAction.navigationType == .linkActivated && url.host != host {
                if ["https", "mailto", "tel"].contains(url.scheme ?? "") { await UIApplication.shared.open(url) }
                return .cancel
            }
            return ["https", "about", "blob", "data"].contains(url.scheme ?? "") ? .allow : .cancel
        }
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if navigationAction.targetFrame == nil { webView.load(navigationAction.request) }
            return nil
        }
        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor () -> Void) {
            present(webView, title: message, confirm: false) { _ in completionHandler() }
        }
        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor (Bool) -> Void) {
            present(webView, title: message, confirm: true, completion: completionHandler)
        }
        private func present(_ web: WKWebView, title: String, confirm: Bool, completion: @escaping @MainActor (Bool) -> Void) {
            var controller = web.window?.rootViewController
            while let presented = controller?.presentedViewController { controller = presented }
            guard let controller else { completion(false); return }
            let alert = UIAlertController(title: nil, message: title, preferredStyle: .alert)
            if confirm { alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in completion(false) }) }
            alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in completion(true) })
            controller.present(alert, animated: true)
        }
    }
}
