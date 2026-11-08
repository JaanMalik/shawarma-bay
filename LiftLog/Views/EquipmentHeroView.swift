import SwiftUI

/// The animated equipment picture at the top of an exercise screen.
///
/// Bars show one standard plate per side: a 45 in pounds, a 20 in kilograms. Dumbbell exercises
/// show a dumbbell, machines and cables show a weight stack, and anything else shows a lifter.
/// The picture does one slow rep over and over, and holds still when Reduce Motion is on.
/// Scenes are drawn for the default height of 190 points.
struct EquipmentHeroView: View {
    let name: String
    let category: ExerciseCategory
    let equipment: Equipment
    let unit: WeightUnit
    var height: CGFloat = 190

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let picture = EquipmentRules.picture(for: equipment)
        let motion = EquipmentRules.motion(name: name, category: category, equipment: equipment)
        let animate = !reduceMotion

        ZStack {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(uiColor: .secondarySystemGroupedBackground))

            Group {
                switch picture {
                case .barbell:
                    BarbellScene(plates: EquipmentRules.standardPlates(for: unit), motion: motion, wavy: false, animate: animate)
                case .ezBar:
                    BarbellScene(plates: EquipmentRules.standardPlates(for: unit), motion: motion, wavy: true, animate: animate)
                case .dumbbell:
                    DumbbellScene(motion: motion, animate: animate)
                case .machine:
                    MachineScene(labels: EquipmentRules.stackLabels(for: unit), unitLabel: unit.rawValue, motion: motion, animate: animate)
                case .figure:
                    FigureScene(animate: animate)
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 16)
        }
        .frame(height: height)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(EquipmentRules.description(picture: picture, unit: unit)))
    }
}

// MARK: - Motion

/// Moves a view through one rep, forever: up, a short hold, back down. Still when `animate` is false.
private struct RepMotion: ViewModifier {
    let motion: EquipmentRules.Motion
    let animate: Bool

    private enum Phase: CaseIterable {
        case bottom
        case top
        case hold
    }

    private var travel: CGFloat { CGFloat(motion.travel) }

    func body(content: Content) -> some View {
        if animate && (motion.travel > 0 || motion.tilt != 0) {
            content.phaseAnimator(Phase.allCases) { view, phase in
                view
                    // The hold phase differs from the top by a quarter point so there is always
                    // something to animate, which is what makes the pause last its full duration.
                    .offset(y: phase == .bottom ? 0 : (phase == .top ? -travel : -travel + 0.25))
                    .rotationEffect(.degrees(phase == .bottom ? 0 : motion.tilt))
            } animation: { phase in
                switch phase {
                case .top: return .easeInOut(duration: motion.secondsUp)
                case .hold: return .linear(duration: max(motion.holdAtTop, 0.05))
                case .bottom: return .easeInOut(duration: motion.secondsDown)
                }
            }
        } else {
            content.offset(y: -travel / 2)
        }
    }
}

// MARK: - Barbell and curl bar

private struct BarbellScene: View {
    let plates: [PlateSpec]
    let motion: EquipmentRules.Motion
    let wavy: Bool
    let animate: Bool

    var body: some View {
        ZStack {
            if motion.startsOnFloor {
                Capsule()
                    .fill(Color.secondary.opacity(0.25))
                    .frame(height: 3)
                    // The line's top edge meets the plates at the bottom of the rep.
                    .offset(y: CGFloat(motion.travel) / 2 + BarbellView.plateHeight / 2 + 1.5)
            }
            BarbellView(plates: plates, wavy: wavy)
                // Centre the rep's travel in the card.
                .offset(y: CGFloat(motion.travel) / 2)
                .modifier(RepMotion(motion: motion, animate: animate))
        }
    }
}

struct BarbellView: View {
    let plates: [PlateSpec]
    var wavy = false

    static let plateHeight: CGFloat = 112

    private var barColor: Color { Color(uiColor: .systemGray2) }

    var body: some View {
        HStack(spacing: 0) {
            sleeveTip
            plateRow(Array(plates.reversed()))
            collar
            shaft
            collar
            plateRow(plates)
            sleeveTip
        }
        .frame(height: Self.plateHeight)
    }

    private var sleeveTip: some View {
        Capsule()
            .fill(barColor)
            .frame(width: 16, height: 12)
    }

    private var collar: some View {
        RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(Color.accentColor)
            .frame(width: 8, height: 24)
    }

    @ViewBuilder
    private var shaft: some View {
        if wavy {
            EZShaft()
                // Flat ends so the bar stops flush at both collars.
                .stroke(barColor, style: StrokeStyle(lineWidth: 9, lineCap: .butt, lineJoin: .round))
                .frame(height: 34)
        } else {
            Capsule()
                .fill(barColor)
                .frame(height: 9)
        }
    }

    private func plateRow(_ plates: [PlateSpec]) -> some View {
        HStack(spacing: 2) {
            ForEach(Array(plates.enumerated()), id: \.offset) { _, plate in
                PlateView(plate: plate)
            }
        }
    }
}

struct PlateView: View {
    let plate: PlateSpec

    var body: some View {
        let height = BarbellView.plateHeight * CGFloat(plate.relativeDiameter)
        ZStack {
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .fill(fill)
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .strokeBorder(.white.opacity(0.18), lineWidth: 1.5)
            VStack(spacing: 0) {
                Text(plate.label)
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                Text(plate.unitLabel)
                    .font(.system(size: 9, weight: .semibold, design: .rounded))
                    .opacity(0.75)
            }
            .foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
        }
        .frame(width: 32, height: height)
    }

