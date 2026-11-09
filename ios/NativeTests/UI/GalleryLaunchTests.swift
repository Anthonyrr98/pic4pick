import XCTest

final class GalleryLaunchTests: XCTestCase {
    @MainActor func testGalleryExposesPrivacyPolicyAndSearch() {
        let app = XCUIApplication()
        app.launch()
        let policy = app.descendants(matching: .any)["privacyPolicy"].firstMatch
        XCTAssertTrue(policy.waitForExistence(timeout: 10))
        XCTAssertEqual(policy.label, "隐私政策")
        XCTAssertTrue(app.buttons["搜索作品"].exists)
    }
}
