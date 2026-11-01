'use strict';
// Simulator 2026-11-01: two ended BPC-157 protocols showed as two identical rows "BPC-157 · encerrado" in the
// curve's compound picker, and selecting both drew two identical legend rows — they could not be told apart.
// Same-named rows now carry the protocol's own dates in the app's date format: "encerrado em 12 de out." for an
// ended one, "iniciado em 3 de set." for an active one; same day too → the run's start–end. A row whose name is
// unique keeps its plain label (A-83 "· encerrado"). The picker and the legend both read seriesName → __label.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { translations } = require('../i18n/translations');
const { curveLabels, seriesName } = require('../lib/serumModel');

const t = (k) => translations.pt[k];
const now = new Date('2026-11-01T12:00:00');
const label = (list, opts = {}) => curveLabels(list, { t, language: 'pt', now, ...opts }).map((p) => seriesName(p, t));
const bpc = (id, extra) => ({ id, compound_id: 'lyo_bpc_157', type: 'recon', dose: '250', start_date: '2026-09-03', ...extra });
const ended = (id, endedAt, extra) => bpc(id, { active: 0, deleted_at: null, ended_at: endedAt, ...extra });

test('a unique name keeps its plain label; a unique ended one keeps "· encerrado"', () => {
  assert.deepEqual(label([bpc('a', { active: 1 }), ended('b', '2026-10-12T15:00:00')].slice(0, 1)), ['BPC-157']);
  assert.deepEqual(label([ended('b', '2026-10-12T15:00:00')]), ['BPC-157 · encerrado']);
  const plain = curveLabels([bpc('a', { active: 1 })], { t, language: 'pt', now })[0];
  assert.equal(plain.__label, undefined, 'an active unique protocol gets no label');
});

test('two ended protocols of the same compound: each names its own end date', () => {
  assert.deepEqual(label([ended('a', '2026-10-12T15:00:00'), ended('b', '2026-09-20T09:00:00')]),
    ['BPC-157 · encerrado em 12 de out.', 'BPC-157 · encerrado em 20 de set.']);
});

test('a year other than this one is shown', () => {
  assert.deepEqual(label([ended('a', '2026-10-12T15:00:00'), ended('b', '2025-10-12T09:00:00')]),
    ['BPC-157 · encerrado em 12 de out.', 'BPC-157 · encerrado em 12 de out. de 2025']);
});

test('two active protocols of the same compound: each names its start date; an ended one beside them stays plain', () => {
  assert.deepEqual(label([bpc('a', { active: 1, start_date: '2026-10-20' }), bpc('b', { active: 1, start_date: '2026-09-03' }), ended('c', '2026-08-01T10:00:00')]),
    ['BPC-157 · iniciado em 20 de out.', 'BPC-157 · iniciado em 3 de set.', 'BPC-157 · encerrado']);
});

test('ended on the same day: the run start–end', () => {
  assert.deepEqual(label([ended('a', '2026-10-12T15:00:00', { start_date: '2026-09-03' }), ended('b', '2026-10-12T18:00:00', { start_date: '2026-10-01' })]),
    ['BPC-157 · 3 de set.–12 de out.', 'BPC-157 · 1 de out.–12 de out.']);
});

test('every row ends up distinct, even with identical dates', () => {
  const twin = () => ended('x', '2026-10-12T15:00:00', { start_date: '2026-09-03' });
  const out = label([{ ...twin(), id: 'a' }, { ...twin(), id: 'b' }]);
  assert.equal(new Set(out).size, 2, out.join(' | '));
});

test('a blend component keeps its blend label; English reads naturally', () => {
  const blend = { id: 'w__BPC-157', compound_id: 'lyo_bpc_157', __label: 'Wolverine · BPC-157 (est.)', __blend: 'Wolverine', active: 1 };
  assert.deepEqual(label([blend, bpc('a', { active: 1 })]), ['Wolverine · BPC-157 (est.)', 'BPC-157']);
  const en = curveLabels([ended('a', '2026-10-12T15:00:00'), ended('b', '2026-09-20T09:00:00')], { t: (k) => translations.en[k], language: 'en', now })
    .map((p) => p.__label);
  assert.deepEqual(en, ['BPC-157 · ended Oct 12', 'BPC-157 · ended Sep 20']);
});

test('strings in all six languages', () => {
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of ['curve_ended_on', 'curve_started_on']) assert.match(translations[l][k] || '', /\{date\}/, `${l} ${k}`);
  }
});

test('wired: the screen labels the charted protocols with curveLabels; picker and legend read seriesName', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/SerumCurveScreen.js'), 'utf8');
  assert.match(src, /const protocols = curveLabels\(split\.active, \{ t, language, timeFormat \}\);/);
  assert.ok(!/__label: `\$\{seriesName\(p, t\)\} · \$\{t\('curve_ended_marker'\)\}`/.test(src), 'the old one-size label is gone');
  assert.match(src, /<Text style=\{s\.optionName\} numberOfLines=\{2\}>\{seriesName\(p, t\)\}<\/Text>/);
  assert.match(src, /name: seriesName\(p, t\),/);
});
