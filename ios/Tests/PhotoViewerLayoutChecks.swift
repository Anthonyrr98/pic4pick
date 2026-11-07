import Foundation

@main
struct PhotoViewerLayoutChecks {
    static func main() {
        for height in [180.0, 260, 375, 759, 823, 1024] {
            for safeBottom in [0.0, 21, 34] {
                let layout = PhotoViewerLayout(availableHeight: height, safeBottom: safeBottom)
                precondition(layout.photoTop >= 0 && layout.photoHeight > 0)
                precondition(layout.photoTop + layout.photoHeight < height - layout.collapsedPanel + safeBottom)
                precondition(layout.expandedPanel <= height + safeBottom)
                precondition(layout.panelHeight(expanded: false, drag: -10000) == layout.collapsedPanel)
                precondition(layout.panelHeight(expanded: true, drag: 10000) == layout.expandedPanel)
                precondition(!layout.destination(expanded: true, translation: 55, predictedTranslation: 55))
                precondition(layout.destination(expanded: false, translation: -55, predictedTranslation: -55))
            }
        }
        // Aspect-fit examples: portrait and landscape photographs remain wholly
        // between the back control and collapsed panel at every phone width.
        for width in [320.0, 390, 430, 844] {
            let layout = PhotoViewerLayout(availableHeight: width > 500 ? 320 : 823, safeBottom: 34)
            for ratio in [0.5, 2.0 / 3, 1, 1.5, 2.4] {
                let scale = min(width / ratio, layout.photoHeight)
                precondition(scale * ratio <= width + 0.001 && scale <= layout.photoHeight)
            }
        }
        let invalid = PhotoViewerLayout(availableHeight: .infinity, safeBottom: .nan)
        precondition(invalid.photoHeight == 0 && invalid.collapsedPanel == 0)
        precondition(PhotoInfoSection.allCases.map(\.title) == ["地理位置", "基本参数"])
        precondition(PhotoInfoSection.visible(parametersTop: 860, parametersBottom: 1600, viewport: 800) == .geography)
        precondition(PhotoInfoSection.visible(parametersTop: 40, parametersBottom: 900, viewport: 800) == .parameters)
        precondition(PhotoInfoSection.visible(parametersTop: 280, parametersBottom: 700, viewport: 800) == .parameters)
        precondition(PhotoInfoSection.visible(parametersTop: .nan, parametersBottom: 700, viewport: 800) == .geography)
        let withStatus = PhotoViewerLayout(availableHeight: 823, safeBottom: 34, safeTop: 59)
        precondition(withStatus.photoTop > 69 && withStatus.photoTop < 72)
        precondition(withStatus.photoHeight == 609, "Moving the photo must preserve the original aspect-fit viewport size")
        let withoutStatus = PhotoViewerLayout(availableHeight: 882, safeBottom: 34, safeTop: 0)
        precondition(withStatus.expandedPanel == withoutStatus.expandedPanel, "Hiding status bar must not move the expanded panel")
        precondition(withStatus.expandedPreviewHeight == withoutStatus.expandedPreviewHeight)
        precondition(withStatus.height + withStatus.safeTop + withStatus.safeBottom - withStatus.expandedPanel
            + withStatus.expandedHandleHeight == withStatus.expandedPreviewHeight, "Handle must meet the photo preview edge")
        let travel = withStatus.expandedPanel - withStatus.collapsedPanel
        precondition(withStatus.expansion(expanded: false) == 0 && withStatus.expansion(expanded: true) == 1)
        precondition(abs(withStatus.expansion(expanded: false, drag: travel / 2) - 0.5) < 0.00001)
        precondition(withStatus.expansion(expanded: true, drag: 10000) == 1)
        precondition(withStatus.expansion(expanded: false, drag: -10000) == 0)
        precondition(PhotoViewerLayout.informationBlend(progress: 0) == 0)
        precondition(PhotoViewerLayout.compactInformationOpacity(progress: 0) == 1)
        precondition(PhotoViewerLayout.informationBlend(progress: 0.05) == 0)
        precondition(PhotoViewerLayout.compactInformationOpacity(progress: 0.05) == 0)
        precondition(abs(PhotoViewerLayout.informationBlend(progress: 0.11) - 0.5) < 0.00001)
        precondition(PhotoViewerLayout.informationBlend(progress: 0.17) == 1)
        for progress in stride(from: 0.0, through: 1, by: 0.001) {
            let compact = PhotoViewerLayout.compactInformationOpacity(progress: progress)
            let expanded = PhotoViewerLayout.informationBlend(progress: progress)
            precondition(compact * expanded == 0, "Compact and expanded information cannot overlap")
        }
        precondition(withStatus.revealsDetails(expanded: false, drag: 12), "Parameters must appear while the finger moves, before release")
        precondition(!withStatus.revealsDetails(expanded: false, drag: 0))
        precondition(!withStatus.revealsDetails(expanded: false, drag: -12))
        precondition(withStatus.revealsDetails(expanded: true, drag: -12))
        precondition(withStatus.panelTranslation(expanded: true) == 0)
        precondition(withStatus.panelTranslation(expanded: false) == travel)
        precondition(abs(withStatus.panelTranslation(expanded: false, drag: travel / 2) - travel / 2) < 0.00001)
        // A panel of constant expanded height is translated instead of resized;
        // its visible top still follows exactly the same interactive trajectory.
        for drag in stride(from: 0.0, through: travel, by: 17) {
            precondition(abs(withStatus.expandedPanel - withStatus.panelTranslation(expanded: false, drag: drag)
                - withStatus.panelHeight(expanded: false, drag: drag)) < 0.00001)
        }
        print("Photo viewer checks passed: full-image viewport, controls/panel clearance, compact phones, landscape and panel snapping.")
    }
}
