import SwiftUI
import SwiftData

@main
struct LiftLogApp: App {
    init() {
        // Before any screen looks for a video file.
        VideoStore.migrateLegacyFolder()
        APIKeyStore.refreshFlag()
    }

    var body: some Scene {
        WindowGroup {
            ExerciseListView()
        }
        // Everything is stored in a local database on the phone. No account, no cloud.
        .modelContainer(for: [Exercise.self, LiftSet.self])
    }
}
