import SwiftUI
import ImageIO
import CryptoKit
import CoreImage

extension UIImage {
    var hasOpaqueBitmap: Bool {
        switch cgImage?.alphaInfo {
        case .noneSkipFirst?, .noneSkipLast?, .none?: true
        default: false
        }
    }
}

enum PhotoViewerBackdropStyle {
    static let sourceMaxPixels = 192
    static let canvas = CGSize(width: 192, height: 416)
    static let blurRadius = 34.0
    static let saturation = 0.90
    static let brightness = 0.02
    static let lightVeilOpacity = 0.66
    static let darkVeilOpacity = 0.36
}

// A non-main actor serializes decoding/compositing without blocking scroll events.
// Network awaits remain reentrant; identical consumers share one pending request.
actor ImageCache {
    static let shared = ImageCache()
    static let thumbnailMaxPixels = 1000
    private let images = NSCache<NSURL, UIImage>()
    private let framed = NSCache<NSString, UIImage>()
    private let artwork = NSCache<NSString, UIImage>()
    private var pending: [String: Task<UIImage, Error>] = [:]
    private var developmentHistory = FilmDevelopmentHistory()
    private var disk = DiskImageCache()
    private let downloads = ImageDownload()
    private var pendingDownloads: [URL: Task<Data, Error>] = [:]
    private let backdrops = NSCache<NSURL, UIImage>()
    private var processingContext: CIContext?
    init() {
        images.totalCostLimit = 80 * 1024 * 1024
        framed.totalCostLimit = 40 * 1024 * 1024
        artwork.totalCostLimit = 32 * 1024 * 1024
        backdrops.totalCostLimit = 8 * 1024 * 1024
    }

    func viewerBackdrop(_ url: URL) async throws -> UIImage {
        let key = url as NSURL
        if let cached = backdrops.object(forKey: key) { return cached }
        let source: UIImage
        if let thumbnail = images.object(forKey: imageKey(url, size: Self.thumbnailMaxPixels)) {
            source = thumbnail
        } else {
            source = try await load(url, size: PhotoViewerBackdropStyle.sourceMaxPixels)
        }
        if let cached = backdrops.object(forKey: key) { return cached }
        try Task.checkCancellation()
        assert(!Thread.isMainThread, "Backdrop rendering must not run on the main thread")
        guard let cg = source.cgImage else { throw ClientError.message("背景处理失败") }
        let input = CIImage(cgImage: cg)
        let size = PhotoViewerBackdropStyle.canvas
        // Preserve colors at the sides of wide photos in the ambient field.
        let field = input.transformed(by: CGAffineTransform(
            scaleX: size.width / input.extent.width, y: size.height / input.extent.height))
        let output = field.clampedToExtent()
            .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: PhotoViewerBackdropStyle.blurRadius])
            .cropped(to: CGRect(origin: .zero, size: size))
            .applyingFilter("CIColorControls", parameters: [
                kCIInputSaturationKey: PhotoViewerBackdropStyle.saturation,
                kCIInputBrightnessKey: PhotoViewerBackdropStyle.brightness
            ])
        if processingContext == nil { processingContext = CIContext(options: [.cacheIntermediates: false]) }
        guard let rendered = processingContext?.createCGImage(output, from: output.extent) else { throw ClientError.message("背景处理失败") }
        let image = UIImage(cgImage: rendered)
        backdrops.setObject(image, forKey: key, cost: rendered.bytesPerRow * rendered.height)
        return image
    }

    func load(_ url: URL, size: Int) async throws -> UIImage {
        let key = imageKey(url, size: size)
        if let value = images.object(forKey: key) { return value }
        let requestKey = key.absoluteString ?? "\(url.absoluteString)#size=\(size)"
        if let task = pending[requestKey] { return try await task.value }
        let task = Task {
            try decode(try await sourceData(for: url), size: size)
        }
        pending[requestKey] = task
        defer { pending[requestKey] = nil }
        let value = try await task.value
        let cost = value.cgImage.map { $0.bytesPerRow * $0.height } ?? 0
        images.setObject(value, forKey: key, cost: cost)
        return value
    }

    private func sourceData(for url: URL) async throws -> Data {
        if let pending = pendingDownloads[url] { return try await pending.value }
        let diskKey = SHA256.hash(data: Data(url.absoluteString.utf8))
            .map { String(format: "%02x", $0) }.joined()
        if let data = disk.data(forKey: diskKey, maxBytes: ImageDownload.maximumBytes),
           ImageDownload.validSource(data) != nil { return data }
        let task = Task {
            let (data, canStore) = try await downloads.fetch(url)
            if canStore { disk.store(data, forKey: diskKey) }
            return data
        }
        pendingDownloads[url] = task
        defer { pendingDownloads[url] = nil }
        return try await task.value
    }

    private func imageKey(_ url: URL, size: Int) -> NSURL {
        var components = URLComponents(url: url, resolvingAgainstBaseURL: true)
        components?.fragment = "size=\(size)"
        return (components?.url ?? url) as NSURL
    }

    private func decode(_ data: Data, size: Int) throws -> UIImage {
        assert(!Thread.isMainThread, "Image decoding must not block scrolling")
        return try autoreleasepool {
            guard let source = ImageDownload.validSource(data),
                  let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceShouldCacheImmediately: true,
                    kCGImageSourceThumbnailMaxPixelSize: size
                  ] as CFDictionary) else { throw ClientError.message("图片加载失败") }
            return UIImage(cgImage: cg)
        }
    }

    func bundledArtwork(_ name: String, crop: CGRect? = nil) -> UIImage? {
        let key = "\(name)|\(String(describing: crop))" as NSString
        if let cached = artwork.object(forKey: key) { return cached }
        assert(!Thread.isMainThread, "Artwork processing must not block scrolling")
        guard let url = Bundle.module.url(forResource: name, withExtension: "png"),
              let data = try? Data(contentsOf: url),
              let decoded = try? decode(data, size: 2048), let cg = decoded.cgImage else { return nil }
        let value: UIImage
        if let crop {
            guard let cropped = cg.cropping(to: crop) else { return nil }
            value = UIImage(cgImage: cropped)
        } else { value = decoded }
        artwork.setObject(value, forKey: key, cost: value.cgImage.map { $0.bytesPerRow * $0.height } ?? 0)
        return value
    }

    func shouldDevelop(photoID: String, session: UUID) -> Bool {
        developmentHistory.claim(photoID: photoID, session: session)
    }

    func filmNegative(_ image: UIImage, photoID: String, session: UUID?) -> UIImage? {
        if let session, !developmentHistory.needsDevelopment(photoID: photoID, session: session) { return nil }
        guard let source = image.cgImage else { return nil }
        let negative = CIImage(cgImage: source).applyingFilter("CIColorInvert")
            .applyingFilter("CISepiaTone", parameters: [kCIInputIntensityKey: 1.0])
        if processingContext == nil { processingContext = CIContext(options: [.cacheIntermediates: false]) }
        guard let bitmap = processingContext?.createCGImage(negative, from: negative.extent) else { return nil }
        return UIImage(cgImage: bitmap, scale: image.scale, orientation: image.imageOrientation)
    }

    func withFrame(_ image: UIImage, photo: Photo, key: String) -> UIImage {
        assert(!Thread.isMainThread, "Film compositing must not block scrolling")
        guard photo.isFilm else { return image }
        let cacheKey = "\(key)|\(photo.frameStock)|\(image.size.width)" as NSString
        if let value = framed.object(forKey: cacheKey) { return value }
        let portrait = image.size.height >= image.size.width
        let stock = photo.frameStock
        let name = stock.isEmpty ? (portrait ? "135-portrait" : "135-landscape") : stock
        guard let artwork = bundledArtwork(name), let cg = artwork.cgImage else { return image }
        // Stock artwork is landscape; rotate the entire frame for portrait photos.
        if portrait && !stock.isEmpty {
            let rotated = rotate(image, clockwise: false)
            let value = rotate(compose(rotated, artwork: cg, stock: stock, portrait: false), clockwise: true)
            framed.setObject(value, forKey: cacheKey, cost: Int(value.size.width * value.size.height * 4))
            return value
        }
        let value = compose(image, artwork: cg, stock: stock, portrait: portrait)
        framed.setObject(value, forKey: cacheKey, cost: Int(value.size.width * value.size.height * 4))
        return value
    }

    private func rotate(_ image: UIImage, clockwise: Bool) -> UIImage {
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: image.size.height, height: image.size.width), format: format).image { context in
            context.cgContext.translateBy(x: image.size.height / 2, y: image.size.width / 2)
            context.cgContext.rotate(by: clockwise ? .pi / 2 : -.pi / 2)
            image.draw(in: CGRect(x: -image.size.width / 2, y: -image.size.height / 2, width: image.size.width, height: image.size.height))
        }
    }

    private func compose(_ photo: UIImage, artwork: CGImage, stock: String, portrait: Bool) -> UIImage {
        let top: CGRect, bottom: CGRect, left: CGRect?, right: CGRect?
        if !stock.isEmpty {
            let y: CGFloat = stock == "fuji-c200" ? 856 : stock == "kodak-gold-200" ? 842 : 826
            top = CGRect(x: 0, y: 0, width: 1536, height: 160)
            bottom = CGRect(x: 0, y: y, width: 1536, height: 1024 - y)
            left = nil; right = nil
        } else if portrait {
            top = CGRect(x: 64, y: 65, width: 896, height: 65)
            bottom = CGRect(x: 64, y: 1406, width: 896, height: 63)
            left = CGRect(x: 64, y: 130, width: 134, height: 1276)
            right = CGRect(x: 828, y: 130, width: 132, height: 1276)
        } else {
            top = CGRect(x: 80, y: 76, width: 1376, height: 123)
            bottom = CGRect(x: 80, y: 817, width: 1376, height: 125)
            left = CGRect(x: 80, y: 199, width: 44, height: 618)
            right = CGRect(x: 1414, y: 199, width: 42, height: 618)
        }
        let factor = photo.size.width / (top.width - (left?.width ?? 0) - (right?.width ?? 0))
        let l = (left?.width ?? 0) * factor, r = (right?.width ?? 0) * factor
        let t = top.height * factor, b = bottom.height * factor
        let size = CGSize(width: photo.size.width + l + r, height: photo.size.height + t + b)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor.black.setFill(); context.fill(CGRect(origin: .zero, size: size))
            func edge(_ crop: CGRect, _ rect: CGRect) {
                if let cg = artwork.cropping(to: crop) { UIImage(cgImage: cg).draw(in: rect) }
            }
            edge(top, CGRect(x: 0, y: 0, width: size.width, height: t))
            edge(bottom, CGRect(x: 0, y: t + photo.size.height, width: size.width, height: b))
            if let left { edge(left, CGRect(x: 0, y: t, width: l, height: photo.size.height)) }
            if let right { edge(right, CGRect(x: l + photo.size.width, y: t, width: r, height: photo.size.height)) }
            // Draw the full photo in its own rectangle. Artwork centre is never drawn.
            photo.draw(in: CGRect(x: l, y: t, width: photo.size.width, height: photo.size.height))
        }
    }
}

