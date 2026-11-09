import SwiftUI
import SwiftData

@main
struct LiftLogApp: App {
    init() {
        // Before any screen looks for a video file.
        VideoStore.migrateLegacyFolder()
        // The API key setting is refreshed once LiftLog is on screen (ExerciseListView), not here:
        // iOS can start the app early while the phone is locked, when the Keychain can't be read.
    }

    var body: some Scene {
        WindowGroup {
            ExerciseListView()
        }
        // Everything is stored in a local database on the phone. No account, no cloud.
        .modelContainer(for: [Exercise.self, LiftSet.self])
    }
}
