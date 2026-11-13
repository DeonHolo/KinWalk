# KinWalk — Android phone app

An original, personal fitness tracker made for Kin. This is an Android app with
an offline WebView interface and a native phone step-counter bridge. Android
Studio or the included GitHub Actions workflow can compile it into an APK.

## Run the interface locally

On Windows, double-click `Preview-KinWalk.cmd` (requires Python 3). It opens
`http://127.0.0.1:4173` and serves the same interface bundled in the Android app.
Leave the terminal open while using it; press **Ctrl+C** to stop it.

Or, from this project's directory on any system with Python 3:

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory app/src/main/assets
```

Food, water, progress, settings and backups work in this preview. Phone step
counting requires the Android app and an actual compatible sensor. Browser and
Android data remain separate; move tracker records with export/import.

## Run regression tests

With Node.js 22 or later, run:

```sh
node --test tests/tracker.test.cjs
```

The tests cover backup validation, older backup compatibility, night-shift date
boundaries, native setting synchronization, data reset, input validation, safe
exports and Walk Garden updates. CI runs these tests before building and linting
the Android app.

## Features

- Daily food/calorie, water, and one-sugary-drink-swap tracking.
- Weight chart, waist/hips measurements, symptoms, and energy journal.
- Adjustable tracking-day cutoff for night shifts (defaults to 10 AM).
- **Walk Garden**: a playful original Sproutling grows from step milestones.
- Real Android **TYPE_STEP_COUNTER** sensor (not GPS). Asks for Android's
  Physical activity permission only after the user acknowledges that a
  clinician has specifically cleared walking.
- Entirely local storage and backups; no account or internet required.
- Android document picker for backup export and import.

## Safety

The user's reported exertional chest pressure, repeated unexplained trips/falls,
and extreme fatigue need a **prompt medical assessment before starting gym
workouts or walking challenges**. Walk Garden stays locked until the user
explicitly confirms that a clinician assessed these symptoms and cleared walking.
This is self-reported, not verified. Stop activity and seek medical help if
concerning symptoms occur; active chest pain can be an emergency.

## Build an APK with Android Studio

1. Install a current Android Studio (with Android SDK Platform 35 and JDK 17).
2. Extract this ZIP, and open the `kinwalk-android` folder as a project.
3. Let Android Studio install/sync Android Gradle Plugin 8.7.3 and Gradle 8.9.
4. Choose **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
5. Find the result at `app/build/outputs/apk/debug/app-debug.apk`.
6. Transfer that APK to your Android phone and install it by allowing
   installation from the app you opened the APK with, if Android prompts you.
   Only install an APK you built yourself or trust.

## Build an APK without Android Studio: GitHub Actions

1. Upload the **contents** of the `kinwalk-android` folder to a private GitHub
   repository (the project files, not an extra nested directory).
2. Open **Actions > Build Android APK > Run workflow**.
3. After it finishes, download the **KinWalk-Android-Debug-APK** artifact.
4. Unzip the artifact, transfer `app-debug.apk` to your phone and install it.
   This debug APK is for personal testing, not Play Store distribution.

The workflow explicitly requests `platform-tools`, `platforms;android-35` and
`build-tools;35.0.0`. This avoids setup-android v3's default request for the
removed legacy `tools` package, which causes `Failed to find package 'tools'`
before the app can compile. Pull requests also run the build and tests.

## Using the step sensor

On the phone, after medical clearance, open **Walk Garden**, check the
clearance statement, tap **Enable phone step counting**, and allow **Physical
activity**. The app will read the phone's step counter on open and while open.

There are limitations:

- Not all phones have the needed step sensor.
- Before the first reading, historical steps are unknown and are not counted.
- The OS step sensor is cumulative since the last boot. Steps taken when the
  app is closed can often be included on reopening, but if the tracking-day
  cutoff happens while closed, those later steps may be assigned to the day of
  reopening rather than their actual day.
- Reboots reset the OS counter; the app detects this and establishes a new baseline.
- No GPS, route map, background service, health cloud sync, or AI recognition
  is part of this first version.

## Keeping old tracker data

The prior standalone HTML file and this Android app do **not** share storage
automatically. In your older tracker, use **Settings > Export backup**. Then
in KinWalk on Android, use **Settings > Restore a backup** and select that JSON
file. Export a new backup periodically; deleting the app can delete its data.

The app stores all records locally on this device. Settings > Erase all saved
data resets food, water, weight, symptoms, habits, settings and native step
history. It also disables walking tracking until enabled again. Restoring a
backup updates the native cutoff and walking settings immediately. Backups
contain tracker records and settings; they do not contain native step history.

## Technical details

- Java Android Activity (minimum SDK 26, target SDK 35).
- Android System WebView to render a bundled, offline app UI.
- A narrow JavaScript bridge for step count, sensor permission, tracking-day
  cutoff and file-save picker.
- No `INTERNET`, location, camera, or external storage permission.
- `ACTIVITY_RECOGNITION` is the only runtime permission.

Local validation: regression tests pass, Java compiles against Android SDK 35,
and a debug APK was packaged with the installed SDK tools and its signature
verified. The standard Gradle build and Android lint could not run here because
the environment blocks Gradle's local daemon connection. Physical phone sensor
behavior and Android 15 insets still require a device or emulator check.
