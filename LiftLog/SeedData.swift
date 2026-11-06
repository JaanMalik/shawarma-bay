import Foundation
import SwiftData

/// The exercises the app starts with. Add more from the + button in the app,
/// or add a line here before the first launch.
enum SeedData {
    struct Template {
        let name: String
        let category: ExerciseCategory
        let equipment: Equipment
        var weightNote: String = ""
    }

    static let defaults: [Template] = [
        Template(name: "Squat", category: .legs, equipment: .barbell),
        Template(name: "Leg Press", category: .legs, equipment: .machine),
        Template(name: "Calf Raise", category: .legs, equipment: .machine),
        Template(name: "Deadlift", category: .back, equipment: .barbell),
        Template(name: "Bent-Over Row", category: .back, equipment: .barbell),
        Template(name: "Bench Press", category: .chest, equipment: .barbell),
        Template(name: "Incline Press", category: .chest, equipment: .barbell),
        Template(name: "Decline Press", category: .chest, equipment: .barbell),
        Template(name: "Military Press", category: .shoulders, equipment: .barbell),
        Template(name: "Preacher Curl", category: .arms, equipment: .ezBar),
        Template(name: "Single-Arm Dumbbell Curl", category: .arms, equipment: .dumbbell, weightNote: "per arm"),
        Template(name: "Underhand Dumbbell Triceps Extension", category: .arms, equipment: .dumbbell, weightNote: "per dumbbell"),
    ]

    static func insertDefaults(into context: ModelContext) {
        for (index, t) in defaults.enumerated() {
            context.insert(Exercise(name: t.name, category: t.category, equipment: t.equipment, weightNote: t.weightNote, sortOrder: index))
        }
        try? context.save()
    }
}
