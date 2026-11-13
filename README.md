# KinWalk — Android phone app

An original, personal fitness tracker made for Kin. The **APK is not included**
in this source package because the current workspace lacks the Android SDK and
Gradle build tools. This is an actual Android app project, rather than a browser
shortcut. Android Studio (or the included GitHub Actions workflow) can compile
it into an APK.

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
data resets food, water, weight and symptom entries, but native step count
records are stored separately in Android app preferences and are cleared by
uninstalling/clearing the app's data.

## Technical details

- Java Android Activity (minimum SDK 26, target SDK 35).
- Android System WebView to render a bundled, offline app UI.
- A narrow JavaScript bridge for step count, sensor permission, tracking-day
  cutoff and file-save picker.
- No `INTERNET`, location, camera, or external storage permission.
- `ACTIVITY_RECOGNITION` is the only runtime permission.

No real APK build or phone hardware test was possible in this environment.
