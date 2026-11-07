import SwiftUI

struct GalleryRefreshOverlay: View {
    @EnvironmentObject private var store: GalleryStore
    @Environment(\.galleryAppearance) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        Group {
            if let notice = store.refreshNotice {
                pill(notice)
                    .padding(.top, 8)
                    .transition(reduceMotion ? .identity : .offset(y: -5).combined(with: .opacity))
            }
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: store.refreshNotice)
        .allowsHitTesting(false)
    }

    @ViewBuilder
    private func pill(_ notice: GalleryRefreshNotice) -> some View {
        let content = HStack(spacing: 7) {
            Group {
                if notice == .updating {
                    ProgressView().controlSize(.small).tint(theme.ink)
                } else {
                    Image(systemName: "checkmark")
                }
            }
            .frame(width: 17, height: 17)
            Text(title(for: notice)).contentTransition(.opacity)
        }
        .font(.footnote.weight(.semibold))
        .foregroundStyle(theme.ink)
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title(for: notice))

        if #available(iOS 26.0, *), !reduceTransparency {
            content.glassEffect(.regular, in: Capsule())
        } else if reduceTransparency {
            content.background(theme.surface, in: Capsule())
        } else {
            content.background(.regularMaterial, in: Capsule())
        }
    }

    private func title(for notice: GalleryRefreshNotice) -> String {
        switch notice {
        case .updating: "正在更新图库"
        case .noNewPhotos: "暂无新照片"
        case .newPhotos: "新照片已加载"
        }
    }
}
