import SwiftUI

/// The looping animation at the top of an exercise. What it shows depends on the equipment:
/// a barbell with one plate per side (45 lb, or 20 kg when the unit is kg), a dumbbell curl,
/// or a machine weight stack.
struct ExerciseAnimationView: View {
    let equipment: Equipment
    let unit: WeightUnit
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 8) {
            TimelineView(.animation(paused: reduceMotion)) { context in
                scene(phase: reduceMotion ? 0.65 : Self.phase(at: context.date))
            }
            .frame(height: 190)
            Text(caption)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(caption)
    }

    @ViewBuilder
    private func scene(phase: Double) -> some View {
        switch equipment {
        case .barbell: BarbellScene(phase: phase, plateLabel: plateLabel, ezBar: false)
        case .ezBar: BarbellScene(phase: phase, plateLabel: plateLabel, ezBar: true)
        case .dumbbell: DumbbellScene(phase: phase)
        case .machine, .cable: WeightStackScene(phase: phase)
        case .bodyweight, .other: FigureScene(phase: phase)
        }
    }

    /// One plate per side. A 45 lb plate's metric counterpart is the 20 kg plate.
    private var plateLabel: String { unit == .lb ? "45 LB" : "20 KG" }

    private var caption: String {
        let plate = unit == .lb ? "45 lb" : "20 kg"
        switch equipment {
        case .barbell:
            let total = unit == .lb ? "135 lb" : "60 kg"
            return "One \(plate) plate per side · \(total) with a \(plate) bar"
        case .ezBar: return "EZ bar with one \(plate) plate per side"
        case .dumbbell: return "Dumbbell"
        case .machine: return "Machine weight stack"
        case .cable: return "Cable weight stack"
        case .bodyweight: return "Bodyweight"
        case .other: return equipment.rawValue
        }
    }

    /// 0 at the bottom of a rep, 1 at the top, eased in and out. One rep every 2.6 seconds.
    static func phase(at date: Date) -> Double {
        let period = 2.6
        let t = date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: period) / period
        return (1 - cos(t * 2 * .pi)) / 2
    }
}

private let steel = Color(white: 0.62)

// MARK: - Barbell

private struct BarbellScene: View {
    let phase: Double
    let plateLabel: String
    let ezBar: Bool

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let plateHeight = min(h * 0.5, 94)
            let floorY = h - 6
            let travel = floorY - plateHeight - 6
            let y = floorY - plateHeight / 2 - travel * phase
            let plateOffset = min(w * 0.33, 150)

            ZStack {
                Capsule()
                    .fill(Color.secondary.opacity(0.25))
                    .frame(width: w * 0.85, height: 3)
                    .position(x: w / 2, y: floorY)
                Ellipse()
                    .fill(Color.black.opacity(0.2 * (1 - phase * 0.7)))
                    .frame(width: plateOffset * 2.2 * (1 - 0.25 * phase), height: 8)
                    .position(x: w / 2, y: floorY)

                BarShape(ez: ezBar)
                    .stroke(steel, style: StrokeStyle(lineWidth: 6, lineCap: .round, lineJoin: .round))
                    .frame(width: plateOffset * 2 + 70, height: 24)
                    .position(x: w / 2, y: y)

                ForEach([-1.0, 1.0], id: \.self) { side in
                    let x = w / 2 + side * plateOffset
                    Plate(label: plateLabel, height: plateHeight)
                        .position(x: x, y: y)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.orange)
                        .frame(width: 7, height: 20)
                        .position(x: x - side * (Plate.width / 2 + 5), y: y)
                }
            }
            .frame(width: w, height: h)
        }
    }
}

/// A straight bar, or an EZ bar with the cambered middle.
private struct BarShape: Shape {
    let ez: Bool

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let y = rect.midY
        p.move(to: CGPoint(x: rect.minX, y: y))
        if ez {
            let bend: CGFloat = rect.height * 0.3
            for (fraction, dy) in [(0.36, 0.0), (0.41, -bend), (0.46, bend), (0.5, 0.0), (0.54, bend), (0.59, -bend), (0.64, 0.0)] {
                p.addLine(to: CGPoint(x: rect.minX + rect.width * fraction, y: y + dy))
            }
        }
        p.addLine(to: CGPoint(x: rect.maxX, y: y))
        return p
    }
}

private struct Plate: View {
    static let width: CGFloat = 30
    let label: String
    let height: CGFloat

    var body: some View {
        RoundedRectangle(cornerRadius: 5, style: .continuous)
            .fill(LinearGradient(colors: [Color(white: 0.3), Color(white: 0.1)], startPoint: .leading, endPoint: .trailing))
            .overlay(
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.18), lineWidth: 1)
            )
            .overlay(
                Text(label)
                    .font(.system(size: 13, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                    .fixedSize()
                    .rotationEffect(.degrees(-90))
            )
            .frame(width: Self.width, height: height)
    }
}

