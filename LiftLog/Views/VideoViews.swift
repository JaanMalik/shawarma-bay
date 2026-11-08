import SwiftUI
import AVKit
import AVFoundation

/// Poster frame of a stored video, loaded off the main thread. Makes the poster if it is missing.
struct PosterImage: View {
    let fileName: String

    @State private var image: UIImage?
    @State private var missing = false

    var body: some View {
        ZStack {
            Rectangle()
                .fill(Color(white: 0.12))
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                Image(systemName: missing ? "video.slash" : "video.fill")
                    .foregroundStyle(.white.opacity(0.7))
            }
        }
        .clipped()
        .task(id: fileName) {
            let name = fileName
            guard VideoStore.exists(name) else {
                missing = true
                return
            }
            var loaded = await Task.detached(priority: .userInitiated) { VideoStore.poster(for: name) }.value
            if loaded == nil {
                await VideoStore.makePoster(for: name)
                loaded = VideoStore.poster(for: name)
            }
            image = loaded
        }
    }
}

/// A tappable thumbnail with a play badge.
struct VideoThumbnail: View {
    let fileName: String
    var cornerRadius: CGFloat = 10
    var badgeSize: CGFloat = 22

    var body: some View {
        PosterImage(fileName: fileName)
            .overlay {
                Image(systemName: "play.fill")
                    .font(.system(size: badgeSize, weight: .bold))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.5), radius: 4)
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }
}

/// Full-screen playback of one set's video, with a share button to save it elsewhere.
struct VideoPlayerSheet: View {
    let fileName: String
    let title: String

    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer?

    private var url: URL { VideoStore.url(for: fileName) }

    var body: some View {
        NavigationStack {
            Group {
                if VideoStore.exists(fileName) {
                    if let player {
                        VideoPlayer(player: player)
                    } else {
                        Color.black
                    }
                } else {
                    ContentUnavailableView(
                        "Video missing",
                        systemImage: "video.slash",
                        description: Text("The file isn't in the app's Videos folder any more. Edit the set to remove or replace it.")
                    )
                }
            }
            .background(Color.black)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    if VideoStore.exists(fileName) {
                        ShareLink(item: url) {
                            Image(systemName: "square.and.arrow.up")
                        }
                        .accessibilityLabel("Share video")
                    }
                }
            }
        }
        .onAppear {
            guard VideoStore.exists(fileName) else { return }
            // Play sound even with the mute switch on, like a video app.
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
            try? AVAudioSession.sharedInstance().setActive(true)
            let newPlayer = AVPlayer(url: url)
            player = newPlayer
            newPlayer.play()
        }
        .onDisappear {
            player?.pause()
            player = nil
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
}
