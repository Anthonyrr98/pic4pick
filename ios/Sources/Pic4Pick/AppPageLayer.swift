import SwiftUI

// Retain page identity/scroll state while animating only its outer presentation.
// Only navigation animation stops at the content; film development and other
// animations originating inside the page keep their own transactions.
struct AppPageLayer: ViewModifier {
    let active: Bool
    var fades = false
    static let fadeDuration = 0.20
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .animation(nil, value: active)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .opacity(!fades || active ? 1 : 0)
            .animation(fades && !reduceMotion ? .easeInOut(duration: Self.fadeDuration) : nil, value: active)
            .allowsHitTesting(active)
            .accessibilityHidden(!active)
    }
}
