'use strict';
// Integration 2026-11-24 (integration/pacote-2026-11): the dose observation (feat/dose-observation, the report
// seam observationSummary, DO-25) is wired into the adherence report (feat/adherence-report, the per-protocol
// hook extraSections, AR-22). Pictures: docs/design/dose-jejum-refeicao-treino.html part 4 (beside each
// protocol's doses, only when there is something in the 30 days: the mark count and the observations; identical
// observations once with the number of doses and the dates, a different one with the dose's day and time) in the
// report's approved wording, docs/design/relatorio-adesao.html ("Doses registradas como tomadas em jejum (marcado
// pela pessoa): 27 de 29"; only the count of what she marked, never a "Sem marca" count). Text and A4 PDF.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { translations } = require('../i18n/translations');
const { buildAdherenceReport } = require('../lib/adherenceReportDoc');
const { observationSummary, reportObservationSections } = require('../lib/doseObservation');
const { adherenceStats } = require('../lib/adherenceReport');
const { formatTime } = require('../lib/timeFormat');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const tFor = (l) => (k) => (k in translations[l] ? translations[l][k] : `[[${k}]]`);
const at = (m, d, h = 9, min = 0) => new Date(2026, m - 1, d, h, min, 0, 0);
const NOW = at(11, 24, 9, 15).getTime();
const SINCE = at(10, 26, 0).getTime();

// Marina's 30 days (the picture): L-Carnitina 29 taken, 27 marked Em jejum, 25 with "Antes da yoga" from 26/10
// to 24/11 and one "Acordei tarde, tomei às 10:00" on 23/11 at 10:02, 1 skipped; Retatrutida 4 of 4 Com refeição;
// Melatonina taken with nothing marked or written.
function data() {
  const protocols = [
    { id: 1, interval_days: 1, doses_per_day: 1, start_date: '2026-10-01', created_at: at(10, 1, 8).toISOString(), active: 1, reminder_time: '07:00' },
    { id: 2, interval_days: 7, doses_per_day: 1, start_date: '2026-10-03', created_at: at(10, 3, 8).toISOString(), active: 1, reminder_time: '08:00' },
    { id: 3, interval_days: 1, doses_per_day: 1, start_date: '2026-10-01', created_at: at(10, 1, 8).toISOString(), active: 1, reminder_time: '22:00' },
  ];
  const logs = [];
  const days = [];
  for (let d = 26; d <= 31; d++) days.push([10, d]);
  for (let d = 1; d <= 24; d++) days.push([11, d]);
  let i = 0;
  for (const [m, d] of days) {
    if (m === 11 && d === 5) { logs.push({ protocol_id: 1, outcome: 'Skipped', logged_at: at(m, d, 7).toISOString() }); continue; }
    i++;
    const late = m === 11 && d === 23;
    const note = late ? 'Acordei tarde, tomei às 10:00' : (i <= 3 ? null : (i === 4 ? '  Antes da yoga ' : 'Antes da yoga'));
    // 27 of the 29 marked Em jejum (the first two not); the yoga note on 25 doses from the 4th dose (29/10) on.
    const ctx = i <= 2 ? null : 'fasted';
    logs.push({ protocol_id: 1, outcome: 'Taken', logged_at: (late ? at(m, d, 10, 2) : at(m, d, 7, 2)).toISOString(), dose_context: ctx, dose_note: note });
  }
  for (const d of [[11, 2], [11, 9], [11, 16], [11, 23]]) logs.push({ protocol_id: 2, outcome: 'Taken', logged_at: at(d[0], d[1], 8, 5).toISOString(), dose_context: 'meal', dose_note: null });
  for (const [m, d] of days) logs.push({ protocol_id: 3, outcome: 'Taken', logged_at: at(m, d, 22, 1).toISOString() });
  return { protocols, logs };
}

function modelFor(l = 'pt') {
  const { protocols, logs } = data();
  const stats = adherenceStats({ protocols, logs, sinceMs: SINCE, nowMs: NOW });
  const names = { 1: 'L-Carnitina', 2: 'Retatrutida', 3: 'Melatonina' };
  const model = {
    reportName: 'Marina Costa Silva', sinceMs: SINCE, nowMs: NOW, overall: stats.overall, unsync: null, gaps: [],
    protocols: protocols.map((p) => {
      const r = stats.perProtocol.find((x) => x.id === p.id);
      return { id: p.id, name: names[p.id], endedAtMs: null, dose: '2 cápsulas', frequency: 'Diariamente', due: r.due, counted: r.counted, taken: r.taken, skipped: r.skipped, missed: r.missed, adherence: r.adherence, unrecorded: 0, streak: 3, streakSinceMs: at(11, 22).getTime(), vialRemaining: null };
    }),
  };
  const summary = observationSummary({ logs, protocols, fromMs: SINCE, toMs: NOW + 1 });
  const byId = new Map(summary.map((s) => [s.protocolId, s]));
  const opts = { t: tFor(l), language: l, timeFormat: '24h' };
  const extraSections = (p) => reportObservationSections(byId.get(p.id), opts);
  return { model, stats, summary, opts, extraSections };
}

