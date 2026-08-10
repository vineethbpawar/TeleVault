# MARKETING_RECORDING_SETUP.md

This document guides you through setting up the recording environment for capturing high-quality marketing footage of the TeleVault application.

---

## 🛠️ Recording Setup Guidelines

### 1. Device Setup

#### A. Android Recording
* **Aspect Ratio:** 9:16 vertical (1080 × 1920) or 16:9 horizontal depending on ad format. 9:16 is recommended for Reels/Shorts/TikTok.
* **Framerate:** 60 FPS (for fluid scrolling transitions).
* **Display Settings:**
  * Enable **Do Not Disturb** (to prevent message or system notifications from appearing).
  * Hide status bar icons or use a clean simulator status bar layout (e.g. using `adb shell settings put global demo_mode_allowed 1`).
  * Turn off automatic brightness adjustment and set to 80-90%.

#### B. Desktop Web/PWA Recording
* **Aspect Ratio:** 1080 × 1920 viewport (configure Chrome DevTools Device Emulation to emulate a mobile viewport size).
* **Frame Hide:** Hide the browser URL search bar, bookmarks bar, and extensions. Enter fullscreen tab mode (`F11`).
* **Visual Theme:** Use system dark mode to prevent white flashes between page frames.

---

## 🔒 Privacy & Cleanliness Checklist
* [ ] No debugging tools, yellow box error banners, or logger panels in frame.
* [ ] No keyboard autocomplete suggestions showing passwords or email addresses.
* [ ] Do not capture developer option overlay pointers or touches unless clean.
* [ ] Ensure all demo assets (images and videos) are cached prior to recording so there are no empty placeholder states or loading spinners.
