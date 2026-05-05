import { google } from 'googleapis';
import fs from 'node:fs/promises';
import path from 'node:path';

// Service account: used to READ shared photo folders (no storage required).
function serviceAccountAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set');
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
}

// OAuth: used to WRITE outputs in the user's personal Drive (acts on user's behalf).
// Falls back to null if OAuth secrets are not set — the upload step will then skip.
function oauthClient() {
  const cid = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const csec = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const rtok = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!cid || !csec || !rtok) return null;
  const c = new google.auth.OAuth2(cid, csec);
  c.setCredentials({ refresh_token: rtok });
  return c;
}

export async function listImagesInFolder(folderId, { recursive = true, max = 50 } = {}) {
  const drive = google.drive({ version: 'v3', auth: await serviceAccountAuth().getClient() });
  const all = [];
  const stack = [folderId];
  while (stack.length && all.length < max) {
    const id = stack.pop();
    let pageToken;
    do {
      const { data } = await drive.files.list({
        q: `'${id}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, imageMediaMetadata)',
        pageSize: 100,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const f of data.files || []) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          if (recursive) stack.push(f.id);
        } else if (f.mimeType?.startsWith('image/')) {
          all.push(f);
        }
      }
      pageToken = data.nextPageToken;
    } while (pageToken && all.length < max);
  }
  return all;
}

export async function downloadFile(fileId, destPath) {
  const drive = google.drive({ version: 'v3', auth: await serviceAccountAuth().getClient() });
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  );
  await fs.writeFile(destPath, Buffer.from(res.data));
  return destPath;
}

export async function uploadFile(filePath, name, parentFolderId, mimeType = 'image/png') {
  const auth = oauthClient();
  if (!auth) {
    console.warn('[drive] OAuth secrets not set (GOOGLE_OAUTH_CLIENT_ID / SECRET / REFRESH_TOKEN).');
    console.warn('[drive] Skipping upload. PNG available as workflow artifact.');
    return null;
  }
  const drive = google.drive({ version: 'v3', auth });
  const fileBuffer = await fs.readFile(filePath);
  const { Readable } = await import('node:stream');
  try {
    const { data } = await drive.files.create({
      requestBody: { name, parents: [parentFolderId] },
      media: { mimeType, body: Readable.from(fileBuffer) },
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
    });
    return data;
  } catch (err) {
    console.warn('[drive] Upload failed:', err?.errors?.[0]?.message || err.message);
    return null;
  }
}
