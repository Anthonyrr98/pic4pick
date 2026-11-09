import XCTest

final class GalleryLaunchTests: XCTestCase {
    @MainActor func testGalleryHeaderShowsSearchWithoutPrivacyShortcut() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["搜索作品"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.descendants(matching: .any)["privacyPolicy"].firstMatch.exists)
    }
}
