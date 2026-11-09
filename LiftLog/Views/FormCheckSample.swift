import SwiftUI

/// A made-up form check, for looking at the review screens in the simulator without a video or
/// an API key. Launch with -LiftLogSampleFormCheck for the review, or -LiftLogSampleAPIKey for the
/// key screen. Nothing is saved and nothing is sent.
enum FormCheckSample {
    static var showsReview: Bool { ProcessInfo.processInfo.arguments.contains("-LiftLogSampleFormCheck") }
    static var showsKeyScreen: Bool { ProcessInfo.processInfo.arguments.contains("-LiftLogSampleAPIKey") }

    static var check: FormCheck {
        let times = [1.4, 2.2, 3.0, 3.8, 9.0, 13.4, 14.2, 15.0, 15.8, 16.4]
        let labels = ["start of rep 1", "rep 1, on the way down", "rep 1, bottom", "rep 1, on the way up", "rep 3, bottom",
                      "start of rep 5", "rep 5, on the way down", "rep 5, bottom", "rep 5, on the way up", "end of rep 5"]
        let depths = [0.0, 0.6, 1.0, 0.6, 1.0, 0.0, 0.6, 1.0, 0.6, 0.0]
        let frames = times.indices.map { i in
            FormKeyFrame(number: i + 1, time: times[i], label: labels[i], pose: squatPose(time: times[i], depth: depths[i]))
        }
        let reps = (0..<5).map { k -> RepMeasure in
            let start = 1.4 + 3 * Double(k)
            var rep = RepMeasure(number: k + 1, startTime: start, turnTime: start + 1.6, endTime: start + 3)
            rep.kneeAtTurn = 52 + Double(k)
            rep.hipAtTurn = 58
            rep.leanAtTurn = 38 + 2 * Double(k)
            rep.hipBelowKnee = 0.12 - 0.01 * Double(k)
            rep.kneeMin = rep.kneeAtTurn
            rep.kneeMax = 176
            rep.leanMin = 8
            rep.leanMax = rep.leanAtTurn
            return rep
        }
        var check = FormCheck(
            videoFileName: "sample-form-check.mov",
            checkedAt: Date(),
            aspect: 9.0 / 16.0,
            duration: 18,
            frames: frames,
            measurements: FormMeasurements(pattern: .squat, signal: .hipHeight, side: .left, camera: .side, trackedShare: 0.96, reps: reps)
        )
        check.feedback = FormFeedback(
            verdict: .good,
            score: 8,
            headline: "Solid depth on every rep. Your chest drops a little as you come out of the bottom, most on the last rep.",
            cameraView: "side",
            confidence: "medium",
            confidenceNote: "The plates hide your far knee in frames 3 and 8, so knee tracking isn't judged.",
            strengths: ["Hips below parallel on all 5 reps", "A steady, controlled descent of about 1.5 seconds", "Heels stay flat the whole set"],
            fixes: [
                FormFix(issue: "Chest drops out of the bottom", whyItMatters: "Your hips rise first, which shifts the weight onto your lower back.",
                        cue: "Drive your upper back into the bar", severity: "moderate", frames: [3, 8, 9]),
                FormFix(issue: "Bar drifts forward on rep 5", whyItMatters: "A bar over your toes is harder to stand up and pulls you forward.",
                        cue: "Keep the bar over mid-foot", severity: "minor", frames: [9]),
            ],
            safetyFlags: [],
            repNotes: [FormRepNote(rep: 5, note: "Slowest out of the hole, and the chest drop is biggest here.")],
            nextSetTip: "Brace hard before each rep and lead with your chest as you stand."
        )
        check.model = FormCoachRequest.model
        check.inputTokens = 13_400
        check.outputTokens = 4_200
        check.cost = FormCoachPricing.dollars(model: FormCoachRequest.model, input: 13_400, output: 4_200)
        return check
    }

    /// A side-on squatter, standing at depth 0 and at the bottom at 1, in a portrait frame.
    private static func squatPose(time: Double, depth: Double) -> PoseSample {
        let aspect = 9.0 / 16.0
        func point(_ x: Double, _ y: Double) -> JointPoint { JointPoint(x: 0.5 + x / aspect, y: y, confidence: 0.9) }
        let a = 30 * depth * .pi / 180, b = 100 * depth * .pi / 180, c = 40 * depth * .pi / 180
        let ankle = (0.0, 0.88)
        let knee = (ankle.0 + 0.2 * sin(a), ankle.1 - 0.2 * cos(a))
        let hip = (knee.0 - 0.2 * sin(b), knee.1 - 0.2 * cos(b))
        let neck = (hip.0 + 0.28 * sin(c), hip.1 - 0.28 * cos(c))
        let joints: [BodyJoint: JointPoint] = [
            .nose: point(neck.0 + 0.03, neck.1 - 0.06), .neck: point(neck.0, neck.1),
            .leftShoulder: point(neck.0, neck.1), .rightShoulder: point(neck.0 + 0.01, neck.1),
            .leftElbow: point(neck.0 - 0.06, neck.1 + 0.05), .rightElbow: point(neck.0 - 0.05, neck.1 + 0.05),
            .leftWrist: point(neck.0 - 0.02, neck.1 - 0.01), .rightWrist: point(neck.0 - 0.01, neck.1 - 0.01),
            .leftHip: point(hip.0, hip.1), .rightHip: point(hip.0 + 0.01, hip.1), .root: point(hip.0, hip.1),
            .leftKnee: point(knee.0, knee.1), .rightKnee: point(knee.0 + 0.01, knee.1),
            .leftAnkle: point(ankle.0, ankle.1), .rightAnkle: point(ankle.0 + 0.01, ankle.1),
        ]
        return PoseSample(time: time, joints: Dictionary(uniqueKeysWithValues: joints.map { ($0.key.rawValue, $0.value) }))
    }
}

/// Shows the sample screens when the app is launched with their arguments.
struct FormCheckSampleScreens: ViewModifier {
    @State private var showingReview = FormCheckSample.showsReview
    @State private var showingKeyScreen = FormCheckSample.showsKeyScreen

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: $showingReview) {
                FormCheckResultView(check: FormCheckSample.check, title: "Squat", loggedReps: 5, canAskClaude: true,
                                    onCheckAgain: { _ in }, onDelete: {})
            }
            .sheet(isPresented: $showingKeyScreen) {
                NavigationStack {
                    APIKeyView()
                }
            }
    }
}
