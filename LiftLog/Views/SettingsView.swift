import SwiftUI
import SwiftData
import UniformTypeIdentifiers

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Query(sort: \Exercise.sortOrder) private var exercises: [Exercise]

    @AppStorage(SettingsKey.unit) private var unit: WeightUnit = .lb
    @AppStorage(SettingsKey.formula) private var formula: OneRepMaxFormula = .epley
    @AppStorage(SettingsKey.maxEstimateReps) private var maxEstimateReps = 10
    @AppStorage(SettingsKey.hasAPIKey) private var hasAPIKey = false

    @State private var importing = false
    @State private var message: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Units") {
                    Picker("Weight unit", selection: $unit) {
                        ForEach(WeightUnit.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }

                Section {
                    Picker("Formula", selection: $formula) {
                        ForEach(OneRepMaxFormula.allCases) { Text($0.name).tag($0) }
                    }
                    Picker("Count sets up to", selection: $maxEstimateReps) {
                        ForEach([5, 8, 10, 12, 15], id: \.self) { Text("\($0) reps").tag($0) }
                    }
                } header: {
                    Text("Estimated 1RM")
                } footer: {
                    Text("A single always counts as your real 1RM. Sets with more reps than this limit are left out of the estimate, because high-rep sets overestimate it.")
                }

                Section {
                    NavigationLink {
                        APIKeyView()
                    } label: {
                        LabeledContent("Anthropic API key", value: hasAPIKey ? "Saved" : "Not set")
                    }
                } header: {
                    Text("Form check")
                } footer: {
                    Text("Claude can review your form from a set's video and tell you what's good and what to fix. It uses your own Anthropic API key, about 10 to 20 cents a check. Open a set with a video and tap Check my form.")
                }

                Section {
                    ShareLink(
                        item: BackupExport(data: (try? Backup.jsonData(from: exercises)) ?? Data()),
                        preview: SharePreview("LiftLog backup")
                    ) {
                        Label("Export backup", systemImage: "square.and.arrow.up")
                    }
                    ShareLink(
                        item: CSVExport(text: Backup.csv(from: exercises, unit: unit)),
                        preview: SharePreview("LiftLog sets (CSV)")
                    ) {
                        Label("Export sets as CSV", systemImage: "tablecells")
                    }
                    Button {
                        importing = true
                    } label: {
                        Label("Restore from backup", systemImage: "square.and.arrow.down")
                    }
                } header: {
                    Text("Backup")
                } footer: {
                    Text("Your data lives only on this iPhone. Export a backup now and then (save it to Files or AirDrop it to your Mac). Restoring adds missing sets and never deletes anything. The backup remembers which set has which video but doesn't contain the videos: copy those from the Files app under On My iPhone > LiftLog > Videos.")
                }

                Section("Stats") {
                    LabeledContent("Exercises", value: "\(exercises.count)")
                    LabeledContent("Sets logged", value: "\(exercises.reduce(0) { $0 + $1.sets.count })")
                    LabeledContent("Videos", value: videoSummary)
                    LabeledContent("Form checks", value: formCheckSummary)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                restore(result)
            }
            .alert("Backup", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
                Button("OK") {}
            } message: {
                Text(message ?? "")
            }
        }
    }

    private var videoSummary: String {
        let names = exercises.flatMap { $0.sets.compactMap(\.videoFileName) }
        guard !names.isEmpty else { return "None" }
        let bytes = names.reduce(Int64(0)) { $0 + VideoStore.fileSize($1) }
        return "\(names.count) · \(ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file))"
    }

    private var formCheckSummary: String {
        let checks = exercises.flatMap { $0.sets.compactMap(\.formCheck) }
        guard !checks.isEmpty else { return "None" }
        let spent = checks.compactMap(\.estimatedCost).reduce(0, +)
        guard spent > 0 else { return "\(checks.count)" }
        return "\(checks.count) · about \(spent.formatted(.currency(code: "USD").precision(.fractionLength(2))))"
    }

    private func restore(_ result: Result<URL, Error>) {
        do {
            let url = try result.get()
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            let data = try Data(contentsOf: url)
            let added = try Backup.restore(from: data, into: context, existing: exercises)
            message = "Restored \(added.sets) sets and \(added.exercises) new exercises."
                + (added.videos > 0 ? " Re-linked \(added.videos) videos." : "")
        } catch {
            message = "Couldn't restore that file. \(error.localizedDescription)"
        }
    }
}
