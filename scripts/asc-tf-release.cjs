// Release a TestFlight build to EVERY TestFlight tester (founder 2026-10-15: "cada vez que a gente
// faça um update, esse update vá para todo mundo que tem o TestFlight"): add the build to the
// Early Birds external group (public link) and submit it for Beta App Review, then VERIFY the
// review submission has a real submittedDate. The internal group gets every build by itself.
//   node scripts/asc-tf-release.cjs <buildNumber>
const crypto = require('crypto');
const https = require('https');

const KEY_ID = 'N493SYFP2T';
const ISSUER = '69a6de85-8f0f-47e3-e053-5b8c7c11a4d1';
const APP_ID = '6761788157';
const EARLY_BIRDS = '0980fae5-a7cf-4b29-9f15-0504f4058616';
const p8 = require('./ascKey.cjs').readKey();
const b64 = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const now = Math.floor(Date.now() / 1000);
const si = b64(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })) + '.' +
  b64(JSON.stringify({ iss: ISSUER, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' }));
const TOKEN = si + '.' + b64(crypto.sign('sha256', Buffer.from(si), { key: p8, dsaEncoding: 'ieee-p1363' }));
const api = (method, p, body) => new Promise((res, rej) => {
  const data = body ? JSON.stringify(body) : null;
  const r = https.request('https://api.appstoreconnect.apple.com' + p, {
    method, headers: { Authorization: 'Bearer ' + TOKEN, ...(data ? { 'Content-Type': 'application/json' } : {}) },
  }, (x) => { let d = ''; x.on('data', (c) => (d += c)); x.on('end', () => { let j; try { j = JSON.parse(d || '{}'); } catch { j = d; } res({ s: x.statusCode, b: j }); }); });
  r.on('error', rej); if (data) r.write(data); r.end();
});

(async () => {
  const num = process.argv[2];
  if (!num) { console.error('usage: node scripts/asc-tf-release.cjs <buildNumber>'); process.exit(2); }
  const bl = await api('GET', `/v1/builds?filter[app]=${APP_ID}&filter[version]=${num}&limit=1`);
  const build = bl.b.data && bl.b.data[0];
  if (!build) { console.error('build not found:', num); process.exit(1); }
  console.log('build', num, build.id, 'processing', build.attributes.processingState);
  if (build.attributes.processingState !== 'VALID') { console.error('not VALID yet'); process.exit(1); }

  const add = await api('POST', `/v1/betaGroups/${EARLY_BIRDS}/relationships/builds`, { data: [{ type: 'builds', id: build.id }] });
  console.log('add to Early Birds →', add.s, add.s === 204 ? 'ok' : JSON.stringify(add.b).slice(0, 300));

  const existing = await api('GET', `/v1/builds/${build.id}/betaAppReviewSubmission`);
  let sub = existing.b && existing.b.data;
  if (!sub) {
    const r = await api('POST', '/v1/betaAppReviewSubmissions', { data: { type: 'betaAppReviewSubmissions', relationships: { build: { data: { type: 'builds', id: build.id } } } } });
    console.log('submit beta review →', r.s, r.s === 201 ? 'ok' : JSON.stringify(r.b).slice(0, 400));
  }
  const v = await api('GET', `/v1/builds/${build.id}/betaAppReviewSubmission`);
  const a = v.b && v.b.data && v.b.data.attributes;
  // APPROVED needs no submittedDate: Apple auto-approves a new build of an already-approved version
  // (build 67, 2026-10-16: APPROVED with submittedDate null, live on the Early Birds link).
  const ok = !!(a && ((a.betaReviewState === 'APPROVED') || (a.submittedDate && ['WAITING_FOR_REVIEW', 'IN_REVIEW'].includes(a.betaReviewState))));
  console.log('VERIFY beta review:', a ? `${a.betaReviewState} submitted ${a.submittedDate}` : 'none', ok ? '→ DELIVERED TO REVIEW' : '→ NOT DELIVERED');
  process.exit(ok ? 0 : 1);
})();
