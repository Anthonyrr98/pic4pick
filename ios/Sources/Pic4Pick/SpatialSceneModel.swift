import SwiftUI
import Metal
import OSLog

@MainActor
struct SpatialContent {
    let photoID: String
    let image: UIImage
    let framedImage: UIImage
    let depth: SpatialDepth
    let photoRect: CGRect
    var size: CGSize { framedImage.size }
}

@MainActor
final class SpatialSceneModel: ObservableObject {
    @Published private(set) var content: SpatialContent?
    @Published private(set) var loading = false
    @Published private(set) var message = ""
    @Published var tiltEnabled = true
    @Published private(set) var calibration = 0
    private var selectedID: String?
    private var generation = 0
    private var prefetchTask: Task<SpatialDepth?, Error>?
    private var loadTask: Task<Void, Never>?
    private static let logger = Logger(subsystem: "com.rlzhao.pic4pick", category: "Spatial")

    func select(_ photoID: String?, client: SpatialDepthClient?, prefetch: Bool) {
        stop()
        selectedID = photoID
        guard prefetch, let photoID, let client, !ProcessInfo.processInfo.isLowPowerModeEnabled else { return }
        prefetchTask = Task {
            try await Task.sleep(for: .milliseconds(800))
            return try await client.depth(photoID: photoID, poll: false)
        }
    }

    func stop() {
        generation += 1
        prefetchTask?.cancel(); prefetchTask = nil
        loadTask?.cancel(); loadTask = nil
        content = nil; loading = false; message = ""
    }

    func recenter() { calibration += 1 }

    func toggle(photo: Photo, config: ClientConfig?, client: SpatialDepthClient?) {
        if content != nil || loading { stop(); return }
        guard let config, let client else { message = "空间场景需要连接云端图库。"; return }
        guard MTLCreateSystemDefaultDevice() != nil else { message = "当前设备暂不支持空间场景。"; return }
        generation += 1
        let token = generation
        let prepared = selectedID == photo.id ? prefetchTask : nil
        loading = true; message = "正在读取空间照片…"
        loadTask = Task { [weak self] in
            guard let self else { return }
            do {
                // Image and depth requests overlap; the prefetch is shared with the user action.
                async let image = Self.loadImage(photo: photo, config: config)
                let depth: SpatialDepth
                if let prepared, let cached = try? await prepared.value { depth = cached }
                else {
                    guard let loaded = try await client.depth(photoID: photo.id, poll: true, onPending: { [weak self] in
                        await self?.pending(token: token)
                    }) else { throw SpatialFailure.message("空间数据尚未准备好。") }
                    depth = loaded
                }
                let loadedImage = try await image
                try Task.checkCancellation()
                guard self.generation == token else { return }
                // Inverse depth must line up with the EXIF-corrected photograph.
                let ratio = Double(loadedImage.size.width / loadedImage.size.height)
                guard abs(ratio / (Double(depth.width) / Double(depth.height)) - 1) < 0.025 else {
                    throw SpatialFailure.message("景深与照片方向不匹配，请稍后重试。")
                }
                let framed = await ImageCache.shared.withFrame(loadedImage, photo: photo, key: "spatial-" + photo.imageURL)
                try Task.checkCancellation()
                let insets = SpatialMath.frameInsets(width: loadedImage.size.width, height: loadedImage.size.height,
                    film: photo.isFilm, stock: photo.frameStock)
                self.content = SpatialContent(photoID: photo.id, image: loadedImage, framedImage: framed, depth: depth,
                    photoRect: CGRect(x: insets.left, y: insets.top, width: loadedImage.size.width, height: loadedImage.size.height))
                self.message = ""; self.loading = false; self.prefetchTask = nil
                Self.logger.info("Spatial assets ready: \(photo.id, privacy: .public), depth \(depth.width)x\(depth.height)")
            } catch {
                guard !Task.isCancelled, self.generation == token else { return }
                self.content = nil; self.loading = false; self.message = error.localizedDescription
                self.prefetchTask = nil
                Self.logger.error("Spatial load failed (URLs omitted)")
            }
        }
    }

    private func pending(token: Int) {
        if generation == token { message = "空间照片正在后台准备…" }
    }

    func rendererFailed(_ message: String, photoID: String) {
        guard content?.photoID == photoID else { return }
        stop()
        self.message = message
        Self.logger.error("Spatial renderer failed (URLs omitted)")
    }

    private static func loadImage(photo: Photo, config: ClientConfig) async throws -> UIImage {
        // Use the same preview/original pixels as the website, without film artwork.
        for candidate in GalleryCatalogEngine.media(photo, detail: true).candidates where !candidate.isEmpty {
            try Task.checkCancellation()
            guard let url = config.mediaURL(candidate) else { continue }
            do { return try await ImageCache.shared.load(url, size: 2048) }
            catch { try Task.checkCancellation() }
        }
        throw SpatialFailure.message("照片读取失败，请检查网络后重试。")
    }
}
