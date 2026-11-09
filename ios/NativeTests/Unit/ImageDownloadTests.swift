import Foundation
import XCTest
@testable import Pic4Pick

final class ImageDownloadTests: XCTestCase {
    func testRejectsExcessiveDeclaredAndStreamingSizes() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ImageFixtureProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let download = ImageDownload(session: session, byteLimit: 256)
        for path in ["declared", "streamed"] {
            let url = try XCTUnwrap(URL(string: "https://images.example.invalid/\(path)"))
            do {
                _ = try await download.fetch(url)
                XCTFail("Oversized response was accepted")
            } catch let error as ClientError {
                XCTAssertTrue(error.localizedDescription.contains("大小限制"))
            }
        }
    }

    func testRejectsNonImageAndAcceptsSupportedImage() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ImageFixtureProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let download = ImageDownload(session: session)
        let validURL = try XCTUnwrap(URL(string: "https://images.example.invalid/valid"))
        let (data, store) = try await download.fetch(validURL)
        XCTAssertEqual(data, ImageFixtureProtocol.pixel)
        XCTAssertFalse(store)
        let fakeURL = try XCTUnwrap(URL(string: "https://images.example.invalid/fake"))
        do {
            _ = try await download.fetch(fakeURL)
            XCTFail("A non-image body was accepted as an image")
        } catch let error as ClientError {
            XCTAssertTrue(error.localizedDescription.contains("图片格式"))
        }
    }
}

private final class ImageFixtureProtocol: URLProtocol, @unchecked Sendable {
    static let pixel = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==") ?? Data()

    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "images.example.invalid" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url, let client else { return }
        var headers = ["Content-Type": "image/png", "Cache-Control": "no-store"]
        let data: Data
        switch url.lastPathComponent {
        case "declared":
            headers["Content-Length"] = String(50 * 1024 * 1024)
            data = Data()
        case "streamed":
            data = Data(repeating: 0, count: 257)
        case "valid":
            data = Self.pixel
        default:
            data = Data("not an image".utf8)
        }
        guard let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers) else {
            return client.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
        }
        client.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        if !data.isEmpty { client.urlProtocol(self, didLoad: data) }
        client.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
