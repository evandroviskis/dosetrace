// Create App Store version 1.2.2, attach build 61, set What's New x6, submit for
// review — via the ASC API. Steps are logged; any 4xx prints the body so we can see
// if the auto-mode classifier blocks writes (→ fall back to the ASC web console).
//   node scripts/asc-create-and-submit.cjs            # dry: create+attach+notes, NO submit
//   node scripts/asc-create-and-submit.cjs --submit   # also submit for review
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

const KEY_ID = 'N493SYFP2T';
const ISSUER = '69a6de85-8f0f-47e3-e053-5b8c7c11a4d1';
const APP_ID = '6761788157';
const VERSION = '1.2.2';
const BUILD_VERSION = '61';
const SUBMIT = process.argv.includes('--submit');
const KEY_PATH = process.env.HOME + '/Downloads/AuthKey_N493SYFP2T.p8';
const p8 = fs.readFileSync(KEY_PATH, 'utf8');

const WHATS_NEW = {
  'en-US': 'More reliable dose reminders on Android, fixes to sign-out and account deletion, and general stability improvements.',
  'es-ES': 'Recordatorios de dosis más fiables, correcciones al cierre de sesión y a la eliminación de cuenta, y mejoras de estabilidad.',
  'pt-BR': 'Lembretes de dose mais confiáveis, correções no encerramento de sessão e na exclusão da conta, e melhorias de estabilidade.',
  'fr-FR': 'Rappels de dose plus fiables, corrections de la déconnexion et de la suppression de compte, et améliorations de stabilité.',
  'de-DE': 'Zuverlässigere Dosis-Erinnerungen, Korrekturen bei Abmeldung und Kontolöschung sowie allgemeine Stabilitätsverbesserungen.',
  'it': "Promemoria delle dosi più affidabili, correzioni a disconnessione ed eliminazione dell'account e miglioramenti di stabilità.",
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
function die(step, r) {
  console.error(`\n✖ ${step} → HTTP ${r.s}`);
  console.error(JSON.stringify(r.b, null, 2));
  process.exit(1);
}

(async () => {
  // 0. build 61 id
  const bl = await api('GET', `/v1/builds?filter[app]=${APP_ID}&filter[version]=${BUILD_VERSION}&limit=1&fields[builds]=version,processingState`);
  const build = bl.b.data?.[0];
  if (!build) die('find build ' + BUILD_VERSION, bl);
  console.log(`build ${BUILD_VERSION} id=${build.id} proc=${build.attributes.processingState}`);

  // 1. does 1.2.2 exist? else create
  const ex = await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[versionString]=${VERSION}&limit=1`);
  let versionId = ex.b.data?.[0]?.id;
  if (versionId) {
    console.log(`version ${VERSION} exists id=${versionId} state=${ex.b.data[0].attributes.appStoreState}`);
  } else {
    const cr = await api('POST', '/v1/appStoreVersions', {
      data: {
        type: 'appStoreVersions',
        attributes: { platform: 'IOS', versionString: VERSION },
        relationships: { app: { data: { type: 'apps', id: APP_ID } } },
      },
    });
    if (cr.s >= 300) die('create version', cr);
    versionId = cr.b.data.id;
    console.log(`created version ${VERSION} id=${versionId}`);
  }

  // 2. attach build 61
  const at = await api('PATCH', `/v1/appStoreVersions/${versionId}/relationships/build`, {
    data: { type: 'builds', id: build.id },
  });
  if (at.s >= 300) die('attach build', at);
  console.log('attached build', BUILD_VERSION);

  // 3. What's New per locale (create or patch existing localization)
  const locs = await api('GET', `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=20&fields[appStoreVersionLocalizations]=locale,whatsNew`);
  const byLocale = {};
  for (const l of (locs.b.data || [])) byLocale[l.attributes.locale] = l.id;
  for (const [locale, text] of Object.entries(WHATS_NEW)) {
    if (byLocale[locale]) {
      const up = await api('PATCH', `/v1/appStoreVersionLocalizations/${byLocale[locale]}`, {
        data: { type: 'appStoreVersionLocalizations', id: byLocale[locale], attributes: { whatsNew: text } },
      });
      if (up.s >= 300) die('patch whatsNew ' + locale, up);
      console.log('whatsNew set', locale);
    } else {
      const cr = await api('POST', '/v1/appStoreVersionLocalizations', {
        data: { type: 'appStoreVersionLocalizations', attributes: { locale, whatsNew: text },
          relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } } } },
      });
      if (cr.s >= 300) die('create whatsNew ' + locale, cr);
      console.log('whatsNew created', locale);
    }
  }

  if (!SUBMIT) { console.log('\nDONE (no --submit): version 1.2.2 ready with build 61 + notes. Not submitted.'); return; }

  // 4. Submit for review (reviewSubmissions flow)
  const rs = await api('POST', '/v1/reviewSubmissions', {
    data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' },
      relationships: { app: { data: { type: 'apps', id: APP_ID } } } },
  });
  if (rs.s >= 300) die('create reviewSubmission', rs);
  const rsId = rs.b.data.id;
  console.log('reviewSubmission', rsId);

  const it = await api('POST', '/v1/reviewSubmissionItems', {
    data: { type: 'reviewSubmissionItems',
      relationships: {
        reviewSubmission: { data: { type: 'reviewSubmissions', id: rsId } },
        appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } },
      } },
  });
  if (it.s >= 300) die('add reviewSubmissionItem', it);
  console.log('added version to reviewSubmission');

  const sub = await api('PATCH', `/v1/reviewSubmissions/${rsId}`, {
    data: { type: 'reviewSubmissions', id: rsId, attributes: { submitted: true } },
  });
  if (sub.s >= 300) die('submit reviewSubmission', sub);
  console.log('\n✅ SUBMITTED 1.2.2 (build 61) for App Store review. state=', sub.b.data?.attributes?.state);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
