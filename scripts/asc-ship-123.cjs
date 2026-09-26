// Ship iOS 1.2.3: reuse the editable version object (currently labeled 1.2.2, review
// canceled → DEVELOPER_REJECTED — Apple won't let it be deleted since a build was
// uploaded), rename it to 1.2.3, attach build 62, set What's New x6, submit for review.
//   node scripts/asc-ship-123.cjs            # rename+attach+notes, NO submit
//   node scripts/asc-ship-123.cjs --submit   # also submit for review
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

const KEY_ID = 'N493SYFP2T';
const ISSUER = '69a6de85-8f0f-47e3-e053-5b8c7c11a4d1';
const APP_ID = '6761788157';
const VERSION_ID = 'cb308db3-c151-4900-a75c-22f43a3b29a9'; // the editable version object
const NEW_VERSION = '1.2.3';
const BUILD_VERSION = '62';
const SUBMIT = process.argv.includes('--submit');
const p8 = require('./ascKey.cjs').readKey();

const WHATS_NEW = {
  'en-US': 'The reality-check food-log reminder now fires reliably, plus stability fixes.',
  'es-ES': 'El aviso de registro de comidas de la comprobación de progreso ahora se envía de forma fiable, además de correcciones de estabilidad.',
  'pt-BR': 'O lembrete de registro de refeições do acompanhamento agora é enviado de forma confiável, além de correções de estabilidade.',
  'fr-FR': 'Le rappel de journal alimentaire du suivi se déclenche désormais de manière fiable, avec des corrections de stabilité.',
  'de-DE': 'Die Ess-Erinnerung des Reality-Checks wird jetzt zuverlässig gesendet, dazu Stabilitätskorrekturen.',
  'it': 'Il promemoria del diario alimentare del monitoraggio ora arriva in modo affidabile, oltre a correzioni di stabilità.',
};

const b64 = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const now = Math.floor(Date.now() / 1000);
const si = b64(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })) + '.' +
  b64(JSON.stringify({ iss: ISSUER, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' }));
const TOKEN = si + '.' + b64(crypto.sign('sha256', Buffer.from(si), { key: p8, dsaEncoding: 'ieee-p1363' }));

function api(method, p, body) {
  return new Promise((res, rej) => {
    const data = body ? JSON.stringify(body) : null;
    const r = https.request('https://api.appstoreconnect.apple.com' + p, {
      method, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
    }, (x) => { let d = ''; x.on('data', (c) => (d += c)); x.on('end', () => { try { res({ s: x.statusCode, b: JSON.parse(d || '{}') }); } catch { res({ s: x.statusCode, b: d }); } }); });
    r.on('error', rej); if (data) r.write(data); r.end();
  });
}
function die(step, r) { console.error(`\n✖ ${step} → HTTP ${r.s}`); console.error(JSON.stringify(r.b, null, 2)); process.exit(1); }

(async () => {
  const bl = await api('GET', `/v1/builds?filter[app]=${APP_ID}&filter[version]=${BUILD_VERSION}&limit=1&fields[builds]=version,processingState`);
  const build = bl.b.data?.[0];
  if (!build) die('find build ' + BUILD_VERSION, bl);
  console.log(`build ${BUILD_VERSION} id=${build.id} proc=${build.attributes.processingState}`);

  // rename version → 1.2.3
  const rn = await api('PATCH', `/v1/appStoreVersions/${VERSION_ID}`, {
    data: { type: 'appStoreVersions', id: VERSION_ID, attributes: { versionString: NEW_VERSION } },
  });
  if (rn.s >= 300) die('rename version', rn);
  console.log('version renamed →', rn.b.data.attributes.versionString, 'state=', rn.b.data.attributes.appStoreState);

  // attach build 62
  const at = await api('PATCH', `/v1/appStoreVersions/${VERSION_ID}/relationships/build`, { data: { type: 'builds', id: build.id } });
  if (at.s >= 300) die('attach build', at);
  console.log('attached build', BUILD_VERSION);

  // What's New per locale
  const locs = await api('GET', `/v1/appStoreVersions/${VERSION_ID}/appStoreVersionLocalizations?limit=20&fields[appStoreVersionLocalizations]=locale,whatsNew`);
  const byLocale = {}; for (const l of (locs.b.data || [])) byLocale[l.attributes.locale] = l.id;
  for (const [locale, text] of Object.entries(WHATS_NEW)) {
    if (byLocale[locale]) {
      const up = await api('PATCH', `/v1/appStoreVersionLocalizations/${byLocale[locale]}`, { data: { type: 'appStoreVersionLocalizations', id: byLocale[locale], attributes: { whatsNew: text } } });
      if (up.s >= 300) die('patch whatsNew ' + locale, up); console.log('whatsNew set', locale);
    } else {
      const cr = await api('POST', '/v1/appStoreVersionLocalizations', { data: { type: 'appStoreVersionLocalizations', attributes: { locale, whatsNew: text }, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: VERSION_ID } } } } });
      if (cr.s >= 300) die('create whatsNew ' + locale, cr); console.log('whatsNew created', locale);
    }
  }

  if (!SUBMIT) { console.log('\nDONE (no --submit): 1.2.3 ready with build 62 + notes. Not submitted.'); return; }

  const rs = await api('POST', '/v1/reviewSubmissions', { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: APP_ID } } } } });
  if (rs.s >= 300) die('create reviewSubmission', rs);
  const rsId = rs.b.data.id; console.log('reviewSubmission', rsId);
  const it = await api('POST', '/v1/reviewSubmissionItems', { data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: rsId } }, appStoreVersion: { data: { type: 'appStoreVersions', id: VERSION_ID } } } } });
  if (it.s >= 300) die('add reviewSubmissionItem', it);
  console.log('added version to reviewSubmission');
  const sub = await api('PATCH', `/v1/reviewSubmissions/${rsId}`, { data: { type: 'reviewSubmissions', id: rsId, attributes: { submitted: true } } });
  if (sub.s >= 300) die('submit reviewSubmission', sub);
  console.log('\n✅ SUBMITTED 1.2.3 (build 62) for App Store review. state=', sub.b.data?.attributes?.state);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