test('the text: per protocol the count of what she marked "27 de 29" and her observations, as the approved pictures', () => {
  const { model, opts, extraSections } = modelFor('pt');
  const { text } = buildAdherenceReport(model, { ...opts, extraSections });
  const carn = text.slice(text.indexOf('L-CARNITINA'), text.indexOf('RETATRUTIDA'));
  const time = formatTime('10:02', 'pt', '24h');
  const after = carn.slice(carn.indexOf('Doses tomadas seguidas'));
  assert.ok(after.includes([
    '',
    'Doses registradas como tomadas em jejum (marcado pela pessoa): 27 de 29',
    '',
    'Observações escritas pela pessoa:',
    '“Antes da yoga”',
    '   em 25 doses, de 29/10 a 24/11',
    '“Acordei tarde, tomei às 10:00”',
    `   na dose de 23/11, às ${time}`,
    '',
  ].join('\n')), after);
  const reta = text.slice(text.indexOf('RETATRUTIDA'), text.indexOf('MELATONINA'));
  assert.ok(reta.includes('\nDoses registradas como tomadas com refeição (marcado pela pessoa): 4 de 4\n'));
  assert.doesNotMatch(reta, /Observações escritas/);
  // Nothing marked or written: the protocol is exactly as before (no extra line).
  const mela = text.slice(text.indexOf('MELATONINA'), text.indexOf('COMO LER'));
  assert.doesNotMatch(mela, /jejum|refeição|Observações escritas/);
  // Never a "sem marca" count, in any form.
  assert.doesNotMatch(text, /sem marca/i);
});

test('the PDF: "Marcado pela pessoa" and "Observações escritas pela pessoa" under the protocol table, typed text escaped', () => {
  const { model, opts, extraSections } = modelFor('pt');
  const { html } = buildAdherenceReport(model, { ...opts, extraSections });
  const time = formatTime('10:02', 'pt', '24h');
  const carn = html.slice(html.indexOf('<b>L-Carnitina</b>'), html.indexOf('<b>Retatrutida</b>'));
  assert.ok(carn.includes('<div class="sub">Marcado pela pessoa</div><div class="obs">Doses registradas como tomadas em jejum: 27 de 29</div>'), carn);
  assert.ok(carn.includes('<div class="sub">Observações escritas pela pessoa</div><div class="obs"><q>“Antes da yoga”</q><div>em 25 doses, de 29/10 a 24/11</div></div>'));
  assert.ok(carn.includes(`<div class="obs"><q>“Acordei tarde, tomei às 10:00”</q><div>na dose de 23/11, às ${time}</div></div>`));
  assert.ok(carn.indexOf('</table>') < carn.indexOf('Marcado pela pessoa'), 'after the protocol table');
  assert.match(html, /\.obs q \{[^}]*quotes: none/);
  const reta = html.slice(html.indexOf('<b>Retatrutida</b>'), html.indexOf('<b>Melatonina</b>'));
  assert.ok(reta.includes('<div class="obs">Doses registradas como tomadas com refeição: 4 de 4</div>'));
  const mela = html.slice(html.indexOf('<b>Melatonina</b>'), html.indexOf('class="disc"'));
  assert.doesNotMatch(mela, /class="extras"/);
  assert.doesNotMatch(html, /sem marca/i);
  // A typed observation is reproduced as written but escaped on the page.
  const { logs, protocols } = data();
  logs.push({ protocol_id: 3, outcome: 'Taken', logged_at: at(11, 24, 8).toISOString(), dose_note: '<b>x</b> & y' });
  const s = observationSummary({ logs, protocols, fromMs: SINCE, toMs: NOW + 1 });
  const sec = reportObservationSections(s.find((x) => x.protocolId === 3), opts);
  const out = buildAdherenceReport(model, { ...opts, extraSections: (p) => (p.id === 3 ? sec : []) });
  assert.ok(out.html.includes('&lt;b&gt;x&lt;/b&gt; &amp; y'));
  assert.doesNotMatch(out.html, /<b>x<\/b>/);
});

