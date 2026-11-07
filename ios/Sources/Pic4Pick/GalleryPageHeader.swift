import SwiftUI

// The gallery uses this fixed header above the scrolling viewport.
struct GalleryPageHeader: View {
    static let bottomPadding: CGFloat = 12
    var showsFilters: Bool
    var searchVisible = false
    var onSearch: (() -> Void)? = nil
    var onShuffle: (() -> Void)? = nil
    let onSelectFilter: (GalleryFilter) -> Void

    var body: some View {
        VStack(spacing: 12) {
            GalleryTopBar(searchVisible: searchVisible, onSearch: onSearch, onShuffle: onShuffle)
            if showsFilters { GalleryFilterBar(onSelect: onSelectFilter) }
        }
        .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, Self.bottomPadding)
        .frame(maxWidth: .infinity)
        .fixedSize(horizontal: false, vertical: true)
    }
}
