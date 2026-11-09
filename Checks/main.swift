// Quick checks for the PR math, the equipment pictures and the form check. Run from the repo root on a Mac:
//   swiftc LiftLog/PRCalculator.swift LiftLog/Units.swift LiftLog/ExerciseTypes.swift LiftLog/EquipmentRules.swift LiftLog/FormAnalysis.swift LiftLog/FormCoachAPI.swift Checks/main.swift -o /tmp/prchecks && /tmp/prchecks
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

// Equipment pictures
check(EquipmentRules.picture(for: .barbell) == .barbell, "barbell exercises show a barbell")
check(EquipmentRules.picture(for: .ezBar) == .ezBar, "curl bar exercises show a curl bar")
check(EquipmentRules.picture(for: .dumbbell) == .dumbbell, "dumbbell exercises show a dumbbell")
check(EquipmentRules.picture(for: .machine) == .machine, "machine exercises show a machine")
check(EquipmentRules.picture(for: .cable) == .machine, "cable exercises show the weight stack")
check(EquipmentRules.picture(for: .bodyweight) == .figure, "bodyweight exercises show a lifter")

let lbPlates = EquipmentRules.standardPlates(for: .lb)
check(lbPlates.count == 1 && lbPlates[0].label == "45" && lbPlates[0].unitLabel == "lb", "pounds: one 45 lb plate per side")
let kgPlates = EquipmentRules.standardPlates(for: .kg)
check(kgPlates.count == 1 && kgPlates[0].label == "20" && kgPlates[0].unitLabel == "kg", "kilograms: one 20 kg plate per side")
check(EquipmentRules.stackLabels(for: .lb).prefix(3) == ["10", "20", "30"], "lb weight stack counts by 10")
check(EquipmentRules.stackLabels(for: .kg).prefix(3) == ["5", "10", "15"], "kg weight stack counts by 5")
check(EquipmentRules.description(picture: .barbell, unit: .kg).contains("20 kg"), "VoiceOver says 20 kg in kilograms")

let deadlift = EquipmentRules.motion(name: "Deadlift", category: .back, equipment: .barbell)
check(deadlift.startsOnFloor && deadlift.travel > 0, "deadlift starts from the floor")
let dbCurl = EquipmentRules.motion(name: "Single-Arm Dumbbell Curl", category: .arms, equipment: .dumbbell)
check(dbCurl.tilt != 0 && dbCurl.travel > 0, "dumbbell curl tilts as it rises")
let preacher = EquipmentRules.motion(name: "Preacher Curl", category: .arms, equipment: .ezBar)
check(preacher.tilt == 0 && preacher.travel > 0, "preacher curl bar stays level")
for name in ["Barbell Curl", "Skull Crusher", "EZ Bar Triceps Extension"] {
    for equipment in [Equipment.barbell, .ezBar] {
        check(EquipmentRules.motion(name: name, category: .arms, equipment: equipment).tilt == 0, "\(name) on a \(equipment.rawValue) stays level")
    }
}
let bench = EquipmentRules.motion(name: "Bench Press", category: .chest, equipment: .barbell)
check(bench.tilt == 0 && bench.travel > 0 && !bench.startsOnFloor, "bench press goes straight up and down")
let legPress = EquipmentRules.motion(name: "Leg Press", category: .legs, equipment: .machine)
check(legPress.travel > 0 && legPress.tilt == 0, "machine stack moves straight up")
for equipment in Equipment.allCases {
    let m = EquipmentRules.motion(name: "Anything", category: .other, equipment: equipment)
    check(m.secondsUp > 0 && m.secondsDown > 0 && m.travel <= 40, "\(equipment.rawValue) motion fits the card")
}

// MARK: Form check: geometry

func approx(_ a: Double?, _ b: Double, _ tolerance: Double) -> Bool {
    guard let a else { return false }
    return abs(a - b) <= tolerance
}
func pt(_ x: Double, _ y: Double) -> JointPoint { JointPoint(x: x, y: y, confidence: 0.9) }

check(approx(FormGeometry.angle(pt(0, 0), pt(0, 1), pt(1, 1), aspect: 1), 90, 0.001), "a right angle is 90°")
check(approx(FormGeometry.angle(pt(0, 0), pt(0, 0.5), pt(0, 1), aspect: 1), 180, 0.001), "a straight limb is 180°")
check(approx(FormGeometry.lean(upper: pt(0.5, 0.2), lower: pt(0.5, 0.6), aspect: 1), 0, 0.001), "an upright torso leans 0°")
check(approx(FormGeometry.lean(upper: pt(0.9, 0.5), lower: pt(0.5, 0.5), aspect: 1), 90, 0.001), "a level torso leans 90°")
// In a 9:16 portrait frame, 0.1 of the width is 0.05625 of the height.
check(approx(FormGeometry.lean(upper: pt(0.6, 0.44375), lower: pt(0.5, 0.5), aspect: 0.5625), 45, 0.01), "angles use the picture's true proportions")

// MARK: Form check: synthetic lifts

// Deterministic jitter, like the wobble in real pose tracking.
var noiseState: UInt64 = 42
func jitter(_ amount: Double) -> Double {
    noiseState = noiseState &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
    return (Double(noiseState >> 11) / Double(UInt64(1) << 53) - 0.5) * 2 * amount
}
func pose(_ time: Double, _ joints: [BodyJoint: (Double, Double)], wobble: Double = 0.003) -> PoseSample {
    var points: [String: JointPoint] = [:]
    for (joint, xy) in joints.sorted(by: { $0.key.rawValue < $1.key.rawValue }) {
        points[joint.rawValue] = JointPoint(x: xy.0 + jitter(wobble), y: xy.1 + jitter(wobble), confidence: 0.9)
    }
    return PoseSample(time: time, joints: points)
}
func makeTrack(duration: Double, fps: Double = 8, aspect: Double = 1, _ poseAt: (Double) -> PoseSample?) -> PoseTrack {
    let count = Int(duration * fps)
    return PoseTrack(duration: duration, aspect: aspect, framesLooked: count,
                     samples: (0..<count).compactMap { poseAt((Double($0) + 0.5) / fps) })
}
/// 0 at the start of each rep, 1 halfway through, 0 again at its end. 0 before and after the set.
func repWave(_ t: Double, lead: Double, reps: Int, period: Double) -> Double {
    let u = (t - lead) / period
    guard u >= 0, u < Double(reps) else { return 0 }
    return (1 - cos(2 * .pi * (u - u.rounded(.down)))) / 2
}
func deg(_ d: Double) -> Double { d * .pi / 180 }
/// Both sides of a side-on lifter, a little apart, from one side's points.
func bothSides(_ base: [BodyJoint: (Double, Double)], shoulder: (Double, Double), elbow: (Double, Double), wrist: (Double, Double),
               hip: (Double, Double), knee: (Double, Double), ankle: (Double, Double)) -> [BodyJoint: (Double, Double)] {
    var j = base
    j[.leftShoulder] = (shoulder.0 - 0.01, shoulder.1); j[.rightShoulder] = (shoulder.0 + 0.01, shoulder.1)
    j[.leftElbow] = (elbow.0 - 0.01, elbow.1); j[.rightElbow] = (elbow.0 + 0.01, elbow.1)
    j[.leftWrist] = (wrist.0 - 0.01, wrist.1); j[.rightWrist] = (wrist.0 + 0.01, wrist.1)
    j[.leftHip] = (hip.0 - 0.01, hip.1); j[.rightHip] = (hip.0 + 0.01, hip.1)
    j[.leftKnee] = (knee.0 - 0.01, knee.1); j[.rightKnee] = (knee.0 + 0.01, knee.1)
    j[.leftAnkle] = (ankle.0 - 0.01, ankle.1); j[.rightAnkle] = (ankle.0 + 0.01, ankle.1)
    return j
}

