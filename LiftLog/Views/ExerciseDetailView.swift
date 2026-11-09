import SwiftUI
import SwiftData
import Charts

struct ExerciseDetailView: View {
    @Bindable var exercise: Exercise
    @Environment(\.modelContext) private var context

    @AppStorage(SettingsKey.unit) private var unit: WeightUnit = .lb
    @AppStorage(SettingsKey.formula) private var formula: OneRepMaxFormula = .epley
    @AppStorage(SettingsKey.maxEstimateReps) private var maxEstimateReps = 10

    @State private var showingLog = false
    @State private var editingSet: LiftSet?
    @State private var playingSet: LiftSet?
    @State private var pendingSetDelete: LiftSet?
    @State private var showingEditor = false

    private var calculator: PRCalculator { PRCalculator(formula: formula, maxRepsForEstimate: maxEstimateReps) }

    var body: some View {
        let records = exercise.records
        let summary = calculator.summary(of: records)
        let flags = calculator.prFlags(for: records)
        let timeline = calculator.estimateTimeline(records)

        List {
            Section {
                EquipmentHeroView(name: exercise.name, category: exercise.category, equipment: exercise.equipment, unit: unit)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }

            Section {
                HStack(spacing: 12) {
                    StatCard(
                        title: "Est. 1RM",
                        value: summary.bestEstimateValue.map { unit.format($0) } ?? "—",
                        detail: summary.bestEstimate.map { "from \(unit.format($0.weight)) × \($0.reps)" }
                    )
                    StatCard(
                        title: "Heaviest",
                        value: summary.heaviest.map { unit.format($0.weight) } ?? "—",
                        detail: summary.heaviest.map { "× \($0.reps) · \($0.date.formatted(.dateTime.month(.abbreviated).day()))" }
                    )
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            } footer: {
                if !exercise.weightNote.isEmpty {
                    Text("Weight is counted \(exercise.weightNote).")
                }
            }

            Section {
                Button {
                    showingLog = true
                } label: {
                    Label("Log a set", systemImage: "plus.circle.fill")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                }
            }

            if timeline.count >= 2 {
                Section("Estimated 1RM over time") {
                    Chart(timeline) { point in
                        LineMark(x: .value("Date", point.date), y: .value("e1RM", unit.fromPounds(point.value)))
                            .interpolationMethod(.monotone)
                        PointMark(x: .value("Date", point.date), y: .value("e1RM", unit.fromPounds(point.value)))
                    }
                    .chartYScale(domain: .automatic(includesZero: false))
                    .frame(height: 180)
                    .padding(.vertical, 8)
                }
            }

            if !summary.repMaxes.isEmpty {
                Section {
                    ForEach(summary.repMaxes) { rm in
                        HStack {
                            Text("\(rm.reps) rep\(rm.reps == 1 ? "" : "s")")
                                .frame(width: 64, alignment: .leading)
                            Text(unit.format(rm.set.weight))
                                .font(.body.weight(.semibold))
                                .monospacedDigit()
                            Spacer()
                            VStack(alignment: .trailing, spacing: 0) {
                                Text(rm.set.date.formatted(date: .abbreviated, time: .omitted))
                                if rm.isInferred {
                                    Text("from a set of \(rm.set.reps)")
                                }
                            }
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        }
                    }
                } header: {
                    Text("Rep maxes")
                } footer: {
                    Text("The most weight you've moved for at least that many reps. A set of 225 × 5 also counts as your 3-rep max until you beat it.")
                }
            }

            if records.isEmpty {
                Section {
                    Text("No sets yet. Log your first set and it becomes your baseline.")
                        .foregroundStyle(.secondary)
                }
            } else {
                history(flags: flags)
            }
        }
        .navigationTitle(exercise.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Edit") { showingEditor = true }
            }
        }
        .sheet(isPresented: $showingLog) { LogSetView(exercise: exercise) }
        .sheet(item: $editingSet) { set in LogSetView(exercise: exercise, editing: set) }
        .sheet(item: $playingSet) { set in
            VideoPlayerSheet(fileName: set.videoFileName ?? "", title: "\(unit.format(set.weight)) × \(set.reps)")
        }
        .sheet(isPresented: $showingEditor) { ExerciseEditorView(exercise: exercise) }
        .confirmationDialog(
            "Delete this set and its video?",
            isPresented: Binding(get: { pendingSetDelete != nil }, set: { if !$0 { pendingSetDelete = nil } }),
            titleVisibility: .visible,
            presenting: pendingSetDelete
        ) { set in
            Button("Delete set and video", role: .destructive) {
                delete(set)
            }
        } message: { _ in
            Text("The video is removed from LiftLog too. A copy you kept in Photos isn't affected.")
        }
    }

    @ViewBuilder
    private func history(flags: [UUID: [PRKind]]) -> some View {
        let days = Dictionary(grouping: exercise.sets) { Calendar.current.startOfDay(for: $0.date) }
        let sortedDays = days.keys.sorted(by: >)
        ForEach(sortedDays, id: \.self) { day in
            Section {
                ForEach((days[day] ?? []).sorted { $0.date > $1.date }) { set in
                    HStack(spacing: 12) {
                        if let video = set.videoFileName {
                            Button {
                                playingSet = set
                            } label: {
                                VideoThumbnail(fileName: video, cornerRadius: 8, badgeSize: 16)
                                    .frame(width: 56, height: 56)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Play video")
                        }
                        Button {
                            editingSet = set
                        } label: {
                            SetRow(set: set, unit: unit, estimate: calculator.estimate(set.record), prs: flags[set.id] ?? [])
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    // A set with a video asks first, since its video is deleted too. The button
                    // has no destructive role on purpose: that role makes the row slide away
                    // before the question is answered.
                    .swipeActions(allowsFullSwipe: !set.hasVideo) {
                        Button {
                            if set.hasVideo {
                                pendingSetDelete = set
                            } else {
                                delete(set)
                            }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                        .tint(.red)
                    }
                }
            } header: {
                Text(day == sortedDays.first ? "History · \(day.formatted(date: .complete, time: .omitted))" : day.formatted(date: .complete, time: .omitted))
            }
        }
    }

    private func delete(_ set: LiftSet) {
        VideoStore.delete(set.videoFileName)
        exercise.sets.removeAll { $0.id == set.id }
        context.delete(set)
        try? context.save()
    }
}

struct StatCard: View {
    let title: String
    let value: String
    let detail: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            Text(value)
                .font(.title2.bold())
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(detail ?? " ")
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct SetRow: View {
    let set: LiftSet
    let unit: WeightUnit
    let estimate: Double?
    let prs: [PRKind]

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text("\(unit.format(set.weight)) × \(set.reps)")
                    .font(.body.weight(.semibold))
                    .monospacedDigit()
                if !prs.isEmpty || set.formVerdict != nil {
                    HStack(spacing: 4) {
                        ForEach(prs, id: \.self) { PRBadge(kind: $0) }
                        if let verdict = set.formVerdict {
                            FormVerdictChip(verdict: verdict, score: set.formScore)
                        }
                    }
                }
                if !set.note.isEmpty {
                    Text(set.note)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(set.date.formatted(date: .omitted, time: .shortened))
                if let estimate, set.reps > 1 {
                    Text("e1RM \(unit.format(estimate, showUnit: false))")
                        .monospacedDigit()
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
    }
}

struct PRBadge: View {
    let kind: PRKind

    var body: some View {
        Text(kind.shortTitle)
            .font(.caption2.bold())
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color.orange.opacity(0.18), in: Capsule())
            .foregroundStyle(.orange)
    }
}
