import { google } from 'googleapis';
import fs from 'node:fs/promises';
import path from 'node:path';

function authClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set');
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
}

export async function listImagesInFolder(folderId, { recursive = true, max = 50 } = {}) {
  const drive = google.drive({ version: 'v3', auth: await authClient().getClient() });
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
  const drive = google.drive({ version: 'v3', auth: await authClient().getClient() });
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  );
  await fs.writeFile(destPath, Buffer.from(res.data));
  return destPath;
}

export async function uploadFile(filePath, name, parentFolderId, mimeType = 'image/png') {
  const drive = google.drive({ version: 'v3', auth: await authClient().getClient() });
  const fileBuffer = await fs.readFile(filePath);
  const { Readable } = await import('node:stream');
  const { data } = await drive.files.create({
    requestBody: { name, parents: [parentFolderId] },
    media: { mimeType, body: Readable.from(fileBuffer) },
    fields: 'id, name, webViewLink',
    supportsAllDrives: true,
  });
  return data;
}