/// A side-on back squat. depth 0 is standing, 1 is the bottom, a little below parallel.
func squatPose(_ t: Double, depth: Double) -> PoseSample {
    let ankle = (0.5, 0.9)
    let a = deg(30 * depth), b = deg(100 * depth), c = deg(40 * depth)
    let knee = (ankle.0 + 0.2 * sin(a), ankle.1 - 0.2 * cos(a))
    let hip = (knee.0 - 0.2 * sin(b), knee.1 - 0.2 * cos(b))
    let neck = (hip.0 + 0.3 * sin(c), hip.1 - 0.3 * cos(c))
    return pose(t, bothSides([.neck: neck, .root: hip, .nose: (neck.0 + 0.03, neck.1 - 0.05)],
                             shoulder: neck, elbow: (neck.0 - 0.05, neck.1 + 0.05), wrist: (neck.0 - 0.02, neck.1 - 0.01),
                             hip: hip, knee: knee, ankle: ankle))
}
let squatTrack = makeTrack(duration: 18) { t in squatPose(t, depth: repWave(t, lead: 1.5, reps: 5, period: 3)) }
let squat = FormAnalyzer.measure(track: squatTrack, pattern: LiftPattern.of(name: "Squat", category: .legs, equipment: .barbell))
check(squat?.reps.count == 5, "finds all 5 squat reps")
check(squat?.signal == .hipHeight && squat?.camera == .side, "squats are counted from hip height, and the camera is side-on")
if let reps = squat?.reps, reps.count == 5 {
    check(zip(reps, [3.0, 6, 9, 12, 15]).allSatisfy { abs($0.turnTime - $1) <= 0.2 }, "each squat rep turns at the bottom")
    check(reps.allSatisfy { ($0.hipBelowKnee ?? -1) > 0.1 }, "the squats measure as below parallel")
    check(reps.allSatisfy { approx($0.kneeAtTurn, 50, 6) }, "knees measure about 50° at the bottom")
    check(reps.allSatisfy { approx($0.leanAtTurn, 40, 5) }, "torso measures about 40° of lean at the bottom")
    check(reps.allSatisfy { $0.turnTime - $0.startTime > 0.9 && $0.turnTime - $0.startTime < 1.6 }, "the way down takes about 1.5 s, without the standing before the set")
    check(reps.allSatisfy { $0.endTime - $0.turnTime > 0.9 && $0.endTime - $0.turnTime < 1.6 }, "the way up takes about 1.5 s, without the standing after the set")
    let line = FormReport.repLine(reps[0], pattern: .squat)
    check(line.contains("below parallel") && line.contains("down 1.") && line.contains("up 1."), "the rep line gives depth and tempo: \(line)")
}

// Real tracking wobbles more and loses the lifter now and then.
var frameNumber = 0
let roughTrack = makeTrack(duration: 18) { t -> PoseSample? in
    frameNumber += 1
    guard frameNumber % 4 != 0 else { return nil }
    var sample = squatPose(t, depth: repWave(t, lead: 1.5, reps: 5, period: 3))
    for (name, point) in sample.joints.sorted(by: { $0.key < $1.key }) {
        sample.joints[name] = JointPoint(x: point.x + jitter(0.008), y: point.y + jitter(0.008), confidence: frameNumber % 7 == 0 ? 0.1 : 0.8)
    }
    return sample
}
let rough = FormAnalyzer.measure(track: roughTrack, pattern: .squat)
check(rough?.reps.count == 5 && approx(rough?.trackedShare, 0.75, 0.01), "still finds 5 squats with shaky tracking and a quarter of the frames missing")

/// A side-on deadlift. lift 0 is the bar on the floor, 1 is lockout.
func deadliftPose(_ t: Double, lift: Double) -> PoseSample {
    let d = 1 - lift
    let ankle = (0.5, 0.9)
    let a = deg(20 * d), b = deg(70 * d), c = deg(60 * d)
    let knee = (ankle.0 + 0.2 * sin(a), ankle.1 - 0.2 * cos(a))
    let hip = (knee.0 - 0.2 * sin(b), knee.1 - 0.2 * cos(b))
    let neck = (hip.0 + 0.3 * sin(c), hip.1 - 0.3 * cos(c))
    let wrist = (neck.0, neck.1 + 0.25)
    return pose(t, bothSides([.neck: neck, .root: hip, .nose: (neck.0 + 0.04, neck.1 - 0.04)],
                             shoulder: neck, elbow: (neck.0, neck.1 + 0.125), wrist: wrist, hip: hip, knee: knee, ankle: ankle))
}
let deadliftTrack = makeTrack(duration: 14) { t in deadliftPose(t, lift: repWave(t, lead: 1, reps: 3, period: 4)) }
let pull = FormAnalyzer.measure(track: deadliftTrack, pattern: LiftPattern.of(name: "Deadlift", category: .back, equipment: .barbell))
check(pull?.reps.count == 3 && pull?.signal == .wristHeight, "finds 3 deadlift reps from the bar's height, starting on the floor")
if let reps = pull?.reps, reps.count == 3 {
    check(zip(reps, [3.0, 7, 11]).allSatisfy { abs($0.turnTime - $1) <= 0.2 }, "deadlift reps are counted at lockout")
    check(reps.allSatisfy { approx($0.hipAtTurn, 180, 8) }, "hips measure straight at lockout")
    check(reps.allSatisfy { approx($0.leanMax, 60, 5) }, "torso lean at the floor measures about 60°")
    check(reps.allSatisfy { ($0.earlyLeanChange ?? 99) < 5 }, "chest and hips rise together")
}

/// A single-arm curl with the right arm. The left arm hangs still.
func curlPose(_ t: Double, flex: Double) -> PoseSample {
    let elbowAngle = deg(160 - 120 * flex)
    let shoulder = (0.5, 0.3), elbow = (0.5, 0.45)
    // bothSides puts the right elbow 0.01 to the right.
    let wrist = (elbow.0 + 0.01 + 0.15 * sin(.pi - elbowAngle), elbow.1 + 0.15 * cos(.pi - elbowAngle))
    var j = bothSides([.neck: (0.5, 0.28), .root: (0.5, 0.6), .nose: (0.53, 0.22)],
                      shoulder: shoulder, elbow: elbow, wrist: (0.52, 0.6), hip: (0.5, 0.6), knee: (0.5, 0.75), ankle: (0.5, 0.9))
    j[.rightWrist] = wrist
    return pose(t, j)
}
let curlTrack = makeTrack(duration: 12) { t in curlPose(t, flex: repWave(t, lead: 1, reps: 4, period: 2.5)) }
let curl = FormAnalyzer.measure(track: curlTrack, pattern: LiftPattern.of(name: "Single-Arm Dumbbell Curl", category: .arms, equipment: .dumbbell))
check(curl?.reps.count == 4 && curl?.signal == .elbowAngle && curl?.side == .right, "finds 4 curls on the arm that moves")
if let reps = curl?.reps, reps.count == 4 {
    check(zip(reps, [2.25, 4.75, 7.25, 9.75]).allSatisfy { abs($0.turnTime - $1) <= 0.2 }, "curls are counted at the top")
    check(reps.allSatisfy { approx($0.elbowMin, 40, 5) && approx($0.elbowMax, 160, 5) }, "elbow range measures 40° to 160°")
}

let stillTrack = makeTrack(duration: 12) { t in squatPose(t, depth: 0) }
let still = FormAnalyzer.measure(track: stillTrack, pattern: .squat)
check(still != nil && still?.reps.isEmpty == true, "standing still is no reps")
check(FormAnalyzer.measure(track: PoseTrack(duration: 5, aspect: 1, framesLooked: 40, samples: []), pattern: .squat) == nil, "nobody in the video gives no measurements")

// MARK: Form check: following the lifter

