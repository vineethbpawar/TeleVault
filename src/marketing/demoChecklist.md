# Demo Checklist & QA Steps

Follow these steps to verify that Marketing Mode is functioning correctly:

1. **Verify environment flag configuration:**
   * Open or create `.env` or `.env.local`.
   * Add: `EXPO_PUBLIC_MARKETING_MODE=true`
   * Restart the Metro bundler: `npm run start` or `npm run dev`.

2. **Verify Memories screen:**
   * Open the app.
   * Navigate to the **Memories** tab.
   * Confirm that the mocked memories ('Road trip down the coast!', 'Sunset at the campfire', etc.) display instead of your production images/videos.

3. **Verify Fullscreen Viewer:**
   * Tap on any photo/video thumbnail in the grid.
   * Confirm that the media is displayed and can be navigated by tapping left/right edges of the screen.

4. **Verify Private Drive:**
   * Navigate to the **Private Drive** folder.
   * Confirm that the mock tax returns and lease agreements are shown.

5. **Verify Production Safety:**
   * Set `EXPO_PUBLIC_MARKETING_MODE=false` or remove the line from the `.env` file.
   * Restart the server.
   * Confirm that your normal production/live database memories and drive folders load instead of the mock data. Real files are untouched!