test('the count is over the same doses as "Doses registradas como tomadas" (declared history out, the same window)', () => {
  const { stats, summary } = modelFor('pt');
  for (const s of summary) assert.equal(s.taken, stats.perProtocol.find((r) => r.id === s.protocolId).taken, `protocol ${s.protocolId}`);
});

test('both marks on one protocol: two lines; one dose written twice the same day keeps the range wording', () => {
  const t = tFor('pt');
  const sum = { protocolId: 9, taken: 10, fasted: 6, meal: 3, none: 1, notes: [] };
  const sec = reportObservationSections(sum, { t, language: 'pt', timeFormat: '24h' });
  assert.equal(sec.length, 1);
  assert.deepEqual(sec[0].textLines, [
    'Doses registradas como tomadas em jejum (marcado pela pessoa): 6 de 10',
    'Doses registradas como tomadas com refeição (marcado pela pessoa): 3 de 10',
  ]);
  assert.deepEqual(sec[0].lines, ['Doses registradas como tomadas em jejum: 6 de 10', 'Doses registradas como tomadas com refeição: 3 de 10']);
  assert.equal(sec[0].textTitle, null, 'the text says "(marcado pela pessoa)" in the line, no heading');
  // nothing marked, nothing written → no section at all
  assert.deepEqual(reportObservationSections({ protocolId: 9, taken: 5, fasted: 0, meal: 0, none: 5, notes: [] }, { t, language: 'pt', timeFormat: '24h' }), []);
  assert.deepEqual(reportObservationSections(undefined, { t, language: 'pt', timeFormat: '24h' }), []);
});

test('6 languages: the new lines exist with the same placeholders, natural wording, and every language builds', () => {
  const keys = ['report_obs_fasted_text', 'report_obs_meal_text', 'report_obs_marked_title', 'report_obs_fasted', 'report_obs_meal', 'report_obs_notes_title', 'report_obs_note_many', 'report_obs_note_one', 'report_how_marks_t', 'report_how_marks_d', 'report_how_notes_t', 'report_how_notes_d'];
  const ph = (s) => (s.match(/\{[a-z]+\}/g) || []).sort().join(',');
  for (const l of LANGS) for (const k of keys) {
    assert.ok(translations[l][k], `${l}.${k}`);
    assert.equal(ph(translations[l][k]), ph(translations.en[k]), `${l}.${k} placeholders`);
  }
  assert.equal(translations.pt.report_obs_fasted_text, 'Doses registradas como tomadas em jejum (marcado pela pessoa): {n} de {total}');
  assert.equal(translations.pt.report_obs_notes_title, 'Observações escritas pela pessoa');
  for (const l of LANGS) {
    const { model, extraSections } = modelFor(l);
    const { text, html } = buildAdherenceReport(model, { t: tFor(l), language: l, timeFormat: '24h', extraSections });
    assert.doesNotMatch(text + html, /\[\[/, l);
  }
});

test('what the report is and "Como ler" now name the marks and the observations (the approved picture, with the feature in the same release)', () => {
  const { model, opts } = modelFor('pt');
  const { text, html } = buildAdherenceReport(model, opts);
  assert.match(text, /um diário pessoal em que a própria pessoa registra as doses que toma, marca se foram em jejum ou com refeição e escreve observações\./);
  assert.match(text, /^Em jejum \/ com refeição: marcado pela própria pessoa em cada dose, quando quis\.$/m);
  assert.match(text, /^Observações: texto escrito pela própria pessoa, reproduzido como foi escrito\.$/m);
  assert.ok(html.indexOf('<dt>Doses restantes no frasco</dt>') < html.indexOf('<dt>Em jejum / com refeição</dt>'));
  assert.ok(html.indexOf('<dt>Observações</dt>') < html.indexOf('<dt>* (asterisco)</dt>'));
});

test('Settings builds the report with the observations of the same 30 days (observationSummary → reportObservationSections)', () => {
  const s = read('screens/SettingsScreen.js');
  const fn = s.slice(s.indexOf('async function makeAdherenceReport'), s.indexOf('async function reportSyncNow'));
  assert.match(fn, /observationSummary\(\{ logs, protocols, fromMs: thirtyDaysAgo\.getTime\(\), toMs: now\.getTime\(\) \+ 1 \}\)/);
  assert.match(fn, /buildAdherenceReport\(model, \{ t, language, timeFormat, extraSections \}\)/);
  assert.match(fn, /reportObservationSections\(/);
  assert.match(s, /import \{[^}]*observationSummary[^}]*reportObservationSections[^}]*\} from '\.\.\/lib\/doseObservation';|import \{[^}]*reportObservationSections[^}]*observationSummary[^}]*\} from '\.\.\/lib\/doseObservation';/);
});