/// A pose's joints moved sideways by `dx` and scaled about the feet, as someone else in the gym.
func elsewhere(_ sample: PoseSample, dx: Double, scale: Double = 1) -> [String: JointPoint] {
    sample.joints.mapValues { JointPoint(x: 0.5 + ($0.x - 0.5) * scale + dx, y: 0.9 - (0.9 - $0.y) * scale, confidence: $0.confidence) }
}
/// Every frame of the 5-rep squat set, with whoever else `others` adds. The squatter is missing
/// from the frames `missing` picks, and is listed first or second in turn.
func gym(missing: (Int) -> Bool, others: (Double) -> [[String: JointPoint]]) -> [LifterTracker.Frame] {
    (0..<144).map { i in
        let t = (Double(i) + 0.5) / 8
        var people = others(t)
        if !missing(i) {
            people.insert(squatPose(t, depth: repWave(t, lead: 1.5, reps: 5, period: 3)).joints, at: min(i % 2, people.count))
        }
        return LifterTracker.Frame(time: t, people: people)
    }
}
func onlyLifter(_ samples: [PoseSample]) -> Bool {
    samples.allSatisfy { abs(($0.joints[BodyJoint.root.rawValue]?.x ?? 9) - 0.45) < 0.15 }
}
func squats(in samples: [PoseSample]) -> Int? {
    FormAnalyzer.measure(track: PoseTrack(duration: 18, aspect: 1, framesLooked: 144, samples: samples), pattern: .squat)?.reps.count
}

let partner = { (t: Double) in [elsewhere(squatPose(t, depth: 0), dx: 0.35)] }
let besidePartner = LifterTracker.lifter(in: gym(missing: { [30, 70, 100].contains($0) }, others: partner), aspect: 1)
check(besidePartner.count == 141 && onlyLifter(besidePartner) && squats(in: besidePartner) == 5,
      "a frame without the lifter doesn't hand the tracking to a partner standing beside them")
let gapNearPartner = LifterTracker.lifter(in: gym(missing: { (40..<52).contains($0) }, others: partner), aspect: 1)
check(gapNearPartner.count == 132 && onlyLifter(gapNearPartner) && squats(in: gapNearPartner) == 5,
      "after 1.5 s without the lifter, the tracking picks them up again, not the partner")
let passerby = LifterTracker.lifter(in: gym(missing: { $0 < 8 }) { t in t < 2 ? [elsewhere(squatPose(t, depth: 0), dx: -0.4 + 0.1 * t)] : [] }, aspect: 1)
check(passerby.count == 136 && onlyLifter(passerby), "someone walking past before the lifter comes into view isn't followed")
let background = LifterTracker.lifter(in: gym(missing: { $0 % 4 == 0 }) { t in [elsewhere(squatPose(t, depth: 0), dx: -0.3, scale: 0.5)] }, aspect: 1)
check(background.count == 108 && onlyLifter(background), "a smaller person in the background the whole time isn't taken for the lifter")
check(LifterTracker.lifter(in: [LifterTracker.Frame(time: 0, people: [])], aspect: 1).isEmpty, "nobody found, nobody followed")
let otherSet = LifterTracker.lifter(in: gym(missing: { $0 % 5 == 0 }) { t in
    [elsewhere(squatPose(t, depth: repWave(t, lead: 0.5, reps: 5, period: 3)), dx: -0.3, scale: 0.6)]
}, aspect: 1)
check(otherSet.count == 115 && onlyLifter(otherSet) && squats(in: otherSet) == 5, "someone doing their own set further back isn't taken for the lifter")
func ankleless(_ joints: [String: JointPoint]) -> [String: JointPoint] {
    var j = joints
    for side in BodySide.allCases { j[side.ankle.rawValue]?.confidence = 0.1 }
    return j
}
let anklesLost = LifterTracker.lifter(in: gym(missing: { _ in false }, others: { _ in [] }).enumerated().map { i, f in
    i == 20 ? LifterTracker.Frame(time: f.time, people: f.people.map(ankleless)) : f
}, aspect: 1)
check(anklesLost.count == 144 && squats(in: anklesLost) == 5, "one frame where the phone loses both ankles doesn't split the lifter's trail")

/// A lifter on a flat bench, filmed from the side with the head to the left. press 1 is the bar at
/// lockout and 0 at the chest. sit 1 is sitting up on the bench with the hands on the knees, and
/// stand 1 standing beside it.
func benchPose(_ t: Double, press p: Double, sit: Double = 0, stand: Double = 0) -> PoseSample {
    let lying: [BodyJoint: (Double, Double)] = [.nose: (0.26, 0.66), .neck: (0.30, 0.68), .root: (0.50, 0.70)]
    let seated: [BodyJoint: (Double, Double)] = [.nose: (0.53, 0.45), .neck: (0.50, 0.50), .root: (0.50, 0.70)]
    let standing: [BodyJoint: (Double, Double)] = [.nose: (0.53, 0.27), .neck: (0.50, 0.32), .root: (0.50, 0.52)]
    let limbs: [[(Double, Double)]] = [
        // shoulder, elbow, wrist, hip, knee, ankle
        [(0.30, 0.68), (0.28 + 0.02 * p, 0.72 - 0.162 * p), (0.31, 0.596 - 0.16 * p), (0.50, 0.70), (0.66, 0.68), (0.70, 0.90)],
        [(0.50, 0.50), (0.57, 0.60), (0.64, 0.66), (0.50, 0.70), (0.66, 0.70), (0.68, 0.90)],
        [(0.50, 0.34), (0.50, 0.43), (0.51, 0.548), (0.50, 0.52), (0.51, 0.71), (0.50, 0.90)],
    ]
    func mix(_ a: (Double, Double), _ b: (Double, Double), _ c: (Double, Double)) -> (Double, Double) {
        let ab = (a.0 + (b.0 - a.0) * sit, a.1 + (b.1 - a.1) * sit)
        return (ab.0 + (c.0 - ab.0) * stand, ab.1 + (c.1 - ab.1) * stand)
    }
    var base: [BodyJoint: (Double, Double)] = [:]
    for joint in [BodyJoint.nose, .neck, .root] { base[joint] = mix(lying[joint]!, seated[joint]!, standing[joint]!) }
    let l = (0..<6).map { mix(limbs[0][$0], limbs[1][$0], limbs[2][$0]) }
    return pose(t, bothSides(base, shoulder: l[0], elbow: l[1], wrist: l[2], hip: l[3], knee: l[4], ankle: l[5]))
}
/// A bench set of `reps` reps, 3 s each after 1.5 s at lockout, then the bar back in the rack,
/// sitting up and standing up.
func benchSet(reps: Int) -> (Double) -> PoseSample {
    let end = 1.5 + 3 * Double(reps)
    return { t in
        switch t {
        case ..<(end + 1): return benchPose(t, press: 1 - repWave(t, lead: 1.5, reps: reps, period: 3))
        case ..<(end + 1.5): return benchPose(t, press: 1 - ramp(t, end + 1, end + 1.5))
        case ..<(end + 3): return benchPose(t, press: 0, sit: ramp(t, end + 1.5, end + 3))
        default: return benchPose(t, press: 0, sit: 1, stand: ramp(t, end + 3, end + 4.5))
        }
    }
}
// Someone standing still at the head of the bench, about as far from the phone as the lifter.
let benchFrames = (0..<168).map { i -> LifterTracker.Frame in
    let t = (Double(i) + 0.5) / 8
    let lifter = benchPose(t, press: 1 - repWave(t, lead: 1.5, reps: 5, period: 3)).joints
    let spotter = benchPose(t, press: 0, sit: 1, stand: 1).joints.mapValues { JointPoint(x: $0.x - 0.4, y: $0.y, confidence: $0.confidence) }
    return LifterTracker.Frame(time: t, people: i % 2 == 0 ? [lifter, spotter] : [spotter, lifter])
}
let benched = LifterTracker.lifter(in: benchFrames, aspect: 1)
check(benched.count == 168 && benched.allSatisfy { ($0.joints[BodyJoint.root.rawValue]?.x ?? 0) > 0.4 },
      "a lifter lying on a bench is followed, not someone standing still beside the bench")

// MARK: Form check: what counts as a rep