struct PhotoImage: View {
    let photo: Photo
    let config: ClientConfig?
    var detail = false
    // Nil for images outside the pager.
    var isSelectedPage: Bool? = nil
    var developmentID: UUID? = nil
    var previewsDevelopment = false
    var cardFill = false
    var panelInteraction: PhotoPanelInteraction? = nil
    var transition: PhotoPreviewSession? = nil
    var sourceToken: UUID? = nil
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.photoSourceScope) private var sourceScope
    @Environment(\.galleryAppearance) private var appearance
    @State private var image: UIImage?
    @State private var pagingPreview: UIImage?
    @State private var failed = false
    @State private var retry = 0
    @State private var negative: UIImage?
    @State private var generation = UUID()
    private var preparesDevelopment: Bool { !reduceMotion && (developmentID != nil || previewsDevelopment) }

    var body: some View {
        Group {
            if let image = image ?? transition?.seed(for: photo.id) ?? pagingPreview {
                if detail { ZoomImage(image: image, panelInteraction: panelInteraction, transition: transition, photoID: photo.id) }
                else if preparesDevelopment, let negative {
                    let renderGeneration = generation
                    let content = DevelopingFilmImage(negative: negative, framed: image, photo: photo, session: developmentID) {
                        if generation == renderGeneration { self.negative = nil }
                    }
                    if let sourceToken {
                        PhotoDevelopingTransitionThumbnail(image: image, id: photo.id, token: sourceToken, scope: sourceScope,
                            content: content)
                            .aspectRatio(image.size, contentMode: .fit)
                    } else { content }
                } else if let sourceToken {
                    if cardFill {
                        PhotoTransitionThumbnail(image: image, id: photo.id, token: sourceToken, scope: sourceScope,
                            fill: !photo.isFilm, corner: appearance.radius)
                            .frame(maxWidth: .infinity, maxHeight: .infinity).clipped()
                    } else {
                        PhotoTransitionThumbnail(image: image, id: photo.id, token: sourceToken, scope: sourceScope, fill: false, corner: 0)
                            .aspectRatio(image.size, contentMode: .fit)
                    }
                } else if cardFill {
                    GeometryReader { geometry in
                        Image(uiImage: image).resizable()
                            .aspectRatio(contentMode: PhotoPresentationPolicy.cropsImage(card: cardFill, film: photo.isFilm, detail: detail) ? .fill : .fit)
                            .frame(width: geometry.size.width, height: geometry.size.height)
                            .clipped()
                    }
                } else { Image(uiImage: image).resizable().scaledToFit() }
            } else if failed {
                if cardFill {
                    // The enclosing card opens the viewer, where loading can be retried.
                    // Do not nest a retry button inside the card's open-photo button.
                    Label("图片暂不可用", systemImage: "photo").font(.caption).foregroundStyle(.white.opacity(0.7))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    Button { retry += 1 } label: {
                        Label("点按重新加载", systemImage: "arrow.clockwise").font(.caption).frame(maxWidth: .infinity, minHeight: 160)
                    }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, minHeight: 180)
            }
        }
        .task(id: isSelectedPage == nil ? nil : "\(photo.id)-\(retry)") {
            guard isSelectedPage != nil, image == nil, pagingPreview == nil,
                  transition?.seed(for: photo.id) == nil else { return }
            await transition?.waitUntilPresented()
            for candidate in GalleryCatalogEngine.media(photo, detail: false).candidates {
                guard !Task.isCancelled, transition?.phase != .finished, image == nil else { return }
                guard let url = config?.mediaURL(candidate),
                      let thumbnail = try? await ImageCache.shared.load(url, size: ImageCache.thumbnailMaxPixels),
                      !Task.isCancelled else { continue }
                let framed = await ImageCache.shared.withFrame(thumbnail, photo: photo, key: url.absoluteString)
                guard !Task.isCancelled, transition?.phase != .finished, image == nil else { return }
                pagingPreview = framed
                return
            }
        }
        .task(id: "\(photo.id)-\(detail)-\(retry)-\(preparesDevelopment)-\(isSelectedPage == false)") {
            guard isSelectedPage != false else { return }
            if detail, let transition {
                // Keep the paging views mounted, but defer their image work until the opening handoff.
                await transition.waitUntilPresented()
                guard !Task.isCancelled, transition.phase != .finished else { return }
            }
            generation = UUID()
            failed = false
            negative = nil
            let candidates = GalleryCatalogEngine.media(photo, detail: detail).candidates
            for candidate in candidates {
                guard !Task.isCancelled, let url = config?.mediaURL(candidate) else { continue }
                do {
                    let loaded = try await ImageCache.shared.load(url, size: detail ? 2500 : ImageCache.thumbnailMaxPixels)
                    guard !Task.isCancelled else { return }
                    let framed = await ImageCache.shared.withFrame(loaded, photo: photo, key: url.absoluteString)
                    guard !Task.isCancelled else { return }
                    // Keep the exact decoded source bitmap until the shared element has settled.
                    while let transition, !transition.isStable {
                        if transition.phase == .finished { return }
                        do { try await Task.sleep(for: .milliseconds(35)) } catch { return }
                    }
                    let preparedNegative: UIImage?
                    if preparesDevelopment {
                        preparedNegative = await ImageCache.shared.filmNegative(loaded, photoID: photo.id, session: developmentID)
                    } else { preparedNegative = nil }
                    guard !Task.isCancelled else { return }
                    negative = preparedNegative
                    image = framed
                    pagingPreview = nil
                    return
                } catch { if Task.isCancelled { return } }
            }
            failed = true
        }
    }
}

