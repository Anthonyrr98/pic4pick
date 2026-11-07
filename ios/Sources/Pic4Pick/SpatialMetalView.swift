import SwiftUI
import MetalKit
import CoreMotion
import OSLog

@MainActor
private enum SpatialGPU {
    private static var resources: (MTLDevice, MTLRenderPipelineState)?
    static func pipeline() throws -> (MTLDevice, MTLRenderPipelineState) {
        if let resources { return resources }
        guard let device = MTLCreateSystemDefaultDevice(),
              let file = Bundle.module.url(forResource: "SpatialShader.metal", withExtension: "txt") else {
            throw SpatialFailure.message("当前设备无法开启空间场景。")
        }
        // Compile MSL on the iPhone; xtool on Linux does not need Apple's metal compiler.
        let library = try device.makeLibrary(source: String(contentsOf: file, encoding: .utf8), options: nil)
        let descriptor = MTLRenderPipelineDescriptor()
        descriptor.vertexFunction = library.makeFunction(name: "spatialVertex")
        descriptor.fragmentFunction = library.makeFunction(name: "spatialFragment")
        descriptor.colorAttachments[0].pixelFormat = .bgra8Unorm
        let pipeline = try device.makeRenderPipelineState(descriptor: descriptor)
        resources = (device, pipeline)
        return (device, pipeline)
    }
}

struct SpatialMetalView: UIViewRepresentable {
    let content: SpatialContent
    let tilt: Bool
    let calibration: Int
    let onFailure: @MainActor (String) -> Void

    func makeUIView(context: Context) -> SpatialSurface {
        SpatialSurface(content: content, tilt: tilt, calibration: calibration, onFailure: onFailure)
    }
    func updateUIView(_ view: SpatialSurface, context: Context) { view.update(tilt: tilt, calibration: calibration) }
    static func dismantleUIView(_ view: SpatialSurface, coordinator: ()) { view.stop() }
}

@MainActor
final class SpatialSurface: UIView {
    private let content: SpatialContent
    private let still = UIImageView()
    private var metal: MTKView?
    private var renderer: SpatialMetalRenderer?
    private var previousSize: CGSize = .zero

    init(content: SpatialContent, tilt: Bool, calibration: Int, onFailure: @escaping @MainActor (String) -> Void) {
        self.content = content
        super.init(frame: .zero)
        still.image = content.framedImage; still.contentMode = .scaleAspectFit
        addSubview(still)
        isAccessibilityElement = true
        accessibilityLabel = "空间照片。拖动可探索景深，使用工具栏可关闭空间场景或重新校准。"
        do {
            let (device, pipeline) = try SpatialGPU.pipeline()
            let view = MTKView(frame: .zero, device: device)
            view.colorPixelFormat = .bgra8Unorm
            view.isPaused = true; view.enableSetNeedsDisplay = false
            view.autoResizeDrawable = false; view.framebufferOnly = true
            view.clearColor = MTLClearColorMake(0, 0, 0, 1)
            (view.layer as? CAMetalLayer)?.colorspace = CGColorSpace(name: CGColorSpace.sRGB)
            let renderer = try SpatialMetalRenderer(view: view, content: content, pipeline: pipeline, onFailure: onFailure)
            self.metal = view; self.renderer = renderer
            addSubview(view)
            let pan = UIPanGestureRecognizer(target: renderer, action: #selector(SpatialMetalRenderer.pan(_:)))
            view.addGestureRecognizer(pan)
            renderer.update(tilt: tilt, calibration: calibration)
        } catch {
            Task { @MainActor in onFailure("空间渲染初始化失败，请重新打开。") }
        }
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.width > 0 && bounds.height > 0 else { return }
        let scale = min(bounds.width / content.size.width, bounds.height / content.size.height)
        let size = CGSize(width: content.size.width * scale, height: content.size.height * scale)
        let origin = CGPoint(x: (bounds.width - size.width) / 2, y: (bounds.height - size.height) / 2)
        still.frame = CGRect(origin: origin, size: size)
        let rect = content.photoRect
        metal?.frame = CGRect(x: origin.x + rect.minX * scale, y: origin.y + rect.minY * scale,
            width: rect.width * scale, height: rect.height * scale)
        renderer?.resize(recalibrate: previousSize != bounds.size)
        previousSize = bounds.size
    }
    func update(tilt: Bool, calibration: Int) { renderer?.update(tilt: tilt, calibration: calibration) }
    func stop() { renderer?.stop(); metal?.delegate = nil; renderer = nil }
}

@MainActor
final class SpatialMetalRenderer: NSObject, @MainActor MTKViewDelegate {
    private weak var view: MTKView?
    private let pipeline: MTLRenderPipelineState
    private let queue: MTLCommandQueue
    private let photoTexture: MTLTexture
    private let depthTexture: MTLTexture
    private let strength: Double
    private let onFailure: @MainActor (String) -> Void
    private let motion = CMMotionManager()
    private var baseline: CMAttitude?
    private var displayLink: CADisplayLink?
    private var lastFrameAt: Double?
    private var target = SIMD2<Double>.zero
    private var current = SIMD2<Double>.zero
    private var accepted = SIMD2<Double>.zero
    private var returning = false
    private var dragging = false
    private var tilt = false
    private var calibration = -1
    private var stopped = false
    private var angle: Double = 0
    private var loggedFrame = false
    private var loggedMotion = false
    private static let logger = Logger(subsystem: "com.rlzhao.pic4pick", category: "Spatial")