    private var fill: LinearGradient {
        switch plate.style {
        case .iron:
            return LinearGradient(colors: [Color(white: 0.32), Color(white: 0.14)], startPoint: .top, endPoint: .bottom)
        case .blue:
            return LinearGradient(
                colors: [Color(red: 0.24, green: 0.50, blue: 0.95), Color(red: 0.10, green: 0.28, blue: 0.70)],
                startPoint: .top, endPoint: .bottom
            )
        }
    }
}

/// A curl bar: straight at the ends with a wave in the middle.
struct EZShaft: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let midY = rect.midY
        let depth = rect.height * 0.42
        let straight = rect.width * 0.16
        let waveStart = rect.minX + straight
        let waveEnd = rect.maxX - straight

        path.move(to: CGPoint(x: rect.minX, y: midY))
        path.addLine(to: CGPoint(x: waveStart, y: midY))
        let steps = 48
        for step in 1...steps {
            let t = CGFloat(step) / CGFloat(steps)
            let x = waveStart + (waveEnd - waveStart) * t
            // One and a half waves, eased to flat at both ends.
            let y = midY + depth * sin(t * .pi * 3) * sin(t * .pi)
            path.addLine(to: CGPoint(x: x, y: y))
        }
        path.addLine(to: CGPoint(x: rect.maxX, y: midY))
        return path
    }
}

// MARK: - Dumbbell

private struct DumbbellScene: View {
    let motion: EquipmentRules.Motion
    let animate: Bool

    var body: some View {
        DumbbellView()
            .offset(y: CGFloat(motion.travel) / 2)
            .modifier(RepMotion(motion: motion, animate: animate))
    }
}

struct DumbbellView: View {
    var body: some View {
        HStack(spacing: -2) {
            head
            Capsule()
                .fill(Color(uiColor: .systemGray2))
                .frame(width: 70, height: 12)
            head
        }
    }

    private var head: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(LinearGradient(colors: [Color(white: 0.34), Color(white: 0.15)], startPoint: .top, endPoint: .bottom))
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .strokeBorder(.white.opacity(0.18), lineWidth: 1.5)
            VStack(spacing: 11) {
                ForEach(0..<3, id: \.self) { _ in
                    Capsule()
                        .fill(.white.opacity(0.08))
                        .frame(height: 2)
                        .padding(.horizontal, 7)
                }
            }
        }
        .frame(width: 34, height: 62)
    }
}

// MARK: - Machine (weight stack)

private struct MachineScene: View {
    let labels: [String]        // top plate first
    let unitLabel: String
    let motion: EquipmentRules.Motion
    let animate: Bool

    private let plateWidth: CGFloat = 104
    private let plateHeight: CGFloat = 12
    private let gap: CGFloat = 2
    private let moving = 4
    private let pulleySize: CGFloat = 20

    private var travel: CGFloat { CGFloat(motion.travel) }
    private var stackHeight: CGFloat { CGFloat(labels.count) * (plateHeight + gap) - gap }
    private var movingHeight: CGFloat { CGFloat(moving) * (plateHeight + gap) - gap }
    /// Where the top of the selected block sits between reps.
    private var restingTop: CGFloat { pulleySize + travel }
    private var sceneHeight: CGFloat { restingTop + stackHeight }

    var body: some View {
        ZStack(alignment: .top) {
            // Guide rods, behind everything.
            HStack(spacing: plateWidth * 0.55) {
                rod
                rod
            }
            .offset(y: pulleySize - 6)

            // Cable from the pulley down to where the block rests. The block covers it as it rises.
            Rectangle()
                .fill(Color(uiColor: .systemGray))
                .frame(width: 3, height: restingTop - pulleySize / 2)
                .offset(y: pulleySize / 2)

            Circle()
                .fill(Color(uiColor: .systemGray3))
                .overlay(Circle().strokeBorder(Color(uiColor: .systemGray), lineWidth: 2))
                .frame(width: pulleySize, height: pulleySize)

            // Plates that stay put.
            VStack(spacing: gap) {
                ForEach(Array(labels.enumerated()), id: \.offset) { index, label in
                    if index >= moving {
                        plate(label, selected: false)
                    }
                }
            }
            .offset(y: restingTop + movingHeight + gap)

            // The selected plates, with the pin, doing the rep.
            VStack(spacing: gap) {
                ForEach(Array(labels.prefix(moving).enumerated()), id: \.offset) { index, label in
                    plate(label, selected: true)
                        .overlay(alignment: .trailing) {
                            if index == moving - 1 {
                                pin
                            }
                        }
                }
            }
            .offset(y: restingTop)
            .modifier(RepMotion(motion: motion, animate: animate))
        }
        .frame(width: plateWidth + 40, height: sceneHeight, alignment: .top)
    }

    private var rod: some View {
        RoundedRectangle(cornerRadius: 1.5)
            .fill(Color(uiColor: .systemGray3))
            .frame(width: 3, height: stackHeight + travel + 6)
    }

    private var pin: some View {
        Capsule()
            .fill(Color.accentColor)
            .frame(width: 22, height: 6)
            .offset(x: 16)
    }

    private func plate(_ label: String, selected: Bool) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(LinearGradient(
                    colors: selected ? [Color(white: 0.44), Color(white: 0.27)] : [Color(white: 0.31), Color(white: 0.16)],
                    startPoint: .top, endPoint: .bottom
                ))
            Text("\(label) \(unitLabel)")
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .foregroundStyle(.white.opacity(0.9))
        }
        .frame(width: plateWidth, height: plateHeight)
    }
}

// MARK: - Bodyweight and other

private struct FigureScene: View {
    let animate: Bool

    var body: some View {
        Image(systemName: "figure.strengthtraining.traditional")
            .font(.system(size: 72, weight: .regular))
            .foregroundStyle(Color.accentColor)
            .symbolEffect(.pulse, options: .repeating, isActive: animate)
    }
}
