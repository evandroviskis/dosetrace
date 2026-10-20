#!/usr/bin/env node
// Replace the Google Play phone screenshots of every listing language with the slides in
// store/screenshots/play/<lang>/0N_*.png (1440×2868, built by store-slides.cjs from real Android
// captures). For each language: delete the current phoneScreenshots, upload the new ones in order
// (one at a time), list them back. Commits ONLY with --commit; the dry run uploads into a
// throwaway edit, checks the count and discards it.
//   node scripts/play-screenshots.cjs            # dry run
//   node scripts/play-screenshots.cjs --commit   # replace and commit
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PKG = 'io.outcom.dosetrace';
const COMMIT = process.argv.includes('--commit');
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'store', 'screenshots', 'play');
const LOCALES = { 'en-US': 'en', 'pt-BR': 'pt', 'es-ES': 'es', 'fr-FR': 'fr', 'de-DE': 'de', 'it-IT': 'it' };
const SA = JSON.parse(fs.readFileSync(path.join(ROOT, 'google-play-service-account.json'), 'utf8'));

const b64url = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: SA.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const signer = crypto.createSign('RSA-SHA256'); signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${b64url(signer.sign(SA.private_key))}`;
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` });
  const j = await res.json(); if (!j.access_token) throw new Error('token failed'); return j.access_token;
}
async function api(token, method, url) {
  const res = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}${url}`, { method, headers: { Authorization: `Bearer ${token}` } });
  const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch { j = txt; }
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${txt}`); return j;
}
function upload(token, editId, lang, bytes) {
  return new Promise((resolve, reject) => {
    const p = `/upload/androidpublisher/v3/applications/${PKG}/edits/${editId}/listings/${lang}/phoneScreenshots?uploadType=media`;
    const r = https.request('https://androidpublisher.googleapis.com' + p, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png', 'Content-Length': bytes.length } }, (x) => {
      let d = ''; x.on('data', (c) => (d += c)); x.on('end', () => (x.statusCode >= 300 ? reject(new Error(`upload ${lang} → ${x.statusCode}: ${d}`)) : resolve(JSON.parse(d || '{}'))));
    });
    r.on('error', reject); r.write(bytes); r.end();
  });
}

(async () => {
  const token = await getToken();
  const edit = await api(token, 'POST', '/edits');
  let committed = false;
  try {
    for (const [locale, lang] of Object.entries(LOCALES)) {
      const files = fs.readdirSync(path.join(DIR, lang)).filter((f) => /^\d\d_.*\.png$/.test(f)).sort();
      if (files.length < 2 || files.length > 8) throw new Error(`${lang}: ${files.length} files (Play needs 2–8)`);
      const before = await api(token, 'GET', `/edits/${edit.id}/listings/${locale}/phoneScreenshots`);
      await api(token, 'DELETE', `/edits/${edit.id}/listings/${locale}/phoneScreenshots`);
      for (const f of files) await upload(token, edit.id, locale, fs.readFileSync(path.join(DIR, lang, f)));
      const after = await api(token, 'GET', `/edits/${edit.id}/listings/${locale}/phoneScreenshots`);
      const n = (after.images || []).length;
      console.log(`${locale}: ${(before.images || []).length} old → ${n} new (${files.join(', ')})`);
      if (n !== files.length) throw new Error(`${locale}: expected ${files.length}, got ${n}`);
    }
    await api(token, 'POST', `/edits/${edit.id}:validate`);
    console.log('validate: OK');
    if (COMMIT) { await api(token, 'POST', `/edits/${edit.id}:commit`); committed = true; console.log('COMMITTED — Play screenshots replaced.'); }
    else console.log('DRY RUN — nothing committed; discarding the edit.');
  } finally {
    if (!committed) await api(token, 'DELETE', `/edits/${edit.id}`).catch(() => {});
  }
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