// MARK: - Dumbbell

private struct DumbbellScene: View {
    let phase: Double

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let forearm: CGFloat = min(h * 0.38, 72)
            let elbow = CGPoint(x: w / 2 - forearm * 0.2, y: h * 0.5)
            let shoulder = CGPoint(x: elbow.x - 14, y: elbow.y - forearm)
            // Side view: from the arm hanging down to curled up near the shoulder.
            let degrees: Double = 75 - 145 * phase
            let angle = Angle.degrees(degrees).radians
            let hand = CGPoint(x: elbow.x + forearm * cos(angle), y: elbow.y + forearm * sin(angle))
            let arm = Color.secondary.opacity(0.45)

            ZStack {
                Path { p in
                    p.move(to: shoulder)
                    p.addLine(to: elbow)
                    p.addLine(to: hand)
                }
                .stroke(arm, style: StrokeStyle(lineWidth: 16, lineCap: .round, lineJoin: .round))
                Circle()
                    .fill(arm)
                    .frame(width: 26, height: 26)
                    .position(shoulder)

                // Held across the grip, so it turns with the forearm.
                Dumbbell()
                    .rotationEffect(.degrees(degrees + 90))
                    .position(hand)
            }
            .frame(width: w, height: h)
        }
    }
}

private struct Dumbbell: View {
    var body: some View {
        HStack(spacing: 0) {
            head
            Capsule().fill(steel).frame(width: 30, height: 8)
            head
        }
    }

    private var head: some View {
        RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill(LinearGradient(colors: [Color(white: 0.32), Color(white: 0.12)], startPoint: .top, endPoint: .bottom))
            .overlay(
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.18), lineWidth: 1)
            )
            .frame(width: 18, height: 38)
    }
}

// MARK: - Machine / cable weight stack

private struct WeightStackScene: View {
    let phase: Double
    private let plateCount = 9
    /// The pin sits in this plate (0 = top), so it and the plates above it lift.
    private let pinIndex = 3

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let cx = w / 2
            let plateWidth: CGFloat = 92
            let plateHeight: CGFloat = 9
            let gap: CGFloat = 2.5
            let bottom = h - 6
            let stackTop = bottom - CGFloat(plateCount) * (plateHeight + gap)
            let pulleyY: CGFloat = 12
            let lift = (stackTop - pulleyY - 18) * phase

            ZStack {
                // Frame and guide rods.
                ForEach([-1.0, 1.0], id: \.self) { side in
                    Capsule()
                        .fill(steel.opacity(0.7))
                        .frame(width: 4, height: bottom - pulleyY)
                        .position(x: cx + side * (plateWidth / 2 - 14), y: (bottom + pulleyY) / 2)
                }
                Capsule()
                    .fill(Color.secondary.opacity(0.25))
                    .frame(width: plateWidth + 50, height: 3)
                    .position(x: cx, y: bottom + 2)

                // Cable from the pulley to the top plate.
                Path { p in
                    p.move(to: CGPoint(x: cx, y: pulleyY))
                    p.addLine(to: CGPoint(x: cx, y: stackTop - lift))
                }
                .stroke(Color.secondary.opacity(0.7), lineWidth: 2)
                Circle()
                    .strokeBorder(steel, lineWidth: 4)
                    .background(Circle().fill(Color(uiColor: .secondarySystemGroupedBackground)))
                    .frame(width: 22, height: 22)
                    .position(x: cx, y: pulleyY)

                ForEach(0..<plateCount, id: \.self) { i in
                    let restY = stackTop + CGFloat(i) * (plateHeight + gap) + plateHeight / 2
                    let lifted = i <= pinIndex
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(LinearGradient(colors: [Color(white: 0.32), Color(white: 0.14)], startPoint: .top, endPoint: .bottom))
                        .frame(width: plateWidth, height: plateHeight)
                        .position(x: cx, y: restY - (lifted ? lift : 0))
                }

                // Selector pin.
                Capsule()
                    .fill(Color.orange)
                    .frame(width: 22, height: 5)
                    .position(
                        x: cx + plateWidth / 2 + 6,
                        y: stackTop + CGFloat(pinIndex) * (plateHeight + gap) + plateHeight / 2 - lift
                    )
            }
            .frame(width: w, height: h)
        }
    }
}

// MARK: - Bodyweight / other

private struct FigureScene: View {
    let phase: Double

    var body: some View {
        Image(systemName: "figure.strengthtraining.functional")
            .font(.system(size: 84))
            .foregroundStyle(.orange)
            .scaleEffect(1 + 0.06 * phase)
            .offset(y: -10 * phase)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
