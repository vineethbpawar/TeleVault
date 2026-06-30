# TeleVault

> **Camera. Memories. Drive.**

TeleVault is a Snapchat-inspired camera, memories, and cloud drive vault app that is completely powered by Telegram's free, unlimited private channel cloud storage. It uses Supabase for lightweight account authentication and metadata storage, meaning no files are hosted on Supabase, allowing you to use the completely free tiers of both services.

---

## Key Features

1. **Snapchat-Inspired Camera:** Full-screen viewport, large circular capture trigger, front/back switching, and flash controls.
2. **Dynamic Live Filters:** Apply overlays like Warm, Cool, Bright, Moody, Vintage, or B&W directly onto your pictures.
3. **Telegram Cloud Storage Bot:** Upload media to a private Telegram channel via your custom bot. Files are stored directly in Telegram's cloud for free, with no storage limits.
4. **Encrypted Security PIN Locks:** Keep your normal Drive or Private Vault secure with optional local 4-digit PIN locks stored in SecureStore.
5. **Dark Mode File Explorer:** A beautiful Google Drive-style file manager for organizing folders and uploading any document (PDFs, docs, text files) directly to Telegram.
6. **Snapchat-Style Memories Grid:** Group public photo/video uploads by Date (Today, Yesterday, This Month, Older) with lazy load details.

---

## Tech Stack & Free Services Used

- **React Native & Expo (v56)** - Mobile application framework
- **TypeScript** - Code type safety
- **React Navigation (v7)** - Main tab & screen navigation
- **Expo Camera** - Device camera access (CameraView API)
- **Expo ImagePicker & DocumentPicker** - Local file system access
- **Expo SecureStore** - Native encrypted storage (for Bot Token, Channel ID, and Vault PIN)
- **Supabase** - Authentication & file/folder metadata DB
- **Telegram Bot API** - Free backend cloud storage host

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
4. Open the **SQL Editor** in the Supabase Dashboard, create a new query, copy the contents of [supabase/schema.sql](file:///home/vini/TeleVault/supabase/schema.sql), and run it. This will create the `profiles`, `folders`, and `files` tables with Row Level Security (RLS) and the automatic user profile trigger.

---

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

## Troubleshooting

- **Expo Camera / Permission Errors:** Ensure you grant camera and gallery permissions when prompted. In emulator runs, you might need to enable virtual camera settings or test on a real device.
- **Telegram Upload Fails:** Double check that your bot is added as an administrator in the private channel, and that the channel ID is entered correctly with the `-100` prefix. Ensure your file size is under 50 MB.
- **Supabase Session Missing:** Ensure `.env` is loaded. If variables are missing, clear cache and restart expo with: `npx expo start -c`.
- **Gradle Compilation Fails:** If you face Gradle compilation issues during `./gradlew assembleDebug`, verify that your `JAVA_HOME` environment variable points to JDK 17.
