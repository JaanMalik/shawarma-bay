import Foundation
import AVFoundation
import Vision
import UIKit

/// Finds the lifter's joints in a set's video, on the phone, with Apple's Vision framework.
/// Nothing here leaves the phone.
enum PoseTracker {
    enum TrackError: LocalizedError {
        case unreadable

        var errorDescription: String? { "The video couldn't be read." }
    }

    /// Looks at `fps` frames a second (at most `maxFrames` in all, spread over the whole video) and
    /// returns the lifter's pose in each frame where they were found. Everyone in each frame is
    /// kept until the end, and LifterTracker then picks out the lifter.
    static func track(url: URL, fps: Double = 8, maxFrames: Int = 320, progress: @escaping @MainActor (Double) -> Void) async throws -> PoseTrack {
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration).seconds
        guard duration.isFinite, duration > 0 else { throw TrackError.unreadable }

        let count = max(1, min(maxFrames, Int(duration * fps)))
        let step = duration / Double(count)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 640, height: 640)
        // Any frame near the asked-for time will do, which is much faster than an exact one.
        let tolerance = CMTime(seconds: step * 0.4, preferredTimescale: 600)
        generator.requestedTimeToleranceBefore = tolerance
        generator.requestedTimeToleranceAfter = tolerance

        let request = VNDetectHumanBodyPoseRequest()
        var frames: [LifterTracker.Frame] = []
        var aspect: Double?
        var lastTime = -1.0
        for i in 0..<count {
            try Task.checkCancellation()
            let time = CMTime(seconds: (Double(i) + 0.5) * step, preferredTimescale: 600)
            if let frame = try? await generator.image(at: time) {
                let image = frame.image
                if aspect == nil, image.height > 0 {
                    aspect = Double(image.width) / Double(image.height)
                }
                let seconds = frame.actualTime.seconds
                // Two requests can land on the same frame; keep it once.
                if seconds > lastTime {
                    frames.append(LifterTracker.Frame(time: seconds, people: people(in: image, request: request)))
                    lastTime = seconds
                }
            }
            await progress(Double(i + 1) / Double(count))
        }
        let samples = LifterTracker.lifter(in: frames, aspect: aspect ?? 1)
        return PoseTrack(duration: duration, aspect: aspect ?? 1, framesLooked: count, samples: samples)
    }

    /// Everyone Vision finds in a frame, as joints in LiftLog's coordinates.
    private static func people(in image: CGImage, request: VNDetectHumanBodyPoseRequest) -> [[String: JointPoint]] {
        let handler = VNImageRequestHandler(cgImage: image, orientation: .up, options: [:])
        guard (try? handler.perform([request])) != nil, let observations = request.results else { return [] }
        return observations.compactMap { observation in
            guard let points = try? observation.recognizedPoints(.all) else { return nil }
            var joints: [String: JointPoint] = [:]
            for joint in BodyJoint.allCases {
                guard let point = points[joint.visionName], point.confidence > 0.1 else { continue }
                // Vision puts y = 0 at the bottom; LiftLog puts it at the top.
                joints[joint.rawValue] = JointPoint(x: Double(point.location.x), y: 1 - Double(point.location.y), confidence: Double(point.confidence))
            }
            return joints.isEmpty ? nil : joints
        }
    }

    /// The frames at `times`, as JPEGs for Claude. nil for a frame that couldn't be read.
    static func jpegFrames(url: URL, times: [Double], longEdge: CGFloat = 1280, quality: CGFloat = 0.8) async throws -> [Data?] {
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: longEdge, height: longEdge)
        // The exact frames that were tracked, so the pose drawn on them matches.
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = .zero
        var frames: [Data?] = []
        for time in times {
            try Task.checkCancellation()
            let frame = try? await generator.image(at: CMTime(seconds: time, preferredTimescale: 600))
            frames.append(frame.flatMap { UIImage(cgImage: $0.image).jpegData(compressionQuality: quality) })
        }
        return frames
    }

    /// The frames at `times`, one after another with one decoder, for showing the key frames in
    /// the app. `onImage` gets each one's index in `times`, and nil for a frame that couldn't be read.
    static func images(url: URL, times: [Double], longEdge: CGFloat = 720, onImage: @MainActor (Int, UIImage?) -> Void) async {
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: longEdge, height: longEdge)
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = .zero
        for (index, time) in times.enumerated() {
            if Task.isCancelled { return }
            let frame = try? await generator.image(at: CMTime(seconds: time, preferredTimescale: 600))
            await onImage(index, frame.map { UIImage(cgImage: $0.image) })
        }
    }
}

extension BodyJoint {
    var visionName: VNHumanBodyPoseObservation.JointName {
        switch self {
        case .nose: return .nose
        case .neck: return .neck
        case .leftShoulder: return .leftShoulder
        case .rightShoulder: return .rightShoulder
        case .leftElbow: return .leftElbow
        case .rightElbow: return .rightElbow
        case .leftWrist: return .leftWrist
        case .rightWrist: return .rightWrist
        case .leftHip: return .leftHip
        case .rightHip: return .rightHip
        case .root: return .root
        case .leftKnee: return .leftKnee
        case .rightKnee: return .rightKnee
        case .leftAnkle: return .leftAnkle
        case .rightAnkle: return .rightAnkle
        }
    }
}
