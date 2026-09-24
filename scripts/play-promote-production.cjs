#!/usr/bin/env node
// Promote an already-uploaded Android versionCode to the PRODUCTION track (full,
// completed) with localized release notes. The .aab is already on Play (internal),
// so this just assigns it to production — no re-upload. Manual RS256 JWT → OAuth →
// Android Publisher API. Commits ONLY when run with `--commit`; otherwise validates
// (creates edit, sets track, validates, deletes edit) as a dry run.
//
//   node scripts/play-promote-production.cjs 43            # dry-run/validate
//   node scripts/play-promote-production.cjs 43 --commit   # actually release
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PKG = 'io.outcom.dosetrace';
const SA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'google-play-service-account.json'), 'utf8'));

const versionCode = process.argv[2];
const COMMIT = process.argv.includes('--commit');
if (!versionCode || !/^\d+$/.test(versionCode)) {
  console.error('usage: node scripts/play-promote-production.cjs <versionCode> [--commit]');
  process.exit(1);
}

const RELEASE_NOTES = [
  { language: 'en-US', text: 'More reliable dose reminders on Android, fixes to sign-out and account deletion, and general stability improvements.' },
  { language: 'es-ES', text: 'Recordatorios de dosis más fiables en Android, correcciones al cierre de sesión y a la eliminación de cuenta, y mejoras de estabilidad.' },
  { language: 'pt-BR', text: 'Lembretes de dose mais confiáveis no Android, correções no encerramento de sessão e na exclusão da conta, e melhorias de estabilidade.' },
  { language: 'fr-FR', text: 'Rappels de dose plus fiables sur Android, corrections de la déconnexion et de la suppression de compte, et améliorations de stabilité.' },
  { language: 'de-DE', text: 'Zuverlässigere Dosis-Erinnerungen unter Android, Korrekturen bei Abmeldung und Kontolöschung sowie allgemeine Stabilitätsverbesserungen.' },
  { language: 'it-IT', text: "Promemoria delle dosi più affidabili su Android, correzioni a disconnessione ed eliminazione dell'account e miglioramenti di stabilità." },
];

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: SA.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${b64url(signer.sign(SA.private_key))}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('token: ' + JSON.stringify(j));
  return j.access_token;
}
async function api(token, method, url, body) {
  const res = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}${url}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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
  let committed = false;
  try {
    const trackBody = {
      track: 'production',
      releases: [{
        name: `1.2.2 (${versionCode})`,
        versionCodes: [String(versionCode)],
        status: 'completed',
        releaseNotes: RELEASE_NOTES,
      }],
    };
    const put = await api(token, 'PUT', `/edits/${editId}/tracks/production`, trackBody);
    console.log('track set:', JSON.stringify(put.releases?.[0]?.versionCodes), put.releases?.[0]?.status);
    // Validate the edit before committing.
    await api(token, 'POST', `/edits/${editId}:validate`);
    console.log('validate: OK');
    if (COMMIT) {
      await api(token, 'POST', `/edits/${editId}:commit`);
      committed = true;
      console.log(`COMMITTED — vc${versionCode} is now the production release (full rollout).`);
    } else {
      console.log('DRY RUN (no --commit) — edit validated, not committed.');
    }
  } finally {
    if (!committed) await api(token, 'DELETE', `/edits/${editId}`).catch(() => {});
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
