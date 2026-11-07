import SwiftUI
import QuartzCore

@MainActor
enum DisplayRefreshPreference {
    static func policy(for screen: UIScreen?, spatial: Bool = false) -> DisplayRefreshPolicy {
        let process = ProcessInfo.processInfo
        let limited = process.isLowPowerModeEnabled || process.thermalState == .serious || process.thermalState == .critical
        return DisplayRefreshPolicy(screenMaximum: screen?.maximumFramesPerSecond ?? 60,
            powerLimited: limited, constrainedMaximum: spatial ? 30 : 60)
    }

    static func range(for screen: UIScreen?, spatial: Bool = false) -> CAFrameRateRange {
        let rate = policy(for: screen, spatial: spatial)
        return CAFrameRateRange(minimum: rate.minimum, maximum: rate.maximum, preferred: rate.preferred)
    }
}

// Attach once to the scene rather than to an individual tab. Full-screen photos,
// navigation, scrolling and sheets in the same scene share the preference.
struct AppRefreshPreference: UIViewRepresentable {
    func makeUIView(context: Context) -> RefreshSceneAnchor { RefreshSceneAnchor() }
    func updateUIView(_ view: RefreshSceneAnchor, context: Context) { view.attach() }
}

@MainActor
final class RefreshSceneAnchor: UIView {
    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        isOpaque = false
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) { fatalError("Use init(frame:)") }

    override func didMoveToWindow() { super.didMoveToWindow(); attach() }

    func attach() {
        if #available(iOS 18.0, *), let scene = window?.windowScene {
            SceneRefreshPreferences.shared.attach(to: scene)
        }
        // iOS 17 keeps system-managed ProMotion plus explicit CA/Metal requests.
    }
}

@available(iOS 18.0, *)
@MainActor
private final class SceneRefreshPreferences: NSObject {
    static let shared = SceneRefreshPreferences()
    private struct Entry {
        weak var scene: UIWindowScene?
        let link: UIUpdateLink
    }
    private var entries: [String: Entry] = [:]

    override private init() {
        super.init()
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(refresh), name: UIScene.didActivateNotification, object: nil)
        center.addObserver(self, selector: #selector(deactivate(_:)), name: UIScene.willDeactivateNotification, object: nil)
        center.addObserver(self, selector: #selector(disconnect(_:)), name: UIScene.didDisconnectNotification, object: nil)
        center.addObserver(self, selector: #selector(policyChanged), name: .NSProcessInfoPowerStateDidChange, object: nil)
        center.addObserver(self, selector: #selector(policyChanged), name: ProcessInfo.thermalStateDidChangeNotification, object: nil)
    }

    func attach(to scene: UIWindowScene) {
        let id = scene.session.persistentIdentifier
        if let entry = entries[id], entry.scene === scene { return }
        entries[id]?.link.isEnabled = false
        // UIKit requires an associated phase action before configuring updates,
        // even when setting requiresContinuousUpdates to false (iOS 27 asserts).
        let link = UIUpdateLink(windowScene: scene, actionHandler: { _, _ in
            // Passive observer: never mutate UI or request another frame here.
        })
        // No continuous redraw or idle timer; callbacks only follow natural updates.
        link.requiresContinuousUpdates = false
        entries[id] = Entry(scene: scene, link: link)
        refresh()
    }

    @objc private func refresh() {
        for id in Array(entries.keys) {
            guard let entry = entries[id] else { continue }
            guard let scene = entry.scene else {
                entry.link.isEnabled = false
                entries[id] = nil
                continue
            }
            entry.link.preferredFrameRateRange = DisplayRefreshPreference.range(for: scene.screen)
            entry.link.isEnabled = scene.activationState == .foregroundActive
        }
    }

    @objc nonisolated private func policyChanged() {
        // ProcessInfo notifications aren't required to arrive on the UI executor.
        Task { @MainActor [weak self] in self?.refresh() }
    }

    @objc private func deactivate(_ note: Notification) {
        guard let scene = note.object as? UIWindowScene else { return }
        entries[scene.session.persistentIdentifier]?.link.isEnabled = false
    }

    @objc private func disconnect(_ note: Notification) {
        guard let scene = note.object as? UIWindowScene else { return }
        let id = scene.session.persistentIdentifier
        entries[id]?.link.isEnabled = false
        entries[id] = nil
    }
}
