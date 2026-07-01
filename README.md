# TeleVault

> **Camera. Memories. Drive.**

TeleVault is a Snapchat-inspired camera, memories, and cloud drive vault app that is completely powered by Telegram's free, unlimited private channel cloud storage. It uses Supabase for lightweight account authentication and metadata storage, meaning no files are hosted on Supabase, allowing you to use the completely free tiers of both services.

---

## Key Features

1. **Snapchat-Inspired Camera & Video Capture:** Take pictures by tapping the capture trigger, or hold/long-press it to record video (default 30 seconds limit). Shows a live red recording indicator and countdown timer (`00:05` style). Includes front/back switching, flash toggling, and gallery picker.
2. **Camera Timer Controls:** Select a countdown timer (Off, 3s, 5s, 10s) to delay photo capture or video recording with a big visual indicator in the center of the camera viewport.
3. **Snapchat-style Lens & Overlay System:** Add overlays to your media on the Preview screen, including Time (`08:11 PM`), Date (`30 Jun 2026`), combined Time & Date, Location coordinates or geocoded address, floating emojis (😎, 😂, ❤️, 🔥, etc.), and sticker filters (Crown, Sunglasses, Heart Eyes, Fire) that can be dragged and repositioned directly on the screen.
4. **Photo Optimization:** Automatically resizes and compresses captured images (down to 1600px width and 75% quality) to speed up cloud upload times without losing quality (can be toggled in settings).
5. **Robust Background Upload Queue:** Media captures and Explorer uploads are sent to a local persistent queue. It uploads files sequentially, updates staged progress bars in the UI (Preparing -> Uploading -> Saving Metadata), and automatically resumes any pending/failed syncs when the app opens or returns to the foreground. Includes background synchronization support for Android using Expo Background Tasks and Task Manager.
6. **Strict 50 MB Upload Limits:** Since Telegram's Bot API limits uploads to 50 MB, the app automatically checks sizes and safely blocks oversized files, warning the user before initiating failed requests.
7. **Telegram Cloud Storage Bot:** Upload media to a private Telegram channel via your custom bot. Files are stored directly in Telegram's cloud for free, with no storage limits.
8. **Encrypted Security PIN Locks:** Keep your normal Drive or Private Vault secure with optional local 4-digit PIN locks stored in SecureStore.
9. **Dark Mode File Explorer:** A beautiful Google Drive-style file manager for organizing folders and uploading any document (PDFs, docs, text files) directly to Telegram.
10. **Snapchat-Style Memories Grid:** Group public photo/video uploads by Date (Today, Yesterday, This Month, Older) with lazy load details.
11. **Username System:** Required upon login/signup if missing. Enforces lowercase only, alphanumeric + underscores, 3-20 characters, and uniqueness checking. Supports editing in Settings.
12. **User Search:** Search other profiles by @username or full name, starting a chat or sending direct snaps right away.
13. **Realtime In-App Chat:** Instant messaging built on Supabase postgres realtime channels, displaying messages and interactive snap cards.
14. **Telegram Chat Backup Logs:** Copies every chat message to your private Telegram channel as secure logs.
15. **View-Once Snaps:** Sends photos and videos that immediately hide inside the app after the receiver views them.
16. **24-Hour Stories:** Post photo/video stories that auto-expire and disappear from the app after 24 hours, including view counters for your own stories.

---

## Tech Stack & Free Services Used

- **React Native & Expo (v56)** - Mobile application framework
- **TypeScript** - Code type safety
- **React Navigation (v7)** - Main tab & screen navigation
- **Expo Camera** - Device camera access (CameraView API)
- **Expo ImagePicker & DocumentPicker** - Local file system access
- **Expo SecureStore** - Native encrypted storage (for Bot Token, Channel ID, and Vault PIN)
- **Supabase & Postgres Realtime** - Authentication, message sync, and file/folder metadata DB
- **Telegram Bot API** - Free backend cloud storage host and chat logger

---

## Installation

To set up the project dependencies, run:

```bash
npm install
```

---

## Local Development

Start the Expo bundler:

```bash
npx expo start
```

Use Expo Go on your physical Android/iOS device or run on an emulator by pressing `a` (Android) or `i` (iOS).

---

## Supabase Database Setup