/// A side-on standing press. height -1 is the hands hanging by the thighs, 0 the bar at the
/// shoulders and 1 lockout. x is where the lifter stands.
func pressPose(_ t: Double, height h: Double, x: Double) -> PoseSample {
    let shoulder = (x, 0.3)
    let wrist = h < 0 ? (x + 0.06 * (1 + h), 0.32 - 0.26 * h) : (x + 0.06 - 0.06 * h, 0.32 - 0.3 * h)
    let elbow = ((shoulder.0 + wrist.0) / 2 + (h < 0 ? 0.01 : 0.05), (shoulder.1 + wrist.1) / 2)
    return pose(t, bothSides([.neck: (x, 0.28), .root: (x, 0.6), .nose: (x + 0.03, 0.23)],
                             shoulder: shoulder, elbow: elbow, wrist: wrist, hip: (x, 0.6), knee: (x, 0.75), ankle: (x, 0.9)))
}
func ramp(_ t: Double, _ from: Double, _ to: Double) -> Double { max(0, min(1, (t - from) / (to - from))) }
/// Takes the bar from the rack, walks it out, presses 5 reps, walks it back and lets go.
let walkedOut = makeTrack(duration: 18) { t -> PoseSample in
    let bob = 0.03 * sin(2 * .pi * 2 * t)
    let x = 0.3 + 0.2 * ramp(t, 1.6, 4) - 0.2 * ramp(t, 14, 16.4)
    let h: Double
    switch t {
    case ..<1.6: h = -1 + ramp(t, 1, 1.6)
    case ..<4: h = bob
    case ..<14: h = repWave(t, lead: 4, reps: 5, period: 2)
    case ..<16.4: h = bob
    default: h = -ramp(t, 16.4, 17)
    }
    return pressPose(t, height: h, x: x)
}
let pressed = FormAnalyzer.measure(track: walkedOut, pattern: LiftPattern.of(name: "Military Press", category: .shoulders, equipment: .barbell))
check(pressed?.reps.count == 5, "finds the 5 presses between the walk-out and the walk back")
if let reps = pressed?.reps, reps.count == 5 {
    check(reps[0].turnTime - reps[0].startTime < 1.5 && reps[4].endTime - reps[4].turnTime < 1.5,
          "the first press doesn't include the walk-out, nor the last the walk back (up \(FormReport.seconds(reps[0].turnTime - reps[0].startTime)), down \(FormReport.seconds(reps[4].endTime - reps[4].turnTime)))")
}

/// A side-on bent-over row. stand 0 is crouched over the bar on the floor, 1 standing. lean is
/// the torso's lean. pull 0 is the arms hanging, 1 the bar at the belly.
func rowPose(_ t: Double, stand: Double, lean: Double, pull: Double) -> PoseSample {
    let hip = (0.45, 0.7 - 0.12 * stand)
    let shoulder = (hip.0 + 0.3 * sin(deg(lean)), hip.1 - 0.3 * cos(deg(lean)))
    let elbow = (shoulder.0 - 0.1 * pull, shoulder.1 + 0.13 - 0.07 * pull)
    let wrist = (shoulder.0 - 0.07 * pull, shoulder.1 + 0.26 - 0.13 * pull)
    return pose(t, bothSides([.neck: shoulder, .root: hip, .nose: (shoulder.0 + 0.04, shoulder.1 - 0.03)],
                             shoulder: shoulder, elbow: elbow, wrist: wrist, hip: hip, knee: (0.52, 0.76), ankle: (0.5, 0.9)))
}
/// Deadlifts the bar up, bends over, rows 8 times, stands up and sets the bar down.
let rowFromFloor = makeTrack(duration: 23) { t -> PoseSample in
    switch t {
    case ..<2.5: return rowPose(t, stand: ramp(t, 1, 2), lean: 60 * (1 - ramp(t, 1, 2)), pull: 0)
    case ..<3.5: return rowPose(t, stand: 1, lean: 60 * ramp(t, 2.5, 3.5), pull: 0)
    case ..<19.5: return rowPose(t, stand: 1, lean: 60, pull: repWave(t, lead: 3.5, reps: 8, period: 2))
    case ..<21: return rowPose(t, stand: 1, lean: 60 * (1 - ramp(t, 19.5, 20.5)), pull: 0)
    default: return rowPose(t, stand: 1 - ramp(t, 21, 22), lean: 60 * ramp(t, 21, 22), pull: 0)
    }
}
let rows = FormAnalyzer.measure(track: rowFromFloor, pattern: LiftPattern.of(name: "Bent-Over Row", category: .back, equipment: .barbell))
check(rows?.reps.count == 8, "picking the bar up off the floor and setting it down aren't counted as rows (found \(rows?.reps.count ?? -1))")
if let reps = rows?.reps, reps.count == 8 {
    check(zip(reps, (0..<8).map { 4.5 + 2 * Double($0) }).allSatisfy { abs($0.turnTime - $1) <= 0.2 }, "the 8 rows are counted at the top of each pull")
}

/// A side-on curl with the given upper-arm angle (degrees from hanging, forward is positive) and
/// elbow angle, with both arms together.
func armPose(_ t: Double, arm: Double, elbow elbowAngle: Double, lean: Double = 0) -> PoseSample {
    let hip = (0.5, 0.65)
    let shoulder = (hip.0 + 0.3 * sin(deg(lean)), hip.1 - 0.3 * cos(deg(lean)))
    let elbow = (shoulder.0 + 0.15 * sin(deg(arm)), shoulder.1 + 0.15 * cos(deg(arm)))
    let forearm = deg(arm + 180 - elbowAngle)
    let wrist = (elbow.0 + 0.15 * sin(forearm), elbow.1 + 0.15 * cos(forearm))
    return pose(t, bothSides([.neck: shoulder, .root: hip, .nose: (shoulder.0 + 0.03, shoulder.1 - 0.05)],
                             shoulder: shoulder, elbow: elbow, wrist: wrist, hip: hip, knee: (0.62, 0.68), ankle: (0.62, 0.9)), wobble: 0)
}
/// Lifts the bar off the lap, sets the arms on the pad and does 5 preacher curls.
let fromLap = makeTrack(duration: 16) { t -> PoseSample in
    switch t {
    case ..<1.25: return armPose(t, arm: 0, elbow: 90 - 45 * ramp(t, 0.5, 1.25), lean: 10)
    case ..<2.5: return armPose(t, arm: 45 * ramp(t, 1.25, 2.5), elbow: 45 + 115 * ramp(t, 1.25, 2.5), lean: 10)
    default: return armPose(t, arm: 45, elbow: 160 - 120 * repWave(t, lead: 2.5, reps: 5, period: 2.5), lean: 10)
    }
}
let preacherCurls = FormAnalyzer.measure(track: fromLap, pattern: LiftPattern.of(name: "Preacher Curl", category: .arms, equipment: .ezBar))
check(preacherCurls?.reps.count == 5, "lifting the bar off the lap onto the pad isn't counted as a curl (found \(preacherCurls?.reps.count ?? -1))")

let cheatCurls = makeTrack(duration: 12) { t -> PoseSample in
    let flex = repWave(t, lead: 1, reps: 4, period: 2.5)
    return armPose(t, arm: -15 + 35 * flex, elbow: 160 - 120 * flex)
}
let swung = FormAnalyzer.measure(track: cheatCurls, pattern: .curl)
check(swung?.reps.count == 4 && swung?.reps.allSatisfy { approx($0.upperArmSwing, 35, 4) } == true,
      "an upper arm swinging from 15° behind to 20° in front reads as 35° of swing (\(swung?.reps.map { FormReport.degrees($0.upperArmSwing ?? 0) } ?? []))")

