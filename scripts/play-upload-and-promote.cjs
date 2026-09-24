#!/usr/bin/env node
// Upload an .aab to Google Play and release it to PRODUCTION (full, completed) with
// localized notes. Manual RS256 JWT → OAuth → Android Publisher API (bundles.upload
// + tracks). Used because `eas submit` to production is gated; this is the same API
// path that shipped 1.2.2. Commits ONLY with --commit; otherwise validates + discards.
//   node scripts/play-upload-and-promote.cjs <path-to-aab>            # dry-run
//   node scripts/play-upload-and-promote.cjs <path-to-aab> --commit   # release
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PKG = 'io.outcom.dosetrace';
const AAB = process.argv[2];
const COMMIT = process.argv.includes('--commit');
if (!AAB || !fs.existsSync(AAB)) { console.error('usage: play-upload-and-promote.cjs <aab> [--commit]'); process.exit(1); }
const SA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'google-play-service-account.json'), 'utf8'));

const RELEASE_NOTES = [
  { language: 'en-US', text: 'More reliable reminders — including the reality-check food-log nudge — plus stability fixes.' },
  { language: 'es-ES', text: 'Recordatorios más fiables, incluido el aviso de registro de comidas de la comprobación de progreso, y correcciones de estabilidad.' },
  { language: 'pt-BR', text: 'Lembretes mais confiáveis, incluindo o aviso de registro de refeições do acompanhamento, e correções de estabilidade.' },
  { language: 'fr-FR', text: 'Rappels plus fiables, y compris le rappel de journal alimentaire du suivi, et corrections de stabilité.' },
  { language: 'de-DE', text: 'Zuverlässigere Erinnerungen — inkl. der Ess-Erinnerung des Reality-Checks — sowie Stabilitätskorrekturen.' },
  { language: 'it-IT', text: 'Promemoria più affidabili, incluso quello del diario alimentare del monitoraggio, e correzioni di stabilità.' },
];

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
function uploadBundle(token, editId, bytes) {
  return new Promise((resolve, reject) => {
    const p = `/upload/androidpublisher/v3/applications/${PKG}/edits/${editId}/bundles?uploadType=media`;
    const r = https.request('https://androidpublisher.googleapis.com' + p, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length } }, (x) => { let d = ''; x.on('data', (c) => (d += c)); x.on('end', () => { if (x.statusCode >= 300) return reject(new Error(`upload → ${x.statusCode}: ${d}`)); resolve(JSON.parse(d || '{}')); }); });
    r.on('error', reject); r.write(bytes); r.end();
  });
}

(async () => {
  const bytes = fs.readFileSync(AAB);
  const token = await getToken();
  const edit = await api(token, 'POST', '/edits');
  const editId = edit.id;
  let committed = false;
  try {
    const up = await uploadBundle(token, editId, bytes);
    const vc = up.versionCode;
    console.log('uploaded bundle versionCode:', vc);
    const trackBody = { track: 'production', releases: [{ name: `1.2.3 (${vc})`, versionCodes: [String(vc)], status: 'completed', releaseNotes: RELEASE_NOTES }] };
    const put = await api(token, 'PUT', `/edits/${editId}/tracks/production`, trackBody);
    console.log('production release set:', JSON.stringify(put.releases?.[0]?.versionCodes), put.releases?.[0]?.status);
    await api(token, 'POST', `/edits/${editId}:validate`);
    console.log('validate: OK');
    if (COMMIT) {
      await api(token, 'POST', `/edits/${editId}:commit`);
      committed = true;
      console.log(`COMMITTED — vc${vc} released to production (full).`);
    } else {
      console.log('DRY RUN (no --commit) — validated, discarding edit.');
    }
  } finally {
    if (!committed) await api(token, 'DELETE', `/edits/${editId}`).catch(() => {});
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
