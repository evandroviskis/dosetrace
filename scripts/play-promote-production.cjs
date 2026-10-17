#!/usr/bin/env node
// Promote an already-uploaded Android versionCode to the PRODUCTION track: status
// "completed" with no userFraction = 100% of users, no staged rollout. The .aab is
// already on Play (internal), so this only assigns it to production, no re-upload.
// Release name "<app.json version> (<versionCode>)"; release notes from
// store/whats-new-<version>.json (top-level texts, locales via _store_locales).
// Manual RS256 JWT -> OAuth -> Android Publisher API.
//
// DRY RUN by default: creates an edit, checks the versionCode is uploaded, sets the
// track inside the edit, validates, then DELETES the edit (nothing is published).
// Only --commit commits the edit.
//
//   node scripts/play-promote-production.cjs 52            # dry run / validate
//   node scripts/play-promote-production.cjs 52 --commit   # actually release
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { appVersion, playReleaseNotes } = require('./releaseNotes.cjs');

const PKG = 'io.outcom.dosetrace';

const versionCode = process.argv[2];
const COMMIT = process.argv.includes('--commit');
if (!versionCode || !/^\d+$/.test(versionCode)) {
  console.error('usage: node scripts/play-promote-production.cjs <versionCode> [--commit]');
  process.exit(1);
}

const VERSION = appVersion();
const RELEASE_NAME = `${VERSION} (${versionCode})`;
const RELEASE_NOTES = playReleaseNotes(VERSION); // throws on a missing text or > 500 chars

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
async function getToken(SA) {
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
  if (!j.access_token) throw new Error('token request failed: ' + (j.error || res.status));
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
  console.log(`${COMMIT ? 'COMMIT' : 'DRY RUN'}: production, completed (100%), release "${RELEASE_NAME}"`);
  console.log('release notes:');
  for (const n of RELEASE_NOTES) console.log(`  ${n.language.padEnd(6)} ${String(n.text.length).padStart(3)} chars  ${n.text.split('\n')[0]}`);

  const SA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'google-play-service-account.json'), 'utf8'));
  const token = await getToken(SA);
  const edit = await api(token, 'POST', '/edits');
  const editId = edit.id;
  let committed = false;
  let exitCode = 0;
  try {
    // Is the versionCode uploaded to this app at all? Without it the track PUT fails.
    const bundles = (await api(token, 'GET', `/edits/${editId}/bundles`)).bundles || [];
    const uploaded = bundles.some((b) => String(b.versionCode) === String(versionCode));
    const newest = bundles.map((b) => b.versionCode).sort((a, b) => b - a).slice(0, 3);
    const tracks = (await api(token, 'GET', `/edits/${editId}/tracks`)).tracks || [];
    const onTracks = tracks.filter((t) => (t.releases || []).some((r) => (r.versionCodes || []).includes(String(versionCode)))).map((t) => t.track);
    const prod = tracks.find((t) => t.track === 'production');
    for (const r of (prod?.releases || [])) {
      console.log(`production now: name="${r.name || ''}" status=${r.status} versionCodes=${(r.versionCodes || []).join(',')} rollout=${r.userFraction ?? '(full)'}`);
    }
    const listings = ((await api(token, 'GET', `/edits/${editId}/listings`)).listings || []).map((l) => l.language);
    const unlisted = RELEASE_NOTES.map((n) => n.language).filter((l) => !listings.includes(l));
    console.log(`store listing languages: ${listings.join(', ')}${unlisted.length ? `  (notes with no listing: ${unlisted.join(', ')})` : ''}`);

    if (!uploaded) {
      console.log(`\nNOT READY: versionCode ${versionCode} is not uploaded to Play (newest bundles: ${newest.join(', ') || 'none'}).`);
      console.log('Upload the .aab first (eas submit to the internal track), then rerun. Nothing was changed.');
      exitCode = 2;
      return;
    }
    console.log(`versionCode ${versionCode} uploaded; on tracks: ${onTracks.join(', ') || '(none)'}`);

    const trackBody = {
      track: 'production',
      releases: [{
        name: RELEASE_NAME,
        versionCodes: [String(versionCode)],
        status: 'completed', // no userFraction: full rollout, 100%
        releaseNotes: RELEASE_NOTES,
      }],
    };
    const put = await api(token, 'PUT', `/edits/${editId}/tracks/production`, trackBody);
    const rel = put.releases?.[0] || {};
    console.log(`track set (in edit): name="${rel.name}" versionCodes=${JSON.stringify(rel.versionCodes)} status=${rel.status} rollout=${rel.userFraction ?? '(full)'} notes=${(rel.releaseNotes || []).length}`);
    await api(token, 'POST', `/edits/${editId}:validate`);
    console.log('validate: OK');
    if (COMMIT) {
      await api(token, 'POST', `/edits/${editId}:commit`);
      committed = true;
      console.log(`COMMITTED: vc${versionCode} is now the production release (full rollout). Check with node scripts/play-track-status.cjs.`);
    } else {
      console.log('DRY RUN (no --commit): edit validated, then deleted. Nothing published.');
    }
  } finally {
    if (!committed) await api(token, 'DELETE', `/edits/${editId}`).catch(() => {});
    if (exitCode) process.exitCode = exitCode;
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
