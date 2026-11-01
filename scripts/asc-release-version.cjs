#!/usr/bin/env node
// Releases an approved App Store version held for a MANUAL release (asc-create-and-submit.cjs --manual;
// founder 2026-11-01: the 1.3.1 binary is checked on his iPhone first). Read-only by default: it prints
// the version's state. With --release it posts the release request, but only when the state is
// PENDING_DEVELOPER_RELEASE (approved and waiting); any other state stops without writing.
//   node scripts/asc-release-version.cjs            → shows the state of the app.json version
//   node scripts/asc-release-version.cjs --release  → releases it to the App Store
//   node scripts/asc-release-version.cjs --after-approval → a version in review goes live as soon as Apple approves
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');

const KEY_ID = 'N493SYFP2T';
const ISSUER = '69a6de85-8f0f-47e3-e053-5b8c7c11a4d1';
const APP_ID = '6761788157';
const VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).expo.version;
const RELEASE = process.argv.includes('--release');
const AFTER_APPROVAL = process.argv.includes('--after-approval');
const p8 = require('./ascKey.cjs').readKey();

const b64 = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const now = Math.floor(Date.now() / 1000);
const si = b64(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })) + '.' +
  b64(JSON.stringify({ iss: ISSUER, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' }));
const TOKEN = si + '.' + b64(crypto.sign('sha256', Buffer.from(si), { key: p8, dsaEncoding: 'ieee-p1363' }));

function request(method, p, body) {
  return new Promise((res, rej) => {
    const data = body ? JSON.stringify(body) : null;
    const r = https.request('https://api.appstoreconnect.apple.com' + p, {
      method,
      headers: {
        Authorization: 'Bearer ' + TOKEN,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (x) => { let d = ''; x.on('data', (c) => (d += c)); x.on('end', () => { try { res({ s: x.statusCode, b: JSON.parse(d || '{}') }); } catch { res({ s: x.statusCode, b: d }); } }); });
    r.on('error', rej); if (data) r.write(data); r.end();
  });
}

(async () => {
  const vs = await request('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${VERSION}&fields[appStoreVersions]=versionString,appStoreState,releaseType`);
  if (vs.s >= 300) { console.error('read versions → HTTP ' + vs.s, JSON.stringify(vs.b)); process.exit(1); }
  const v = (vs.b.data || [])[0];
  if (!v) { console.error(`no App Store version ${VERSION}`); process.exit(1); }
  const { appStoreState, releaseType } = v.attributes;
  console.log(`App Store ${VERSION}: state ${appStoreState}, releaseType ${releaseType}`);
  // --after-approval (founder 2026-11-01, "Trocar para automática"): a version still in review switches
  // from MANUAL to AFTER_APPROVAL, so Apple releases it the moment it is approved.
  if (AFTER_APPROVAL) {
    if (!['WAITING_FOR_REVIEW', 'IN_REVIEW', 'PREPARE_FOR_SUBMISSION'].includes(appStoreState)) {
      console.error(`not changed: the version is ${appStoreState}`);
      process.exit(1);
    }
    const p = await request('PATCH', `/v1/appStoreVersions/${v.id}`, { data: { type: 'appStoreVersions', id: v.id, attributes: { releaseType: 'AFTER_APPROVAL' } } });
    if (p.s >= 300) { console.error('release type → HTTP ' + p.s, JSON.stringify(p.b, null, 2)); process.exit(1); }
    const back = await request('GET', `/v1/appStoreVersions/${v.id}?fields[appStoreVersions]=appStoreState,releaseType`);
    console.log('read back:', JSON.stringify(back.b.data && back.b.data.attributes));
    return;
  }
  if (!RELEASE) return;
  if (appStoreState !== 'PENDING_DEVELOPER_RELEASE') {
    console.error(`not released: the version is ${appStoreState}, not PENDING_DEVELOPER_RELEASE (approved and waiting)`);
    process.exit(1);
  }
  const r = await request('POST', '/v1/appStoreVersionReleaseRequests', {
    data: { type: 'appStoreVersionReleaseRequests', relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: v.id } } } },
  });
  if (r.s >= 300) { console.error('release request → HTTP ' + r.s, JSON.stringify(r.b, null, 2)); process.exit(1); }
  console.log(`release requested for ${VERSION}; confirm with node scripts/asc-appstore-status.cjs (READY_FOR_SALE)`);
})().catch((e) => { console.error(e); process.exit(1); });
