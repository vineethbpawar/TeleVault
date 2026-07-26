/**
 * Temporary Blob Cache
 * Used to pass binary Blobs from the Web Camera recorder to the Preview Screen
 * without triggering browser fetch CORS/sandbox failures on mobile platforms.
 */
export const tempBlobCache = new Map<string, Blob>();