private struct DevelopingFilmImage: View {
    let negative: UIImage
    let framed: UIImage
    let photo: Photo
    let session: UUID?
    let onFinish: () -> Void
    @State private var opacity = 1.0

    var body: some View {
        Image(uiImage: framed).resizable().scaledToFit()
            .overlay {
                GeometryReader { geometry in
                    let scale = geometry.size.width / framed.size.width
                    let insets = SpatialMath.frameInsets(width: negative.size.width, height: negative.size.height,
                        film: photo.isFilm, stock: photo.frameStock)
                    Image(uiImage: negative).resizable()
                        .overlay {
                            RadialGradient(colors: [.clear, Color.hex(0x271407).opacity(0.6)],
                                center: .topLeading, startRadius: 15, endRadius: max(60, geometry.size.width))
                        }
                        .frame(width: negative.size.width * scale, height: negative.size.height * scale)
                        .opacity(opacity)
                        .offset(x: insets.left * scale, y: insets.top * scale)
                }.allowsHitTesting(false)
            }
            .task(id: session) {
                guard let session else { return }
                // The negative must already be mounted before starting the dissolve.
                try? await Task.sleep(for: .milliseconds(40))
                guard !Task.isCancelled else { return }
                let shouldDevelop = await ImageCache.shared.shouldDevelop(photoID: photo.id, session: session)
                guard !Task.isCancelled else { return }
                if shouldDevelop {
                    withAnimation(.easeInOut(duration: 3.2), completionCriteria: .removed) {
                        opacity = 0
                    } completion: { onFinish() }
                } else { onFinish() }
            }
    }
}

