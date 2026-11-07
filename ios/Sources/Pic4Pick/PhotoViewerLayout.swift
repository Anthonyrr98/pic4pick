import Foundation

enum PhotoInfoSection: String, CaseIterable, Identifiable {
    case geography, parameters
    var id: String { rawValue }
    var title: String { self == .geography ? "地理位置" : "基本参数" }
    static func visible(parametersTop: Double, parametersBottom: Double, viewport: Double) -> PhotoInfoSection {
        guard parametersTop.isFinite, parametersBottom.isFinite, viewport.isFinite, viewport > 0 else { return .geography }
        return parametersTop < 80 || parametersBottom < viewport - 70 ? .parameters : .geography
    }
}

struct PhotoViewerLayout {
    private static let informationHandoff = 0.05
    private static let informationFadeEnd = 0.17
    let height: Double
    let safeBottom: Double
    let safeTop: Double
    let photoTop: Double
    let photoHeight: Double
    let collapsedPanel: Double
    let expandedPanel: Double
    let expandedPreviewHeight: Double
    let expandedHandleHeight: Double

    init(availableHeight: Double, safeBottom: Double, safeTop: Double = 0) {
        let height = max(0, availableHeight.isFinite ? availableHeight : 0)
        let bottom = max(0, safeBottom.isFinite ? safeBottom : 0)
        let top = max(0, safeTop.isFinite ? safeTop : 0)
        self.height = height
        self.safeBottom = bottom
        self.safeTop = top
        let content = min(142, height * 0.35)
        let topClearance = min(60, height * 0.15)
        let bottomClearance = min(12, height * 0.03)
        photoTop = topClearance + min(height * 0.014, bottomClearance * 0.9)
        photoHeight = max(0, height - topClearance - content - bottomClearance)
        collapsedPanel = content + bottom
        let preview = min(height + top, min(106, max(44, (height + top) * 0.2)))
        expandedPreviewHeight = preview
        expandedHandleHeight = min(44, preview)
        expandedPanel = max(collapsedPanel, height + top + bottom - preview + expandedHandleHeight)
    }

    func expansion(expanded: Bool, drag: Double = 0) -> Double {
        guard expandedPanel > collapsedPanel else { return 0 }
        return (panelHeight(expanded: expanded, drag: drag) - collapsedPanel) / (expandedPanel - collapsedPanel)
    }

    static func informationBlend(progress: Double) -> Double {
        smoothOpacity((progress - informationHandoff) / (informationFadeEnd - informationHandoff))
    }

    static func compactInformationOpacity(progress: Double) -> Double {
        1 - smoothOpacity(progress / informationHandoff)
    }

    private static func smoothOpacity(_ progress: Double) -> Double {
        let amount = min(1, max(0, progress))
        return amount * amount * (3 - 2 * amount)
    }

    func revealsDetails(expanded: Bool, drag: Double = 0) -> Bool {
        expanded || expansion(expanded: expanded, drag: drag) > 0
    }

    func panelHeight(expanded: Bool, drag: Double = 0) -> Double {
        min(expandedPanel, max(collapsedPanel, (expanded ? expandedPanel : collapsedPanel) + drag))
    }

    func panelTranslation(expanded: Bool, drag: Double = 0) -> Double {
        expandedPanel - panelHeight(expanded: expanded, drag: drag)
    }

    func destination(expanded: Bool, translation: Double, predictedTranslation: Double) -> Bool {
        PanelSnapPolicy.destination(expanded: expanded, collapsedHeight: collapsedPanel, expandedHeight: expandedPanel,
            translation: translation, predictedTranslation: predictedTranslation)
    }
}