/// A single-arm curl where the phone mixes up the arms for two frames at the top of rep 2.
let swappedArms = makeTrack(duration: 12) { t -> PoseSample in
    var sample = curlPose(t, flex: repWave(t, lead: 1, reps: 4, period: 2.5))
    if abs(t - 4.75) < 0.1 {
        for (left, right) in [(BodyJoint.leftShoulder, BodyJoint.rightShoulder), (.leftElbow, .rightElbow), (.leftWrist, .rightWrist)] {
            let l = sample.joints[left.rawValue], r = sample.joints[right.rawValue]
            sample.joints[left.rawValue] = r
            sample.joints[right.rawValue] = l
        }
    }
    return sample
}
check(FormAnalyzer.measure(track: swappedArms, pattern: .curl)?.reps.count == 4, "two frames with the arms mixed up don't make an extra rep")

// Joining turns seen twice: measured from the first turn, so the next real rep isn't joined on too.
let wave = (0..<40).map { i -> Double in [10: 1.0, 16: 0.5, 22: 1.0][i] ?? 3 }
let waveTimes = (0..<40).map { Double($0) / 10 }
let joined = RepFinder.merge([RepSpan(start: 0, turn: 10, end: 14), RepSpan(start: 14, turn: 16, end: 18), RepSpan(start: 18, turn: 22, end: 30)],
                             wave, times: waveTimes, countAtHigh: false)
check(joined.count == 2 && joined[0].turn == 16 && joined[0].end == 18 && joined[1].turn == 22,
      "a turn seen twice is one rep, kept at its deeper point, and the next rep stays separate")
let fastTurns = (0..<6).map { RepSpan(start: 7 * $0, turn: 7 * $0 + 3, end: 7 * $0 + 7) }
check(RepFinder.merge(fastTurns, Array(repeating: 1, count: 43), times: (0..<43).map { Double($0) / 10 }, countAtHigh: false).count == 6,
      "the reps of a fast set, 0.7 s apart, aren't joined")

// Sitting up and standing after the bar is racked isn't a rep, however short the set.
for reps in 1...3 {
    let track = makeTrack(duration: 1.5 + 3 * Double(reps) + 6.5, benchSet(reps: reps))
    let found = FormAnalyzer.measure(track: track, pattern: LiftPattern.of(name: "Bench Press", category: .chest, equipment: .barbell))?.reps ?? []
    let turns = (0..<reps).map { 3 + 3 * Double($0) }
    check(found.count == reps && zip(found, turns).allSatisfy { abs($0.turnTime - $1) <= 0.2 },
          "a \(reps)-rep bench set, then getting up, is \(reps) rep\(reps == 1 ? "" : "s") at the chest (found \(found.map { FormReport.seconds($0.turnTime) }))")
}
// The middle rep of a triple where the phone missed the torso at the chest.
let unclearMiddle = makeTrack(duration: 1.5 + 9 + 6.5) { t -> PoseSample in
    var sample = benchSet(reps: 3)(t)
    if abs(t - 6) < 0.3 {
        for joint in [BodyJoint.neck, .root, .leftShoulder, .rightShoulder, .leftHip, .rightHip] { sample.joints[joint.rawValue] = nil }
    }
    return sample
}
check(FormAnalyzer.measure(track: unclearMiddle, pattern: .benchPress)?.reps.count == 3, "a triple keeps its first rep when the middle one's torso wasn't seen")

// RDLs start and end standing tall, so they're counted at the bottom.
let rdlTrack = makeTrack(duration: 18) { t in deadliftPose(t, lift: 1 - 0.6 * repWave(t, lead: 1.5, reps: 5, period: 3)) }
let rdls = FormAnalyzer.measure(track: rdlTrack, pattern: LiftPattern.of(name: "Romanian Deadlift", category: .legs, equipment: .barbell))
check(rdls?.reps.count == 5 && zip(rdls?.reps ?? [], [3.0, 6, 9, 12, 15]).allSatisfy { abs($0.turnTime - $1) <= 0.2 },
      "5 RDLs from the rack are 5 reps, each counted at the bottom (found \(rdls?.reps.map { FormReport.seconds($0.turnTime) } ?? []))")
// A deadlift single dropped from lockout never comes back down.
let dropped = makeTrack(duration: 8) { t in deadliftPose(t, lift: ramp(t, 1.5, 3)) }
check(FormAnalyzer.measure(track: dropped, pattern: .hinge, loggedReps: 1)?.reps.count == 1, "a deadlift single let go at lockout counts when one rep was logged")
check(FormAnalyzer.measure(track: dropped, pattern: .hinge)?.reps.isEmpty == true, "without the log, a lockout that never comes down isn't counted")
// Setting the bar down and standing up empty-handed looks like a pull, but isn't one.
let setDown = makeTrack(duration: 10) { t -> PoseSample in
    t < 5 ? deadliftPose(t, lift: repWave(t, lead: 1, reps: 1, period: 4)) : deadliftPose(t, lift: ramp(t, 6, 7.5))
}
check(FormAnalyzer.measure(track: setDown, pattern: .hinge, loggedReps: 1)?.reps.count == 1, "standing up after setting the bar down isn't a second deadlift")

// MARK: Form check: measuring cleanly

check(approx(FormAnalyzer.extent([150, 151, 176, 150, 151])?.high, 159, 0.01), "one jittery frame doesn't set a rep's range by itself")
// Wrists a grip's width apart, as seen at an angle, and the far one lost on every third frame.
let stillWrists = makeTrack(duration: 18) { t -> PoseSample in
    var sample = squatPose(t, depth: repWave(t, lead: 1.5, reps: 5, period: 3))
    sample.joints[BodyJoint.leftWrist.rawValue] = JointPoint(x: 0.55, y: 0.3, confidence: 0.9)
    sample.joints[BodyJoint.rightWrist.rawValue] = JointPoint(x: 0.65, y: 0.3, confidence: Int(t * 8) % 3 == 0 ? 0.2 : 0.9)
    return sample
}
let drift = FormAnalyzer.measure(track: stillWrists, pattern: .squat)?.reps.compactMap(\.barDrift) ?? []
check(drift.count == 5 && drift.allSatisfy { $0 < 0.02 }, "hands that don't move show no drift when the far wrist comes and goes")

/// Two-arm curls filmed from the left: the right arm, behind, is seen less surely and jitters more.
let farArmNoisy = makeTrack(duration: 12) { t -> PoseSample in
    var sample = armPose(t, arm: 0, elbow: 160 - 120 * repWave(t, lead: 1, reps: 4, period: 2.5))
    for joint in [BodyJoint.rightShoulder, .rightElbow, .rightWrist] {
        if let p = sample.joints[joint.rawValue] {
            sample.joints[joint.rawValue] = JointPoint(x: p.x + jitter(0.02), y: p.y + jitter(0.02), confidence: 0.4)
        }
    }
    return sample
}
let nearArm = FormAnalyzer.measure(track: farArmNoisy, pattern: .curl)
check(nearArm?.side == .left && nearArm?.reps.count == 4, "two-arm curls are measured on the arm nearer the camera")

// What a rep line says depends on the view.
if let rep = squat?.reps.first {
    let fromFront = FormMeasurements(pattern: .squat, signal: .hipHeight, side: .left, camera: .front, trackedShare: 1, reps: [rep])
    let frontLines = FormReport.lines(fromFront, loggedReps: 1)
    check(frontLines.contains { $0.hasPrefix("Filmed from the front or back") } && frontLines.last.map { !$0.contains("°") && !$0.contains("parallel") } == true,
          "from the front, rep lines give no angles or depth: \(frontLines.last ?? "")")
    let angledLine = FormReport.repLine(rep, pattern: .squat, camera: .angled)
    check(angledLine.contains("knees about ") && !angledLine.contains("hips") && !angledLine.contains("parallel"),
          "from an angle, rep lines mark the numbers as rough and leave depth out: \(angledLine)")
    let unclearLine = FormReport.repLine(rep, pattern: .squat, camera: .unknown)
    check(unclearLine.contains("hips look below the knees") && !unclearLine.contains("parallel"),
          "when the view couldn't be told, only depth's direction is given: \(unclearLine)")
    var highFromAngle = rep
    highFromAngle.hipBelowKnee = -0.17
    check(!FormReport.repLine(highFromAngle, pattern: .squat, camera: .angled).contains("above"),
          "a squat filmed from an angle by a high phone, which reads as hips above the knees, isn't called high")
    var pressRep = rep
    pressRep.kneeMax = 177
    check(FormReport.repLine(pressRep, pattern: .legPress, camera: .angled).contains("fully straight") == false
          && FormReport.repLine(pressRep, pattern: .legPress).contains("fully straight"), "\"knees fully straight\" is only said from the side")
}

