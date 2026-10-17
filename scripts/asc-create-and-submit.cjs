// App Store release of the app.json version via the ASC API: create (or reuse) the
// App Store version, attach --build <n>, releaseType AFTER_APPROVAL (automatic release
// once Apple approves), NO phased release (100% at once), What's New x6 from
// release-notes/<version>.json, read everything back, then submit for review.
//
//   node scripts/asc-create-and-submit.cjs --build 70            # DRY RUN: read-only, no writes
//   node scripts/asc-create-and-submit.cjs --build 70 --write    # writes + read-back, NO submit
//   node scripts/asc-create-and-submit.cjs --build 70 --submit   # writes + read-back + submit
//
// The dry run only sends GET requests: it reports the build, the version, the current
// releaseType / phased release / notes / screenshots against what the real run will set.
// Any 4xx in a write prints the body and stops.
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { assertIosNotes } = require('./releaseNotes.cjs');

const KEY_ID = 'N493SYFP2T';
const ISSUER = '69a6de85-8f0f-47e3-e053-5b8c7c11a4d1';
const APP_ID = '6761788157';
const VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).expo.version;
const bi = process.argv.indexOf('--build');
const BUILD_VERSION = bi > 0 ? process.argv[bi + 1] : null;
if (!BUILD_VERSION || !/^\d+$/.test(BUILD_VERSION)) {
  console.error('usage: asc-create-and-submit.cjs --build <buildNumber> [--write | --submit]');
  process.exit(1);
}
const SUBMIT = process.argv.includes('--submit');
const WRITE = SUBMIT || process.argv.includes('--write');
const RELEASE_TYPE = 'AFTER_APPROVAL';
const p8 = require('./ascKey.cjs').readKey();

// What's New from release-notes/<version>.json (made from the "ios" block of
// store/whats-new-<version>.json, keyed like Play). ASC uses "it" for Italian.
const NOTES_FILE = path.join(__dirname, '..', 'release-notes', VERSION + '.json');
if (!fs.existsSync(NOTES_FILE)) { console.error('missing ' + NOTES_FILE); process.exit(1); }
const RAW_NOTES = JSON.parse(fs.readFileSync(NOTES_FILE, 'utf8'));
assertIosNotes(RAW_NOTES); // never names Android / Google Play (Apple 2.3.10), <= 4000 chars
const WHATS_NEW = Object.fromEntries(Object.entries(RAW_NOTES).map(([k, v]) => [k === 'it-IT' ? 'it' : k, v]));

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
const get = (p) => request('GET', p);
// Every non-GET goes through here, so the dry run cannot write.
function write(method, p, body) {
  if (!WRITE) throw new Error(`BUG: ${method} ${p} attempted in dry run`);
  return request(method, p, body);
}
function die(step, r) {
  console.error(`\n✖ ${step} → HTTP ${r.s}`);
  console.error(JSON.stringify(r.b, null, 2));
  process.exit(1);
}

const EDITABLE = new Set(['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY']);
const blockers = [];

async function readPhased(versionId) {
  const r = await get(`/v1/appStoreVersions/${versionId}/appStoreVersionPhasedRelease`);
  if (r.s === 404) return null;
  if (r.s >= 300) die('read phased release', r);
  return r.b.data || null;
}

