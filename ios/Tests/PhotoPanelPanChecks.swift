import Foundation

@main
struct PhotoPanelPanChecks {
    static func main() {
        precondition(PhotoPanelPanPolicy.contentAllowsPanelDrag(offset: 0, topInset: 0))
        precondition(PhotoPanelPanPolicy.contentAllowsPanelDrag(offset: -59, topInset: 59))
        precondition(PhotoPanelPanPolicy.contentAllowsPanelDrag(offset: -80, topInset: 59))
        precondition(!PhotoPanelPanPolicy.contentAllowsPanelDrag(offset: 24, topInset: 0))
        precondition(!PhotoPanelPanPolicy.contentAllowsPanelDrag(offset: -20, topInset: 59))
        precondition(!PhotoPanelPanPolicy.contentAllowsPanelDrag(offset: .nan, topInset: 0))
        precondition(PhotoPanelPanPolicy.accepts(horizontal: 20, vertical: -300, expanded: false, zoomScale: 1, touches: 1))
        precondition(PhotoPanelPanPolicy.accepts(horizontal: 20, vertical: 300, expanded: true, zoomScale: 1, touches: 1))
        precondition(!PhotoPanelPanPolicy.accepts(horizontal: 300, vertical: -20, expanded: false, zoomScale: 1, touches: 1))
        precondition(!PhotoPanelPanPolicy.accepts(horizontal: 300, vertical: 20, expanded: true, zoomScale: 1, touches: 1))
        precondition(PhotoPanelPanPolicy.accepts(horizontal: 20, vertical: 300, expanded: false, zoomScale: 1, touches: 1))
        precondition(PhotoPanelPanPolicy.accepts(horizontal: 85, vertical: 100, expanded: false, zoomScale: 1, touches: 1))
        precondition(!PhotoPanelPanPolicy.accepts(horizontal: 100, vertical: 85, expanded: false, zoomScale: 1, touches: 1))
        precondition(!PhotoPanelPanPolicy.accepts(horizontal: 85, vertical: 100, expanded: true, zoomScale: 1, touches: 1))
        precondition(!PhotoPanelPanPolicy.accepts(horizontal: 20, vertical: -300, expanded: true, zoomScale: 1, touches: 1))
        precondition(!PhotoPanelPanPolicy.accepts(horizontal: 0, vertical: -300, expanded: false, zoomScale: 2, touches: 1))
        precondition(!PhotoPanelPanPolicy.accepts(horizontal: 0, vertical: -300, expanded: false, zoomScale: 1, touches: 2))
        precondition(!PhotoPanelPanPolicy.accepts(horizontal: .nan, vertical: -300, expanded: false, zoomScale: 1, touches: 1))
        precondition(!PhotoPanelPanPolicy.accepts(horizontal: 0, vertical: 0, expanded: false, zoomScale: 1, touches: 1))
        print("Photo panel gesture checks passed: up/down direction, horizontal paging, zoom/pinch exclusion and invalid movement.")
    }
}
