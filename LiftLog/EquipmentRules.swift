import Foundation

// What the equipment picture at the top of an exercise screen shows, and how it moves.
// Pure logic, no SwiftUI, so Checks/main.swift can verify it.

/// One plate on a bar.
struct PlateSpec: Hashable {
    enum Style: Hashable {
        case iron       // black iron plate, the classic 45
        case blue       // competition blue, the 20 kg plate
    }

    let label: String       // "45" or "20"
    let unitLabel: String   // "lb" or "kg"
    /// 1.0 is a full-size plate. Smaller plates are drawn shorter.
    let relativeDiameter: Double
    let style: Style
}

enum EquipmentRules {
    /// Which picture an exercise gets.
    enum Picture: Equatable {
        case barbell
        case ezBar
        case dumbbell
        case machine
        case figure
    }

    static func picture(for equipment: Equipment) -> Picture {
        switch equipment {
        case .barbell: return .barbell
        case .ezBar: return .ezBar
        case .dumbbell: return .dumbbell
        case .machine, .cable: return .machine
        case .bodyweight, .other: return .figure
        }
    }

    /// The plates shown on each side of a bar, innermost first.
    /// For now that's one standard plate: a 45 in pounds, a 20 in kilograms.
    static func standardPlates(for unit: WeightUnit) -> [PlateSpec] {
        switch unit {
        case .lb: return [PlateSpec(label: "45", unitLabel: "lb", relativeDiameter: 1, style: .iron)]
        case .kg: return [PlateSpec(label: "20", unitLabel: "kg", relativeDiameter: 1, style: .blue)]
        }
    }

    /// Numbers printed on a machine's weight stack, top plate first, counting up in the current unit.
    static func stackLabels(for unit: WeightUnit, count: Int = 8) -> [String] {
        let step = unit == .lb ? 10 : 5
        return (1...max(count, 1)).map { String($0 * step) }
    }

    /// How the picture moves: one rep, repeated.
    struct Motion: Equatable {
        /// How far the equipment travels, in points.
        var travel: Double
        /// Tilt at the top of the rep, in degrees. Curls tilt, presses don't.
        var tilt: Double
        var secondsUp: Double
        var secondsDown: Double
        var holdAtTop: Double
        /// Draw a floor line and start the rep from it (deadlifts).
        var startsOnFloor: Bool

        static func rep(travel: Double, tilt: Double = 0, up: Double = 0.9, down: Double = 1.1, hold: Double = 0.2, floor: Bool = false) -> Motion {
            Motion(travel: travel, tilt: tilt, secondsUp: up, secondsDown: down, holdAtTop: hold, startsOnFloor: floor)
        }
    }

    static func motion(name: String, category: ExerciseCategory, equipment: Equipment) -> Motion {
        let n = name.lowercased()

        switch picture(for: equipment) {
        case .machine:
            return .rep(travel: 22, up: 0.9, down: 1.1, hold: 0.2)
        case .figure:
            return .rep(travel: 0, up: 1, down: 1, hold: 0)
        case .dumbbell, .ezBar:
            if n.contains("curl") { return .rep(travel: 22, tilt: -14, up: 0.8, down: 1.0, hold: 0.15) }
            if n.contains("tricep") || n.contains("extension") || n.contains("skull") {
                return .rep(travel: 20, tilt: 10, up: 0.8, down: 1.0, hold: 0.15)
            }
        case .barbell:
            break
        }

        // By movement, then by muscle group.
        if n.contains("deadlift") { return .rep(travel: 34, up: 1.1, down: 1.2, hold: 0.3, floor: true) }
        if n.contains("row") || n.contains("shrug") { return .rep(travel: 22, up: 0.8, down: 1.0, hold: 0.2) }
        if n.contains("calf") { return .rep(travel: 10, up: 0.6, down: 0.8, hold: 0.2) }

        switch category {
        case .legs: return .rep(travel: 20, up: 1.0, down: 1.2, hold: 0.1)
        case .chest, .shoulders: return .rep(travel: 28, up: 0.9, down: 1.1, hold: 0.25)
        case .back: return .rep(travel: 24, up: 0.9, down: 1.1, hold: 0.2)
        case .arms: return .rep(travel: 22, tilt: equipment == .barbell ? 0 : -14, up: 0.8, down: 1.0, hold: 0.15)
        case .core, .other: return .rep(travel: 20)
        }
    }

    /// Spoken description for VoiceOver.
    static func description(picture: Picture, unit: WeightUnit) -> String {
        switch picture {
        case .barbell, .ezBar:
            let plate = standardPlates(for: unit).first
            let bar = picture == .ezBar ? "Curl bar" : "Barbell"
            return "\(bar) with a \(plate?.label ?? "") \(plate?.unitLabel ?? "") plate on each side"
        case .dumbbell: return "Dumbbell"
        case .machine: return "Weight stack machine"
        case .figure: return "Lifter"
        }
    }
}