// MARK: Form check: kinds of lift

let seedPatterns: [(String, ExerciseCategory, Equipment, LiftPattern)] = [
    ("Squat", .legs, .barbell, .squat), ("Leg Press", .legs, .machine, .legPress), ("Calf Raise", .legs, .machine, .calfRaise),
    ("Deadlift", .back, .barbell, .hinge), ("Bent-Over Row", .back, .barbell, .row), ("Bench Press", .chest, .barbell, .benchPress),
    ("Incline Press", .chest, .barbell, .benchPress), ("Decline Press", .chest, .barbell, .benchPress),
    ("Military Press", .shoulders, .barbell, .overheadPress), ("Preacher Curl", .arms, .ezBar, .curl),
    ("Single-Arm Dumbbell Curl", .arms, .dumbbell, .curl), ("Underhand Dumbbell Triceps Extension", .arms, .dumbbell, .tricepsExtension),
]
for (name, category, equipment, expected) in seedPatterns {
    check(LiftPattern.of(name: name, category: category, equipment: equipment) == expected, "\(name) is checked as \(expected.rawValue)")
}
check(LiftPattern.of(name: "Romanian Deadlift", category: .legs, equipment: .barbell) == .hingeFromTop, "an RDL is a hinge that starts standing")
check(LiftPattern.of(name: "Leg Curl", category: .legs, equipment: .machine) == .other, "a leg curl isn't an arm curl")
check(LiftPattern.of(name: "Machine Press", category: .shoulders, equipment: .machine) == .overheadPress, "a press under Shoulders is overhead")

// MARK: Form check: key frames

let squatFrames = FormAnalyzer.keyFrames(track: squatTrack, measurements: squat)
check(squatFrames.count >= 6 && squatFrames.count <= 10, "6 to 10 key frames for a 5-rep set (got \(squatFrames.count))")
check(zip(squatFrames, squatFrames.dropFirst()).allSatisfy { $0.time < $1.time }, "key frames are in time order")
check(squatFrames.map(\.number) == Array(1...squatFrames.count), "key frames are numbered from 1")
check(squatFrames.allSatisfy { $0.pose != nil }, "every key frame has the pose drawn on it")
check(squatFrames.first?.label == "start of rep 1" && squatFrames.last?.label == "end of rep 5", "key frames run from the start of rep 1 to the end of rep 5")
check(squatFrames.contains { $0.label == "rep 1, bottom" } && squatFrames.contains { $0.label == "rep 5, bottom" }, "the bottoms of the first and last reps are shown")
check(FormAnalyzer.chooseReps(count: 5, limit: 4) == [0, 1, 3, 4] && FormAnalyzer.chooseReps(count: 3, limit: 4) == [0, 1, 2], "picks reps spread over the set")
let stillFrames = FormAnalyzer.keyFrames(track: stillTrack, measurements: still)
check(stillFrames.count == 8 && stillFrames.map(\.number) == Array(1...8), "no reps: 8 evenly spaced frames from a 12 s video")
let manyReps = makeTrack(duration: 40) { t in squatPose(t, depth: repWave(t, lead: 1, reps: 12, period: 3)) }
let manyFrames = FormAnalyzer.keyFrames(track: manyReps, measurements: FormAnalyzer.measure(track: manyReps, pattern: .squat))
check(manyFrames.count <= 10 && manyFrames.contains { $0.label == "rep 12, bottom" }, "a long set still fits in 10 frames and shows the last rep")

// MARK: Form check: what Claude is told

let info = FormCheckContext(exerciseName: "Squat", category: .legs, equipment: .barbell, weightText: "225 lb", reps: 5, weightNote: "", note: " felt heavy ")
let ask = FormPrompt.request(info: info, measurements: squat, frameCount: squatFrames.count, duration: squatTrack.duration)
check(ask.contains("Exercise: Squat (Barbell, Legs)") && ask.contains("Set: 225 lb × 5 reps") && ask.contains("Lifter's note: felt heavy"), "the request names the lift, the set and the note")
check(ask.contains("Reps found: 5, as logged.") && ask.contains("- Rep 5: bottom at"), "the request gives the phone's rep count and each rep")
check(FormPrompt.request(info: info, measurements: nil, frameCount: 8, duration: 12).contains("Judge from the frames alone"), "with no tracking, Claude judges from the frames")
check(FormReport.lines(squat!, loggedReps: 6).contains { $0.hasPrefix("Reps found: 5 (logged: 6)") }, "a rep count that differs from the log is pointed out")
check(FormPrompt.frameLabel(squatFrames[0], total: squatFrames.count).hasPrefix("Frame 1 of \(squatFrames.count) · "), "frames are labeled with their number")

let fakeFrames: [(label: String, jpeg: Data)] = [("Frame 1 of 2", Data([0xFF, 0xD8, 0xFF])), ("Frame 2 of 2", Data([0xFF, 0xD8, 0x00]))]
let requestJSON = (try? FormCoachRequest.body(system: FormPrompt.system, frames: fakeFrames, text: ask))
    .flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any] ?? [:]
check(requestJSON["model"] as? String == "claude-opus-5-5" && requestJSON["fallbacks"] as? String == "default", "asks Claude Opus 5.5, with the fallback on")
check(requestJSON["stream"] as? Bool == true && requestJSON["max_tokens"] as? Int == 32000, "streams, with room to think")
check(["temperature", "top_p", "top_k", "thinking"].allSatisfy { requestJSON[$0] == nil }, "sends no sampling or thinking settings")
let outputConfig = requestJSON["output_config"] as? [String: Any]
check(outputConfig?["effort"] as? String == "high" && (outputConfig?["format"] as? [String: Any])?["type"] as? String == "json_schema", "asks for high effort and an answer in the schema")
let sent = (requestJSON["messages"] as? [[String: Any]])?.first?["content"] as? [[String: Any]] ?? []
check(sent.count == 5 && sent.last?["text"] as? String == ask, "each frame is a label and a picture, then the set's details")
let firstImage = sent.count > 1 ? sent[1]["source"] as? [String: Any] : nil
check(sent.count > 1 && sent[1]["type"] as? String == "image" && firstImage?["media_type"] as? String == "image/jpeg"
      && firstImage?["data"] as? String == Data([0xFF, 0xD8, 0xFF]).base64EncodedString(), "frames go as base64 JPEGs")
let requestHeaders = FormCoachRequest.headers(apiKey: "test-key")
check(requestHeaders["anthropic-version"] == "2026-10-21" && requestHeaders["anthropic-beta"] == "server-side-fallback-2026-07-01"
      && requestHeaders["x-api-key"] == "test-key", "headers carry the key, the API version and the fallback beta")

func isStrict(_ schema: [String: Any]) -> Bool {
    switch schema["type"] as? String {
    case "object":
        guard schema["additionalProperties"] as? Bool == false, let properties = schema["properties"] as? [String: Any],
              Set(schema["required"] as? [String] ?? []) == Set(properties.keys) else { return false }
        return properties.values.allSatisfy { ($0 as? [String: Any]).map(isStrict) ?? false }
    case "array":
        return (schema["items"] as? [String: Any]).map(isStrict) ?? false
    default:
        return true
    }
}
check(isStrict(FormCoachRequest.schema), "every object in the schema is closed and fully required")
let schemaText = (try? JSONSerialization.data(withJSONObject: FormCoachRequest.schema)).flatMap { String(data: $0, encoding: .utf8) } ?? ""
check(["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"].allSatisfy { !schemaText.contains("\"\($0)\"") }, "the schema uses no unsupported limits")