    init(view: MTKView, content: SpatialContent, pipeline: MTLRenderPipelineState,
         onFailure: @escaping @MainActor (String) -> Void) throws {
        guard let device = view.device, let queue = device.makeCommandQueue(), let cgImage = content.image.cgImage,
              content.depth.isValid else { throw SpatialFailure.message("无法创建空间渲染资源。") }
        self.view = view; self.pipeline = pipeline; self.queue = queue; self.onFailure = onFailure
        // Normalize wide-gamut/decoder-native BGRA images to explicit RGBA sRGB.
        // Never infer byte order from a UIImage's backing CGImage or texture loader.
        photoTexture = try Self.makePhotoTexture(cgImage, device: device)
        let depth = content.depth
        let descriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .r8Unorm,
            width: depth.width, height: depth.height, mipmapped: false)
        descriptor.usage = .shaderRead; descriptor.storageMode = .shared
        guard let texture = device.makeTexture(descriptor: descriptor) else { throw SpatialFailure.message("无法创建景深纹理。") }
        depth.values.withUnsafeBytes { bytes in
            texture.replace(region: MTLRegionMake2D(0, 0, depth.width, depth.height), mipmapLevel: 0,
                withBytes: bytes.baseAddress!, bytesPerRow: depth.width)
        }
        depthTexture = texture; strength = depth.strength
        super.init()
        #if DEBUG
        try Self.checkColorPipeline(device: device, queue: queue, pipeline: pipeline)
        #endif
        view.delegate = self
        NotificationCenter.default.addObserver(self, selector: #selector(displayPolicyChanged), name: .NSProcessInfoPowerStateDidChange, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(displayPolicyChanged), name: ProcessInfo.thermalStateDidChangeNotification, object: nil)
    }

