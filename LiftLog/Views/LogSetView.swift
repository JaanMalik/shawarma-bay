import SwiftUI
import UIKit
import SwiftData
import PhotosUI

/// Log a new set, or edit an existing one. A video from Photos can be attached to any set.
struct LogSetView: View {
    let exercise: Exercise
    var editing: LiftSet? = nil

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context

    @AppStorage(SettingsKey.unit) private var unit: WeightUnit = .lb
    @AppStorage(SettingsKey.formula) private var formula: OneRepMaxFormula = .epley
    @AppStorage(SettingsKey.maxEstimateReps) private var maxEstimateReps = 10

    @State private var weightText = ""
    @State private var reps = 5
    @State private var date = Date()
    @State private var note = ""
    @State private var draftID = UUID()
    @State private var didLoad = false
    @State private var celebration: [PRKind]?
    @State private var savedText = ""
    @State private var saveCount = 0
    @FocusState private var weightFocused: Bool

    // Video. A clip picked here is copied in under a temporary name and only becomes the set's
    // video on Save, so Cancel never changes a saved video.
    @State private var pendingVideo: String?
    @State private var removeSavedVideo = false
    @State private var pickerItem: PhotosPickerItem?
    @State private var importingVideo = false
    @State private var videoError: String?
    @State private var playingVideo: VideoRef?
    @State private var importTask: Task<Void, Never>?

    // Form check of the set's saved video. A finished check is saved with the set right away, since
    // it may have cost money, whether or not the other changes in the sheet are saved.
    @State private var formRunner = FormCheckRunner()
    @State private var showingFormCheck = false
    @State private var showingKeyEntry = false
    @AppStorage(SettingsKey.hasAPIKey) private var hasAPIKey = false
    @Environment(\.scenePhase) private var scenePhase

    private var calculator: PRCalculator { PRCalculator(formula: formula, maxRepsForEstimate: maxEstimateReps) }

    private var weightInPounds: Double? {
        guard let value = WeightUnit.parse(weightText), value > 0 else { return nil }
        return unit.toPounds(value)
    }

    private var otherSets: [SetRecord] {
        exercise.sets.filter { $0.id != editing?.id }.map(\.record)
    }

    private var draft: SetRecord? {
        guard let pounds = weightInPounds else { return nil }
        return SetRecord(id: editing?.id ?? draftID, date: date, weight: pounds, reps: reps)
    }

    /// The video shown in the sheet right now: the newly picked one, or the set's saved one.
    private var shownVideo: String? {
        if let pendingVideo { return pendingVideo }
        if removeSavedVideo { return nil }
        return editing?.videoFileName
    }

