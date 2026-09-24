#!/usr/bin/env node
// Upload the 512x512 high-res store-listing icon to Google Play. Manual RS256 JWT →
// OAuth → Android Publisher images upload. Commits ONLY with --commit.
//   node scripts/play-set-icon.cjs            # upload to a throwaway edit, list, discard
//   node scripts/play-set-icon.cjs --commit   # upload + commit (icon goes live-pending)
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PKG = 'io.outcom.dosetrace';
const LANG = 'en-US';
const IMG = path.join(__dirname, '..', 'store_assets', 'app_icon_512.png');
const COMMIT = process.argv.includes('--commit');
const SA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'google-play-service-account.json'), 'utf8'));

const b64url = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: SA.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const signer = crypto.createSign('RSA-SHA256'); signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${b64url(signer.sign(SA.private_key))}`;
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` });
  const j = await res.json(); if (!j.access_token) throw new Error('token: ' + JSON.stringify(j)); return j.access_token;
}
async function api(token, method, url, body) {
  const res = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}${url}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch { j = txt; }
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${txt}`); return j;
}
// media upload (raw bytes) — uses the /upload/ host
function uploadImage(token, editId, bytes) {
  return new Promise((resolve, reject) => {
    const p = `/upload/androidpublisher/v3/applications/${PKG}/edits/${editId}/listings/${LANG}/icon?uploadType=media`;
    const r = https.request('https://androidpublisher.googleapis.com' + p, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png', 'Content-Length': bytes.length } }, (x) => { let d = ''; x.on('data', (c) => (d += c)); x.on('end', () => { if (x.statusCode >= 300) return reject(new Error(`upload → ${x.statusCode}: ${d}`)); resolve(JSON.parse(d || '{}')); }); });
    r.on('error', reject); r.write(bytes); r.end();
  });
}

(async () => {
  const bytes = fs.readFileSync(IMG);
  const token = await getToken();
  const edit = await api(token, 'POST', '/edits');
  const editId = edit.id;
  let committed = false;
  try {
    const up = await uploadImage(token, editId, bytes);
    console.log('uploaded icon sha1:', up.image?.sha1 || '(ok)');
    const list = await api(token, 'GET', `/edits/${editId}/listings/${LANG}/icon`);
    console.log('icon slots now:', (list.images || []).length);
    if (COMMIT) {
      await api(token, 'POST', `/edits/${editId}:validate`);
      await api(token, 'POST', `/edits/${editId}:commit`);
      committed = true;
      console.log('COMMITTED — 512 store icon updated (live-pending on the listing).');
    } else {
      console.log('DRY RUN (no --commit) — uploaded to a throwaway edit, discarding.');
    }
  } finally {
    if (!committed) await api(token, 'DELETE', `/edits/${editId}`).catch(() => {});
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