1. Create a free project at [supabase.com](https://supabase.com).
2. Copy your **Project URL** and **API Anon Key**.
3. Create a `.env` file in the root folder (using `.env.example` as a template):
   ```env
   EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
4. Open the **SQL Editor** in the Supabase Dashboard:
   - Create a new query, copy the contents of [supabase/schema.sql](file:///home/vini/TeleVault/supabase/schema.sql), and run it. This sets up the core accounts, files, and folders tables.
   - Create a second query, copy the contents of [supabase/migration.sql](file:///home/vini/TeleVault/supabase/migration.sql), and run it. This configures the username updates, conversations, messages, snaps, story views, and RLS policies.

---

## MVP Privacy & Technical Limitations

- **View-Once Snaps / Story Expiry:** Hides viewed snaps and expired stories inside the app. However, the original files are not deleted from the backing private Telegram channel logs automatically. Do not falsely assume snaps are permanently destroyed on Telegram.
- **Bot API Database Limitations:** The Telegram Bot API cannot query past channel messages reliably to serve as an in-app database. Therefore, Supabase is used to index message history and power realtime updates, while Telegram holds the backing media files and chat logs copy.
- **Security features:** End-to-end encryption (E2EE), screenshot prevention/detection, and auto-purging Telegram backups are not supported in the MVP and can be added later.

## Telegram Private Cloud Storage Setup

1. **Create a Bot:**
   - Search for `@BotFather` in Telegram.
   - Send `/newbot`, name your bot, and copy the **HTTP API Bot Token**.
2. **Create a Channel:**
   - Create a new **Private Channel** in Telegram.
   - Go to Channel Settings -> Administrators -> Add Admin -> search for your bot and add it.
3. **Get Channel ID:**
   - Send any test message in your channel, then forward that message to `@JsonDumpBot` or `@ShowJsonBot`.
   - Copy the channel ID from the JSON reply (it will be a large negative number, e.g., `-1001234567890`).
4. **Connect the App:**
   - Log into TeleVault, go to **Settings** -> **Telegram Configuration**, paste your Bot Token and Channel ID, then tap **Test Connection** followed by **Save & Sync**.

---

## Android APK Production Build

To compile a local native debug/release APK of your TeleVault app, follow these steps:

1. **Prebuild Native Folders:**
   Ensure your local system has Java Development Kit (JDK 17) and Android SDK configured, then prebuild the Android folders:
   ```bash
   npx expo prebuild
   ```
   *Note: Select Android when prompted.*

2. **Compile the APK:**
   Navigate to the android directory and assemble the build:
   ```bash
   cd android
   ./gradlew assembleDebug
   ```

3. **APK Location:**
   Once compilation completes, the working APK will be located at:
   `android/app/build/outputs/apk/debug/app-debug.apk`

4. **Install APK to Device:**
   Connect your physical phone with USB debugging enabled, or boot up an emulator, and run:
   ```bash
   adb install android/app/build/outputs/apk/debug/app-debug.apk
   ```

---

## Upgrades in TeleVault v2.0.0 (Secure Social Upgrade)

This release implements a modular, high-stability social and safety feature suite:

1. **Friends System:** Bidirectional friendships, requests manager panel, direct snaps and chats restricted to friends by default.
2. **Abuse & Block Controls:** Instantly block abusive users (automatically severing friendships and removing them from search results, chats, and stories) or submit reports which sync directly to the safety metrics dashboard.
3. **Realtime Group Chats:** Multi-user group chatrooms with group message history and disappearing group snaps.
4. **Camera Media Editor:**
   - Freehand sketch tools with full color selection.
   - Text overlays with color selectors.
   - Draggable widget stickers: Location, Clock, Weather status, Music track banner, Poll polls, and Question prompts.
   - Fast image rotation transforms and Gaussian blur overlays.
5. **Backups & Export Manager:**
   - Export chats as `.txt` log books.
   - Export messages, Cloud Drive index lists, memories catalog, and profile metadata as `.json` files.
   - Uses `expo-sharing` to share backups straight to other devices.
6. **Admin Dashboard:** Access reports log, user roster, and real-time statistics (only accessible to users with the 'admin' role).

---

## App Size & APK Reduction Guidelines (Part 12)

To keep the release APK footprint as small as possible:
1. **Zero Native Libraries:** We implemented the custom canvas editor, sticker tools, and exports utilizing zero-dependency React Native components and standard SDK modules, saving megabytes of binary bloating.
2. **Asset Optimization:** Compress any local static icons/images before compiling release bundles.
3. **Proguard Shrinking:** In `android/app/build.gradle`, set `minifyEnabled true` and `shrinkResources true` to strip unused code segments and classes during `./gradlew assembleRelease`.
4. **Dependency Pruning:** Run `npm prune --production` to clear devDependencies before bundling code.

---

## Troubleshooting

- **Expo Camera / Permission Errors:** Ensure you grant camera and gallery permissions when prompted. In emulator runs, you might need to enable virtual camera settings or test on a real device.
- **Telegram Upload Fails:** Double check that your bot is added as an administrator in the private channel, and that the channel ID is entered correctly with the `-100` prefix. Ensure your file size is under 50 MB.
- **Supabase Session Missing:** Ensure `.env` is loaded. If variables are missing, clear cache and restart expo with: `npx expo start -c`.
- **Gradle Compilation Fails:** If you face Gradle compilation issues during `./gradlew assembleDebug`, verify that your `JAVA_HOME` environment variable points to JDK 17.
- **Biometric Unlock Inoperative:** Biometrics toggling is enabled only after setting a local app security PIN. Verify your physical device supports biometrics and has enrolled fingerprints or face data.

