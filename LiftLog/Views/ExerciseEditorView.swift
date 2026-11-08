import SwiftUI
import SwiftData

/// Add a new exercise, or edit one. Pass nil to add.
struct ExerciseEditorView: View {
    var exercise: Exercise?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Query private var all: [Exercise]
    @AppStorage(SettingsKey.unit) private var unit: WeightUnit = .lb

    @State private var name = ""
    @State private var category: ExerciseCategory = .legs
    @State private var equipment: Equipment = .barbell
    @State private var weightNote = ""
    @State private var isArchived = false
    @State private var didLoad = false

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Exercise name", text: $name)
                        .textInputAutocapitalization(.words)
                }
                Section {
                    Picker("Muscle group", selection: $category) {
                        ForEach(ExerciseCategory.allCases) { Text($0.rawValue).tag($0) }
                    }
                    Picker("Equipment", selection: $equipment) {
                        ForEach(Equipment.allCases) { Text($0.rawValue).tag($0) }
                    }
                }
                Section {
                    EquipmentHeroView(name: trimmedName.isEmpty ? "Exercise" : trimmedName, category: category, equipment: equipment, unit: unit)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                } header: {
                    Text("Picture")
                } footer: {
                    Text("Shown at the top of the exercise. It follows the equipment you pick.")
                }
                Section {
                    TextField("e.g. per dumbbell, per arm, plates only", text: $weightNote)
                } header: {
                    Text("How weight is counted")
                } footer: {
                    Text("Optional. Shown when you log, so you always enter the weight the same way.")
                }
                if exercise != nil {
                    Section {
                        Toggle("Archived", isOn: $isArchived)
                    } footer: {
                        Text("Archived exercises are hidden from the main list but keep their history.")
                    }
                }
            }
            .navigationTitle(exercise == nil ? "New exercise" : "Edit exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .bold()
                        .disabled(trimmedName.isEmpty)
                }
            }
            .onAppear(perform: load)
        }
    }

    private func load() {
        guard !didLoad, let exercise else { return }
        didLoad = true
        name = exercise.name
        category = exercise.category
        equipment = exercise.equipment
        weightNote = exercise.weightNote
        isArchived = exercise.isArchived
    }

    private func save() {
        let note = weightNote.trimmingCharacters(in: .whitespacesAndNewlines)
        if let exercise {
            exercise.name = trimmedName
            exercise.category = category
            exercise.equipment = equipment
            exercise.weightNote = note
            exercise.isArchived = isArchived
        } else {
            let nextOrder = (all.map(\.sortOrder).max() ?? -1) + 1
            context.insert(Exercise(name: trimmedName, category: category, equipment: equipment, weightNote: note, sortOrder: nextOrder))
        }
        try? context.save()
        dismiss()
    }
}
