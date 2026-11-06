import Foundation

// Pure PR logic. No SwiftUI or SwiftData here, so it can be checked on its own
// (see Checks/main.swift). All weights are in pounds.

struct SetRecord: Identifiable, Hashable {
    let id: UUID
    let date: Date
    let weight: Double
    let reps: Int
}

enum OneRepMaxFormula: String, CaseIterable, Identifiable {
    case epley
    case brzycki

    var id: String { rawValue }

    var name: String {
        switch self {
        case .epley: return "Epley"
        case .brzycki: return "Brzycki"
        }
    }

    func estimate(weight: Double, reps: Int) -> Double {
        guard reps > 1 else { return weight }
        let r = Double(reps)
        switch self {
        case .epley: return weight * (1 + r / 30)
        case .brzycki: return weight * 36 / (37 - r)
        }
    }
}

enum PRKind: Hashable {
    case heaviest
    case estimatedOneRM
    case repMax(Int)

    var title: String {
        switch self {
        case .heaviest: return "Heaviest weight ever"
        case .estimatedOneRM: return "New estimated 1RM"
        case .repMax(let n): return "New \(n)-rep max"
        }
    }

    var shortTitle: String {
        switch self {
        case .heaviest: return "Heaviest"
        case .estimatedOneRM: return "e1RM"
        case .repMax(let n): return "\(n)RM"
        }
    }
}

struct RepMax: Identifiable {
    let reps: Int
    let set: SetRecord
    var id: Int { reps }
    /// True when this rep max comes from a set with more reps (225 x 5 also counts as a 3-rep max).
    var isInferred: Bool { set.reps > reps }
}

struct EstimatePoint: Identifiable {
    let date: Date
    let value: Double
    var id: Date { date }
}

struct PRSummary {
    var heaviest: SetRecord?
    var bestEstimate: SetRecord?
    var bestEstimateValue: Double?
    var repMaxes: [RepMax]
}

struct PRCalculator {
    var formula: OneRepMaxFormula = .epley
    /// Sets with more reps than this are left out of the estimated 1RM (they overestimate it).
    var maxRepsForEstimate: Int = 10
    var repMaxRange: ClosedRange<Int> = 1...12

    /// Estimated 1RM for one set. A single is your real 1RM, not an estimate.
    func estimate(_ set: SetRecord) -> Double? {
        guard set.weight > 0, set.reps >= 1 else { return nil }
        if set.reps == 1 { return set.weight }
        guard set.reps <= maxRepsForEstimate else { return nil }
        return formula.estimate(weight: set.weight, reps: set.reps)
    }

    /// Oldest first, with a stable tie break so results never flicker.
    static func chronological(_ sets: [SetRecord]) -> [SetRecord] {
        sets.sorted {
            $0.date == $1.date ? $0.id.uuidString < $1.id.uuidString : $0.date < $1.date
        }
    }

    private static func isBefore(_ a: SetRecord, _ b: SetRecord) -> Bool {
        a.date == b.date ? a.id.uuidString < b.id.uuidString : a.date < b.date
    }

    /// Heaviest weight moved for at least `reps` reps.
    func bestWeight(atLeast reps: Int, in sets: [SetRecord]) -> SetRecord? {
        var top: SetRecord?
        for s in Self.chronological(sets) where s.reps >= reps && s.weight > 0 {
            if top == nil || s.weight > top!.weight { top = s }
        }
        return top
    }

    func summary(of sets: [SetRecord]) -> PRSummary {
        let ordered = Self.chronological(sets).filter { $0.reps >= 1 }
        var heaviest: SetRecord?
        var best: SetRecord?
        var bestValue: Double?

        for s in ordered {
            if let h = heaviest {
                // Same weight for more reps is the better "heaviest" set to show.
                if s.weight > h.weight || (s.weight == h.weight && s.reps > h.reps) { heaviest = s }
            } else {
                heaviest = s
            }
            if let e = estimate(s), e > (bestValue ?? -1) {
                best = s
                bestValue = e
            }
        }

        var repMaxes: [RepMax] = []
        for n in repMaxRange {
            if let top = bestWeight(atLeast: n, in: ordered) {
                repMaxes.append(RepMax(reps: n, set: top))
            }
        }

        return PRSummary(heaviest: heaviest, bestEstimate: best, bestEstimateValue: bestValue, repMaxes: repMaxes)
    }

    /// Which records `set` breaks compared with the sets done before it.
    /// A tie is not a PR. The very first set of an exercise is a baseline, not a PR.
    func newRecords(for set: SetRecord, comparedTo history: [SetRecord]) -> [PRKind] {
        guard set.reps >= 1, set.weight > 0 else { return [] }
        let prior = history.filter { $0.id != set.id && $0.reps >= 1 && Self.isBefore($0, set) }
        guard !prior.isEmpty else { return [] }

        var kinds: [PRKind] = []
        let isHeaviest = set.weight > (prior.map(\.weight).max() ?? 0)
        if isHeaviest { kinds.append(.heaviest) }

        if let e = estimate(set) {
            let priorBest = prior.compactMap(estimate).max() ?? 0
            if e > priorBest + 1e-9 { kinds.append(.estimatedOneRM) }
        }

        // Rep PR: heavier than anything done for this many reps OR MORE.
        let priorAtReps = bestWeight(atLeast: set.reps, in: prior)?.weight
        let isRepMax = priorAtReps.map { set.weight > $0 } ?? true
        if isRepMax && !(isHeaviest && set.reps == 1) {
            kinds.append(.repMax(set.reps))
        }
        return kinds
    }

    /// PRs each set broke at the time it was done, keyed by set id.
    func prFlags(for sets: [SetRecord]) -> [UUID: [PRKind]] {
        let ordered = Self.chronological(sets)
        var result: [UUID: [PRKind]] = [:]
        for (i, s) in ordered.enumerated() where i > 0 {
            let kinds = newRecords(for: s, comparedTo: Array(ordered[..<i]))
            if !kinds.isEmpty { result[s.id] = kinds }
        }
        return result
    }

    /// Best estimated 1RM per day, oldest first, for the chart.
    func estimateTimeline(_ sets: [SetRecord], calendar: Calendar = .current) -> [EstimatePoint] {
        var byDay: [Date: Double] = [:]
        for s in sets {
            guard let e = estimate(s) else { continue }
            let day = calendar.startOfDay(for: s.date)
            byDay[day] = max(byDay[day] ?? 0, e)
        }
        return byDay.map { EstimatePoint(date: $0.key, value: $0.value) }.sorted { $0.date < $1.date }
    }
}
