#!/usr/bin/env node
// Read-only: show DoseTrace's Play track releases (which versionCodes are live on
// production vs internal, and rollout status). Manual RS256 JWT → OAuth → Android
// Publisher API (no googleapis dep). Creates an edit, reads, then deletes it.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PKG = 'io.outcom.dosetrace';
const SA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'google-play-service-account.json'), 'utf8'));

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: SA.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const sig = b64url(signer.sign(SA.private_key));
  const jwt = `${header}.${claim}.${sig}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('token: ' + JSON.stringify(j));
  return j.access_token;
}

async function api(token, method, url, body) {
  const res = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}${url}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let j; try { j = JSON.parse(txt); } catch { j = txt; }
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${txt}`);
  return j;
}

(async () => {
  const token = await getToken();
  const edit = await api(token, 'POST', '/edits');
  const editId = edit.id;
  try {
    for (const track of ['production', 'internal']) {
      try {
        const t = await api(token, 'GET', `/edits/${editId}/tracks/${track}`);
        console.log(`\n=== ${track} ===`);
        for (const r of (t.releases || [])) {
          console.log(`  name=${r.name || '(none)'} status=${r.status} versionCodes=${(r.versionCodes || []).join(',')} rollout=${r.userFraction ?? '(full)'}`);
        }
        if (!t.releases || !t.releases.length) console.log('  (no releases)');
      } catch (e) {
        console.log(`\n=== ${track} === ERROR: ${e.message}`);
      }
    }
  } finally {
    await api(token, 'DELETE', `/edits/${editId}`).catch(() => {});
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