async function verify(versionId, build) {
  // Read back exactly what the real run sets. In the dry run this is the current state.
  const v = await get(`/v1/appStoreVersions/${versionId}?fields[appStoreVersions]=versionString,appStoreState,releaseType,earliestReleaseDate`);
  if (v.s >= 300) die('read version', v);
  const a = v.b.data.attributes;
  const phased = await readPhased(versionId);
  const b = await get(`/v1/appStoreVersions/${versionId}/relationships/build`);
  const locs = await get(`/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=50&fields[appStoreVersionLocalizations]=locale,whatsNew`);
  const have = Object.fromEntries((locs.b.data || []).map((l) => [l.attributes.locale, l.attributes.whatsNew || '']));
  const rows = [
    ['releaseType', a.releaseType, RELEASE_TYPE, a.releaseType === RELEASE_TYPE],
    ['earliestReleaseDate', a.earliestReleaseDate, null, a.earliestReleaseDate == null],
    ['phased release', phased ? `${phased.attributes.phasedReleaseState} (${phased.id})` : 'none', 'none', !phased],
    ['build', b.b.data?.id || 'none', build ? build.id : `build ${BUILD_VERSION} (not in ASC)`, !!build && b.b.data?.id === build.id],
    ...Object.entries(WHATS_NEW).map(([loc, text]) => [`whatsNew ${loc}`, have[loc] === undefined ? 'no localization' : `${have[loc].length} chars`, `${text.length} chars`, have[loc] === text]),
  ];
  console.log(`\nverify (${WRITE ? 'read back after writes' : 'current state vs real run'}) — version ${a.versionString} state=${a.appStoreState}`);
  for (const [k, cur, want, ok] of rows) console.log(`  ${ok ? 'OK  ' : (WRITE ? 'FAIL' : 'SET ')} ${k.padEnd(20)} now=${cur ?? 'null'}  ->  ${want ?? 'null'}`);
  return rows.every((r) => r[3]);
}

async function screenshotReport(versionId, label) {
  const locs = await get(`/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=50&fields[appStoreVersionLocalizations]=locale,description,keywords`);
  console.log(`\nlocalizations + screenshots on ${label}:`);
  for (const l of (locs.b.data || [])) {
    const sets = await get(`/v1/appStoreVersionLocalizations/${l.id}/appScreenshotSets?fields[appScreenshotSets]=screenshotDisplayType,appScreenshots&include=appScreenshots&limit[appScreenshots]=10`);
    const counts = (sets.b.data || []).map((s) => `${s.attributes.screenshotDisplayType.replace('APP_', '')}=${s.relationships?.appScreenshots?.data?.length ?? '?'}`);
    console.log(`  ${l.attributes.locale.padEnd(6)} description=${l.attributes.description ? 'yes' : 'NO'} keywords=${l.attributes.keywords ? 'yes' : 'NO'} screenshots: ${counts.join(' ') || 'none'}`);
  }
  const missing = Object.keys(WHATS_NEW).filter((loc) => !(locs.b.data || []).some((l) => l.attributes.locale === loc));
  if (missing.length) console.log(`  locales in the notes with no localization yet (would be created, then need description/keywords): ${missing.join(', ')}`);
}

