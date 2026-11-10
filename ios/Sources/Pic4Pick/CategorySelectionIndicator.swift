import SwiftUI
import QuartzCore

// Only the moving capsule uses an explicit refresh-rate hint. No permanent
// display link and no per-frame SwiftUI/layout updates are needed.
struct CategorySelectionIndicator: UIViewRepresentable {
    let selectedIndex: Int
    let count: Int
    let reduceMotion: Bool
    var translucent = false
    var tint: Color = .hex(0x48645e)
    @Environment(\.layoutDirection) private var direction

    func makeUIView(context: Context) -> CategoryIndicatorView { CategoryIndicatorView() }

    func updateUIView(_ view: CategoryIndicatorView, context: Context) {
        view.configure(index: selectedIndex, count: count, rightToLeft: direction == .rightToLeft,
            reduceMotion: reduceMotion, translucent: translucent, tint: UIColor(tint))
    }
}

@MainActor
final class CategoryIndicatorView: UIView {
    private let pill = CAGradientLayer()
    private var selectedIndex = 0
    private var count = 5
    private var rightToLeft = false
    private var reduceMotion = false
    private var translucent = false
    private var highlightTint = UIColor.clear
    private var renderedIndex: Int?
    private var renderedSize = CGSize.zero

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        layer.masksToBounds = true
        pill.startPoint = CGPoint(x: 0.5, y: 0)
        pill.endPoint = CGPoint(x: 0.5, y: 1)
        pill.borderColor = UIColor.white.withAlphaComponent(0.18).cgColor
        pill.shadowColor = UIColor.black.cgColor
        pill.shadowOpacity = 0.16
        pill.shadowRadius = 4
        pill.shadowOffset = CGSize(width: 0, height: 2)
        layer.addSublayer(pill)
    }

    required init?(coder: NSCoder) { fatalError("Use init(frame:)") }

    func configure(index: Int, count: Int, rightToLeft: Bool, reduceMotion: Bool, translucent: Bool, tint: UIColor) {
        selectedIndex = index
        self.count = count
        self.rightToLeft = rightToLeft
        self.reduceMotion = reduceMotion
        self.translucent = translucent
        highlightTint = tint
        setNeedsLayout()
        layoutIfNeeded()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.width > 0, bounds.height > 0 else { return }
        let layout = CategoryIndicatorLayout(containerWidth: Double(bounds.width), count: count,
            selectedIndex: selectedIndex, rightToLeft: rightToLeft)
        let target = CGPoint(x: layout.offset + layout.width / 2, y: bounds.height / 2)
        // Retarget from the current visible position, including during rapid taps.
        let visiblePosition = pill.presentation()?.position ?? pill.position
        let shouldAnimate = renderedIndex != nil && renderedIndex != selectedIndex
            && renderedSize == bounds.size && !reduceMotion && window != nil

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        // A translucent selection keeps the softened material visible underneath.
        pill.borderWidth = translucent ? 0 : 1
        if translucent {
            pill.colors = [UIColor.white.withAlphaComponent(0.20).cgColor,
                           highlightTint.withAlphaComponent(0.22).cgColor]
            pill.shadowOpacity = 0
        } else {
            pill.colors = [highlightTint.cgColor, highlightTint.cgColor]
            pill.borderColor = UIColor.white.withAlphaComponent(0.18).cgColor
            pill.shadowOpacity = 0.16
        }
        layer.cornerRadius = bounds.height / 2
        pill.bounds = CGRect(x: 0, y: 0, width: layout.width, height: bounds.height)
        pill.cornerRadius = bounds.height / 2
        pill.shadowPath = UIBezierPath(roundedRect: pill.bounds, cornerRadius: pill.cornerRadius).cgPath
        pill.position = target
        CATransaction.commit()

        if shouldAnimate, visiblePosition != target {
            let animation = CABasicAnimation(keyPath: "position")
            animation.fromValue = NSValue(cgPoint: visiblePosition)
            animation.toValue = NSValue(cgPoint: target)
            animation.duration = 0.4
            animation.timingFunction = CAMediaTimingFunction(controlPoints: 0.34, 1.56, 0.64, 1)
            animation.preferredFrameRateRange = DisplayRefreshPreference.range(for: window?.windowScene?.screen)
            pill.add(animation, forKey: "categorySelection")
        } else if reduceMotion || renderedSize != bounds.size || renderedIndex != selectedIndex {
            pill.removeAnimation(forKey: "categorySelection")
        }
        renderedIndex = selectedIndex
        renderedSize = bounds.size
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil { pill.removeAllAnimations() }
    }
}
