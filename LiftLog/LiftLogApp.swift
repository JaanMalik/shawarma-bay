import SwiftUI
import SwiftData

@main
struct LiftLogApp: App {
    var body: some Scene {
        WindowGroup {
            ExerciseListView()
        }
        // Everything is stored in a local database on the phone. No account, no cloud.
        .modelContainer(for: [Exercise.self, LiftSet.self])
    }
}