// MARK: Form check: reading Claude's answer

let reviewJSON = """
{"verdict":"good","score":8,"headline":"Good depth, chest drops a little.","camera_view":"side","confidence":"high","confidence_note":"","strengths":["Hips below parallel"],"fixes":[{"issue":"Chest drops at the bottom","why_it_matters":"It shifts the load onto your lower back.","cue":"Chest up","severity":"minor","frames":[3,5]}],"safety_flags":[],"rep_notes":[{"rep":5,"note":"Slower out of the hole"}],"next_set_tip":"Keep your chest proud."}
"""
func reply(_ content: [[String: Any]], stop: String = "end_turn", model: String = "claude-opus-5-5",
           usage: [String: Any] = ["input_tokens": 12_000, "output_tokens": 3_000]) -> Data {
    (try? JSONSerialization.data(withJSONObject: ["type": "message", "role": "assistant", "model": model, "content": content,
                                                  "stop_reason": stop, "usage": usage])) ?? Data()
}
func failure(_ body: Data, status: Int = 200) -> FormCoachError? {
    do {
        _ = try FormCoachResponse.parse(status: status, body: body)
        return nil
    } catch {
        return error as? FormCoachError
    }
}
let plain = try? FormCoachResponse.parse(status: 200, body: reply([["type": "thinking", "thinking": "", "signature": "x"], ["type": "text", "text": reviewJSON]]))
check(plain?.feedback.verdict == .good && plain?.feedback.clampedScore == 8 && plain?.feedback.fixes.first?.frames == [3, 5]
      && plain?.feedback.fixes.first?.whyItMatters.hasPrefix("It shifts") == true, "reads Claude's review after its thinking")
check(approx(plain?.cost, 12_000 * 4e-6 + 3_000 * 20e-6, 1e-12), "Opus 5.5 costs $4 in and $20 out per million tokens")
check(approx(FormCoachPricing.dollars(model: "claude-opus-5-5", input: 10_000, output: 2_000), 0.08, 1e-12), "10k tokens in and 2k out is 8 cents")

let switched: [[String: Any]] = [["type": "text", "text": "{\"verdict\":"],
                                 ["type": "fallback", "from": ["model": "claude-opus-5-5"], "to": ["model": "claude-opus-5"]],
                                 ["type": "text", "text": reviewJSON]]
let attempts: [String: Any] = ["input_tokens": 12_000, "output_tokens": 2_500, "iterations": [
    ["type": "message", "input_tokens": 12_000, "output_tokens": 500],
    ["type": "fallback_message", "model": "claude-opus-5", "input_tokens": 12_000, "output_tokens": 2_500],
]]
let fellBack = try? FormCoachResponse.parse(status: 200, body: reply(switched, model: "claude-opus-5", usage: attempts))
check(fellBack?.feedback.verdict == .good && fellBack?.model == "claude-opus-5", "after a fallback that starts over, reads the answer after the switch")
check(fellBack?.inputTokens == 24_000 && fellBack?.outputTokens == 3_000, "after a fallback, counts both attempts' tokens")
let declinedCost: Double = (12_000 * 4 + 500 * 20) / 1e6
let fallbackCost: Double = (12_000 * 5 + 2_500 * 25) / 1e6
check(approx(fellBack?.cost, declinedCost + fallbackCost, 1e-12), "after a fallback, prices each attempt at its own model's rate")

// A model that declines partway through hands its text to the next one, which carries on from there.
let handOff = reviewJSON.index(reviewJSON.startIndex, offsetBy: 40)
let handedOn: [String: Any] = ["type": "fallback", "from": ["model": "claude-opus-5-5"], "to": ["model": "claude-opus-5"],
                               "trigger": ["type": "refusal", "category": "cyber"]]
let carriedOn: [[String: Any]] = [["type": "text", "text": String(reviewJSON[..<handOff])], handedOn,
                                  ["type": "text", "text": String(reviewJSON[handOff...])]]
let continued = try? FormCoachResponse.parse(status: 200, body: reply(carriedOn, model: "claude-opus-5-5", usage: attempts))
check(continued != nil && continued?.feedback == plain?.feedback && continued?.model == "claude-opus-5",
      "after a fallback that carries on, reads the whole answer and names the model that finished it")
check(approx(continued?.cost, declinedCost + fallbackCost, 1e-12), "a model that declines partway through is billed for what it wrote")
let unlisted = try? FormCoachResponse.parse(status: 200, body: reply(carriedOn, model: "claude-opus-5-5"))
check(unlisted?.model == "claude-opus-5", "without a list of attempts, the switch point names the model that answered")

// A model that declines before writing anything is billed only in some refusal categories.
func declinedFirst(_ category: Any) -> FormCoachReply? {
    let blocks: [[String: Any]] = [["type": "fallback", "from": ["model": "claude-opus-5-5"], "to": ["model": "claude-opus-5"],
                                    "trigger": ["type": "refusal", "category": category]], ["type": "text", "text": reviewJSON]]
    let usage: [String: Any] = ["input_tokens": 12_000, "output_tokens": 3_000, "iterations": [
        ["type": "message", "model": "claude-opus-5-5", "input_tokens": 12_000, "output_tokens": 0],
        ["type": "fallback_message", "model": "claude-opus-5", "input_tokens": 12_000, "output_tokens": 3_000],
    ]]
    return try? FormCoachResponse.parse(status: 200, body: reply(blocks, model: "claude-opus-5", usage: usage))
}
let servedCost: Double = (12_000 * 5 + 3_000 * 25) / 1e6
check(approx(declinedFirst("cyber")?.cost, servedCost, 1e-12) && approx(declinedFirst(NSNull())?.cost, servedCost, 1e-12),
      "a decline before any output costs nothing when its category isn't billed")
check(approx(declinedFirst("bio")?.cost, servedCost + 12_000 * 4 / 1e6, 1e-12), "a decline before any output is billed when its category is")
check(declinedFirst("cyber")?.inputTokens == 24_000 && declinedFirst("cyber")?.outputTokens == 3_000, "a free decline's tokens are still counted")

