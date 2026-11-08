import SwiftUI
import AVKit
import CoreTransferable
import UniformTypeIdentifiers

/// Set videos are copied into the app's own Documents/SetVideos folder, so they keep working
/// even if the original is deleted from Photos. A set stores only the file name.
enum VideoStore {
    static var directory: URL {
        URL.documentsDirectory.appending(path: "SetVideos", directoryHint: .isDirectory)
    }

    static func url(for fileName: String) -> URL {
        directory.appending(path: fileName)
    }

    /// Copies a video into the app and returns the new file name.
    static func importVideo(from source: URL) throws -> String {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let ext = source.pathExtension.isEmpty ? "mov" : source.pathExtension.lowercased()
        let name = "\(UUID().uuidString).\(ext)"
        try FileManager.default.copyItem(at: source, to: url(for: name))
        return name
    }

    static func delete(_ fileName: String?) {
        guard let fileName, !fileName.isEmpty else { return }
        try? FileManager.default.removeItem(at: url(for: fileName))
    }

    static func exists(_ fileName: String?) -> Bool {
        guard let fileName else { return false }
        return FileManager.default.fileExists(atPath: url(for: fileName).path)
    }
}

/// A video picked from Photos, already copied into the app.
struct PickedVideo: Transferable {
    let fileName: String

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .movie) { received in
            PickedVideo(fileName: try VideoStore.importVideo(from: received.file))
        }
    }
}

/// Wraps a file name so it can drive `.sheet(item:)`.
struct PlayableVideo: Identifiable {
    let fileName: String
    var id: String { fileName }
    var url: URL { VideoStore.url(for: fileName) }
}

struct VideoPlayerSheet: View {
    let video: PlayableVideo
    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer?

    var body: some View {
        NavigationStack {
            Group {
                if VideoStore.exists(video.fileName) {
                    VideoPlayer(player: player)
                        .ignoresSafeArea(edges: .bottom)
                } else {
                    ContentUnavailableView("Video not found", systemImage: "video.slash", description: Text("The video file for this set is missing."))
                }
            }
            .background(Color.black)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .toolbarBackground(.visible, for: .navigationBar)
        }
        .onAppear {
            let p = AVPlayer(url: video.url)
            player = p
            p.play()
        }
        .onDisappear { player?.pause() }
    }
}

/// First frame of a set video, with a play icon on top.
struct VideoThumbnail: View {
    let fileName: String
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            Rectangle().fill(Color.black.opacity(0.85))
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            }
            Image(systemName: "play.circle.fill")
                .font(.system(size: 40))
                .symbolRenderingMode(.palette)
                .foregroundStyle(.white, .black.opacity(0.45))
        }
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .task(id: fileName) { image = await Self.firstFrame(of: VideoStore.url(for: fileName)) }
    }

    static func firstFrame(of url: URL) async -> UIImage? {
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 600, height: 600)
        guard let (cgImage, _) = try? await generator.image(at: .zero) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
