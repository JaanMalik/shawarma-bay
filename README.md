# LiftLog

A personal iPhone app for tracking weightlifting PRs. Everything is stored on the phone in a local
database. No account, no cloud, no ads.

## What it does

- Starts with your lifts: Squat, Leg Press, Calf Raise, Deadlift, Bent-Over Row, Bench Press,
  Incline Press, Decline Press, Military Press, Preacher Curl, Single-Arm Dumbbell Curl and
  Underhand Dumbbell Triceps Extension. Add more with the **+** button.
- Log a set (weight, reps, date, note) in a few taps. It pre-fills your last weight and reps and
  shows "to beat" numbers and whether the set will be a PR before you save.
- Celebrates PRs with a trophy screen and a haptic tap.
- Per lift: estimated 1RM, heaviest set, a chart of estimated 1RM over time, a rep-max table
  (1 to 12 reps) and full history with PR badges. Tap a set to edit it, swipe to delete.
- Videos: attach a clip from Photos to any set (PR or not) when you log or edit it. Sets with
  a video show a thumbnail in the history; tap it to play or share. Clips are copied into the
  app, so deleting them from Photos doesn't remove them.
- Equipment picture: the top of each exercise shows an animated picture of its equipment doing
  slow reps. Barbell lifts show a bar with a 45 lb plate on each side (a 20 kg plate when the
  unit is kg), the preacher curl shows a curl bar, dumbbell lifts show a dumbbell, and machine
  or cable lifts show a weight stack. It follows the Equipment you pick for the exercise, and
  holds still when Reduce Motion is on.
- Settings: lb or kg, Epley or Brzycki formula, how many reps count toward the estimate,
  JSON backup and restore, CSV export, and how much space videos use.

## How PRs are counted

- **Rep max (nRM):** the heaviest weight lifted for *at least* n reps. A set of 225 x 5 is also
  your 3-rep max until you lift more than 225 for 3 or more reps.
- **Estimated 1RM:** a single counts as-is. Other sets use Epley (`w x (1 + reps/30)`) or Brzycki
  (`w x 36 / (37 - reps)`). Sets over 10 reps are left out by default (change in Settings).
- **Heaviest:** the most weight ever moved for any reps.
- A tie is not a PR. The first set of a lift is a baseline, not a PR.
- History badges show which PRs each set broke **at the time** it was done.

Weights are stored in pounds and converted for display, so switching units never changes your data.

## Where videos are kept

Videos are stored in the app's own folder on the phone, never uploaded. You can see and copy
them in the Files app under **On My iPhone > LiftLog > Videos**, or in Finder on your Mac with
the phone plugged in. The JSON backup remembers which set has which video but doesn't contain
the video files. To move to a new phone, copy the Videos folder over and restore the backup, in
either order. Deleting a set, or an exercise, deletes its videos (a set with a video asks first).

## Install on your iPhone (free Apple ID)

You need a Mac with Xcode. A paid developer account is not needed.

1. Install **Xcode** from the Mac App Store (use the latest version, so it supports the iOS
   version on your phone). Open it once and let it install its components.
2. In Xcode: **Settings > Accounts > +**, choose **Apple ID** and sign in.
3. Open `LiftLog.xcodeproj` (double-click it).
4. In the left sidebar click **LiftLog** (blue icon), then the **LiftLog** target, then
   **Signing & Capabilities**. Tick **Automatically manage signing** and set **Team** to
   *Your Name (Personal Team)*. If Xcode says the bundle identifier is taken, change
   `com.jaanmalik.liftlog` to something unique like `com.jaanmalik.liftlog2`.
5. Plug your iPhone into the Mac with a cable. Unlock it and tap **Trust**.
6. On the iPhone turn on **Developer Mode**: **Settings > Privacy & Security > Developer Mode**,
   switch it on and let the phone restart. (The option appears after the phone has been
   connected to Xcode once.)
7. In Xcode's top bar, pick your iPhone as the run destination, then press **Run** (the play
   button, or Cmd+R).
8. The first time, the phone may say "Untrusted Developer". Go to **Settings > General >
   VPN & Device Management**, tap your Apple ID and tap **Trust**. Then open LiftLog.

### Things to know with a free Apple ID

- The install is valid for **7 days**. After that the app won't open until you plug in (or use
  Wi-Fi, see below) and press **Run** in Xcode again. **Your data is kept** when you do this.
- **Don't delete the app** from your phone. Deleting it deletes its data. Export a backup from
  Settings now and then just in case.
- To reinstall over Wi-Fi: with the phone plugged in once, open **Window > Devices and
  Simulators**, select the phone and tick **Connect via network**.
- The $99/year Apple Developer Program makes installs last a year and allows TestFlight.

## Project layout

```
LiftLog.xcodeproj         Xcode project (Xcode 16 or newer)
LiftLog/                  App source. Xcode picks up any file added here automatically.
  LiftLogApp.swift        App entry and local database setup (SwiftData)
  Models.swift            Exercise and LiftSet (a set can have a video)
  ExerciseTypes.swift     Muscle groups and equipment
  EquipmentRules.swift    Which picture each exercise gets and how it moves (no UI code)
  VideoStore.swift        Saving, naming and deleting set videos
  PRCalculator.swift      All PR math (no UI code)
  SeedData.swift          Starting exercises
  Units.swift             lb/kg and settings keys
  Backup.swift            JSON backup/restore and CSV export
  Views/                  Screens
Checks/main.swift         Checks for the PR math and equipment rules
```

Run the PR math checks on a Mac:

```
swiftc LiftLog/PRCalculator.swift LiftLog/Units.swift LiftLog/ExerciseTypes.swift LiftLog/EquipmentRules.swift Checks/main.swift -o /tmp/prchecks && /tmp/prchecks
```

Requires iOS 17 or newer.
