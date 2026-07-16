# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# PWA Stability & Performance Guidelines

To ensure the PWA loads quickly, navigates smoothly, and never breaks on Vercel updates:
1. **NO SERVICE WORKERS FOR HTML/JS CACHING:** Do not register service workers that cache `/index.html` or compiled JS bundles. Caching dynamic React Native Web SPA builds causes cache-locks and white-screens when bundle chunk hashes change on Vercel. Keep Service Workers unregistered.
2. **INDEXEDDB FOR BINARY MEDIA CACHING:** Use IndexedDB (`src/services/webBlobStore.ts`) to cache decrypted previews, thumbnails, and files on Web. This allows instant (sub-50ms) page loads and offline support for media without network requests or browser concurrent connection queue bottlenecks.
3. **SYNCHRONOUS USER CLICKS FOR EXPORTS:** Web downloads and sharing must be initiated synchronously inside a direct user-click event handler (using the premium share/download modal overlay) to bypass mobile browser popup blockers and Web Share API sandbox limitations.
4. **LAZY STARTUP INITIALIZATION:** Defer non-critical background services (like upload queue processing or background task registration) by 1-2 seconds after startup to ensure the UI renders immediately on load.

