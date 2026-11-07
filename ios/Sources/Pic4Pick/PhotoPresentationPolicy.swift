import Foundation

enum PhotoPresentationPolicy {
    static let cardAspectRatio = 3.0 / 4.0

    static func cropsImage(card: Bool, film: Bool, detail: Bool) -> Bool {
        card && !film && !detail
    }
}
