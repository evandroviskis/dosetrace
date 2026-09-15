// TestFlight status check for DoseTrace (App Store Connect API).
// Prints each recent build's processing state, whether it's in a TestFlight
// group, and its beta-review state — so "on TestFlight" is never claimed on
// faith. Requires the ASC .p8 key at ~/Downloads/AuthKey_N493SYFP2T.p8 (the key
// itself is the only secret and is NOT in this repo).
//   node scripts/asc-tf-status.cjs
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

const KEY_ID = 'N493SYFP2T';
const ISSUER = '69a6de85-8f0f-47e3-e053-5b8c7c11a4d1';
const APP_ID = '6761788157';
const KEY_PATH = process.env.HOME + '/Downloads/AuthKey_N493SYFP2T.p8';

if (!fs.existsSync(KEY_PATH)) {
  console.error('ASC key missing at', KEY_PATH, '- cannot check TestFlight status.');
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
  const g = await api(`/v1/betaGroups?filter[app]=${APP_ID}&limit=20&fields[betaGroups]=name,isInternalGroup,publicLinkEnabled,publicLink`);
  console.log('=== Beta groups ===');
  for (const b of (g.b.data || [])) {
    const a = b.attributes;
    console.log(`${a.isInternalGroup ? 'INTERNAL' : 'EXTERNAL'}  "${a.name}"  publicLink=${a.publicLinkEnabled ? a.publicLink : 'off'}`);
  }
  // NOTE: the build->betaGroups relationship GET is forbidden by Apple
  // (GET_RELATED not allowed), so group membership can't be read here. The
  // reliable external-delivery signal is the beta-review state:
  //   APPROVED           -> live on the Early Birds public link (installable)
  //   WAITING_FOR_REVIEW  -> submitted, waiting on Apple (with a submittedDate)
  //   none / no date      -> NOT submitted (the step that kept getting skipped)
  const builds = await api(`/v1/builds?filter[app]=${APP_ID}&limit=6&sort=-uploadedDate&fields[builds]=version,uploadedDate,processingState,expired`);
  console.log('\n=== Recent builds (external delivery via beta-review state) ===');
  for (const b of (builds.b.data || [])) {
    const a = b.attributes;
    const rev = await api(`/v1/builds/${b.id}/betaAppReviewSubmission`);
    const sub = (rev.s === 200 && rev.b.data) ? rev.b.data.attributes : null;
    const state = sub ? sub.betaReviewState : 'none';
    const submitted = !!(sub && sub.submittedDate);
    let verdict;
    if (a.expired) verdict = '— expired';
    else if (state === 'APPROVED') verdict = '✅ LIVE on the Early Birds link';
    else if (state === 'WAITING_FOR_REVIEW' && submitted) verdict = '⏳ submitted — awaiting Apple review';
    else if (state === 'WAITING_FOR_REVIEW') verdict = '⚠ review record exists but NOT submitted';
    else verdict = '⚠ NOT submitted for external review (add to Early Birds + submit)';
    console.log(`build ${a.version}  proc=${a.processingState}  expired=${a.expired}  betaReview=${state}  ${verdict}`);
  }
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
