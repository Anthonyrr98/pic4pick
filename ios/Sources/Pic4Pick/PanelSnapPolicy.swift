import Foundation

enum PanelSnapPolicy {
    static func destination(expanded: Bool, collapsedHeight: Double, expandedHeight: Double,
        translation: Double, predictedTranslation: Double) -> Bool {
        guard expandedHeight > collapsedHeight else { return false }
        let threshold = min(48, (expandedHeight - collapsedHeight) * 0.2)
        if translation >= threshold { return false }
        if translation <= -threshold { return true }
        if abs(predictedTranslation - translation) > 60 { return predictedTranslation < translation }
        return expanded
    }
}