check(failure(reply([], stop: "refusal")) == .refusal(category: nil), "a refusal is reported, not read as a review")
check(failure(reply([["type": "text", "text": "{\"verdict\""]], stop: "max_tokens")) == .cutOff, "a cut-off review is reported")
check(failure(reply([["type": "text", "text": "Looks fine to me"]])) == .unreadable, "an answer outside the schema is reported")
check(failure(reply([["type": "thinking", "thinking": ""]])) == .noAnswer, "a reply with no text is reported")
let badKey = failure(Data(#"{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}"#.utf8), status: 401)
check(badKey?.message.contains("API key") == true && badKey?.isRetryable == false, "a bad key says so and isn't retried")
let noCredit = failure(Data(#"{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}"#.utf8), status: 400)
check(noCredit?.message.contains("out of credit") == true && noCredit?.isRetryable == false, "an empty account says to add credit")
let busy = failure(Data(#"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#.utf8), status: 529)
check(busy?.isRetryable == true && busy?.message.contains("busy") == true, "a busy API is retried")
check(failure(Data("<html>".utf8), status: 502)?.isRetryable == true, "a gateway error is retried")
func errorBody(type: String, message: String, code: String? = nil) -> Data {
    var error: [String: Any] = ["type": type, "message": message]
    if let code { error["details"] = ["error_code": code] }
    return (try? JSONSerialization.data(withJSONObject: ["type": "error", "error": error])) ?? Data()
}
let capMessage = "You have reached your API usage limits: your organization has crossed its monthly API usage threshold, set based on your organization's API tier. You will regain access on 2026-12-01 at 00:00 UTC."
let capped = failure(errorBody(type: "rate_limit_error", message: capMessage, code: "enforced_spend_limit_reached"), status: 429)
check(capped == .spendLimit(message: capMessage) && capped?.isRetryable == false, "a spending cap isn't retried like a rate limit")
check(capped?.message.contains("2026-12-01") == true && capped?.message.contains("platform.claude.com") == true,
      "a spending cap says when access comes back and where to raise it")
let ownLimit = "You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC."
let workspaceLimit = "You have reached your specified workspace API usage limits. You will regain access on 2026-12-01 at 00:00 UTC."
check(failure(errorBody(type: "invalid_request_error", message: ownLimit), status: 400) == .spendLimit(message: ownLimit)
      && failure(errorBody(type: "invalid_request_error", message: workspaceLimit), status: 400) == .spendLimit(message: workspaceLimit),
      "a limit set in the Console is a spending limit too")
let throttled = failure(errorBody(type: "rate_limit_error", message: "Number of request tokens has exceeded your per-minute rate limit"), status: 429)
check(throttled?.isRetryable == true && throttled?.message.contains("Too many requests") == true, "an ordinary rate limit is still retried")
check(failure(errorBody(type: "invalid_request_error", message: "messages: field required"), status: 400)?.isRetryable == false,
      "a bad request isn't a spending limit or retried")
check(FormCoachError.retryLater(seconds: 45, rateLimited: true).message.contains("Try again in 45 seconds")
      && FormCoachError.retryLater(seconds: 600, rateLimited: false).message.contains("busy right now. Try again in 10 minutes"),
      "a long wait says how long")

// The verdict always goes with the score and the safety flags.
func reviewed(_ change: (inout [String: Any]) -> Void) -> FormCoachReply? {
    guard var object = (try? JSONSerialization.jsonObject(with: Data(reviewJSON.utf8))) as? [String: Any] else { return nil }
    change(&object)
    guard let data = try? JSONSerialization.data(withJSONObject: object), let text = String(data: data, encoding: .utf8) else { return nil }
    return try? FormCoachResponse.parse(status: 200, body: reply([["type": "text", "text": text]]))
}
check(reviewed { $0["score"] = 5 }?.feedback.verdict == .needsWork, "a score of 5 shows as needs work, whatever the label says")
check(reviewed { $0["verdict"] = "great"; $0["score"] = 9; $0["safety_flags"] = ["Lower back rounds at the bottom"] }?.feedback.verdict == .unsafe,
      "a safety flag always shows as unsafe")
check(reviewed { $0["score"] = 10 }?.feedback.verdict == .great && reviewed { _ in }?.feedback.verdict == .good, "9 to 10 is great and 7 to 8 is good")
check(FormPrompt.system.contains("Use unsafe exactly when safety_flags is not empty") && FormPrompt.system.contains("Leave it empty when there are none"),
      "the prompt ties unsafe to the safety flags")

// A streamed reply, in pieces, as the API sends it.
func event(_ object: [String: Any]) -> String {
    "data: " + ((try? JSONSerialization.data(withJSONObject: object)).flatMap { String(data: $0, encoding: .utf8) } ?? "")
}
var streamLines = [
    "event: message_start",
    event(["type": "message_start", "message": ["id": "msg_1", "type": "message", "role": "assistant", "model": "claude-opus-5-5",
                                                "content": [], "stop_reason": NSNull(), "usage": ["input_tokens": 12_000, "output_tokens": 1]]]),
    "",
    event(["type": "ping"]),
    event(["type": "content_block_start", "index": 0, "content_block": ["type": "thinking", "thinking": "", "signature": ""]]),
    event(["type": "content_block_delta", "index": 0, "delta": ["type": "signature_delta", "signature": "sig"]]),
    event(["type": "content_block_stop", "index": 0]),
    event(["type": "content_block_start", "index": 1, "content_block": ["type": "text", "text": ""]]),
]
var rest = Substring(reviewJSON)
while !rest.isEmpty {
    streamLines.append(event(["type": "content_block_delta", "index": 1, "delta": ["type": "text_delta", "text": String(rest.prefix(37))]]))
    rest = rest.dropFirst(37)
}
streamLines += [
    event(["type": "content_block_stop", "index": 1]),
    event(["type": "message_delta", "delta": ["stop_reason": "end_turn", "stop_sequence": NSNull()], "usage": ["output_tokens": 3_000]]),
    "",
    event(["type": "message_stop"]),
]
var stream = FormCoachStream()
var phases: [FormCoachStream.Phase] = []
for line in streamLines where stream.feed(line: line) {
    phases.append(stream.phase)
}
check(phases == [.thinking, .writing, .done], "a stream goes thinking, writing, done")
let streamed = try? stream.reply()
check(streamed != nil && streamed?.feedback == plain?.feedback && streamed?.inputTokens == 12_000 && streamed?.outputTokens == 3_000,
      "a streamed reply reads the same as a plain one")
var stopped = FormCoachStream()
for line in streamLines.dropLast(4) { stopped.feed(line: line) }
check((try? stopped.reply()) == nil, "a stream that stops partway is an error, not a review")
var overloaded = FormCoachStream()
overloaded.feed(line: streamLines[1])
overloaded.feed(line: event(["type": "error", "error": ["type": "overloaded_error", "message": "Overloaded"]]))
do {
    _ = try overloaded.reply()
    check(false, "an error partway through a stream is reported")
} catch let error as FormCoachError {
    check(error.isRetryable, "an overloaded error partway through a stream is retried")
} catch {
    check(false, "an error partway through a stream is a FormCoachError")
}

// A model that declines partway through a stream hands over on the same stream: its text block
// closes, a fallback block marks the switch, and the next model carries on.
var relayLines = Array(streamLines.prefix(8))
relayLines += [
    event(["type": "content_block_delta", "index": 1, "delta": ["type": "text_delta", "text": String(reviewJSON[..<handOff])]]),
    event(["type": "content_block_stop", "index": 1]),
    event(["type": "content_block_start", "index": 2, "content_block": handedOn]),
    event(["type": "content_block_stop", "index": 2]),
    event(["type": "content_block_start", "index": 3, "content_block": ["type": "text", "text": ""]]),
    event(["type": "content_block_delta", "index": 3, "delta": ["type": "text_delta", "text": String(reviewJSON[handOff...])]]),
    event(["type": "content_block_stop", "index": 3]),
    event(["type": "message_delta", "delta": ["stop_reason": "end_turn", "stop_sequence": NSNull()],
           "usage": ["output_tokens": 2_500, "iterations": attempts["iterations"] ?? []]]),
    event(["type": "message_stop"]),
]
var relayed = FormCoachStream()
var relayPhases: [FormCoachStream.Phase] = []
for line in relayLines where relayed.feed(line: line) {
    relayPhases.append(relayed.phase)
}
let relayReply = try? relayed.reply()
check(relayReply != nil && relayReply?.feedback == plain?.feedback && relayReply?.model == "claude-opus-5",
      "a stream that switches models partway reads the whole answer and names the model that finished it")
check(approx(relayReply?.cost, declinedCost + fallbackCost, 1e-12) && relayPhases == [.thinking, .writing, .done],
      "a stream that switches models partway prices both attempts")

// MARK: Form check: saving

var saved = FormCheck(videoFileName: "set.mov", checkedAt: Date(timeIntervalSince1970: 1_762_000_000), aspect: 0.5625, duration: 18,
                      frames: squatFrames, measurements: squat)
saved.feedback = plain?.feedback
saved.model = plain?.model
saved.inputTokens = plain?.inputTokens
saved.outputTokens = plain?.outputTokens
saved.cost = plain?.cost
let reloaded = saved.encoded().flatMap(FormCheck.decode)
check(reloaded == saved, "a saved check reads back the same")
check(approx(reloaded?.estimatedCost, 0.108, 1e-9), "a saved check keeps its cost")
check(FormCheck.decode("{}") == nil && FormCheck.decode("not json") == nil, "a damaged check is ignored")

print(failures == 0 ? "\nAll checks passed." : "\n\(failures) check(s) failed.")
exit(failures == 0 ? 0 : 1)
