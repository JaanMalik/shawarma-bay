// Quick checks for the PR math. Run from the repo root on a Mac:
//   swiftc LiftLog/PRCalculator.swift LiftLog/Units.swift Checks/main.swift -o /tmp/prchecks && /tmp/prchecks
import Foundation

var failures = 0
func check(_ ok: Bool, _ what: String) {
    print(ok ? "PASS  \(what)" : "FAIL  \(what)")
    if !ok { failures += 1 }
}

let day: TimeInterval = 86_400
let start = Date(timeIntervalSince1970: 1_750_000_000)
func set(_ d: Int, _ w: Double, _ r: Int) -> SetRecord {
    SetRecord(id: UUID(), date: start.addingTimeInterval(Double(d) * day), weight: w, reps: r)
}

let calc = PRCalculator()

// Estimates
check(calc.estimate(set(0, 225, 1)) == 225, "a single is the real 1RM")
check(abs(calc.estimate(set(0, 225, 5))! - 262.5) < 0.001, "Epley 225 x 5 = 262.5")
check(calc.estimate(set(0, 135, 15)) == nil, "15 reps is left out of the estimate")
let brz = PRCalculator(formula: .brzycki)
check(abs(brz.estimate(set(0, 200, 5))! - 225) < 0.001, "Brzycki 200 x 5 = 225")

// Rep maxes count sets with MORE reps too
let history = [set(0, 225, 5), set(1, 245, 1), set(2, 205, 8)]
let summary = calc.summary(of: history)
let rm = Dictionary(uniqueKeysWithValues: summary.repMaxes.map { ($0.reps, $0) })
check(rm[1]?.set.weight == 245, "1RM is 245")
check(rm[3]?.set.weight == 225 && rm[3]!.isInferred, "3RM comes from the 225 x 5")
check(rm[5]?.set.weight == 225 && !rm[5]!.isInferred, "5RM is 225, actual")
check(rm[6]?.set.weight == 205, "6RM comes from the 205 x 8")
check(rm[9] == nil, "no 9RM yet")
check(summary.heaviest?.weight == 245, "heaviest is 245")
check(abs(summary.bestEstimateValue! - 262.5) < 0.001, "best e1RM 262.5 from 225 x 5")

// New records
let more = set(3, 230, 5)
let kinds = calc.newRecords(for: more, comparedTo: history)
check(kinds.contains(.repMax(5)), "230 x 5 is a 5-rep PR")
check(kinds.contains(.estimatedOneRM), "230 x 5 beats e1RM")
check(!kinds.contains(.heaviest), "230 is not the heaviest")

let tie = set(3, 225, 5)
check(calc.newRecords(for: tie, comparedTo: history).isEmpty, "a tie is not a PR")

let lowerRepsLighter = set(3, 220, 3)
check(calc.newRecords(for: lowerRepsLighter, comparedTo: history).isEmpty, "220 x 3 is not a 3-rep PR when 225 x 5 exists")

let single = set(3, 250, 1)
let sk = calc.newRecords(for: single, comparedTo: history)
check(sk.contains(.heaviest) && !sk.contains(.repMax(1)), "heavy single shows as Heaviest, not a duplicate 1RM badge")

check(calc.newRecords(for: set(0, 135, 5), comparedTo: []).isEmpty, "first set is a baseline, not a PR")

let firstTen = set(3, 135, 10)
check(calc.newRecords(for: firstTen, comparedTo: history).contains(.repMax(10)), "first time doing 10 reps is a 10-rep PR")

// Flags over history
let flags = calc.prFlags(for: history + [more])
check(flags[history[0].id] == nil, "first set has no flag")
check(flags[history[1].id]?.contains(.heaviest) == true, "245 x 1 flagged heaviest")
check(flags[more.id]?.contains(.repMax(5)) == true, "230 x 5 flagged as 5RM")

// Units
check(WeightUnit.kg.format(225) == "102.1 kg", "225 lb shows as 102.1 kg")
check(WeightUnit.parse("102,5") == 102.5, "comma decimals parse")
check(WeightUnit.plain(1000) == "1000", "no thousands separator")

print(failures == 0 ? "\nAll checks passed." : "\n\(failures) check(s) failed.")
exit(failures == 0 ? 0 : 1)
