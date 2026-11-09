import SwiftUI
import UIKit
import Observation

// MARK: - Running a check

/// Runs one form check of a saved video: finds the lifter on the phone, picks the key frames and,
/// with an API key, asks Claude for a review. The screen that owns it shows `stage` and saves the
/// finished check with the set.
@MainActor
@Observable
final class FormCheckRunner {
    enum Stage: Equatable {
        case idle
        /// Finding the lifter in the video, 0 to 1.
        case tracking(Double)
        /// Taking the key frames out of the video.
        case framing
        /// Waiting on Claude.
        case reviewing(FormCoachStream.Phase)
        case failed(String)
    }

    private(set) var stage: Stage = .idle
    @ObservationIgnored private var task: Task<Void, Never>?
    @ObservationIgnored private var runID = UUID()
    /// Whether LiftLog went into the background during this run.
    @ObservationIgnored private var wentToBackground = false

    static let backgroundMessage = "The check stopped because the screen locked or LiftLog was closed. Keep LiftLog open until it's done, and try again."

    var isRunning: Bool {
        switch stage {
        case .tracking, .framing, .reviewing: return true
        case .idle, .failed: return false
        }
    }

    var failureMessage: String? {
        if case .failed(let message) = stage { return message }
        return nil
    }

    /// Starts checking a saved video. `onFinish` gets the result, to save with the set.
    func start(videoFileName: String, info: FormCheckContext, pattern: LiftPattern, useClaude: Bool, onFinish: @escaping (FormCheck) -> Void) {
        task?.cancel()
        let id = UUID()
        runID = id
        wentToBackground = false
        stage = .tracking(0)
        task = Task { [weak self] in
            await self?.run(id: id, videoFileName: videoFileName, info: info, pattern: pattern, useClaude: useClaude, onFinish: onFinish)
        }
    }

    /// Stops a check in progress. Nothing is saved, and nothing more is sent.
    func cancel() {
        task?.cancel()
        task = nil
        runID = UUID()
        stage = .idle
    }

    /// Call when LiftLog goes into the background. Finding the reps and taking out the frames
    /// can't be relied on in the background, so they stop with a message rather than carry on
    /// with gaps that would look like missed reps. A request to Claude keeps going.
    func appWentToBackground() {
        guard isRunning else { return }
        wentToBackground = true
        switch stage {
        case .tracking, .framing: task?.cancel()
        case .idle, .reviewing, .failed: break
        }
    }

    private func update(_ newStage: Stage, for id: UUID) {
        if runID == id { stage = newStage }
    }

