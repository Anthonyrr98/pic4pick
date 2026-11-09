import SwiftUI

struct GalleryTopBar: View {
    @EnvironmentObject private var store: GalleryStore
    @Environment(\.galleryAppearance) private var theme
    private static let wordmark = Bundle.module.url(forResource: "brand-wordmark", withExtension: "png")
        .flatMap { UIImage(contentsOfFile: $0.path) }
    var searchVisible = false
    var onSearch: (() -> Void)? = nil
    var onShuffle: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                BrandMark(value: store.brandLogo, size: 36, circular: true)
                if let image = Self.wordmark {
                    Image(uiImage: image).renderingMode(.template).resizable().scaledToFit()
                        .foregroundStyle(theme.ink.opacity(0.8))
                        .frame(maxWidth: 142, maxHeight: 44)
                        .accessibilityHidden(true)
                }
            }.accessibilityElement(children: .ignore).accessibilityLabel(store.brandTitle)
            Spacer(minLength: 0)
            if let onShuffle {
                Button(action: onShuffle) {
                    Image(systemName: "shuffle").frame(width: 44, height: 44)
                }.accessibilityLabel("重新随览")
            }
            if let onSearch {
                Button(action: onSearch) {
                    Image(systemName: searchVisible ? "xmark" : "magnifyingglass")
                        .frame(width: 44, height: 44)
                }.accessibilityLabel(searchVisible ? "关闭搜索" : "搜索作品")
            }
        }.frame(minHeight: 44)
            .buttonStyle(.plain).foregroundStyle(theme.ink.opacity(0.6))
    }
}


