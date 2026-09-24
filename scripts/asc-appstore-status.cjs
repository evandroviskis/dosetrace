// Read-only: current App Store versions + state + attached build + whatsNew locales.
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

const KEY_ID = 'N493SYFP2T';
const ISSUER = '69a6de85-8f0f-47e3-e053-5b8c7c11a4d1';
const APP_ID = '6761788157';
const KEY_PATH = process.env.HOME + '/Downloads/AuthKey_N493SYFP2T.p8';
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
  const v = await api(`/v1/apps/${APP_ID}/appStoreVersions?limit=6&fields[appStoreVersions]=versionString,appStoreState,createdDate,platform&include=build&fields[builds]=version`);
  console.log('=== App Store versions ===');
  for (const ver of (v.b.data || [])) {
    const a = ver.attributes;
    const buildRel = ver.relationships?.build?.data;
    let buildVer = '(none)';
    if (buildRel) {
      const inc = (v.b.included || []).find((i) => i.id === buildRel.id);
      buildVer = inc ? inc.attributes.version : buildRel.id;
    }
    console.log(`${a.versionString}  state=${a.appStoreState}  platform=${a.platform}  build=${buildVer}  id=${ver.id}`);
    // localizations whatsNew presence
    const loc = await api(`/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations?limit=10&fields[appStoreVersionLocalizations]=locale,whatsNew`);
    const locs = (loc.b.data || []).map((l) => `${l.attributes.locale}${l.attributes.whatsNew ? '✓' : '�—'}`);
    console.log('   whatsNew:', locs.join(' '));
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
