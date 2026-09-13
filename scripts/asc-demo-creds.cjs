// Retrieve the App Store review DEMO-account credentials Apple uses to review the
// app — pulled live from App Store Connect (App Review Information) so the
// authoritative copy is never lost and never has to be stored in the repo.
//
//   node scripts/asc-demo-creds.cjs
//
// Auth: the same ASC API key as scripts/asc-tf-status.cjs — the .p8 at
// ~/Downloads/AuthKey_N493SYFP2T.p8 (gitignored; never committed). The demo
// password itself is NOT stored here or anywhere in git — it lives in ASC (the
// source of truth) and the owner's password manager.
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

const KEY_ID = 'N493SYFP2T';
const ISSUER = '69a6de85-8f0f-47e3-e053-5b8c7c11a4d1';
const APP_ID = '6761788157';
const KEY_PATH = process.env.HOME + '/Downloads/AuthKey_N493SYFP2T.p8';

if (!fs.existsSync(KEY_PATH)) {
  console.error('ASC key missing at', KEY_PATH, '- cannot fetch demo credentials.');
  process.exit(1);
}
const p8 = fs.readFileSync(KEY_PATH, 'utf8');
const b64 = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const now = Math.floor(Date.now() / 1000);
const si = b64(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })) + '.' +
  b64(JSON.stringify({ iss: ISSUER, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' }));
const TOKEN = si + '.' + b64(crypto.sign('sha256', Buffer.from(si), { key: p8, dsaEncoding: 'ieee-p1363' }));
const api = (p) => new Promise((res, rej) => {
  const r = https.request('https://api.appstoreconnect.apple.com' + p, { headers: { Authorization: 'Bearer ' + TOKEN } },
    (x) => { let d = ''; x.on('data', (c) => (d += c)); x.on('end', () => { try { res({ s: x.statusCode, b: JSON.parse(d || '{}') }); } catch { res({ s: x.statusCode, b: d }); } }); });
  r.on('error', rej); r.end();
});

(async () => {
  // App Store review demo account (per appStoreVersion review detail).
  const vv = await api(`/v1/apps/${APP_ID}/appStoreVersions?limit=10`);
  let printed = false;
  for (const v of (vv.b.data || [])) {
    const ver = v.attributes?.versionString, state = v.attributes?.appStoreState;
    const d = await api(`/v1/appStoreVersions/${v.id}/appStoreReviewDetail`);
    const a = d.b?.data?.attributes;
    if (a && (a.demoAccountName || a.demoAccountPassword)) {
      console.log(`App Store review demo account (from v${ver} / ${state}):`);
      console.log('  email   :', a.demoAccountName);
      console.log('  password:', a.demoAccountPassword);
      console.log('  required:', a.demoAccountRequired);
      printed = true;
      break;
    }
  }
  // TestFlight beta review demo account (if set separately).
  const bard = await api(`/v1/apps/${APP_ID}/betaAppReviewDetail`);
  const ba = bard.b?.data?.attributes;
  if (ba && (ba.demoAccountName || ba.demoAccountPassword)) {
    console.log('TestFlight beta-review demo account:');
    console.log('  email   :', ba.demoAccountName);
    console.log('  password:', ba.demoAccountPassword);
  }
  if (!printed && !(ba && ba.demoAccountName)) console.log('No demo credentials set in ASC review details.');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
