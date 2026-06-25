// In-memory cache for Google Drive file IDs (persists during warm starts)
let cachedFileIds = [];
let cacheExpiryTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

// Helper to extract the folder ID if the user provides a full Google Drive URL
function extractFolderId(input) {
  if (!input) return '';
  const trimmed = input.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9-_]+)/);
    if (folderMatch && folderMatch[1]) {
      return folderMatch[1];
    }
    const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9-_]+)/);
    if (queryMatch && queryMatch[1]) {
      return queryMatch[1];
    }
  }
  return trimmed;
}

async function fetchGoogleDriveFileIds() {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  const rawFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const folderId = extractFolderId(rawFolderId);

  if (!apiKey || !folderId) {
    console.warn("[Google Drive] Missing GOOGLE_DRIVE_API_KEY or GOOGLE_DRIVE_FOLDER_ID in environment variables");
    return [];
  }

  // Return cached IDs if still valid
  if (Date.now() < cacheExpiryTime && cachedFileIds.length > 0) {
    return cachedFileIds;
  }

  console.log("[Google Drive] Fetching fresh file list from Google Drive API...");
  try {
    // Query Google Drive API for images in the specified folder
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false and mimeType contains 'image/'`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&key=${apiKey}&fields=files(id)&pageSize=1000`;

    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Drive API returned status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const files = data.files || [];
    const fileIds = files.map(file => file.id).filter(Boolean);

    if (fileIds.length === 0) {
      console.warn("[Google Drive] No images found in the specified folder");
      return [];
    }

    console.log(`[Google Drive] Successfully indexed ${fileIds.length} memes`);
    
    // Update cache
    cachedFileIds = fileIds;
    cacheExpiryTime = Date.now() + CACHE_TTL_MS;
    
    return cachedFileIds;
  } catch (err) {
    console.error("[Google Drive] Error fetching file list:", err.message);
    // Return stale cache if available, otherwise empty array
    return cachedFileIds;
  }
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const fileIds = await fetchGoogleDriveFileIds();

  if (fileIds.length > 0) {
    // Pick a random Google Drive file ID
    const randomIndex = Math.floor(Math.random() * fileIds.length);
    const randomFileId = fileIds[randomIndex];
    
    const directViewUrl = `https://lh3.googleusercontent.com/d/${randomFileId}`;
    // Route through wsrv.nl CDN proxy to cache on Cloudflare and optimize delivery.
    // &n=-1 ensures all frames of animated GIFs are preserved.
    const proxiedUrl = `https://wsrv.nl/?url=${encodeURIComponent(directViewUrl)}&n=-1`;

    console.log(`[API] Redirecting to CDN-proxied Google Drive image: ${randomFileId}`);
    
    // Redirect browser to the high-speed CDN URL
    res.writeHead(302, { 'Location': proxiedUrl });
    res.end();
  } else {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: "Google Drive API not configured or failed to fetch files" }));
  }
}