struct ZoomImage: UIViewRepresentable {
    let image: UIImage
    var panelInteraction: PhotoPanelInteraction? = nil
    var transition: PhotoPreviewSession? = nil
    var photoID: String = ""
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> UIScrollView {
        let scroll = PhotoScrollView()
        scroll.delegate = context.coordinator
        scroll.minimumZoomScale = 1; scroll.maximumZoomScale = 4
        scroll.backgroundColor = .clear; scroll.isOpaque = false
        scroll.showsVerticalScrollIndicator = false; scroll.showsHorizontalScrollIndicator = false
        let view = context.coordinator.imageView
        scroll.photoView = view
        scroll.addSubview(view)
        let panelDriver = PhotoPanelPanDriver(view: scroll)
        panelDriver.zoomScale = { [weak scroll] in Double(scroll?.zoomScale ?? 1) }
        panelDriver.interaction = panelInteraction
        context.coordinator.panelDriver = panelDriver
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.doubleTap(_:)))
        tap.numberOfTapsRequired = 2; scroll.addGestureRecognizer(tap)
        return scroll
    }
    func updateUIView(_ scroll: UIScrollView, context: Context) {
        let coordinator = context.coordinator
        let view = coordinator.imageView
        coordinator.panelDriver?.interaction = panelInteraction
        let samePhoto = coordinator.photoID == photoID
        if !samePhoto || view.image == nil { scroll.setZoomScale(1, animated: false) }
        // Opening/dragging the metadata panel must not reset a pinched image.
        if scroll.zoomScale == 1 {
            let frame = CGRect(origin: .zero, size: scroll.bounds.size)
            if view.frame != frame { view.frame = frame }
            if scroll.contentSize != scroll.bounds.size { scroll.contentSize = scroll.bounds.size }
        }
        view.setImage(image)
        coordinator.transition = transition
        coordinator.photoID = photoID
        transition?.register(id: photoID, imageView: view, scroll: scroll)
    }
    static func dismantleUIView(_ view: UIScrollView, coordinator: Coordinator) {
        coordinator.panelDriver?.detach()
        coordinator.transition?.unregister(id: coordinator.photoID, imageView: coordinator.imageView)
    }
    @MainActor final class Coordinator: NSObject, UIScrollViewDelegate {
        let imageView = PhotoZoomBitmapView()
        var panelDriver: PhotoPanelPanDriver?
        weak var transition: PhotoPreviewSession?
        var photoID = ""
        func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }
        @objc func doubleTap(_ tap: UITapGestureRecognizer) {
            guard let scroll = tap.view as? UIScrollView else { return }
            if scroll.zoomScale > 1 { scroll.setZoomScale(1, animated: true) }
            else {
                let point = tap.location(in: imageView)
                scroll.zoom(to: CGRect(x: point.x - scroll.bounds.width / 5, y: point.y - scroll.bounds.height / 5,
                    width: scroll.bounds.width / 2.5, height: scroll.bounds.height / 2.5), animated: true)
            }
        }
    }
}

@MainActor
final class PhotoZoomBitmapView: UIView {
    private(set) var image: UIImage?

    func setImage(_ image: UIImage) {
        guard self.image !== image, let bitmap = image.cgImage else { return }
        // The decoder and film compositor supply oriented CGImages. Swap the
        // pixels in the existing layer, with no intermediate image or opacity change.
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        layer.contentsGravity = .resizeAspect
        layer.contents = bitmap
        CATransaction.commit()
        self.image = image
    }
}

@MainActor
final class PhotoScrollView: UIScrollView {
    weak var photoView: PhotoZoomBitmapView?
    override func layoutSubviews() {
        super.layoutSubviews()
        if zoomScale == 1 {
            photoView?.frame = CGRect(origin: .zero, size: bounds.size)
            if contentSize != bounds.size { contentSize = bounds.size }
        }
    }
}
