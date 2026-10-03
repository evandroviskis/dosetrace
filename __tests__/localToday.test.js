'use strict';
// "Today" is the user's local calendar day everywhere (follow-up of the My Body Date given
// bug, 2026-10-03). Three places outside My Body still built it from a UTC date:
//   - ProtocolsScreen (new protocol, "started before installing?" backfill offer): compared
//     the start day with new Date().toISOString().split('T')[0] — in the evening west of UTC
//     that is already TOMORROW, so a protocol started today counted as started in the past;
//   - ProtocolsScreen (Android start-date picker) and SerumCurveScreen (todayISO): noon
//     local turned into a UTC date — the day BEFORE east of UTC+12 (Kiribati, Tonga, NZ summer).
// Stored dates are not touched; only how "today" / a picked day is computed.
process.env.TZ = 'Pacific/Kiritimati'; // UTC+14
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
function fnCode(src, name) {
  let hit = null;
  const walk = (node) => {
    if (!node || typeof node.type !== 'string' || hit) return;
    if (node.type === 'FunctionDeclaration' && node.id && node.id.name === name) { hit = src.slice(node.start, node.end); return; }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v);
    }
  };
  walk(parse(src, { sourceType: 'module', plugins: ['jsx'] }));
  assert.ok(hit, `function ${name} exists`);
  return hit;
}

test('the Curve\'s "today" is the local day east of UTC+12', () => {
  const { localISO } = require('../lib/localDate');
  const RealDate = Date;
  // 10:00 on Oct 3 in Kiritimati = 20:00 UTC on Oct 2
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : ['2026-10-02T20:00:00Z'])); } }
  const todayISO = new Function('Date', 'localISO', `${fnCode(read('screens', 'SerumCurveScreen.js'), 'todayISO')}\nreturn todayISO;`)(FakeDate, (d) => localISO(d || new FakeDate()));
  assert.equal(todayISO(), '2026-10-03');
});

test('the new-protocol backfill offer compares the start with the LOCAL today', () => {
  const src = read('screens', 'ProtocolsScreen.js');
  assert.match(src, /const todayStr = todayISO\(\);[^\n]*\n\s*const pastCount = \(protocolData && safeStart < todayStr\)/);
  const { isoDay } = require('../lib/protocolForm');
  // the local day at 21:30 in New York is never "tomorrow"
  assert.equal(isoDay(new Date(2026, 9, 2, 21, 30), 0), '2026-10-02');
});

test('the Android start-date picker keeps the picked local day', () => {
  const src = read('screens', 'ProtocolsScreen.js');
  assert.match(src, /if \(d\) setStartDate\(isoDay\(d, 0\)\);/);
  const { isoDay } = require('../lib/protocolForm');
  assert.equal(isoDay(new Date(2026, 9, 3, 0, 0), 0), '2026-10-03', 'midnight local Oct 3 at UTC+14 stays Oct 3');
});

test('no screen or lib builds a day from a UTC date string (toISOString().split / slice)', () => {
  const files = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(path.join(__dirname, '..', dir))) {
      const p = path.join(dir, f);
      const st = fs.statSync(path.join(__dirname, '..', p));
      if (st.isDirectory()) walk(p); else if (/\.js$/.test(f)) files.push(p);
    }
  };
  ['screens', 'lib', 'components'].forEach(walk);
  files.push('App.js');
  for (const f of files) {
    assert.doesNotMatch(strip(read(f)), /toISOString\(\)\s*\.\s*(split\(\s*'T'\s*\)|slice\(\s*0\s*,\s*10\s*\)|substring\(\s*0\s*,\s*10\s*\)|substr\(\s*0\s*,\s*10\s*\))/, f);
  }
});
