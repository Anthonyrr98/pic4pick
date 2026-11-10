import Foundation
import WebKit
import XCTest
@testable import Pic4Pick

final class ReleaseContractTests: XCTestCase {
    func testRejectsUnsafeEndpoints() {
        XCTAssertNil(ClientConfig.httpsURL("http://example.com"))
        XCTAssertNil(ClientConfig.httpsURL("https:///"))
        XCTAssertNil(ClientConfig.httpsURL("https://name:password@example.com"))
        XCTAssertEqual(ClientConfig.httpsURL("https://example.com")?.host, "example.com")
    }

    func testMissingCacheDirectoryIsRecoverable() {
        var cache = DiskImageCache(directory: nil)
        cache.store(Data([1]), forKey: "aa")
        XCTAssertNil(cache.data(forKey: "aa"))
    }

    func testPrivacyManifestAndMapAreInApplicationBundle() throws {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "PrivacyInfo", withExtension: "xcprivacy"))
        let manifest = try PropertyListSerialization.propertyList(from: Data(contentsOf: url), format: nil) as? [String: Any]
        XCTAssertEqual((manifest?["NSPrivacyAccessedAPITypes"] as? [[String: Any]])?.count, 2)
        XCTAssertNotNil(Bundle.main.url(forResource: "GalleryMap", withExtension: "html"))
    }

    @MainActor
    func testMapBridgeAcceptsTrustedMainFrameAndRejectsIframeAndOversizedMessages() async throws {
        let accepted = expectation(description: "Trusted document sent one ready message")
        accepted.assertForOverFulfill = true
        let map = WebsiteMap(payload: .init(content: .init(config: [:], locations: []), camera: .init(focus: [:])),
                             baseURL: try XCTUnwrap(URL(string: "https://maps.example.invalid")),
                             onStatus: { if $0 == "ready" { accepted.fulfill() } })
        let coordinator = map.makeCoordinator()
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.userContentController.add(coordinator, name: "pic4pickMap")
        let web = WKWebView(frame: .zero, configuration: config)
        coordinator.web = web
        web.navigationDelegate = coordinator
        web.loadHTMLString("""
            <iframe srcdoc="<script>webkit.messageHandlers.pic4pickMap.postMessage({type:'ready'})</script>"></iframe>
            <script>
              webkit.messageHandlers.pic4pickMap.postMessage({type:'ready', extra:'x'.repeat(16000)});
              webkit.messageHandlers.pic4pickMap.postMessage({type:'ready'});
            </script>
            """, baseURL: map.baseURL)
        let result = await XCTWaiter.fulfillment(of: [accepted], timeout: 5)
        XCTAssertEqual(result, .completed)
        _ = try await web.evaluateJavaScript("location.replace('https://outside.example.invalid/'); true")
        try await Task.sleep(for: .milliseconds(150))
        XCTAssertNotEqual(web.url?.host, "outside.example.invalid")
        config.userContentController.removeScriptMessageHandler(forName: "pic4pickMap")
    }
}
