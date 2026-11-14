# Rize Buddy for Android

Same Buddy, same dashboard, same data model as the Windows version, packaged as a normal Android app (APK).
The Python backend runs **inside the app** (Chaquopy, Python 3.11 + Flask on 127.0.0.1:8766); the screens are the original web pages shown in a full-screen WebView.

## Get the APK (pick one)

**A. Android Studio (easiest on a PC)**
1. Install Android Studio (it brings the Android SDK and JDK 17).
2. `File > Open` this folder, wait for "Gradle sync" to finish (first time ~5-10 min, it downloads Python packages).
3. Plug in your phone (USB debugging on) or start an emulator, press **Run ▶**. The app installs and opens.
4. To get a file to share: `Build > Build Bundle(s) / APK(s) > Build APK(s)`. It is at `app/build/outputs/apk/debug/app-debug.apk`.

**B. No Android Studio: build it in the cloud with GitHub (free)**
1. Create a new GitHub repository and upload everything in this folder (keep the `.github` folder).
2. Open the **Actions** tab > "Build APK" > wait ~8 min (or press "Run workflow").
3. Open the finished run, download the **RizeBuddy-apk** artifact, unzip, copy `app-debug.apk` to your phone.

**Install on the phone:** open the APK from Files, allow "Install unknown apps" for that file manager when asked, tap Install.

## First run (the app walks you through it)
1. **Usage access** (required): lets Buddy see which app is open. Pick *Rize Buddy* in the list and switch it on.
2. Notifications, microphone, "run in background without limits" (important on Xiaomi/Oppo/Vivo/Samsung/Realme, otherwise the phone may kill tracking), display over other apps (lets Buddy pop up by itself).
3. *Optional* Accessibility: lets Buddy read only the **website address in your browser** and the **YouTube video title**. Without it you still get app-level tracking (Chrome / YouTube / Instagram ...).
4. Open Buddy, ⚙ > paste your OpenRouter / Groq keys, exactly like on Windows.

## What is different on a phone
| Windows | Android |
|---|---|
| Active window + title | Foreground app (Usage access). Site / video title only with the optional Accessibility service |
| Idle = no keyboard/mouse | Idle = screen off or locked |
| Tray icon, pop-up windows, full-screen freeze card | A small "tracking" notification, heads-up notifications, and Buddy opens by itself if "Display over other apps" is allowed |
| Dashboard in a second window | Same window: ☰ > a page opens the dashboard, **Back** returns to Buddy, "🤖 Buddy" button on the dashboard |
| Edge speech recognition | Android's own speech recogniser (mic button) |
| Chatterbox natural voice, Rize Browser, private-window detection | **Not available** (browser voice of the phone is used, 🌐 opens your browser, private tabs are not detected) |
| Start with Windows | Start after reboot (Settings > "Start automatically") |

Your data is in the app's private storage (`files/RizeBuddy/rize-data.json`, with the same rolling backups). Use Settings > Export to save a copy to Downloads. Android also includes it in Google's automatic app backup.

## Honest limits
* Phones sleep. While the screen is off (the app counts that as idle) a goal reminder or timer end may arrive late, when the phone wakes.
* Android does not give window titles, so site/video names depend on the Accessibility service and on the browser's layout; if a browser update renames its address bar, Buddy falls back to the app name.
* Release builds are signed with the debug key so they install by sideloading. For Google Play you need your own keystore.

## Layout
* `app/src/main/python/` backend (tracker.py is the Windows tracker with the Windows parts guarded; **droid.py** swaps them for Android ones; android_entry.py is the entry point)
* `app/src/main/assets/renderer/` the web pages (+ `android.js` / `android.css`: phone layout, voice typing, downloads)
* `app/src/main/java/com/rizebuddy/app/` Kotlin: `Bridge` (foreground app, notifications), `TrackerService`, `MainActivity`, `SetupActivity`, `RizeAccessibilityService`, `BootReceiver`

The Windows original's own documentation is kept in README-windows-original.md (features are the same).
