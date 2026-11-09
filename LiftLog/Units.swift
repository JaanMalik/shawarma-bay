import Foundation

enum WeightUnit: String, CaseIterable, Identifiable {
    case lb
    case kg

    var id: String { rawValue }

    private static let kgPerLb = 0.45359237

    func fromPounds(_ pounds: Double) -> Double { self == .lb ? pounds : pounds * Self.kgPerLb }
    func toPounds(_ value: Double) -> Double { self == .lb ? value : value / Self.kgPerLb }

    /// How much the plus and minus buttons change the weight.
    var step: Double { self == .lb ? 5 : 2.5 }

    /// Formats a weight stored in pounds in this unit, e.g. "225 lb" or "102.1 kg".
    func format(_ pounds: Double, showUnit: Bool = true) -> String {
        let text = Self.plain(fromPounds(pounds))
        return showUnit ? "\(text) \(rawValue)" : text
    }

    /// A number with at most one decimal and no thousands separator, so it can be parsed back.
    static func plain(_ value: Double) -> String {
        let rounded = (value * 10).rounded() / 10
        return rounded.formatted(.number.precision(.fractionLength(0...1)).grouping(.never))
    }

    static func parse(_ text: String) -> Double? {
        Double(text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "."))
    }
}

enum SettingsKey {
    static let unit = "weightUnit"
    static let formula = "oneRepMaxFormula"
    static let maxEstimateReps = "maxEstimateReps"
    static let didSeed = "didSeedExercises"
    /// Whether an Anthropic API key is saved for form checks. The key itself is in the Keychain.
    static let hasAPIKey = "hasAnthropicAPIKey"
}
