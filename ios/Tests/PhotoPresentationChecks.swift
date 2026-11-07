import Foundation

@main
struct PhotoPresentationChecks {
    static func main() {
        for card in [false, true] {
            for film in [false, true] {
                for detail in [false, true] {
                    let crop = PhotoPresentationPolicy.cropsImage(card: card, film: film, detail: detail)
                    precondition(crop == (card && !film && !detail))
                    if film || detail { precondition(!crop, "Film and detail images must retain the complete composition") }
                }
            }
        }
        for viewport in [320.0, 390, 430, 844, 1024] {
            let width = (viewport - 40 - 14) / 2
            let height = width / PhotoPresentationPolicy.cardAspectRatio
            precondition(abs(height / width - 4.0 / 3.0) < 0.00001)
        }
        print("Photo presentation checks passed: 3:4 cards, cover only for ordinary previews, full film/detail composition.")
    }
}
