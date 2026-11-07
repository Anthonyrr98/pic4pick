import SwiftUI
import PhotosUI
import CoreTransferable
import UniformTypeIdentifiers
import ImageIO
import CryptoKit

struct ImportedPhoto: Transferable, Sendable {
    let url: URL
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .image) { received in
            let copy = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try FileManager.default.copyItem(at: received.file, to: copy)
            return ImportedPhoto(url: copy)
        }
    }
}

struct UploadAsset: Codable, Sendable {
    let path: String
    let name: String
    let size: Int
    let mime: String
    let ext: String
    let hash: String
    var url: URL { URL(fileURLWithPath: path) }
}

private struct UploadDraftRecord: Codable {
    let asset: UploadAsset
    let draft: PhotoDraft
    let date: Date
}

@MainActor
final class AdminUploadModel: ObservableObject {
    @Published var draft = PhotoDraft()
    @Published private(set) var asset: UploadAsset?
    @Published private(set) var preview: UIImage?
    @Published private(set) var loadingFile = false
    @Published private(set) var progress = 0.0
    @Published private(set) var stage = ""
    @Published private(set) var uploading = false
    private let admin: AdminStore
    private let directory: URL
    private let scope: String
    private var task: Task<Void, Never>?
    private var picking: Task<Void, Never>?
    private var attemptKey: String { "pic4pick.admin.upload.\(scope).\(asset?.hash ?? "")" }
    private var recordURL: URL { directory.appendingPathComponent("draft.json") }

    init(admin: AdminStore) {
        self.admin = admin
        scope = SHA256.hash(data: Data((admin.config.apiBaseURL + "|" + (admin.session?.username ?? "")).utf8)).map { String(format: "%02x", $0) }.joined()
        directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("AdminUploads/" + scope, isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
        if let data = try? Data(contentsOf: recordURL), let saved = try? JSONDecoder().decode(UploadDraftRecord.self, from: data),
           Date().timeIntervalSince(saved.date) < 48 * 3600, FileManager.default.fileExists(atPath: saved.asset.path),
           saved.asset.url.deletingLastPathComponent().standardizedFileURL == directory.standardizedFileURL {
            asset = saved.asset; draft = saved.draft; preview = Self.thumbnail(saved.asset.url)
        }
        // Only retain the current draft's original in this account's private directory.
        if let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) {
            for file in files where file.lastPathComponent != "draft.json" && file.path != asset?.path {
                try? FileManager.default.removeItem(at: file)
            }
        }
    }

    func persist() {
        guard let asset, let data = try? JSONEncoder().encode(UploadDraftRecord(asset: asset, draft: draft, date: Date())) else { return }
        try? data.write(to: recordURL, options: [.atomic, .completeFileProtection])
    }

    func choose(_ item: PhotosPickerItem?) {
        guard let item else { return }
        picking?.cancel(); loadingFile = true
        picking = Task {
            defer { loadingFile = false }
            do {
                guard let received = try await item.loadTransferable(type: ImportedPhoto.self) else { throw AdminFailure.message("无法读取选中的照片。") }
                defer { try? FileManager.default.removeItem(at: received.url) }
                try Task.checkCancellation()
                try await prepare(received.url, name: "相册照片")
            } catch { if !Task.isCancelled { admin.message = error.localizedDescription } }
        }
    }

    func chooseFile(_ url: URL) async {
        loadingFile = true
        defer { loadingFile = false }
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        do { try await prepare(url, name: url.lastPathComponent) }
        catch { admin.message = error.localizedDescription }
    }