    private static func makePhotoTexture(_ image: CGImage, device: MTLDevice) throws -> MTLTexture {
        let width = image.width, height = image.height
        guard width > 0 && height > 0 && width <= 4096 && height <= 4096,
              let space = CGColorSpace(name: CGColorSpace.sRGB) else { throw SpatialFailure.message("照片色彩空间无效。") }
        var rgba = [UInt8](repeating: 0, count: width * height * 4)
        let valid = rgba.withUnsafeMutableBytes { bytes -> Bool in
            guard let context = CGContext(data: bytes.baseAddress, width: width, height: height,
                bitsPerComponent: 8, bytesPerRow: width * 4, space: space,
                bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard valid else { throw SpatialFailure.message("无法转换照片颜色。") }
        return try makeTexture(rgba, width: width, height: height, format: .rgba8Unorm, device: device)
    }

    private static func makeTexture(_ bytes: [UInt8], width: Int, height: Int, format: MTLPixelFormat, device: MTLDevice) throws -> MTLTexture {
        let descriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: format, width: width, height: height, mipmapped: false)
        descriptor.usage = .shaderRead; descriptor.storageMode = .shared
        guard let texture = device.makeTexture(descriptor: descriptor) else { throw SpatialFailure.message("无法创建照片纹理。") }
        bytes.withUnsafeBytes { data in
            texture.replace(region: MTLRegionMake2D(0, 0, width, height), mipmapLevel: 0,
                withBytes: data.baseAddress!, bytesPerRow: width * (format == .r8Unorm ? 1 : 4))
        }
        return texture
    }

    #if DEBUG
    // Exercise the actual compiled shader with known colors on the iPhone GPU.
    // Read back BGRA output so red/blue swaps cannot pass unnoticed.
    private static func checkColorPipeline(device: MTLDevice, queue: MTLCommandQueue, pipeline: MTLRenderPipelineState) throws {
        let photo = try makeTexture([210, 40, 70, 255], width: 1, height: 1, format: .rgba8Unorm, device: device)
        let depth = try makeTexture([128], width: 1, height: 1, format: .r8Unorm, device: device)
        let descriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm, width: 4, height: 4, mipmapped: false)
        descriptor.usage = [.renderTarget]; descriptor.storageMode = .shared
        guard let output = device.makeTexture(descriptor: descriptor), let command = queue.makeCommandBuffer() else {
            throw SpatialFailure.message("空间颜色校验失败。")
        }
        let pass = MTLRenderPassDescriptor()
        pass.colorAttachments[0].texture = output
        pass.colorAttachments[0].loadAction = .clear; pass.colorAttachments[0].storeAction = .store
        guard let encoder = command.makeRenderCommandEncoder(descriptor: pass) else { throw SpatialFailure.message("空间颜色校验失败。") }
        encoder.setRenderPipelineState(pipeline)
        encoder.setFragmentTexture(photo, index: 0); encoder.setFragmentTexture(depth, index: 1)
        var offset = SIMD2<Float>.zero
        encoder.setFragmentBytes(&offset, length: MemoryLayout<SIMD2<Float>>.stride, index: 0)
        encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 6)
        encoder.endEncoding(); command.commit(); command.waitUntilCompleted()
        var result = [UInt8](repeating: 0, count: 4 * 4 * 4)
        result.withUnsafeMutableBytes { bytes in
            output.getBytes(bytes.baseAddress!, bytesPerRow: 16, from: MTLRegionMake2D(0, 0, 4, 4), mipmapLevel: 0)
        }
        guard command.status == .completed, abs(Int(result[0]) - 70) <= 1, abs(Int(result[1]) - 40) <= 1,
              abs(Int(result[2]) - 210) <= 1 else { throw SpatialFailure.message("空间颜色校验未通过，已恢复普通照片。") }
        Self.logger.info("Spatial GPU color check passed (RGBA to BGRA)")
    }
    #endif

    func update(tilt: Bool, calibration: Int) {
        guard !stopped else { return }
        if self.calibration != calibration { self.calibration = calibration; recenter() }
        guard self.tilt != tilt else { return }
        self.tilt = tilt
        stopMotion()
        recenter()
        if tilt && motion.isDeviceMotionAvailable {
            let rate = DisplayRefreshPreference.policy(for: view?.window?.windowScene?.screen, spatial: true)
            motion.deviceMotionUpdateInterval = 1.0 / Double(rate.preferred)
            motion.startDeviceMotionUpdates(using: .xArbitraryZVertical, to: .main) { [weak self] _, _ in
                MainActor.assumeIsolated { self?.sampleMotion() }
            }
            Self.logger.info("Spatial motion started")
        }
    }

    private func sampleMotion() {
        guard !stopped, tilt, !dragging, let attitude = motion.deviceMotion?.attitude else { return }
        if baseline == nil { baseline = attitude.copy() as? CMAttitude; return }
        guard let relative = attitude.copy() as? CMAttitude, let baseline else { return }
        relative.multiply(byInverseOf: baseline)
        let input = SpatialMath.orientation(roll: relative.roll, pitch: relative.pitch, angle: angle)
        if let filtered = SpatialMath.filtered(input, previous: accepted) {
            accepted = filtered
            setTarget(filtered, returning: false)
            if !loggedMotion { loggedMotion = true; Self.logger.info("Spatial tilt input received") }
        }
    }

    func resize(recalibrate: Bool) {
        guard !stopped, let view, view.bounds.width > 0 && view.bounds.height > 0 else { return }
        refreshDisplayPolicy()
        let limit = max(view.bounds.width, view.bounds.height)
        let resolution = min(view.window?.screen.scale ?? 2, 1.5, 1600 / max(1, limit))
        view.drawableSize = CGSize(width: max(1, round(view.bounds.width * resolution)), height: max(1, round(view.bounds.height * resolution)))
        switch view.window?.windowScene?.interfaceOrientation {
        case .landscapeLeft: angle = .pi / 2
        case .landscapeRight: angle = -.pi / 2
        case .portraitUpsideDown: angle = .pi
        default: angle = 0
        }
        if recalibrate { recenter() }
        view.draw()
    }

