import Foundation

struct SpatialDepth: Sendable {
    let width: Int
    let height: Int
    let values: [UInt8]
    var isValid: Bool { width > 0 && height > 0 && width <= 1024 && height <= 1024 && values.count == width * height }
    var strength: Double {
        guard isValid else { return 0.85 }
        let stride = max(1, Int(ceil(Double(max(width, height)) / 128)))
        var histogram = [Int](repeating: 0, count: 256)
        var samples = 0, comparisons = 0, edges = 0, strong = 0
        func compare(_ a: UInt8, _ b: UInt8) {
            let difference = abs(Int(a) - Int(b))
            comparisons += 1
            if difference >= 24 { edges += 1 }
            if difference >= 64 { strong += 1 }
        }
        for y in Swift.stride(from: 0, to: height, by: stride) {
            for x in Swift.stride(from: 0, to: width, by: stride) {
                let index = y * width + x, value = values[index]
                histogram[Int(value)] += 1; samples += 1
                if x + stride < width { compare(value, values[index + stride]) }
                if y + stride < height { compare(value, values[index + stride * width]) }
            }
        }
        func percentile(_ fraction: Double) -> Int {
            var count = 0
            for i in 0..<256 { count += histogram[i]; if count >= Int(ceil(Double(samples) * fraction)) { return i } }
            return 255
        }
        let density = comparisons == 0 ? 0 : Double(edges) / Double(comparisons)
        let strongDensity = comparisons == 0 ? 0 : Double(strong) / Double(comparisons)
        let range = Double(percentile(0.95) - percentile(0.05)) / 255
        let risk = max(SpatialMath.smoothRange(0.02, 0.10, density), SpatialMath.smoothRange(0.005, 0.04, strongDensity))
        return max(0.75, (1 - 0.25 * risk) * (0.85 + 0.15 * SpatialMath.smoothRange(0.04, 0.20, range)))
    }
}

enum SpatialMath {
    static func clamp(_ value: Double) -> Double { value.isFinite ? max(-1, min(1, value)) : 0 }
    static func alpha(delta: Double, returning: Bool = false) -> Double {
        guard delta.isFinite && delta > 0 else { return 0 }
        return -expm1(-min(delta, 0.064) / (returning ? 0.180 : 0.120))
    }
    static func smoothRange(_ low: Double, _ high: Double, _ value: Double) -> Double {
        let t = max(0, min(1, (value - low) / (high - low)))
        return t * t * (3 - 2 * t)
    }
    static func orientation(roll: Double, pitch: Double, angle: Double) -> SIMD2<Double> {
        let x = roll / (.pi / 10), y = pitch / (.pi / 10)
        return SIMD2(clamp(x * cos(angle) + y * sin(angle)), clamp(y * cos(angle) - x * sin(angle)))
    }
    static func filtered(_ value: SIMD2<Double>, previous: SIMD2<Double>) -> SIMD2<Double>? {
        guard value.x.isFinite && value.y.isFinite else { return nil }
        func deadzone(_ v: Double) -> Double { (v < 0 ? -1 : 1) * max(0, (abs(clamp(v)) - 0.02) / 0.98) }
        let next = SIMD2(deadzone(value.x), deadzone(value.y))
        return hypot(next.x - previous.x, next.y - previous.y) < 0.012 ? nil : next
    }
    // Padding matches ImageCache.compose. Used to leave film artwork stationary.
    static func frameInsets(width: Double, height: Double, film: Bool, stock: String) -> (top: Double, left: Double, bottom: Double, right: Double) {
        guard film else { return (0, 0, 0, 0) }
        if !stock.isEmpty {
            let bottom = stock == "fuji-c200" ? 168.0 : stock == "kodak-gold-200" ? 182.0 : 198.0
            let factor = max(width, height) / 1536
            return height >= width ? (0, bottom * factor, 0, 160 * factor) : (160 * factor, 0, bottom * factor, 0)
        }
        if height >= width {
            let factor = width / 630
            return (65 * factor, 134 * factor, 63 * factor, 132 * factor)
        }
        let factor = width / 1290
        return (123 * factor, 44 * factor, 125 * factor, 42 * factor)
    }
}

struct SpatialMetadata: Decodable, Sendable {
    let photoID: String
    let generation: String
    let status: String
    let storageBackend: String?
    let depthPath: String?
    let width: Int?
    let height: Int?
    enum CodingKeys: String, CodingKey {
        case photoID = "photo_id", storageBackend = "storage_backend", depthPath = "depth_path"
        case generation, status, width, height
    }
    var validReady: Bool {
        guard status == "ready", UUID(uuidString: photoID) != nil, UUID(uuidString: generation) != nil,
              depthPath == "\(photoID)/\(generation).png", let width, let height else { return false }
        return width > 0 && width <= 1024 && height > 0 && height <= 1024
    }
    var cacheKey: String { "\(photoID):\(generation)" }
}
