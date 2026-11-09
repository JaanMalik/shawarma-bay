import Foundation
import SwiftData

@Model
final class Exercise {
    var id: UUID = UUID()
    var name: String = ""
    var categoryRaw: String = ExerciseCategory.other.rawValue
    var equipmentRaw: String = Equipment.other.rawValue
    /// Reminder for how weight is counted, e.g. "per dumbbell".
    var weightNote: String = ""
    var sortOrder: Int = 0
    var isArchived: Bool = false
    var createdAt: Date = Date()

    @Relationship(deleteRule: .cascade, inverse: \LiftSet.exercise)
    var sets: [LiftSet] = []

    init(name: String, category: ExerciseCategory, equipment: Equipment, weightNote: String = "", sortOrder: Int = 0) {
        self.id = UUID()
        self.name = name
        self.categoryRaw = category.rawValue
        self.equipmentRaw = equipment.rawValue
        self.weightNote = weightNote
        self.sortOrder = sortOrder
        self.isArchived = false
        self.createdAt = Date()
    }

    var category: ExerciseCategory {
        get { ExerciseCategory(rawValue: categoryRaw) ?? .other }
        set { categoryRaw = newValue.rawValue }
    }

    var equipment: Equipment {
        get { Equipment(rawValue: equipmentRaw) ?? .other }
        set { equipmentRaw = newValue.rawValue }
    }

    var records: [SetRecord] { sets.map(\.record) }
}

@Model
final class LiftSet {
    var id: UUID = UUID()
    var date: Date = Date()
    /// Always stored in pounds. Converted for display when the unit is kg.
    var weight: Double = 0
    var reps: Int = 1
    var note: String = ""
    /// File name of the set's video inside the app's Videos folder (see VideoStore), if one was added.
    /// Optional with a nil default so stores from the first version open without a migration step.
    var videoFileName: String? = nil
    /// The last form check of the set's video, as JSON (see FormCheck). Optional with a nil default
    /// like videoFileName, so earlier stores open without a migration step.
    var formCheckJSON: String? = nil
    /// That check's verdict and score, kept on their own so the history list doesn't have to read
    /// every check.
    var formVerdictRaw: String? = nil
    var formScore: Int? = nil
    var exercise: Exercise?

    init(date: Date, weight: Double, reps: Int, note: String = "") {
        self.id = UUID()
        self.date = date
        self.weight = weight
        self.reps = reps
        self.note = note
        self.videoFileName = nil
        self.formCheckJSON = nil
        self.formVerdictRaw = nil
        self.formScore = nil
    }

    var record: SetRecord { SetRecord(id: id, date: date, weight: weight, reps: reps) }
    var hasVideo: Bool { videoFileName != nil }

    /// The form check of the set's current video. A check of a video that has since been replaced
    /// or removed doesn't count.
    var formCheck: FormCheck? {
        get {
            guard let formCheckJSON, let check = FormCheck.decode(formCheckJSON), check.videoFileName == videoFileName else { return nil }
            return check
        }
        set {
            formCheckJSON = newValue?.encoded()
            formVerdictRaw = newValue?.feedback?.verdict.rawValue
            formScore = newValue?.feedback?.clampedScore
        }
    }

    var formVerdict: FormVerdict? {
        guard formCheckJSON != nil else { return nil }
        return formVerdictRaw.flatMap(FormVerdict.init(rawValue:))
    }
}
