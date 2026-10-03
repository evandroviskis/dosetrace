'use strict';
// Founder decision "A" (2026-10-03): free users really get 3 free scans a month — lab
// reports, vaccine cards and vial labels combined — as the copy says. The server already
// keeps that one monthly budget (supabase/functions/extract-bloodwork: 3 free / 20 Premium,
// counted per user per calendar month across every kind). The app no longer adds its own
// gates in front of it:
//   - the lab upload stopped after ONE upload per device (AsyncStorage
//     'dosetrace_bloodwork_uploads') → free users then saw the upgrade sheet although 2 of
//     their 3 monthly scans were still unused;
//   - the vaccine-card scan was Premium-only on the client.
// Vial labels never had a client gate. After the change every kind asks the server, and a
// refused scan shows the server's own limit (A-60).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const BODY = read('screens', 'BodyScreen.js');
const VAX = read('screens', 'components', 'VaccinesSection.js');
const PROTO = read('screens', 'ProtocolsScreen.js');
const INDEX = read('supabase', 'functions', 'extract-bloodwork', 'index.ts');

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => walk(c, visit));
    else if (v && typeof v.type === 'string') walk(v, visit);
  }
}
function fnCode(src, name) {
  let hit = null;
  walk(parse(src, { sourceType: 'module', plugins: ['jsx'] }), (n) => {
    if (!hit && n.type === 'FunctionDeclaration' && n.id && n.id.name === name) hit = src.slice(n.start, n.end);
  });
  assert.ok(hit, `function ${name} exists`);
  return hit;
}

test('A: the server keeps ONE monthly budget for every kind — 3 free, 20 Premium (no server change needed)', () => {
  const q = require('../supabase/functions/extract-bloodwork/quota.ts');
  assert.equal(q.FREE_SCAN_LIMIT, 3);
  assert.equal(q.decideQuota({ count: 2, email: 'a@b.c', lookup: 'skipped' }).allowed, true, 'a free user\'s 3rd scan this month');
  assert.deepEqual(q.decideQuota({ count: 3, email: 'a@b.c', lookup: 'inactive' }), { allowed: false, limit: 3 }, 'the 4th is refused, limit 3');
  // counted per user and month, never per kind; every kind writes its row
  const count = INDEX.slice(INDEX.indexOf('count: async'), INDEX.indexOf('reserve: async'));
  assert.match(count, /\.eq\('user_id', user\.id\)\s*\n\s*\.gte\('created_at', monthStart\)/);
  assert.doesNotMatch(count, /\.eq\('kind'/);
  assert.match(INDEX, /\.insert\(\{ user_id: user\.id, kind \}\)/);
  assert.match(INDEX, /body\?\.kind === 'vaccines' \? 'vaccines' : body\?\.kind === 'vial' \? 'vial' : 'bloodwork'/);
});

test('A: a free lab upload goes to the server even after the old one-per-device upload was used', async () => {
  const calls = [];
  const run = new Function('hasPremium', 'chooseSource', 'setShowUpgradeModal', 'getUploadCount',
    `${fnCode(BODY, 'handleUploadPress')}\nreturn handleUploadPress;`)(
    async () => false, () => calls.push('source'), (v) => calls.push(['upgrade', v]), async () => 1,
  );
  await run();
  assert.deepEqual(calls, ['source'], 'the source choice opens; the server decides with the monthly budget');
  assert.doesNotMatch(BODY, /dosetrace_bloodwork_uploads|getUploadCount|incrementUploadCount|uploadCount/, 'the per-device counter is gone');
  const extract = fnCode(BODY, 'extractWithClaude');
  assert.doesNotMatch(extract, /hasPremium/, 'no client gate in front of the paid call');
  assert.match(extract, /scanErrorSheet\(scanErrorKind\(\{ code: errBody\?\.code \?\? null, status \}\), t, \{ what: 'lab', errBody \}\)/, 'a refusal shows the server\'s limit');
});

test('A: a free vaccine-card scan goes to the server (the client Premium gate is gone)', async () => {
  const calls = [];
  const run = new Function('hasPremium', 'hasAIConsent', 'openScanChoice', 'premiumSheet', 'setScanSheet', 't', 'Linking', 'AI_PRIVACY_URL', 'grantAIConsent',
    `${fnCode(VAX, 'handleScanPress')}\nreturn handleScanPress;`)(
    async () => false, async () => true, () => calls.push('choice'), () => calls.push('premium'), (c) => calls.push(['sheet', c && c.title]), (k) => k, null, '', async () => {},
  );
  await run();
  assert.deepEqual(calls, ['choice']);
  assert.doesNotMatch(VAX, /hasPremium|premiumSheet|vax_scan_premium_title/, 'no Premium gate or "A Premium feature" sheet left');
  assert.match(fnCode(VAX, 'extractVaccines'), /scanErrorSheet\(scanErrorKind\(\{ code: errBody\?\.code \?\? null, status \}\), t, \{ what: 'vaccine', errBody \}\)/);
});

test('A: vial labels already go straight to the server (unchanged)', () => {
  const vial = fnCode(PROTO, 'handleVialScanPress');
  assert.doesNotMatch(vial, /hasPremium/);
});

test('A: the free plan card says the 3 free scans until markers exist (never "a Premium feature" alone)', () => {
  const journal = fnCode(BODY, 'renderJournalBody');
  assert.match(journal, /markerSeries\.length > 0\s*\?\s*t\(pluralKey\('blood_premium_markers', markerSeries\.length, language\)\)\.replace\('\{n\}', String\(markerSeries\.length\)\)\s*:\s*t\('blood_first_free'\)/);
  assert.doesNotMatch(journal, /blood_premium_only/);
});
