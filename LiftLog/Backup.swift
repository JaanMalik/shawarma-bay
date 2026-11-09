import Foundation
import SwiftData
import CoreTransferable
import UniformTypeIdentifiers

struct BackupFile: Codable {
    var app: String
    var version: Int
    var exportedAt: Date
    var exercises: [ExerciseBackup]
}

struct ExerciseBackup: Codable {
    var id: UUID
    var name: String
    var category: String
    var equipment: String
    var weightNote: String
    var sortOrder: Int
    var isArchived: Bool
    var sets: [SetBackup]
}

struct SetBackup: Codable {
    var id: UUID
    var date: Date
    var weightLb: Double
    var reps: Int
    var note: String
    /// Name of the set's video in the app's Videos folder. The video itself isn't in the backup.
    /// Optional, so backups from the first version still restore.
    var videoFileName: String?
    /// The set's form check, as saved in the app (see FormCheck). Optional, for older backups.
    var formCheckJSON: String?
}

struct BackupExport: Transferable {
    let data: Data
    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .json) { $0.data }
            .suggestedFileName("LiftLog-backup.json")
    }
}

struct CSVExport: Transferable {
    let text: String
    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .commaSeparatedText) { Data($0.text.utf8) }
            .suggestedFileName("LiftLog-sets.csv")
    }
}

enum Backup {
    static func jsonData(from exercises: [Exercise]) throws -> Data {
        let file = BackupFile(
            app: "LiftLog",
            version: 1,
            exportedAt: Date(),
            exercises: exercises.map { ex in
                ExerciseBackup(
                    id: ex.id,
                    name: ex.name,
                    category: ex.categoryRaw,
                    equipment: ex.equipmentRaw,
                    weightNote: ex.weightNote,
                    sortOrder: ex.sortOrder,
                    isArchived: ex.isArchived,
                    sets: ex.sets.sorted { $0.date < $1.date }.map {
                        SetBackup(id: $0.id, date: $0.date, weightLb: $0.weight, reps: $0.reps, note: $0.note,
                                  videoFileName: $0.videoFileName, formCheckJSON: $0.formCheck?.encoded())
                    }
                )
            }
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(file)
    }

    static func csv(from exercises: [Exercise], unit: WeightUnit) -> String {
        let formatter = ISO8601DateFormatter()
        var lines = ["date,exercise,weight_\(unit.rawValue),reps,note,has_video,form_check"]
        for ex in exercises {
            for s in ex.sets.sorted(by: { $0.date < $1.date }) {
                lines.append([
                    formatter.string(from: s.date),
                    quote(ex.name),
                    unit.format(s.weight, showUnit: false),
                    String(s.reps),
                    quote(s.note),
                    s.videoFileName == nil ? "no" : "yes",
                    quote(formCheckText(s.formCheck)),
                ].joined(separator: ","))
            }
        }
        return lines.joined(separator: "\n")
    }

    /// "Good form 8/10", "measured" for the phone's measurements only, or empty.
    private static func formCheckText(_ check: FormCheck?) -> String {
        guard let check else { return "" }
        guard let feedback = check.feedback else { return "measured" }
        return "\(feedback.verdict.title) \(feedback.clampedScore)/10"
    }

    private static func quote(_ s: String) -> String {
        "\"" + s.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }

    /// Adds exercises and sets from a backup that aren't already in the app. Never deletes.
    static func restore(from data: Data, into context: ModelContext, existing: [Exercise]) throws -> (exercises: Int, sets: Int, videos: Int) {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let file = try decoder.decode(BackupFile.self, from: data)

        var known = existing
        var seenSetIDs = Set(existing.flatMap { $0.sets.map(\.id) })
        let existingSets = Dictionary(existing.flatMap(\.sets).map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        var nextOrder = (existing.map(\.sortOrder).max() ?? -1) + 1
        var addedExercises = 0
        var addedSets = 0
        var relinkedVideos = 0

        for item in file.exercises {
            let target: Exercise
            if let match = known.first(where: { $0.id == item.id || $0.name.caseInsensitiveCompare(item.name) == .orderedSame }) {
                target = match
            } else {
                let ex = Exercise(
                    name: item.name,
                    category: ExerciseCategory(rawValue: item.category) ?? .other,
                    equipment: Equipment(rawValue: item.equipment) ?? .other,
                    weightNote: item.weightNote,
                    sortOrder: nextOrder
                )
                ex.id = item.id
                ex.isArchived = item.isArchived
                nextOrder += 1
                context.insert(ex)
                known.append(ex)
                addedExercises += 1
                target = ex
            }

            // Sets already in the app: put back a video link that was lost, if the clip is on the phone,
            // and the form check of that video if the set has none.
            for s in item.sets {
                guard let current = existingSets[s.id] else { continue }
                if current.videoFileName == nil, VideoStore.exists(s.videoFileName) {
                    current.videoFileName = s.videoFileName
                    relinkedVideos += 1
                }
                if current.formCheckJSON == nil, let check = formCheck(from: s), check.videoFileName == current.videoFileName {
                    current.formCheck = check
                }
            }

            for s in item.sets where !seenSetIDs.contains(s.id) {
                let set = LiftSet(date: s.date, weight: s.weightLb, reps: s.reps, note: s.note)
                set.id = s.id
                // Keep the video link even if the clip isn't on this phone yet: once it's copied back
                // into LiftLog's Videos folder it shows up again. Until then the set shows "Video missing".
                if VideoStore.isSafeName(s.videoFileName) {
                    set.videoFileName = s.videoFileName
                    if let check = formCheck(from: s), check.videoFileName == s.videoFileName {
                        set.formCheck = check
                    }
                }
                context.insert(set)
                target.sets.append(set)
                seenSetIDs.insert(s.id)
                addedSets += 1
            }
        }
        try context.save()
        return (addedExercises, addedSets, relinkedVideos)
    }

    private static func formCheck(from backup: SetBackup) -> FormCheck? {
        backup.formCheckJSON.flatMap(FormCheck.decode)
    }
}
