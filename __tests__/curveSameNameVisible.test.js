'use strict';
// Simulator 2026-11-01 (evidence 7-curva-legenda-duas-bpc-*): two BPC-157 runs started and ended on 30 Oct
// read "BPC-157 · 30 de out.–30 de out. (1)" / "(2)", and the one-line legend and level rows cut them to
// "BPC-157 · 30 de out.–30 de out…" / "BPC-157 · 30 de out.–30…" — the part that tells them apart was lost.
// Now: a start–end of one single day is never written; when the dates do not tell two runs apart, the data
// that does is used (the dose, the reminder time, the time it ended); "(1)/(2)" only when nothing differs;
// every place that shows these labels gives them room (2 lines; the date readout rows 3 with their date).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { translations } = require('../i18n/translations');
const { curveLabels, seriesName } = require('../lib/serumModel');
const { formatTime } = require('../lib/timeFormat');

const t = (k) => translations.pt[k];
const now = new Date('2026-11-01T12:00:00');
const label = (list, opts = {}) => curveLabels(list, { t, language: 'pt', now, ...opts }).map((p) => seriesName(p, t));
const run = (id, extra) => ({
  id, compound_id: 'lyo_bpc_157', type: 'recon', dose: '250', dose_unit: 'mcg', reminder_time: '08:00',
  start_date: '2026-10-30', active: 0, deleted_at: null, ended_at: '2026-10-30T15:00:00', ...extra,
});

test('one-day runs: no "30 de out.–30 de out."; the dose tells them apart', () => {
  const out = label([run('a'), run('b', { dose: '500', ended_at: '2026-10-30T18:00:00' })]);
  assert.deepEqual(out, ['BPC-157 · encerrado em 30 de out. · 250 mcg', 'BPC-157 · encerrado em 30 de out. · 500 mcg']);
  for (const l of out) assert.ok(!/–/.test(l), l);
});

test('same dose: the reminder time tells them apart', () => {
  assert.deepEqual(label([run('a'), run('b', { reminder_time: '20:00' })]),
    [`BPC-157 · encerrado em 30 de out. · ${formatTime('08:00', 'pt', 'auto')}`, `BPC-157 · encerrado em 30 de out. · ${formatTime('20:00', 'pt', 'auto')}`]);
  // The user's 12/24 h choice is followed.
  const en = curveLabels([run('a'), run('b', { reminder_time: '20:00' })], { t: (k) => translations.en[k], language: 'en', now, timeFormat: '24h' }).map((p) => p.__label);
  assert.deepEqual(en, ['BPC-157 · ended Oct 30 · 08:00', 'BPC-157 · ended Oct 30 · 20:00']);
});

test('same dose and reminder: the time each run ended', () => {
  const out = label([run('a', { ended_at: '2026-10-30T15:00:00' }), run('b', { ended_at: '2026-10-30T18:30:00' })]);
  assert.deepEqual(out, [`BPC-157 · encerrado em 30 de out., ${formatTime('15:00', 'pt', 'auto')}`, `BPC-157 · encerrado em 30 de out., ${formatTime('18:30', 'pt', 'auto')}`]);
});

test('nothing differs: (1) and (2), still distinct', () => {
  const out = label([run('a'), run('b')]);
  assert.deepEqual(out, ['BPC-157 · encerrado em 30 de out. (1)', 'BPC-157 · encerrado em 30 de out. (2)']);
});

test('a detail that does not separate a pair is not added (no longer labels for nothing)', () => {
  // Three runs: a and b differ only by reminder time, c by dose — the dose is added to all three, then the time to a and b.
  const out = label([run('a'), run('b', { reminder_time: '20:00' }), run('c', { dose: '500' })]);
  assert.equal(new Set(out).size, 3, out.join(' | '));
  assert.ok(out[2].endsWith('500 mcg'), out[2]);
});

test('every place that shows these labels gives them room', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/SerumCurveScreen.js'), 'utf8');
  assert.match(src, /const protocols = curveLabels\(split\.active, \{ t, language, timeFormat \}\);/);
  assert.match(src, /<Text style=\{s\.legendName\} numberOfLines=\{2\}>\{ser\.name\}<\/Text>/, 'legend rows');
  assert.match(src, /<Text style=\{s\.readoutName\} numberOfLines=\{2\}>\{ser\.name\}<\/Text>/, 'level-now rows');
  assert.match(src, /<Text style=\{s\.readoutName\} numberOfLines=\{3\}>\{ser\.name\} · \{readoutShort\}<\/Text>/, 'date readout rows');
  assert.match(src, /<Text style=\{s\.optionName\} numberOfLines=\{2\}>\{seriesName\(p, t\)\}<\/Text>/, 'picker rows');
  assert.match(src, /<Text style=\{s\.pickText\} numberOfLines=\{2\}>\{buttonLabel\}<\/Text>/, 'the picker button');
  assert.ok(!/numberOfLines=\{1\}>\{ser\.name\}/.test(src), 'no one-line series name left');
});
