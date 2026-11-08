import SwiftUI
import SwiftData

struct ExerciseListView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: [SortDescriptor(\Exercise.sortOrder), SortDescriptor(\Exercise.name)])
    private var exercises: [Exercise]

    @AppStorage(SettingsKey.unit) private var unit: WeightUnit = .lb
    @AppStorage(SettingsKey.formula) private var formula: OneRepMaxFormula = .epley
    @AppStorage(SettingsKey.maxEstimateReps) private var maxEstimateReps = 10
    @AppStorage(SettingsKey.didSeed) private var didSeed = false

    @State private var showingAdd = false
    @State private var showingSettings = false
    @State private var logTarget: Exercise?
    @State private var pendingDelete: Exercise?
    @State private var showArchived = false
    @State private var path: [Exercise] = []
    @State private var handledLaunchArgument = false

    private var calculator: PRCalculator { PRCalculator(formula: formula, maxRepsForEstimate: maxEstimateReps) }
    private var active: [Exercise] { exercises.filter { !$0.isArchived } }
    private var archived: [Exercise] { exercises.filter { $0.isArchived } }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                ForEach(ExerciseCategory.allCases) { category in
                    let items = active.filter { $0.category == category }
                    if !items.isEmpty {
                        Section(category.rawValue) {
                            ForEach(items) { exercise in
                                row(exercise)
                            }
                        }
                    }
                }

                if !archived.isEmpty {
                    Section {
                        DisclosureGroup("Archived (\(archived.count))", isExpanded: $showArchived) {
                            ForEach(archived) { exercise in
                                row(exercise).opacity(0.6)
                            }
                        }
                    }
                }
            }
            .navigationTitle("LiftLog")
            .navigationDestination(for: Exercise.self) { exercise in
                ExerciseDetailView(exercise: exercise)
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { showingSettings = true } label: { Image(systemName: "gearshape") }
                        .accessibilityLabel("Settings")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingAdd = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Add exercise")
                }
            }
            .overlay {
                if exercises.isEmpty && didSeed {
                    ContentUnavailableView("No exercises", systemImage: "dumbbell", description: Text("Tap + to add one."))
                }
            }
            .sheet(item: $logTarget) { exercise in LogSetView(exercise: exercise) }
            .sheet(isPresented: $showingAdd) { ExerciseEditorView(exercise: nil) }
            .sheet(isPresented: $showingSettings) { SettingsView() }
            .confirmationDialog(
                "Delete \(pendingDelete?.name ?? "exercise")?",
                isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
                titleVisibility: .visible,
                presenting: pendingDelete
            ) { exercise in
                Button("Delete exercise and all its sets", role: .destructive) {
                    for set in exercise.sets {
                        VideoStore.delete(set.videoFileName)
                    }
                    context.delete(exercise)
                    try? context.save()
                }
            } message: { _ in
                Text("This can't be undone, and it removes the sets' videos too. Archive it instead if you just want to hide it.")
            }
            .task {
                seedIfNeeded()
                openFromLaunchArgument()
                let referenced = Set(exercises.flatMap { $0.sets.compactMap(\.videoFileName) })
                await Task.detached(priority: .utility) {
                    VideoStore.removeStalePending(keeping: referenced)
                }.value
            }
        }
    }

    private func row(_ exercise: Exercise) -> some View {
        NavigationLink(value: exercise) {
            ExerciseRow(exercise: exercise, calculator: calculator, unit: unit)
        }
        .swipeActions(edge: .leading) {
            Button { logTarget = exercise } label: { Label("Log", systemImage: "plus") }
                .tint(.green)
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { pendingDelete = exercise } label: { Label("Delete", systemImage: "trash") }
            Button {
                exercise.isArchived.toggle()
            } label: {
                Label(exercise.isArchived ? "Unarchive" : "Archive", systemImage: "archivebox")
            }
            .tint(.gray)
        }
    }

    /// For screenshots and testing: launching with `-LiftLogOpen "Squat"` opens that exercise.
    private func openFromLaunchArgument() {
        guard !handledLaunchArgument else { return }
        handledLaunchArgument = true
        guard let name = UserDefaults.standard.string(forKey: "LiftLogOpen") else { return }
        // Fetched directly, because on the very first launch the list hasn't caught up with the
        // exercises that were just added.
        let all = (try? context.fetch(FetchDescriptor<Exercise>())) ?? exercises
        if let match = all.first(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) {
            path = [match]
        }
    }

    private func seedIfNeeded() {
        guard !didSeed else { return }
        if exercises.isEmpty { SeedData.insertDefaults(into: context) }
        didSeed = true
    }
}

struct ExerciseRow: View {
    let exercise: Exercise
    let calculator: PRCalculator
    let unit: WeightUnit

    var body: some View {
        let summary = calculator.summary(of: exercise.records)
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(exercise.name).font(.headline)
                if let h = summary.heaviest {
                    Text("Heaviest \(unit.format(h.weight)) × \(h.reps)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    Text("No sets yet")
                        .font(.subheadline)
                        .foregroundStyle(.tertiary)
                }
            }
            Spacer()
            if let e = summary.bestEstimateValue {
                VStack(alignment: .trailing, spacing: 0) {
                    Text(unit.format(e, showUnit: false))
                        .font(.title3.bold())
                        .monospacedDigit()
                    Text("e1RM \(unit.rawValue)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }
}
