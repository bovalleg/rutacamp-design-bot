// One-shot script: opens a browser, you authorize Ruta Camp Bot to write to your Drive,
// and prints the refresh token. Save that token as GitHub secret GOOGLE_OAUTH_REFRESH_TOKEN.
//
// Usage:
//   node scripts/get-refresh-token.mjs <path-to-oauth-client.json>

import { google } from 'googleapis';
import http from 'node:http';
import { URL } from 'node:url';
import fs from 'node:fs/promises';
import { exec } from 'node:child_process';

const clientPath = process.argv[2];
if (!clientPath) {
  console.error('Usage: node scripts/get-refresh-token.mjs <path-to-oauth-client.json>');
  process.exit(1);
}

const raw = JSON.parse(await fs.readFile(clientPath, 'utf8'));
const cfg = raw.installed || raw.web;
if (!cfg) {
  console.error('Invalid OAuth client JSON — expected `installed` or `web` key.');
  process.exit(1);
}

const oAuth2Client = new google.auth.OAuth2(
  cfg.client_id,
  cfg.client_secret,
  'http://localhost:53682'
);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive.file'],
});

console.log('\n======================================================================');
console.log('Voy a abrir el browser para que autorices al bot.');
console.log('Si no abre solo, copiá-pegá esta URL:');
console.log(authUrl);
console.log('======================================================================\n');

// Try to open the browser (Windows / Mac / Linux)
const cmd = process.platform === 'win32'
  ? `start "" "${authUrl}"`
  : process.platform === 'darwin'
  ? `open "${authUrl}"`
  : `xdg-open "${authUrl}"`;
exec(cmd, () => {});

const code = await new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost:53682');
    const c = u.searchParams.get('code');
    const err = u.searchParams.get('error');
    if (err) {
      res.end(`Error: ${err}. Cerrá esta pestaña y revisá la consola.`);
      server.close();
      reject(new Error(err));
      return;
    }
    if (c) {
      res.end('Listo — podés cerrar esta pestaña.');
      server.close();
      resolve(c);
    } else {
      res.end('No se recibió código.');
    }
  });
  server.listen(53682);
  setTimeout(() => { server.close(); reject(new Error('Timeout (5min) esperando autorización')); }, 5 * 60_000);
});

const { tokens } = await oAuth2Client.getToken(code);

if (!tokens.refresh_token) {
  console.error('\n❌ No se recibió refresh_token. Probá borrar el acceso previo en');
  console.error('https://myaccount.google.com/permissions y volvé a correr este script.');
  process.exit(1);
}

console.log('\n======================================================================');
console.log('✓ ¡Autorización exitosa!');
console.log('======================================================================\n');
console.log('CLIENT_ID:    ', cfg.client_id);
console.log('CLIENT_SECRET:', cfg.client_secret);
console.log('REFRESH_TOKEN:', tokens.refresh_token);
console.log('\nPaso siguiente — cargá los 3 secrets a GitHub:\n');
console.log(`  gh secret set GOOGLE_OAUTH_CLIENT_ID --body "${cfg.client_id}"`);
console.log(`  gh secret set GOOGLE_OAUTH_CLIENT_SECRET --body "${cfg.client_secret}"`);
console.log(`  gh secret set GOOGLE_OAUTH_REFRESH_TOKEN --body "${tokens.refresh_token}"`);
console.log('\n');