    private func run(id: UUID, videoFileName: String, info: FormCheckContext, pattern: LiftPattern, useClaude: Bool, onFinish: @escaping (FormCheck) -> Void) async {
        do {
            guard VideoStore.exists(videoFileName) else {
                throw FormCheckFailure("The video isn't in LiftLog's Videos folder any more.")
            }
            let url = VideoStore.url(for: videoFileName)
            let track = try await PoseTracker.track(url: url) { [weak self] share in
                self?.update(.tracking(share), for: id)
            }
            try Task.checkCancellation()
            // In the background iOS can stop the phone's pose finder from working, which would
            // leave gaps that look like missed reps. Better to stop than measure from those.
            if wentToBackground { throw FormCheckFailure(Self.backgroundMessage) }

            let measurements = FormAnalyzer.measure(track: track, pattern: pattern, loggedReps: info.reps)
            let frames = FormAnalyzer.keyFrames(track: track, measurements: measurements)
            var check = FormCheck(videoFileName: videoFileName, checkedAt: Date(), aspect: track.aspect, duration: track.duration, frames: frames, measurements: measurements)

            guard useClaude else {
                guard let measurements, !measurements.reps.isEmpty else {
                    throw FormCheckFailure("Couldn't find your reps in this video. Film from the side, in good light, with your whole body in the picture.")
                }
                finish(check, id: id, onFinish: onFinish)
                return
            }
            guard let apiKey = APIKeyStore.load() else {
                throw FormCheckFailure("Add your Anthropic API key in Settings > Form check first.")
            }

            update(.framing, for: id)
            let jpegs = try await PoseTracker.jpegFrames(url: url, times: frames.map(\.time))
            // Frames that couldn't be read are left out and the rest renumbered, so the frame
            // numbers Claude uses match the ones shown in the app.
            var kept: [FormKeyFrame] = []
            var pictures: [Data] = []
            for (frame, jpeg) in zip(frames, jpegs) {
                guard let jpeg else { continue }
                var renumbered = frame
                renumbered.number = kept.count + 1
                kept.append(renumbered)
                pictures.append(jpeg)
            }
            guard !kept.isEmpty else { throw FormCheckFailure("Couldn't take any frames out of this video.") }
            check.frames = kept
            try Task.checkCancellation()

            update(.reviewing(.waiting), for: id)
            let total = kept.count
            var labeled: [(label: String, jpeg: Data)] = []
            for (frame, picture) in zip(kept, pictures) {
                labeled.append((label: FormPrompt.frameLabel(frame, total: total), jpeg: picture))
            }
            let text = FormPrompt.request(info: info, measurements: measurements, frameCount: total, duration: track.duration)
            let body = try FormCoachRequest.body(system: FormPrompt.system, frames: labeled, text: text)
            // A paid request is under way: if the screen locks or the lifter switches apps, ask
            // iOS for time to let Claude's reply finish arriving.
            let backgroundTime = BackgroundTime()
            backgroundTime.begin()
            defer { backgroundTime.end() }
            let reply = try await FormCoachClient.review(apiKey: apiKey, body: body) { [weak self] phase in
                self?.update(.reviewing(phase), for: id)
            }
            try Task.checkCancellation()

            check.feedback = reply.feedback
            check.model = reply.model
            check.inputTokens = reply.inputTokens
            check.outputTokens = reply.outputTokens
            check.cost = reply.cost
            finish(check, id: id, onFinish: onFinish)
        } catch is CancellationError {
            // Stopped here, or the screen closed: then the run is no longer current and nothing
            // is shown. Anything else that cancelled it, such as iOS, gets a message.
            update(.failed(wentToBackground ? Self.backgroundMessage : "The form check stopped before it finished. Try again."), for: id)
        } catch let error as FormCoachError {
            if case .network = error, wentToBackground {
                update(.failed(Self.backgroundMessage), for: id)
            } else {
                update(.failed(error.message), for: id)
            }
        } catch let failure as FormCheckFailure {
            update(.failed(failure.message), for: id)
        } catch {
            update(.failed("The form check didn't finish. \(error.localizedDescription)"), for: id)
        }
    }

    private func finish(_ check: FormCheck, id: UUID, onFinish: (FormCheck) -> Void) {
        guard runID == id, !Task.isCancelled else { return }
        stage = .idle
        task = nil
        onFinish(check)
    }
}

/// A form check that stopped, with what to tell the lifter.
struct FormCheckFailure: Error {
    let message: String

    init(_ message: String) {
        self.message = message
    }
}

/// Extra time from iOS to finish a request after LiftLog goes into the background, about 30
/// seconds. iOS ends it early when the time runs out, so the app is never stopped for overrunning.
@MainActor
final class BackgroundTime {
    private var id = UIBackgroundTaskIdentifier.invalid

    func begin() {
        guard id == .invalid else { return }
        // iOS calls this on the main thread.
        id = UIApplication.shared.beginBackgroundTask(withName: "Form check") { [weak self] in
            MainActor.assumeIsolated { self?.end() }
        }
    }

    func end() {
        guard id != .invalid else { return }
        UIApplication.shared.endBackgroundTask(id)
        id = .invalid
    }
}

// MARK: - Small pieces

extension FormVerdict {
    var color: Color {
        switch self {
        case .great: return .green
        case .good: return .teal
        case .needsWork: return .orange
        case .unsafe: return .red
        }
    }

    var symbol: String {
        switch self {
        case .great: return "checkmark.seal.fill"
        case .good: return "hand.thumbsup.fill"
        case .needsWork: return "wrench.and.screwdriver.fill"
        case .unsafe: return "exclamationmark.triangle.fill"
        }
    }
}

/// The form verdict on a set in the history, next to its PR badges.
struct FormVerdictChip: View {
    let verdict: FormVerdict
    var score: Int?