    private func recenter() {
        baseline = nil; accepted = .zero
        setTarget(.zero, returning: true)
    }

    @objc func pan(_ gesture: UIPanGestureRecognizer) {
        guard !stopped, let view else { return }
        if [.began, .changed].contains(gesture.state) {
            if gesture.state == .began { Self.logger.info("Spatial drag started") }
            dragging = true
            let delta = gesture.translation(in: view)
            setTarget(SIMD2(SpatialMath.clamp(delta.x / max(1, view.bounds.width * 0.35)),
                SpatialMath.clamp(delta.y / max(1, view.bounds.height * 0.35))), returning: false)
        } else if [.ended, .cancelled, .failed].contains(gesture.state) {
            dragging = false; recenter()
        }
    }

    private func setTarget(_ value: SIMD2<Double>, returning: Bool) {
        guard !stopped else { return }
        target = value; self.returning = returning
        guard displayLink == nil, abs(target.x - current.x) + abs(target.y - current.y) > 0.0001 else { return }
        lastFrameAt = CACurrentMediaTime()
        let link = CADisplayLink(target: self, selector: #selector(tick(_:)))
        link.preferredFrameRateRange = DisplayRefreshPreference.range(for: view?.window?.windowScene?.screen, spatial: true)
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    @objc private func tick(_ link: CADisplayLink) {
        guard !stopped else { stop(); return }
        let delta = max(0, link.timestamp - (lastFrameAt ?? link.timestamp))
        lastFrameAt = link.timestamp
        let alpha = SpatialMath.alpha(delta: delta, returning: returning)
        current += (target - current) * alpha
        let settled = abs(target.x - current.x) + abs(target.y - current.y) <= 0.001
        if settled { current = target }
        view?.draw()
        if settled { displayLink?.invalidate(); displayLink = nil; lastFrameAt = nil }
    }

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}
    func draw(in view: MTKView) {
        guard !stopped, let drawable = view.currentDrawable, let pass = view.currentRenderPassDescriptor,
              let command = queue.makeCommandBuffer(), let encoder = command.makeRenderCommandEncoder(descriptor: pass) else { return }
        encoder.setRenderPipelineState(pipeline)
        encoder.setFragmentTexture(photoTexture, index: 0)
        encoder.setFragmentTexture(depthTexture, index: 1)
        var offset = SIMD2<Float>(Float(current.x * 0.024 * strength), Float(current.y * 0.016 * strength))
        encoder.setFragmentBytes(&offset, length: MemoryLayout<SIMD2<Float>>.stride, index: 0)
        encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 6)
        encoder.endEncoding()
        command.present(drawable)
        let reportFirstFrame = !loggedFrame
        loggedFrame = true
        command.addCompletedHandler { [weak self] command in
            let failed = command.status == .error
            guard failed || reportFirstFrame else { return }
            Task { @MainActor [weak self] in
                guard let self, !self.stopped else { return }
                if failed { self.stop(); self.onFailure("空间渲染暂不可用，已恢复普通照片。") }
                else if reportFirstFrame { Self.logger.info("Spatial Metal frame completed") }
            }
        }
        command.commit()
    }

    @objc nonisolated private func displayPolicyChanged() {
        Task { @MainActor [weak self] in self?.refreshDisplayPolicy() }
    }

    private func refreshDisplayPolicy() {
        guard !stopped else { return }
        let policy = DisplayRefreshPreference.policy(for: view?.window?.windowScene?.screen, spatial: true)
        displayLink?.preferredFrameRateRange = CAFrameRateRange(minimum: policy.minimum, maximum: policy.maximum, preferred: policy.preferred)
        view?.preferredFramesPerSecond = Int(policy.preferred)
        if motion.isDeviceMotionActive { motion.deviceMotionUpdateInterval = 1.0 / Double(policy.preferred) }
    }

    private func stopMotion() {
        motion.stopDeviceMotionUpdates(); baseline = nil
    }
    func stop() {
        if !stopped { Self.logger.info("Spatial renderer stopped") }
        stopped = true
        NotificationCenter.default.removeObserver(self)
        stopMotion()
        displayLink?.invalidate(); displayLink = nil
        view?.delegate = nil
    }
}