(async () => {
  console.log(`${SUBMIT ? 'SUBMIT' : WRITE ? 'WRITE (no submit)' : 'DRY RUN (read-only)'}: App Store ${VERSION}, build ${BUILD_VERSION}, releaseType ${RELEASE_TYPE}, no phased release`);

  // 0. the build
  const bl = await get(`/v1/builds?filter[app]=${APP_ID}&filter[version]=${BUILD_VERSION}&filter[preReleaseVersion.version]=${VERSION}&limit=1&fields[builds]=version,processingState,expired,usesNonExemptEncryption`);
  if (bl.s >= 300) die('find build', bl);
  const build = bl.b.data?.[0] || null;
  if (build) {
    const ba = build.attributes;
    console.log(`build ${VERSION} (${BUILD_VERSION}) id=${build.id} proc=${ba.processingState} expired=${ba.expired} usesNonExemptEncryption=${ba.usesNonExemptEncryption}`);
    if (ba.processingState !== 'VALID') blockers.push(`build ${BUILD_VERSION} processingState is ${ba.processingState}, not VALID`);
    if (ba.expired) blockers.push(`build ${BUILD_VERSION} is expired`);
    if (ba.usesNonExemptEncryption == null) blockers.push(`build ${BUILD_VERSION} has no export-compliance answer`);
  } else {
    const latest = await get(`/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=3&fields[builds]=version,processingState,preReleaseVersion&include=preReleaseVersion&fields[preReleaseVersions]=version`);
    const pre = Object.fromEntries((latest.b.included || []).map((x) => [x.id, x.attributes.version]));
    const list = (latest.b.data || []).map((x) => `${pre[x.relationships?.preReleaseVersion?.data?.id] || '?'} (${x.attributes.version}) ${x.attributes.processingState}`);
    console.log(`build ${VERSION} (${BUILD_VERSION}): NOT IN ASC. Latest uploads: ${list.join(', ') || 'none'}`);
    blockers.push(`build ${BUILD_VERSION} for ${VERSION} is not uploaded/processed yet (eas submit first)`);
  }

  // 1. the version
  const vs = await get(`/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=10&fields[appStoreVersions]=versionString,appStoreState,releaseType,createdDate`);
  if (vs.s >= 300) die('list versions', vs);
  const versions = vs.b.data || [];
  console.log('recent versions: ' + versions.slice(0, 4).map((v) => `${v.attributes.versionString} ${v.attributes.appStoreState} ${v.attributes.releaseType}`).join(' | '));
  const target = versions.find((v) => v.attributes.versionString === VERSION);
  const otherEditable = versions.find((v) => v.attributes.versionString !== VERSION && EDITABLE.has(v.attributes.appStoreState));
  if (!target && otherEditable) blockers.push(`another editable version exists (${otherEditable.attributes.versionString} ${otherEditable.attributes.appStoreState}); ASC allows one, so ${VERSION} cannot be created next to it`);
  if (target && !EDITABLE.has(target.attributes.appStoreState)) blockers.push(`version ${VERSION} is ${target.attributes.appStoreState}, not editable`);

  // Open review submissions (e.g. a draft the RL-6 subscriptions were added to on the website).
  const subs = await get(`/v1/reviewSubmissions?filter[app]=${APP_ID}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES&fields[reviewSubmissions]=state,submittedDate`);
  const openSubs = subs.b.data || [];
  console.log(`open review submissions: ${openSubs.map((s) => `${s.id} ${s.attributes.state}`).join(', ') || 'none'}`);

  if (!WRITE) {
    if (target) {
      console.log(`version ${VERSION} exists id=${target.id} state=${target.attributes.appStoreState}`);
      console.log(`would PATCH releaseType=${RELEASE_TYPE} earliestReleaseDate=null; delete any INACTIVE phased release; attach build; set What's New x${Object.keys(WHATS_NEW).length}`);
      await verify(target.id, build);
      await screenshotReport(target.id, `version ${VERSION}`);
    } else {
      console.log(`version ${VERSION} does not exist yet: would CREATE it with releaseType=${RELEASE_TYPE}, then delete any phased release ASC adds, attach build, set What's New for ${Object.keys(WHATS_NEW).join(', ')}`);
      const prev = versions[0];
      if (prev) {
        console.log(`(${prev.attributes.versionString} is releaseType ${prev.attributes.releaseType}; phased release: ${(await readPhased(prev.id))?.attributes?.phasedReleaseState || 'none'})`);
        await screenshotReport(prev.id, `version ${prev.attributes.versionString} (ASC copies these into the new version)`);
      }
    }
    console.log(blockers.length ? `\nNOT READY for the real run:\n  - ${blockers.join('\n  - ')}` : '\nREADY: no blockers found.');
    console.log('DRY RUN: nothing was written.');
    if (blockers.length) process.exitCode = 2; // not ready, like the Play script
    return;
  }

  if (blockers.length) { console.error(`\n✖ not ready:\n  - ${blockers.join('\n  - ')}`); process.exit(1); }

  // 2. create or reuse the version, releaseType AFTER_APPROVAL
  let versionId = target?.id;
  if (versionId) {
    const up = await write('PATCH', `/v1/appStoreVersions/${versionId}`, {
      data: { type: 'appStoreVersions', id: versionId, attributes: { releaseType: RELEASE_TYPE, earliestReleaseDate: null } },
    });
    if (up.s >= 300) die('set releaseType', up);
    console.log(`version ${VERSION} id=${versionId}: releaseType=${RELEASE_TYPE}`);
  } else {
    const cr = await write('POST', '/v1/appStoreVersions', {
      data: {
        type: 'appStoreVersions',
        attributes: { platform: 'IOS', versionString: VERSION, releaseType: RELEASE_TYPE },
        relationships: { app: { data: { type: 'apps', id: APP_ID } } },
      },
    });
    if (cr.s >= 300) die('create version', cr);
    versionId = cr.b.data.id;
    console.log(`created version ${VERSION} id=${versionId} releaseType=${cr.b.data.attributes.releaseType}`);
  }

  // 3. no phased release: remove one if it exists (only possible before it starts)
  const phased = await readPhased(versionId);
  if (phased) {
    if (phased.attributes.phasedReleaseState !== 'INACTIVE') {
      console.error(`✖ phased release ${phased.id} is ${phased.attributes.phasedReleaseState}; cannot remove it`); process.exit(1);
    }
    const del = await write('DELETE', `/v1/appStoreVersionPhasedReleases/${phased.id}`);
    if (del.s >= 300) die('delete phased release', del);
    console.log('phased release removed');
  } else {
    console.log('no phased release');
  }

  // 4. attach the build
  const at = await write('PATCH', `/v1/appStoreVersions/${versionId}/relationships/build`, {
    data: { type: 'builds', id: build.id },
  });
  if (at.s >= 300) die('attach build', at);
  console.log('attached build', BUILD_VERSION);

  // 5. What's New per locale (create or patch existing localization)
  const locs = await get(`/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=50&fields[appStoreVersionLocalizations]=locale,whatsNew`);
  const byLocale = {};
  for (const l of (locs.b.data || [])) byLocale[l.attributes.locale] = l.id;
  for (const [locale, text] of Object.entries(WHATS_NEW)) {
    if (byLocale[locale]) {
      const up = await write('PATCH', `/v1/appStoreVersionLocalizations/${byLocale[locale]}`, {
        data: { type: 'appStoreVersionLocalizations', id: byLocale[locale], attributes: { whatsNew: text } },
      });
      if (up.s >= 300) die('patch whatsNew ' + locale, up);
      console.log('whatsNew set', locale);
    } else {
      const cr = await write('POST', '/v1/appStoreVersionLocalizations', {
        data: { type: 'appStoreVersionLocalizations', attributes: { locale, whatsNew: text },
          relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } } } },
      });
      if (cr.s >= 300) die('create whatsNew ' + locale, cr);
      console.log('whatsNew created', locale);
    }
  }

  // 6. read everything back; never submit on a mismatch
  if (!(await verify(versionId, build))) { console.error('\n✖ read-back does not match; not submitting'); process.exit(1); }
  await screenshotReport(versionId, `version ${VERSION}`);

  if (!SUBMIT) { console.log(`\nDONE (--write, no --submit): version ${VERSION} ready with build ${BUILD_VERSION}, ${RELEASE_TYPE}, no phased release. Not submitted.`); return; }

  // 7. Submit for review: reuse an open draft submission (e.g. one holding the RL-6
  // subscriptions added on the website), else create one.
  let rsId = openSubs.find((s) => s.attributes.state === 'READY_FOR_REVIEW')?.id;
  if (!rsId) {
    const rs = await write('POST', '/v1/reviewSubmissions', {
      data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' },
        relationships: { app: { data: { type: 'apps', id: APP_ID } } } },
    });
    if (rs.s >= 300) die('create reviewSubmission', rs);
    rsId = rs.b.data.id;
  }
  console.log('reviewSubmission', rsId);

  const it = await write('POST', '/v1/reviewSubmissionItems', {
    data: { type: 'reviewSubmissionItems',
      relationships: {
        reviewSubmission: { data: { type: 'reviewSubmissions', id: rsId } },
        appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } },
      } },
  });
  if (it.s >= 300) die('add reviewSubmissionItem', it);
  console.log('added version to reviewSubmission');

  const sub = await write('PATCH', `/v1/reviewSubmissions/${rsId}`, {
    data: { type: 'reviewSubmissions', id: rsId, attributes: { submitted: true } },
  });
  if (sub.s >= 300) die('submit reviewSubmission', sub);
  console.log(`\n✅ SUBMITTED ${VERSION} (build ${BUILD_VERSION}) for App Store review, ${RELEASE_TYPE}. state=`, sub.b.data?.attributes?.state);
  const after = await get(`/v1/appStoreVersions/${versionId}?fields[appStoreVersions]=appStoreState,releaseType`);
  console.log(`read back: state=${after.b.data?.attributes?.appStoreState} releaseType=${after.b.data?.attributes?.releaseType} phased=${(await readPhased(versionId)) ? 'PRESENT' : 'none'}`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
