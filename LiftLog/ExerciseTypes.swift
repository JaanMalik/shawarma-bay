import Foundation

// Plain types shared by the data model, the equipment pictures and the checks.
// No SwiftUI or SwiftData here, so Checks/main.swift can compile this file on its own.

enum ExerciseCategory: String, CaseIterable, Identifiable, Codable {
    case legs = "Legs"
    case chest = "Chest"
    case back = "Back"
    case shoulders = "Shoulders"
    case arms = "Arms"
    case core = "Core"
    case other = "Other"

    var id: String { rawValue }
}

enum Equipment: String, CaseIterable, Identifiable, Codable {
    case barbell = "Barbell"
    case dumbbell = "Dumbbell"
    case ezBar = "EZ / Preacher Bar"
    case machine = "Machine"
    case cable = "Cable"
    case bodyweight = "Bodyweight"
    case other = "Other"

    var id: String { rawValue }
}
