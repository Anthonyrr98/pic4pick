import Foundation

@main
struct SpatialChecks {
    static func main() throws {
        func close(_ a: Double, _ b: Double, tolerance: Double = 0.00001) { precondition(abs(a - b) < tolerance, "\(a) != \(b)") }
        func progress(fps: Int) -> Double {
            var current = 0.0
            for _ in 0..<fps { current += (1 - current) * SpatialMath.alpha(delta: 1 / Double(fps)) }
            return current
        }
        close(progress(fps: 60), progress(fps: 90)); close(progress(fps: 60), progress(fps: 120))
        close(SpatialMath.alpha(delta: 30), SpatialMath.alpha(delta: 0.064))
        precondition(SpatialMath.alpha(delta: 0) == 0 && SpatialMath.alpha(delta: .nan) == 0)
        precondition(SpatialMath.clamp(.nan) == 0 && SpatialMath.clamp(8) == 1 && SpatialMath.clamp(-8) == -1)
        let portrait = SpatialMath.orientation(roll: .pi / 10, pitch: 0, angle: 0)
        close(portrait.x, 1); close(portrait.y, 0)
        let landscape = SpatialMath.orientation(roll: .pi / 10, pitch: 0, angle: .pi / 2)
        close(landscape.x, 0); close(landscape.y, -1)
        precondition(SpatialMath.filtered(SIMD2(0.01, -0.01), previous: .zero) == nil)
        precondition(SpatialMath.filtered(SIMD2(0.03, 0), previous: .zero) == nil)
        precondition(SpatialMath.filtered(SIMD2(0.05, 0), previous: .zero) != nil)
        let flat = SpatialDepth(width: 128, height: 128, values: [UInt8](repeating: 128, count: 128 * 128))
        close(flat.strength, 0.85)
        let smooth = SpatialDepth(width: 128, height: 128, values: (0..<128 * 128).map { UInt8(($0 % 128) * 2) })
        let sharp = SpatialDepth(width: 128, height: 128, values: (0..<128 * 128).map { ($0 % 2) == 0 ? 0 : 255 })
        precondition(smooth.strength > sharp.strength && sharp.strength >= 0.75 && smooth.strength <= 1)
        precondition(!SpatialDepth(width: 10, height: 10, values: [1]).isValid)
        let c200 = SpatialMath.frameInsets(width: 1536, height: 1024, film: true, stock: "fuji-c200")
        close(c200.top, 160); close(c200.bottom, 168); close(c200.left, 0)
        let ace = SpatialMath.frameInsets(width: 1024, height: 1536, film: true, stock: "fuji-simple-ace")
        close(ace.left, 198); close(ace.right, 160); close(ace.top, 0)
        let defaultPortrait = SpatialMath.frameInsets(width: 630, height: 1276, film: true, stock: "")
        close(defaultPortrait.left, 134); close(defaultPortrait.right, 132); close(defaultPortrait.top, 65)
        let unframed = SpatialMath.frameInsets(width: 1600, height: 900, film: false, stock: "")
        close(unframed.top + unframed.bottom + unframed.left + unframed.right, 0)
        let id = "11111111-1111-4111-8111-111111111111", generation = "22222222-2222-4222-8222-222222222222"
        func metadata(width: Int, path: String? = nil) throws -> SpatialMetadata {
            let row: [String: Any] = ["photo_id": id, "generation": generation, "status": "ready", "width": width, "height": 500,
                "storage_backend": "oss", "depth_path": path ?? "\(id)/\(generation).png"]
            return try JSONDecoder().decode(SpatialMetadata.self, from: JSONSerialization.data(withJSONObject: row))
        }
        let valid = try metadata(width: 784)
        let oversized = try metadata(width: 2048)
        let mismatch = try metadata(width: 784, path: "../other.png")
        precondition(valid.validReady && !oversized.validReady && !mismatch.validReady)
        if CommandLine.arguments.count > 1 {
            let rows = try JSONDecoder().decode([SpatialMetadata].self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
            precondition(rows.allSatisfy { $0.status != "ready" || $0.validReady })
            print("线上景深元数据解析通过：\(rows.count) 张。")
        }
        print("通过：运动平滑、长帧保护、横竖屏姿态、抖动过滤、自动幅度、静态边框、景深版本与尺寸校验。")
    }
}