    private func prepare(_ url: URL, name: String) async throws {
        let targetDirectory = directory
        let prepared = try await Task.detached(priority: .userInitiated) {
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size > 0 && size <= 100 * 1024 * 1024 else { throw AdminFailure.message("照片最大支持 100 MB。") }
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil), let type = CGImageSourceGetType(source) else { throw AdminFailure.message("无法读取图片格式。") }
            let typeID = type as String
            let formats = ["public.jpeg": ("jpg", "image/jpeg"), "public.png": ("png", "image/png"),
                "org.webmproject.webp": ("webp", "image/webp"), "public.heic": ("heic", "image/heic"),
                "public.heif": ("heic", "image/heic"), "com.compuserve.gif": ("gif", "image/gif")]
            guard let (ext, mime) = formats[typeID] else { throw AdminFailure.message("请选择 JPG、PNG、HEIC、WebP 或 GIF 图片。") }
            let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any] ?? [:]
            let tiff = properties[kCGImagePropertyTIFFDictionary as String] as? [String: Any] ?? [:]
            let exif = properties[kCGImagePropertyExifDictionary as String] as? [String: Any] ?? [:]
            let gps = properties[kCGImagePropertyGPSDictionary as String] as? [String: Any] ?? [:]
            var draft = PhotoDraft()
            draft.camera = [tiff[kCGImagePropertyTIFFMake as String] as? String, tiff[kCGImagePropertyTIFFModel as String] as? String].compactMap { $0 }.joined(separator: " ")
            draft.lens = exif[kCGImagePropertyExifLensModel as String] as? String ?? ""
            if let n = exif[kCGImagePropertyExifFocalLength as String] as? NSNumber { draft.focal = "\(n)mm" }
            if let n = exif[kCGImagePropertyExifFNumber as String] as? NSNumber { draft.aperture = "f/\(n)" }
            if let n = exif[kCGImagePropertyExifExposureTime as String] as? NSNumber, n.doubleValue > 0 {
                draft.shutter = n.doubleValue < 1 ? "1/\(Int(round(1 / n.doubleValue)))s" : "\(n)s"
            }
            if let n = (exif[kCGImagePropertyExifISOSpeedRatings as String] as? [NSNumber])?.first { draft.iso = n.stringValue }
            if let value = exif[kCGImagePropertyExifDateTimeOriginal as String] as? String { draft.shotDate = String(value.prefix(10)).replacingOccurrences(of: ":", with: "-") }
            if let n = gps[kCGImagePropertyGPSLatitude as String] as? NSNumber { draft.latitude = String(n.doubleValue * ((gps[kCGImagePropertyGPSLatitudeRef as String] as? String) == "S" ? -1 : 1)) }
            if let n = gps[kCGImagePropertyGPSLongitude as String] as? NSNumber { draft.longitude = String(n.doubleValue * ((gps[kCGImagePropertyGPSLongitudeRef as String] as? String) == "W" ? -1 : 1)) }
            if let n = gps[kCGImagePropertyGPSAltitude as String] as? NSNumber { draft.altitude = String(n.doubleValue * ((gps[kCGImagePropertyGPSAltitudeRef as String] as? NSNumber)?.intValue == 1 ? -1 : 1)) }
            let input = try FileHandle(forReadingFrom: url)
            defer { try? input.close() }
            var hasher = SHA256()
            while let chunk = try input.read(upToCount: 1024 * 1024), !chunk.isEmpty { hasher.update(data: chunk) }
            let hash = hasher.finalize().map { String(format: "%02x", $0) }.joined()
            let destination = targetDirectory.appendingPathComponent(UUID().uuidString + "." + ext)
            try FileManager.default.copyItem(at: url, to: destination)
            try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: destination.path)
            return (UploadAsset(path: destination.path, name: name, size: size, mime: mime, ext: ext, hash: hash), draft)
        }.value
        if Task.isCancelled { try? FileManager.default.removeItem(at: prepared.0.url); throw CancellationError() }
        if let previous = asset { try? FileManager.default.removeItem(at: previous.url) }
        asset = prepared.0; draft = prepared.1; preview = Self.thumbnail(prepared.0.url); progress = 0; stage = ""
        persist()
    }

    private static func thumbnail(_ url: URL) -> UIImage? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil), let image = CGImageSourceCreateThumbnailAtIndex(source, 0,
            [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true,
             kCGImageSourceThumbnailMaxPixelSize: 900] as CFDictionary) else { return nil }
        return UIImage(cgImage: image)
    }

    func submit() {
        guard let asset, !uploading, !admin.busy else { return }
        persist(); uploading = true; progress = 0; stage = "准备上传…"
        let key = attemptKey, token = admin.token
        task = Task { [self] in
            defer { uploading = false }
            _ = await admin.work {
                var body = try self.draft.payload()
                var attempt = UserDefaults.standard.data(forKey: key).flatMap { try? JSONDecoder().decode(UploadAttempt.self, from: $0) }
                    ?? UploadAttempt(id: UUID().uuidString.lowercased(), filename: UUID().uuidString.lowercased() + "." + asset.ext)
                func saveAttempt() throws { UserDefaults.standard.set(try JSONEncoder().encode(attempt), forKey: key) }
                try saveAttempt() // Persist identity before any network mutation.
                if attempt.receipt == nil {
                    self.stage = "正在上传原图…"
                    let id = attempt.id
                    let polling = Task { [weak self] in
                        while !Task.isCancelled {
                            try? await Task.sleep(for: .seconds(2))
                            guard !Task.isCancelled, let self else { return }
                            if let result = try? await self.admin.api.call("/api/upload/oss/progress/\(id)", token: token) {
                                let stage = result["data"]["stage"].string
                                if stage == "processing" { self.stage = "正在生成高清预览…" }
                                if stage == "original" { self.stage = "正在保存云端原图…" }
                                if stage == "preview" { self.progress = max(self.progress, 0.96); self.stage = "正在保存高清预览…" }
                            }
                        }
                    }
                    defer { polling.cancel() }
                    attempt.receipt = try await self.admin.api.upload(file: asset.url, mime: asset.mime, attempt: attempt, token: token) { [weak self] fraction in
                        Task { @MainActor in if let self { self.progress = max(self.progress, fraction) } }
                    }
                    try saveAttempt()
                }
                try Task.checkCancellation()
                guard let receipt = attempt.receipt else { throw AdminFailure.message("上传结果丢失，请重试。") }
                self.progress = 0.98; self.stage = "正在保存作品信息…"
                body["id"] = .string(attempt.id); body["upload_id"] = .string(attempt.id)
                body["image_url"] = .string(receipt.url); body["thumbnail_url"] = .string(receipt.thumbnailUrl ?? receipt.url)
                body.merge(ReviewStatus.pending.patch()) { _, next in next }; body["hidden"] = .bool(false)
                do { _ = try await self.admin.api.call("/api/admin/photos", method: "POST", body: body, token: token) }
                catch AdminFailure.response(let status, let message) where status == 410 {
                    attempt.receipt = nil; try saveAttempt(); throw AdminFailure.response(status, message)
                }
                UserDefaults.standard.removeObject(forKey: key)
                self.clear(); self.progress = 1; self.stage = "已上传，等待审核。"
                await self.admin.didMutate(); self.admin.message = "作品已上传并送审。"
            }
            if Task.isCancelled { stage = "已取消，草稿已保留，可重新提交。" }
        }
    }
    func cancel() { task?.cancel() }
    func clear() {
        if let asset { try? FileManager.default.removeItem(at: asset.url) }
        try? FileManager.default.removeItem(at: recordURL)
        asset = nil; preview = nil; draft = PhotoDraft(); progress = 0; stage = ""
    }
}
