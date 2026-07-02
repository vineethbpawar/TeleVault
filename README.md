# TeleVault

> **Camera. Memories. Drive.**

**Version:** v2.0 Beta  
**Developer:** Vineeth B. Pawar ([GitHub](https://github.com/vineethbpawar))

TeleVault is a Snapchat-inspired camera, memories, and cloud drive vault app that is completely powered by Telegram's free, unlimited private channel cloud storage. It uses Supabase for lightweight account authentication and metadata storage, meaning no files are hosted on Supabase, allowing you to use the completely free tiers of both services.

### Custom Branding & Logo
This version introduces the official, custom-designed TeleVault logo. Designed as a lightweight, scalable React Native vector component (`src/components/TeleVaultLogo.tsx`), the logo features a sleek rounded vault/safe box outline, a circular vault dial, and the letter "T" integrated inside the vault, accented with a golden-yellow theme on a dark navy background. It is featured in the Splash, Login, Signup, Settings, and About developer sections.

---

## Key Features

1. **Snapchat-Inspired Camera & Video Capture:** Take pictures by tapping the capture trigger, or hold/long-press it to record video (default 30 seconds limit). Shows a live red recording indicator and countdown timer (`00:05` style). Includes front/back switching, flash toggling, and gallery picker.
2. **Camera Timer Controls:** Select a countdown timer (Off, 3s, 5s, 10s) to delay photo capture or video recording with a big visual indicator in the center of the camera viewport.
3. **Snapchat-style Lens & Overlay System:** Add overlays to your media on the Preview screen, including Time (`08:11 PM`), Date (`30 Jun 2026`), combined Time & Date, Location coordinates or geocoded address, floating emojis (😎, 😂, ❤️, 🔥, etc.), and sticker filters (Crown, Sunglasses, Heart Eyes, Fire) that can be dragged and repositioned directly on the screen.
4. **Photo Optimization:** Automatically resizes and compresses captured images (down to 1600px width and 75% quality) to speed up cloud upload times without losing quality (can be toggled in settings).
5. **Robust Background Upload Queue:** Media captures and Explorer uploads are sent to a local persistent queue. It uploads files sequentially, updates staged progress bars in the UI (Preparing -> Uploading -> Saving Metadata), and automatically resumes any pending/failed syncs when the app opens or returns to the foreground. Includes background synchronization support for Android using Expo Background Tasks and Task Manager.
6. **Large File Mode (Chunked Uploads):** Supports files larger than the 50 MB normal Telegram Bot API limit by splitting them into smaller parts (45 MB chunks) and uploading them to Telegram sequentially. Files between 50 MB and 500 MB are supported. The app saves chunk metadata in Supabase, tracks individual chunk statuses, supports cancelling ongoing uploads, and resumes failed uploads by skipping chunks already uploaded.
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
- **Large File Mode Chunking:** Files over 50 MB and up to 500 MB are split into 45 MB chunks and uploaded as Telegram documents. Supabase indexes the chunk order and Telegram message/file IDs.
- **Download & Rebuild:** On-device downloading and merging of chunks is currently in beta. For full 2 GB uploads without client-side chunking, a future roadmap option is connecting to a self-hosted Telegram Bot API server.

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

---

---

## Upgrades in TeleVault v2.2.0 (Bug-Fix Release)

This update resolves critical user loops, credentials data persistence, and upload routing issues:

1. **Simple Practical Logo & Launcher Icon:** Replaced the logo with a clean, high-readability vault storage symbol with a small letter "T" centered inside it. The launcher icons (`assets/icon.png`, `assets/adaptive-icon.png`, and `assets/splash-icon.png`) have been updated to matches this style on a solid `#0B0E1B` dark navy background.
2. **Setup Loop Resolved:** Users completing their profile setup (username and full name) will transition to the main app dashboard immediately upon clicking "Get Started" without requiring a manual app reload.
3. **Persisted Telegram Configurations:** Added a `telegram_configs` table in Supabase to sync and back up Telegram Bot Tokens and Channel IDs. If the user uninstalls and reinstalls the app, they can instantly sync/restore their keys from Settings. Added credentials masking in the settings subtitle.
4. **Instantly Synchronized Chats:** Fixed subscription configurations so that message read receipts and snap "Opened" status changes update instantly for both sender and receiver without polling delays.
5. **Cleaned Chat UI:** Enhanced the chat layout with text-profile avatars, balanced messaging bubbles, and a proper KeyboardAvoidingView offset.
6. **Automatic Chunk Routing:** The upload queue runner now dynamically reads the actual file size from the disk prior to upload. If a file/video is 50 MB - 500 MB, it automatically routes it to chunk uploading (45 MB splits) even if the picker size metadata returned 0. Files over 500 MB are blocked.
7. **Cleaned Snap Inbox:** Direct snaps in the inbox are structured cleanly, separating new vs. opened snaps with visual badges.

---

## Upgrades in TeleVault v2.1.0 (Fix and Polish Update)

This update focuses on performance, speed perception, and media capabilities:

1. **Robust Realtime Messaging:** Realtime chat is powered by Supabase Realtime Channels. It automatically falls back to 5-second polling if connection drops, implements optimistic UI for instant message display, and updates conversation previews instantly.
2. **Staged Upload Progress:** Displays detailed stage feedback: Queued -> Preparing -> Optimizing -> Uploading -> Saving Metadata -> Completed. Shows warning labels for large videos and upload modes (Normal vs. Chunked) for documents.
3. **Upload Concurrency Settings:** Choose between `Stable` (1 concurrent upload) and `Fast` (2 concurrent normal uploads) under Settings. Chunked uploads remain sequential for reliability.
4. **Real Chunk Manager:** Manage large chunked files (50 MB - 500 MB) split into 45 MB chunks. The Chunk Manager Screen allows you to monitor parts, view chunk logs, resume uploading, retry failed chunks, and delete metadata.
5. **Natively Embedded MP4 Player:** Natively stream or play MP4 videos from Snap Viewer, Preview, and File Details screens using the native `expo-video` SDK module.
6. **Universal Document Viewer:** Download PDF, Office, ZIP, and text files to cache, then open or share them externally using native `expo-sharing` sheets.
7. **Telegram file URL / Download Helpers:** Securely query Telegram `getFile` endpoints and construct short-lived file download URLs without exposing bot tokens.

---

## Realtime Messaging Database Migration (Required)

To use realtime chat, you MUST enable Supabase Realtime on the corresponding public tables. Run the contents of [supabase/migration_realtime_fix.sql](file:///home/vini/TeleVault/supabase/migration_realtime_fix.sql) in the **Supabase SQL Editor**.

This query adds the following tables to the `supabase_realtime` publication:
- `chat_messages`
- `conversations`
- `notifications`
- `snaps`
- `group_messages`

It also locks down RLS policies so conversations, messages, and notifications are only readable by their respective owners or participants.

---

## Android APK Production Builds

To compile local native APKs of your TeleVault app:

1. **Prebuild Native Folders:**
   Ensure your local system has Java Development Kit (JDK 17) and Android SDK configured, then prebuild the Android folders:
   ```bash
   npx expo prebuild
   ```

2. **Compile Debug APK:**
   ```bash
   cd android
   ./gradlew assembleDebug
   ```
   *APK Location:* `android/app/build/outputs/apk/debug/app-debug.apk`

3. **Compile Release APK:**
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
   *APK Location:* `android/app/build/outputs/apk/release/app-release.apk` (unsigned) or `app-release-signed.apk` if keystore is configured.

---

## Troubleshooting

- **Realtime Chat Preview Not Updating:** Make sure you ran the `migration_realtime_fix.sql` script to enable postgres replication on your tables. If replication is disabled, Chat List and Room will automatically fallback to 5-second polling.
- **Telegram Upload Fails:** Double check that your bot is added as an administrator in the private channel, and that the channel ID is entered correctly with the `-100` prefix. Ensure your normal file size is under 50 MB (or use Large File Mode up to 500 MB).
- **Video Playback Error:** Make sure native player dependencies are compiled correctly. If testing on emulator, verify that H.264/MP4 hardware decoding is supported.
- **Biometric Unlock Inoperative:** Biometrics toggling is enabled only after setting a local app security PIN. Verify your physical device supports biometrics and has enrolled fingerprints or face data.