    var body: some View {
        Label(score.map { "Form \($0)/10" } ?? verdict.shortTitle, systemImage: verdict.symbol)
            .labelStyle(.titleAndIcon)
            .font(.caption2.bold())
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(verdict.color.opacity(0.18), in: Capsule())
            .foregroundStyle(verdict.color)
            .accessibilityLabel(score.map { "\(verdict.title), \($0) out of 10" } ?? verdict.title)
    }
}

/// The score as a ring that fills up to it.
struct FormScoreBadge: View {
    let score: Int
    let verdict: FormVerdict
    var size: CGFloat = 52

    var body: some View {
        ZStack {
            Circle()
                .stroke(verdict.color.opacity(0.22), lineWidth: size * 0.09)
            Circle()
                .trim(from: 0, to: CGFloat(score) / 10)
                .stroke(verdict.color, style: StrokeStyle(lineWidth: size * 0.09, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(score)")
                .font(.system(size: size * 0.42, weight: .bold, design: .rounded))
                .monospacedDigit()
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Form score \(score) out of 10")
    }
}

/// A saved check, as a row in the set's sheet. Tapping it opens the whole review.
struct FormCheckSummaryRow: View {
    let check: FormCheck

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            if let feedback = check.feedback {
                FormScoreBadge(score: feedback.clampedScore, verdict: feedback.verdict)
                VStack(alignment: .leading, spacing: 3) {
                    Text(feedback.verdict.title)
                        .font(.headline)
                        .foregroundStyle(feedback.verdict.color)
                    Text(feedback.headline)
                        .font(.subheadline)
                        .lineLimit(3)
                    Text("Checked \(check.checkedAt.formatted(date: .abbreviated, time: .shortened))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else {
                Image(systemName: "ruler")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                    .frame(width: 52, height: 52)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Phone measurements")
                        .font(.headline)
                    Text(repSummary)
                        .font(.subheadline)
                    Text("Measured \(check.checkedAt.formatted(date: .abbreviated, time: .shortened))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.footnote.bold())
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }

    private var repSummary: String {
        let count = check.measurements?.reps.count ?? 0
        return "\(count) \(count == 1 ? "rep" : "reps") found"
    }
}

// MARK: - The review

struct FormCheckResultView: View {
    let check: FormCheck
    let title: String
    let loggedReps: Int
    let canAskClaude: Bool
    let onCheckAgain: (_ useClaude: Bool) -> Void
    let onDelete: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var confirmingDelete = false
    /// Key frames taken from the video so far, by frame number.
    @State private var frameImages: [Int: UIImage] = [:]
    /// Frame numbers that are done loading, with or without a picture.
    @State private var framesLoaded: Set<Int> = []

    var body: some View {
        NavigationStack {
            List {
                if let feedback = check.feedback {
                    review(feedback)
                } else {
                    Section {
                        Text(canAskClaude
                             ? "These are the phone's own measurements. Tap Check with Claude below for a review of your form."
                             : "These are the phone's own measurements. Add your Anthropic API key in Settings > Form check to have Claude review your form too.")
                            .font(.subheadline)
                    }
                }

                if !check.frames.isEmpty {
                    framesSection
                }
                if let measurements = check.measurements {
                    measurementsSection(measurements)
                }

                Section {
                    // Measuring again without a key would replace Claude's review with the phone's
                    // numbers alone, so it's only offered when there's no review to lose.
                    if canAskClaude || check.feedback == nil {
                        Button {
                            dismiss()
                            onCheckAgain(canAskClaude)
                        } label: {
                            Label(canAskClaude ? (check.feedback == nil ? "Check with Claude" : "Check again") : "Measure again",
                                  systemImage: "arrow.clockwise")
                        }
                    }
                    Button(role: .destructive) {
                        confirmingDelete = true
                    } label: {
                        Label("Delete this check", systemImage: "trash")
                    }
                } footer: {
                    checkFooter
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .confirmationDialog("Delete this form check?", isPresented: $confirmingDelete, titleVisibility: .visible) {
                Button("Delete check", role: .destructive) {
                    onDelete()
                    dismiss()
                }
            } message: {
                Text("The set and its video stay.")
            }
        }
    }

    @ViewBuilder
    private func review(_ feedback: FormFeedback) -> some View {
        Section {
            HStack(spacing: 16) {
                FormScoreBadge(score: feedback.clampedScore, verdict: feedback.verdict, size: 64)
                VStack(alignment: .leading, spacing: 6) {
                    Label(feedback.verdict.title, systemImage: feedback.verdict.symbol)
                        .font(.headline)
                        .foregroundStyle(feedback.verdict.color)
                    Text(feedback.headline)
                }
            }
            .padding(.vertical, 4)
            if let note = confidenceText(feedback) {
                Label {
                    Text(note)
                } icon: {
                    Image(systemName: "info.circle")
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
        }

        if !feedback.safetyFlags.isEmpty {
            Section("Safety") {
                ForEach(feedback.safetyFlags, id: \.self) { flag in
                    Label {
                        Text(flag)
                    } icon: {
                        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red)
                    }
                }
            }
        }

        if !feedback.fixes.isEmpty {
            Section("What to fix") {
                ForEach(Array(feedback.fixes.enumerated()), id: \.offset) { index, fix in
                    FormFixRow(number: index + 1, fix: fix)
                }
            }
        }

        if !feedback.strengths.isEmpty {
            Section("What's good") {
                ForEach(feedback.strengths, id: \.self) { strength in
                    Label {
                        Text(strength)
                    } icon: {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                    }
                }
            }
        }

        if !feedback.repNotes.isEmpty {
            Section("Rep by rep") {
                ForEach(feedback.repNotes, id: \.self) { note in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text("Rep \(note.rep)")
                            .font(.subheadline.bold())
                            .frame(minWidth: 52, alignment: .leading)
                        Text(note.note)
                            .font(.subheadline)
                    }
                }
            }
        }

        if !feedback.nextSetTip.isEmpty {
            Section("Next set") {
                Label {
                    Text(feedback.nextSetTip)
                } icon: {
                    Image(systemName: "target").foregroundStyle(Color.accentColor)
                }
            }
        }
    }

    private var framesSection: some View {
        Section {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 10) {
                    ForEach(check.frames, id: \.number) { frame in
                        KeyFrameView(frame: frame, aspect: check.aspect, image: frameImages[frame.number],
                                     loaded: framesLoaded.contains(frame.number))
                    }
                }
                .padding(.vertical, 4)
            }
            .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
            // One frame at a time with one decoder, so a 4K clip doesn't decode ten frames at once.
            .task(id: check.checkedAt) {
                frameImages = [:]
                framesLoaded = []
                let frames = check.frames
                guard VideoStore.exists(check.videoFileName) else {
                    framesLoaded = Set(frames.map(\.number))
                    return
                }
                await PoseTracker.images(url: VideoStore.url(for: check.videoFileName), times: frames.map(\.time)) { index, image in
                    let number = frames[index].number
                    frameImages[number] = image
                    framesLoaded.insert(number)
                }
            }
        } header: {
            Text("Key frames")
        } footer: {
            Text(check.feedback == nil
                 ? "The frames that would go to Claude, with the joints the phone found."
                 : "What Claude saw, with the joints the phone found. The numbers match the fixes above.")
        }
    }

    private func measurementsSection(_ measurements: FormMeasurements) -> some View {
        Section {
            ForEach(FormReport.lines(measurements, loggedReps: loggedReps), id: \.self) { line in
                Text(line)
                    .font(.footnote)
            }
        } header: {
            Text("What the phone measured")
        } footer: {
            Text("Rough 2D estimates from the video. They're best when you film from the side, at hip height, with your whole body in the picture.")
        }
    }

    private var checkFooter: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let model = check.model {
                Text(usageText(model: model))
            }
            Text("Checked \(check.checkedAt.formatted(date: .abbreviated, time: .shortened)).")
            if check.feedback != nil {
                Text("This is coaching feedback from an AI looking at still frames, not medical advice. If something hurts, stop and get it checked.")
            }
        }
    }

    private func confidenceText(_ feedback: FormFeedback) -> String? {
        let note = feedback.confidenceNote.trimmingCharacters(in: .whitespacesAndNewlines)
        switch (feedback.confidence, note.isEmpty) {
        case ("high", true): return nil
        case ("high", false): return note
        case (let level, true): return "Claude's confidence: \(level)."
        case (let level, false): return "Claude's confidence: \(level). \(note)"
        }
    }

    private func usageText(model: String) -> String {
        var parts = ["Reviewed by \(Self.modelName(model))"]
        if let input = check.inputTokens, let output = check.outputTokens {
            parts.append("\((input + output).formatted()) tokens")
        }
        if let cost = check.estimatedCost {
            parts.append("about \(cost.formatted(.currency(code: "USD").precision(.fractionLength(2))))")
        }
        return parts.joined(separator: " · ")
    }

    /// "claude-opus-5-5" as "Claude Opus 5.5".
    static func modelName(_ id: String) -> String {
        let parts = id.split(separator: "-").map(String.init)
        guard parts.count >= 3, parts[0] == "claude" else { return id }
        // Version numbers only, not a date at the end.
        let version = parts[2...].filter { Int($0) != nil && $0.count <= 2 }.joined(separator: ".")
        return "Claude \(parts[1].capitalized)" + (version.isEmpty ? "" : " \(version)")
    }
}

struct FormFixRow: View {
    let number: Int
    let fix: FormFix

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(number). \(fix.issue)")
                    .font(.headline)
                Spacer(minLength: 8)
                Text(fix.severity.capitalized)
                    .font(.caption2.bold())
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(severityColor.opacity(0.18), in: Capsule())
                    .foregroundStyle(severityColor)
            }
            Text(fix.whyItMatters)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Label("Cue: \(fix.cue)", systemImage: "text.bubble.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.accentColor)
            if !fix.frames.isEmpty {
                Text(fix.frames.count == 1 ? "See frame \(fix.frames[0])" : "See frames \(fix.frames.map { String($0) }.joined(separator: ", "))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private var severityColor: Color {
        switch fix.severity {
        case "major": return .red
        case "moderate": return .orange
        default: return .secondary
        }
    }
}

/// One key frame, with the joints the phone found drawn on it. The picture is taken from the
/// video by the screen showing it.
struct KeyFrameView: View {
    let frame: FormKeyFrame
    let aspect: Double
    /// nil while it loads, or when the frame couldn't be read.
    let image: UIImage?
    /// Whether loading finished, with or without a picture.
    let loaded: Bool
    var height: CGFloat = 240

    private var width: CGFloat { height * CGFloat(min(max(aspect, 0.4), 1.8)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ZStack {
                Color(white: 0.12)
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else if loaded {
                    Image(systemName: "video.slash")
                        .foregroundStyle(.white.opacity(0.7))
                } else {
                    ProgressView()
                        .tint(.white)
                }
                if let pose = frame.pose {
                    SkeletonOverlay(pose: pose)
                }
            }
            .frame(width: width, height: height)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(alignment: .topLeading) {
                Text("\(frame.number)")
                    .font(.caption.bold())
                    .monospacedDigit()
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(.black.opacity(0.6), in: Capsule())
                    .foregroundStyle(.white)
                    .padding(6)
            }
            Text(frame.label)
                .font(.caption)
                .lineLimit(2)
            Text(FormReport.seconds(frame.time))
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(width: width, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Frame \(frame.number), \(frame.label), at \(FormReport.seconds(frame.time))")
    }
}

/// The joints the phone found, joined up like a stick figure.
struct SkeletonOverlay: View {
    let pose: PoseSample

    private static let bones: [(BodyJoint, BodyJoint)] = [
        (.leftShoulder, .rightShoulder), (.leftHip, .rightHip),
        (.leftShoulder, .leftElbow), (.leftElbow, .leftWrist),
        (.rightShoulder, .rightElbow), (.rightElbow, .rightWrist),
        (.leftShoulder, .leftHip), (.rightShoulder, .rightHip),
        (.leftHip, .leftKnee), (.leftKnee, .leftAnkle),
        (.rightHip, .rightKnee), (.rightKnee, .rightAnkle),
        (.neck, .nose),
    ]

    var body: some View {
        Canvas { context, size in
            func spot(_ joint: BodyJoint) -> CGPoint? {
                guard let point = pose.point(joint) else { return nil }
                return CGPoint(x: CGFloat(point.x) * size.width, y: CGFloat(point.y) * size.height)
            }
            var path = Path()
            for (from, to) in Self.bones {
                guard let a = spot(from), let b = spot(to) else { continue }
                path.move(to: a)
                path.addLine(to: b)
            }
            context.stroke(path, with: .color(.black.opacity(0.45)), style: StrokeStyle(lineWidth: 4.5, lineCap: .round))
            context.stroke(path, with: .color(.green), style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
            for joint in BodyJoint.allCases {
                guard let p = spot(joint) else { continue }
                context.fill(Path(ellipseIn: CGRect(x: p.x - 3, y: p.y - 3, width: 6, height: 6)), with: .color(.white))
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

// MARK: - The API key

/// Where the lifter pastes their own Anthropic API key. LiftLog never sees or stores it anywhere
/// but this iPhone's Keychain, and only sends it to Anthropic.
struct APIKeyView: View {
    @AppStorage(SettingsKey.hasAPIKey) private var hasAPIKey = false
    @State private var keyText = ""
    @State private var status: Status = .idle
    @State private var verifyTask: Task<Void, Never>?

    private enum Status: Equatable {
        case idle
        case checking
        case works
        case failed(String)
    }

    private var trimmed: String { keyText.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        Form {
            Section {
                if hasAPIKey {
                    LabeledContent("API key", value: "Saved on this iPhone")
                    Button {
                        verify()
                    } label: {
                        Label("Check that it works", systemImage: "checkmark.shield")
                    }
                    .disabled(status == .checking)
                    Button(role: .destructive) {
                        verifyTask?.cancel()
                        APIKeyStore.delete()
                        status = .idle
                    } label: {
                        Label("Remove key", systemImage: "trash")
                    }
                } else {
                    SecureField("Paste your key (sk-ant-…)", text: $keyText)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.done)
                        .onSubmit(save)
                    if !trimmed.isEmpty && !trimmed.hasPrefix("sk-ant-") {
                        Text("Anthropic API keys start with sk-ant-. Check that you copied the whole key.")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                    }
                    Button(action: save) {
                        Label("Save key", systemImage: "key.fill")
                    }
                    .disabled(trimmed.isEmpty)
                }
                statusRow
            } header: {
                Text("Anthropic API key")
            } footer: {
                Text("Form checks use your own key, so they're billed to your Anthropic account, which is separate from a Claude subscription. A check costs about 10 to 20 cents. The key is kept in this iPhone's Keychain, isn't in backups, and is only sent to Anthropic.")
            }

            Section {
                if let keysPage = URL(string: "https://platform.claude.com/settings/keys") {
                    Link(destination: keysPage) {
                        Label("Get a key at platform.claude.com", systemImage: "arrow.up.right.square")
                    }
                }
            } footer: {
                Text("Sign in, add a little credit under Billing, then create a key under API keys and paste it above.")
            }

            Section("What gets sent") {
                Text("Only when you tap Check my form: about 10 still frames from that set's video, the exercise, weight, reps and note, and the phone's measurements. The video itself never leaves your iPhone. By default, Anthropic doesn't train its models on what's sent to its API.")
                    .font(.subheadline)
            }
        }
        .navigationTitle("Form check")
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { verifyTask?.cancel() }
    }

    @ViewBuilder
    private var statusRow: some View {
        switch status {
        case .idle:
            EmptyView()
        case .checking:
            HStack(spacing: 10) {
                ProgressView()
                Text("Checking your key…")
                    .foregroundStyle(.secondary)
            }
        case .works:
            Label("Your key works. Form checks are ready.", systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
        case .failed(let message):
            Label(message, systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
        }
    }

    private func save() {
        guard !trimmed.isEmpty else { return }
        guard APIKeyStore.save(trimmed) else {
            status = .failed("Couldn't save the key on this iPhone. Try again.")
            return
        }
        keyText = ""
        verify()
    }

    private func verify() {
        guard let key = APIKeyStore.load() else {
            status = .failed("No key is saved.")
            return
        }
        verifyTask?.cancel()
        status = .checking
        verifyTask = Task {
            do {
                try await FormCoachClient.verify(apiKey: key)
                status = .works
            } catch is CancellationError {
                return
            } catch let error as FormCoachError {
                status = .failed(error.message)
            } catch {
                status = .failed(error.localizedDescription)
            }
        }
    }
}
