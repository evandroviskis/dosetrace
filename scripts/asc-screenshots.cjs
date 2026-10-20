#!/usr/bin/env node
// Upload the App Store screenshots of one version from store/screenshots/apple/<lang>/0N_*.png
// (1320×2868, the 6.9" iPhone size, display type APP_IPHONE_67) to every localization of that
// version. Each set is replaced: the old screenshots are deleted, the new ones are uploaded ONE AT
// A TIME (memory: parallel uploads failed), each is checked COMPLETE, and the order is read back.
//   node scripts/asc-screenshots.cjs                  # dry run: shows what would change, writes nothing
//   node scripts/asc-screenshots.cjs --commit         # replaces the screenshots
//   node scripts/asc-screenshots.cjs --commit pt-BR   # one localization only
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { KEY_ID, readKey } = require('./ascKey.cjs');

const ISSUER = '69a6de85-8f0f-47e3-e053-5b8c7c11a4d1';
const APP_ID = '6761788157';
const VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).expo.version;
const COMMIT = process.argv.includes('--commit');
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DISPLAY = 'APP_IPHONE_67';
const DIR = path.join(__dirname, '..', 'store', 'screenshots', 'apple');
const LANG = { 'en-US': 'en', 'es-ES': 'es', 'pt-BR': 'pt', 'fr-FR': 'fr', 'de-DE': 'de', it: 'it', 'it-IT': 'it' };

const b64 = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const si = b64(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })) + '.' +
    b64(JSON.stringify({ iss: ISSUER, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' }));
  return si + '.' + b64(crypto.sign('sha256', Buffer.from(si), { key: readKey(), dsaEncoding: 'ieee-p1363' }));
}
function raw(method, url, headers, body) {
  return new Promise((res, rej) => {
    const r = https.request(url, { method, headers: { ...headers, ...(body ? { 'Content-Length': body.length } : {}) } }, (x) => {
      let d = ''; x.on('data', (c) => (d += c)); x.on('end', () => { let b; try { b = JSON.parse(d || '{}'); } catch { b = d; } res({ s: x.statusCode, b }); });
    });
    r.on('error', rej); if (body) r.write(body); r.end();
  });
}
const api = (method, p, body) => raw(method, 'https://api.appstoreconnect.apple.com' + p,
  { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }, body ? Buffer.from(JSON.stringify(body)) : null);
const get = (p) => api('GET', p);
function write(method, p, body) { if (!COMMIT) throw new Error(`BUG: ${method} ${p} in dry run`); return api(method, p, body); }
function must(r, step) { if (r.s >= 300) { console.error(`✖ ${step} → HTTP ${r.s}\n` + JSON.stringify(r.b, null, 2)); process.exit(1); } return r.b; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function uploadOne(setId, file) {
  const bytes = fs.readFileSync(file);
  const created = must(await write('POST', '/v1/appScreenshots', { data: { type: 'appScreenshots',
    attributes: { fileName: path.basename(file), fileSize: bytes.length },
    relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } } } }), 'reserve ' + file).data;
  for (const op of created.attributes.uploadOperations) {
    const part = bytes.subarray(op.offset, op.offset + op.length);
    const headers = Object.fromEntries((op.requestHeaders || []).map((h) => [h.name, h.value]));
    const r = await raw(op.method, op.url, headers, part);
    if (r.s >= 300) { console.error(`✖ upload part ${file} → ${r.s}`); process.exit(1); }
  }
  const md5 = crypto.createHash('md5').update(bytes).digest('hex');
  must(await write('PATCH', `/v1/appScreenshots/${created.id}`, { data: { type: 'appScreenshots', id: created.id,
    attributes: { uploaded: true, sourceFileChecksum: md5 } } }), 'commit ' + file);
  for (let i = 0; i < 100; i++) {
    const s = must(await get(`/v1/appScreenshots/${created.id}`), 'state').data.attributes.assetDeliveryState;
    if (s && s.state === 'COMPLETE') return created.id;
    if (s && s.state === 'FAILED') { console.error(`✖ ${file} FAILED: ${JSON.stringify(s.errors)}`); process.exit(1); }
    await sleep(3000);
  }
  console.error(`✖ ${file} not COMPLETE after 5 min`); process.exit(1);
}

(async () => {
  const vers = must(await get(`/v1/apps/${APP_ID}/appStoreVersions?filter[versionString]=${VERSION}&filter[platform]=IOS`), 'version').data;
  if (!vers.length) { console.error(`version ${VERSION} not in ASC (run asc-create-and-submit.cjs --write first)`); process.exit(2); }
  const v = vers[0];
  console.log(`version ${VERSION} state=${v.attributes.appStoreState} ${COMMIT ? '(COMMIT)' : '(dry run)'}`);
  const locs = must(await get(`/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations?limit=50`), 'localizations').data;
  for (const loc of locs) {
    const code = loc.attributes.locale;
    if (ONLY.length && !ONLY.includes(code)) continue;
    const lang = LANG[code];
    const files = lang && fs.existsSync(path.join(DIR, lang)) ? fs.readdirSync(path.join(DIR, lang)).filter((f) => /^\d\d_.*\.png$/.test(f)).sort() : [];
    if (!files.length) { console.log(`${code}: no files, skipped`); continue; }
    const sets = must(await get(`/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=50`), 'sets').data;
    let set = sets.find((s) => s.attributes.screenshotDisplayType === DISPLAY);
    const old = set ? must(await get(`/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`), 'shots').data : [];
    console.log(`${code}: ${old.length} old → ${files.length} new (${files.join(', ')})`);
    if (!COMMIT) continue;
    if (!set) set = must(await write('POST', '/v1/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: DISPLAY },
      relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } } } }), 'create set').data;
    for (const o of old) must(await write('DELETE', `/v1/appScreenshots/${o.id}`), 'delete old');
    const ids = [];
    for (const f of files) { ids.push(await uploadOne(set.id, path.join(DIR, lang, f))); process.stdout.write('.'); }
    must(await write('PATCH', `/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`, { data: ids.map((id) => ({ type: 'appScreenshots', id })) }), 'order');
    const back = must(await get(`/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`), 'read back').data;
    const ok = back.length === ids.length && back.every((b, i) => b.id === ids[i]);
    console.log(` ${code}: ${back.length} uploaded, order ${ok ? 'OK' : 'MISMATCH'} (${back.map((b) => b.attributes.fileName).join(', ')})`);
    if (!ok) process.exit(1);
  }
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