    var body: some View {
        NavigationStack {
            Group {
                if let celebration {
                    CelebrationView(
                        kinds: celebration,
                        setText: savedText,
                        onLogAnother: { self.celebration = nil },
                        onDone: { dismiss() }
                    )
                } else {
                    form
                }
            }
            .navigationTitle(editing == nil ? exercise.name : "Edit set")
            .navigationBarTitleDisplayMode(.inline)
        }
        // A swipe down would stop a form check that's partway through.
        .interactiveDismissDisabled(formRunner.isRunning)
        .sensoryFeedback(.success, trigger: saveCount)
        .onAppear(perform: load)
        .onDisappear {
            formRunner.cancel()
            UIApplication.shared.isIdleTimerDisabled = false
            discardPendingVideo()
        }
        // Keeps the screen from locking while a check runs, since a lock would stop it.
        .onChange(of: formRunner.isRunning) { _, running in
            UIApplication.shared.isIdleTimerDisabled = running
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { formRunner.appWentToBackground() }
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            importVideo(item)
        }
        .sheet(item: $playingVideo) { video in
            VideoPlayerSheet(fileName: video.fileName, title: exercise.name)
        }
        .sheet(isPresented: $showingFormCheck) {
            if let editing, let check = editing.formCheck {
                FormCheckResultView(
                    check: check,
                    title: exercise.name,
                    loggedReps: reps,
                    canAskClaude: hasAPIKey,
                    onCheckAgain: { useClaude in runFormCheck(useClaude: useClaude) },
                    onDelete: {
                        editing.formCheck = nil
                        try? context.save()
                    }
                )
            }
        }
        .sheet(isPresented: $showingKeyEntry) {
            NavigationStack {
                APIKeyView()
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { showingKeyEntry = false }
                        }
                    }
            }
        }
        .alert("Video", isPresented: Binding(get: { videoError != nil }, set: { if !$0 { videoError = nil } })) {
            Button("OK") {}
        } message: {
            Text(videoError ?? "")
        }
    }

    private var form: some View {
        Form {
            Section {
                HStack(spacing: 12) {
                    roundButton("minus") { adjustWeight(-unit.step) }
                    TextField("0", text: $weightText)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.center)
                        .font(.system(size: 44, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .focused($weightFocused)
                    Text(unit.rawValue)
                        .font(.title3)
                        .foregroundStyle(.secondary)
                    roundButton("plus") { adjustWeight(unit.step) }
                }
            } header: {
                Text("Weight")
            } footer: {
                if !exercise.weightNote.isEmpty {
                    Text("Enter the weight \(exercise.weightNote).")
                }
            }

            Section("Reps") {
                HStack(spacing: 12) {
                    roundButton("minus") { reps = max(1, reps - 1) }
                    Text("\(reps)")
                        .font(.system(size: 44, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .frame(maxWidth: .infinity)
                    roundButton("plus") { reps = min(100, reps + 1) }
                }
                HStack(spacing: 6) {
                    ForEach([1, 3, 5, 8, 10, 12], id: \.self) { n in
                        Button("\(n)") { reps = n }
                            .buttonStyle(.bordered)
                            .tint(reps == n ? Color.accentColor : Color.gray)
                            .frame(maxWidth: .infinity)
                    }
                }
            }

            Section {
                DatePicker("When", selection: $date)
                TextField("Note (optional)", text: $note, axis: .vertical)
            }

            videoSection

            formCheckSection

            if let draft {
                Section("Preview") { preview(draft) }
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { save() }
                    .bold()
                    .disabled(draft == nil || importingVideo || formRunner.isRunning)
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { weightFocused = false }
            }
        }
    }

    // MARK: Video

    private var videoSection: some View {
        Section {
            if importingVideo {
                HStack(spacing: 12) {
                    ProgressView()
                    Text("Adding video…")
                        .foregroundStyle(.secondary)
                }
            } else if let shownVideo {
                Button {
                    playingVideo = VideoRef(fileName: shownVideo)
                } label: {
                    VideoThumbnail(fileName: shownVideo, cornerRadius: 12, badgeSize: 30)
                        .frame(height: 160)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
                .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
                .accessibilityLabel("Play video")

                PhotosPicker(selection: $pickerItem, matching: .videos) {
                    Label("Replace video", systemImage: "arrow.triangle.2.circlepath")
                }

                Button(role: .destructive) {
                    removeVideo()
                } label: {
                    Label("Remove video", systemImage: "trash")
                }
            } else {
                PhotosPicker(selection: $pickerItem, matching: .videos) {
                    Label("Add a video of this set", systemImage: "video.badge.plus")
                }
            }
        } header: {
            Text("Video")
        } footer: {
            if editing == nil, pendingVideo != nil {
                Text("Save the set, then tap it in your history to have your form checked.")
            } else {
                Text("Pick a clip you recorded. It's copied into the app, so it stays even if you later delete it from Photos. The backup file keeps which set has which video, but not the videos themselves.")
            }
        }
    }

    private func importVideo(_ item: PhotosPickerItem) {
        formRunner.cancel()
        importTask?.cancel()
        importingVideo = true
        videoError = nil
        importTask = Task {
            do {
                guard let movie = try await item.loadTransferable(type: PickedMovie.self) else {
                    throw CocoaError(.fileReadUnknown)
                }
                // The sheet was closed while the clip was copying: throw the copy away.
                guard !Task.isCancelled else {
                    VideoStore.delete(movie.fileName)
                    return
                }
                await VideoStore.makePoster(for: movie.fileName)
                guard !Task.isCancelled else {
                    VideoStore.delete(movie.fileName)
                    return
                }
                if let old = pendingVideo {
                    VideoStore.delete(old)
                }
                pendingVideo = movie.fileName
            } catch {
                if !Task.isCancelled {
                    videoError = "Couldn't add that video. \(error.localizedDescription)"
                }
            }
            importingVideo = false
            pickerItem = nil
        }
    }

    private func removeVideo() {
        formRunner.cancel()
        if let pendingVideo {
            VideoStore.delete(pendingVideo)
            self.pendingVideo = nil
        } else {
            removeSavedVideo = true
        }
    }

    /// Cancel, swipe-down, or Done after a PR: anything picked but never saved is removed,
    /// and a copy still in progress is thrown away when it finishes.
    private func discardPendingVideo() {
        importTask?.cancel()
        importTask = nil
        if let pendingVideo {
            VideoStore.delete(pendingVideo)
            self.pendingVideo = nil
        }
    }

    /// Moves the sheet's video choice onto the set being saved. The set's old video is only
    /// deleted once the new one is safely in place.
    private func applyVideo(to set: LiftSet) {
        if let pendingVideo {
            if let adopted = VideoStore.adopt(pendingVideo, forSetID: set.id) {
                let old = set.videoFileName
                set.videoFileName = adopted
                if old != adopted {
                    VideoStore.delete(old)
                    // A check of the old video says nothing about the new one.
                    set.formCheck = nil
                }
            } else if removeSavedVideo {
                VideoStore.delete(set.videoFileName)
                set.videoFileName = nil
                set.formCheck = nil
            }
            self.pendingVideo = nil
        } else if removeSavedVideo {
            VideoStore.delete(set.videoFileName)
            set.videoFileName = nil
            set.formCheck = nil
        }
        removeSavedVideo = false
    }

    // MARK: Form check

    /// The set's saved video, when the sheet is showing it and no other clip is being added.
    private var checkableVideo: String? {
        guard let editing, let video = editing.videoFileName, pendingVideo == nil, !removeSavedVideo, !importingVideo else { return nil }
        return video
    }

    @ViewBuilder
    private var formCheckSection: some View {
        if let editing, checkableVideo != nil {
            Section {
                switch formRunner.stage {
                case .tracking(let share):
                    formProgress("Finding your reps…", value: share)
                case .framing:
                    formProgress("Picking key frames…")
                case .reviewing(let phase):
                    formProgress(reviewingText(phase))
                case .idle, .failed:
                    if let message = formRunner.failureMessage {
                        Label {
                            Text(message)
                        } icon: {
                            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                        }
                        .font(.subheadline)
                    }
                    if let check = editing.formCheck {
                        Button {
                            showingFormCheck = true
                        } label: {
                            FormCheckSummaryRow(check: check)
                        }
                        .buttonStyle(.plain)
                    }
                    if hasAPIKey {
                        Button {
                            runFormCheck(useClaude: true)
                        } label: {
                            Label(editing.formCheck?.feedback == nil ? "Check my form" : "Check again", systemImage: "figure.strengthtraining.traditional")
                        }
                    } else {
                        Button {
                            showingKeyEntry = true
                        } label: {
                            Label("Add your API key to check form", systemImage: "key.fill")
                        }
                    }
                    // Never offered over Claude's review, which it would replace.
                    if editing.formCheck == nil || (!hasAPIKey && editing.formCheck?.feedback == nil) {
                        Button {
                            runFormCheck(useClaude: false)
                        } label: {
                            Label("Measure reps only, on this iPhone", systemImage: "ruler")
                        }
                    }
                }
                if formRunner.isRunning {
                    Button("Stop") { formRunner.cancel() }
                }
            } header: {
                Text("Form check")
            } footer: {
                Text(formCheckFooter)
            }
        }
    }

    private var formCheckFooter: String {
        if formRunner.isRunning {
            return "Keep this screen open until it's done."
        }
        if hasAPIKey {
            return "Claude looks at about 10 frames from this video and tells you what's good, what to fix and how. About 10 to 20 cents a check, on your Anthropic account. Film from the side with your whole body in the picture."
        }
        return "With your own Anthropic API key, Claude reviews your form from this video. Without one, the phone can still count your reps and measure depth, angles and tempo."
    }

    private func reviewingText(_ phase: FormCoachStream.Phase) -> String {
        switch phase {
        case .waiting: return "Sending the frames to Claude…"
        case .thinking: return "Claude is studying your form…"
        case .writing: return "Claude is writing your review…"
        case .done: return "Finishing up…"
        }
    }

    @ViewBuilder
    private func formProgress(_ text: String, value: Double? = nil) -> some View {
        if let value {
            VStack(alignment: .leading, spacing: 8) {
                Text(text)
                    .foregroundStyle(.secondary)
                ProgressView(value: value)
            }
            .padding(.vertical, 2)
        } else {
            HStack(spacing: 12) {
                ProgressView()
                Text(text)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func runFormCheck(useClaude: Bool) {
        guard let editing, let video = checkableVideo else { return }
        // What's in the sheet now, so a corrected weight or rep count is what Claude is told.
        let info = FormCheckContext(
            exerciseName: exercise.name,
            category: exercise.category,
            equipment: exercise.equipment,
            weightText: unit.format(weightInPounds ?? editing.weight),
            reps: reps,
            weightNote: exercise.weightNote,
            note: note
        )
        let pattern = LiftPattern.of(name: exercise.name, category: exercise.category, equipment: exercise.equipment)
        formRunner.start(videoFileName: video, info: info, pattern: pattern, useClaude: useClaude) { check in
            guard editing.videoFileName == check.videoFileName else { return }
            editing.formCheck = check
            try? context.save()
            showingFormCheck = true
        }
    }

    // MARK: Preview

    @ViewBuilder
    private func preview(_ draft: SetRecord) -> some View {
        let others = otherSets
        let kinds = calculator.newRecords(for: draft, comparedTo: others)

        if let e = calculator.estimate(draft) {
            LabeledContent("Estimated 1RM", value: unit.format(e))
        } else {
            LabeledContent("Estimated 1RM", value: "Over \(maxEstimateReps) reps, not counted")
        }

        if let best = calculator.bestWeight(atLeast: reps, in: others.filter { $0.date < draft.date }) {
            LabeledContent("To beat for \(reps)+ reps", value: unit.format(best.weight))
        }

        if others.isEmpty {
            Text("First set for this lift. It becomes your baseline.")
                .foregroundStyle(.secondary)
        } else if kinds.isEmpty {
            Text("Not a PR")
                .foregroundStyle(.secondary)
        } else {
            Label(kinds.map(\.title).joined(separator: ", "), systemImage: "trophy.fill")
                .foregroundStyle(.orange)
        }
    }

    private func roundButton(_ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: "\(symbol).circle.fill")
                .font(.system(size: 34))
                .symbolRenderingMode(.hierarchical)
        }
        .buttonStyle(.borderless)
    }

    private func adjustWeight(_ delta: Double) {
        let current = WeightUnit.parse(weightText) ?? 0
        weightText = WeightUnit.plain(max(0, current + delta))
    }

    private func load() {
        guard !didLoad else { return }
        didLoad = true
        if let editing {
            weightText = unit.format(editing.weight, showUnit: false)
            reps = editing.reps
            date = editing.date
            note = editing.note
        } else if let last = exercise.sets.max(by: { $0.date < $1.date }) {
            weightText = unit.format(last.weight, showUnit: false)
            reps = last.reps
        } else {
            weightFocused = true
        }
    }

    private func save() {
        guard let pounds = weightInPounds else { return }
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)

        if let editing {
            editing.weight = pounds
            editing.reps = reps
            editing.date = date
            editing.note = trimmed
            applyVideo(to: editing)
            try? context.save()
            dismiss()
            return
        }

        let prior = exercise.records
        let set = LiftSet(date: date, weight: pounds, reps: reps, note: trimmed)
        set.id = draftID
        context.insert(set)
        exercise.sets.append(set)
        applyVideo(to: set)
        try? context.save()

        let kinds = calculator.newRecords(for: set.record, comparedTo: prior)
        saveCount += 1
        if kinds.isEmpty {
            dismiss()
        } else {
            savedText = "\(unit.format(pounds)) × \(reps)"
            celebration = kinds
            // Ready for another set with the same weight and reps.
            draftID = UUID()
            date = Date()
            note = ""
        }
    }
}

/// Identifies a video file for `.sheet(item:)`.
struct VideoRef: Identifiable {
    let fileName: String
    var id: String { fileName }
}

struct CelebrationView: View {
    let kinds: [PRKind]
    let setText: String
    let onLogAnother: () -> Void
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "trophy.fill")
                .font(.system(size: 80))
                .foregroundStyle(.orange)
                .symbolEffect(.bounce, value: setText)
            Text("New PR!")
                .font(.largeTitle.bold())
            Text(setText)
                .font(.title2.weight(.semibold))
                .monospacedDigit()
            VStack(alignment: .leading, spacing: 10) {
                ForEach(kinds, id: \.self) { kind in
                    Label(kind.title, systemImage: "checkmark.seal.fill")
                        .foregroundStyle(.orange)
                }
            }
            Spacer()
            Button(action: onDone) {
                Text("Done").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            Button("Log another set", action: onLogAnother)
                .padding(.bottom)
        }
        .padding(.horizontal, 24)
    }
}
