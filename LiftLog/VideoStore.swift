import Foundation
import AVFoundation
import UIKit
import CoreTransferable
import UniformTypeIdentifiers

/// Set videos live in the app's own Documents/Videos folder on the phone. Nothing is uploaded.
///
/// A clip picked from Photos is copied in under a temporary `pending-…` name first, and renamed to
/// `<set id>-<random>.<ext>` when the set is saved, so a cancelled sheet never touches a saved video
/// and a replaced video always gets a new name (thumbnails then refresh by themselves).
/// Every video gets a poster frame next to it (same name, .jpg) for thumbnails.
/// The Documents folder is visible in the Files app and in Finder, so videos can be copied off the phone.
enum VideoStore {
    /// Only plain file names inside the Videos folder are ever used, so a name read from a backup
    /// file can never point somewhere else (like "../../Library/...").
    static func isSafeName(_ fileName: String?) -> Bool {
        guard let fileName, !fileName.isEmpty, !fileName.hasPrefix(".") else { return false }
        return (fileName as NSString).lastPathComponent == fileName && !fileName.contains("/")
    }

    static var directory: URL {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let folder = documents.appendingPathComponent("Videos", isDirectory: true)
        if !FileManager.default.fileExists(atPath: folder.path) {
            try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        }
        return folder
    }

    static func url(for fileName: String) -> URL {
        directory.appendingPathComponent(fileName)
    }

    static func posterURL(for fileName: String) -> URL {
        url(for: fileName).deletingPathExtension().appendingPathExtension("jpg")
    }

    static func exists(_ fileName: String?) -> Bool {
        guard let fileName, isSafeName(fileName) else { return false }
        var isDirectory: ObjCBool = false
        let found = FileManager.default.fileExists(atPath: url(for: fileName).path, isDirectory: &isDirectory)
        return found && !isDirectory.boolValue
    }

    /// Copies a movie into the store under a temporary name and returns that name.
    static func importMovie(from source: URL) throws -> String {
        let ext = source.pathExtension.isEmpty ? "mov" : source.pathExtension.lowercased()
        let name = pendingPrefix + UUID().uuidString + "." + ext
        try FileManager.default.copyItem(at: source, to: url(for: name))
        return name
    }

    /// Gives a pending video its final name for a set and returns that name, or nil if the file
    /// couldn't be moved (the caller then keeps the set's previous video). Each call makes a new
    /// name, so a replaced video never reuses the old one.
    static func adopt(_ pendingName: String, forSetID id: UUID) -> String? {
        guard isSafeName(pendingName) else { return nil }
        let ext = (pendingName as NSString).pathExtension
        let suffix = UUID().uuidString.prefix(8).lowercased()
        let finalName = "\(id.uuidString)-\(suffix).\(ext.isEmpty ? "mov" : ext)"
        let fm = FileManager.default
        do {
            try fm.moveItem(at: url(for: pendingName), to: url(for: finalName))
        } catch {
            do {
                try fm.copyItem(at: url(for: pendingName), to: url(for: finalName))
                try? fm.removeItem(at: url(for: pendingName))
            } catch {
                return nil
            }
        }
        if (try? fm.moveItem(at: posterURL(for: pendingName), to: posterURL(for: finalName))) == nil {
            try? fm.removeItem(at: posterURL(for: pendingName))
        }
        return finalName
    }

    /// Saves a poster frame for thumbnails. Overwrites any existing poster.
    static func makePoster(for fileName: String) async {
        let asset = AVURLAsset(url: url(for: fileName))
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 640, height: 640)
        let time = CMTime(seconds: 0.5, preferredTimescale: 600)
        guard let result = try? await generator.image(at: time) else { return }
        let image = UIImage(cgImage: result.image)
        guard let data = image.jpegData(compressionQuality: 0.8) else { return }
        try? data.write(to: posterURL(for: fileName), options: .atomic)
    }

    static func poster(for fileName: String) -> UIImage? {
        UIImage(contentsOfFile: posterURL(for: fileName).path)
    }

    /// Removes a video and its poster. Safe to call with nil or a missing file.
    static func delete(_ fileName: String?) {
        guard let fileName, isSafeName(fileName) else { return }
        removeFiles(named: fileName)
    }

    static func fileSize(_ fileName: String) -> Int64 {
        guard isSafeName(fileName) else { return 0 }
        let attributes = try? FileManager.default.attributesOfItem(atPath: url(for: fileName).path)
        return (attributes?[.size] as? NSNumber)?.int64Value ?? 0
    }

    static let pendingPrefix = "pending-"

    /// Removes clips that were picked but never saved, for example if the app was closed with the
    /// log sheet open. Only touches files named `pending-…` that are older than `minimumAge`
    /// seconds and that no set refers to (`keeping`), so saved videos and an import in progress
    /// are never affected.
    static func removeStalePending(keeping referenced: Set<String> = [], minimumAge: TimeInterval = 3600) {
        let keys: [URLResourceKey] = [.contentModificationDateKey]
        guard let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: keys) else { return }
        let keepStems = Set(referenced.map { ($0 as NSString).deletingPathExtension })
        let cutoff = Date().addingTimeInterval(-minimumAge)
        for file in files where file.lastPathComponent.hasPrefix(pendingPrefix)
            && !keepStems.contains(file.deletingPathExtension().lastPathComponent) {
            let modified = (try? file.resourceValues(forKeys: Set(keys)))?.contentModificationDate ?? Date()
            if modified < cutoff {
                try? FileManager.default.removeItem(at: file)
            }
        }
    }

    private static func removeFiles(named fileName: String) {
        try? FileManager.default.removeItem(at: url(for: fileName))
        try? FileManager.default.removeItem(at: posterURL(for: fileName))
    }
}

/// What the Photos picker hands over when a clip is chosen. The picker's copy of the file only
/// exists while the importing closure runs, so it is copied into the store right there.
struct PickedMovie: Transferable {
    let fileName: String

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { movie in
            SentTransferredFile(VideoStore.url(for: movie.fileName))
        } importing: { received in
            PickedMovie(fileName: try VideoStore.importMovie(from: received.file))
        }
    }
}
