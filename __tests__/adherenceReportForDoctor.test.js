'use strict';
// docs/specs/adherence-report.md (picture docs/design/relatorio-adesao.html, approved by the founder
// 2026-11-24): the adherence report is read by a third person (a doctor) who never saw the app. The numbers
// are today's (lib/adherenceReport, lib/doseStreak, the vial count); each one comes in a sentence that explains
// itself, the top says what the report is, "Como ler este relatório" defines each term, nothing judges.
// Text and A4 PDF (HTML → expo-print) from the same model (lib/adherenceReportDoc).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { adherenceStats } = require('../lib/adherenceReport');
const { doseRun, reportStreakRuns, reportStreaks } = require('../lib/doseStreak');
const { formatDate } = require('../lib/localeFormat');
const { formatTime } = require('../lib/timeFormat');
const CLOCK = formatTime('09:15', 'pt', '24h'); // the app's own clock text for 09:15
const { translations } = require('../i18n/translations');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const at = (m, d, h = 9, min = 0) => new Date(2026, m - 1, d, h, min, 0, 0);
const tFor = (l) => (k) => (k in translations[l] ? translations[l][k] : `[[${k}]]`);

// ── AR-7 / AR-9: the due count and the pair the % is made of ─────────────────────────────────
test('AR-7: adherenceStats exposes the due count and the counted taken, per protocol and overall', () => {
  const NOW = at(11, 24, 9, 15).getTime();
  const since = at(10, 26, 0).getTime();
  const p = { id: 1, interval_days: 1, doses_per_day: 1, start_date: '2026-10-01', created_at: at(10, 1, 8).toISOString(), active: 1, reminder_time: '08:00' };
  const logs = [];
  for (let d = 26; d <= 31; d++) logs.push({ protocol_id: 1, outcome: 'Taken', logged_at: at(10, d, 8).toISOString() });
  for (let d = 1; d <= 24; d++) logs.push({ protocol_id: 1, outcome: d === 5 ? 'Skipped' : 'Taken', logged_at: at(11, d, 8).toISOString() });
  const r = adherenceStats({ protocols: [p], logs, sinceMs: since, nowMs: NOW });
  const row = r.perProtocol[0];
  assert.equal(row.due, 30);
  assert.equal(row.counted, 29);
  assert.equal(row.adherence, 97);
  assert.equal(r.overall.due, 30);
  assert.equal(r.overall.counted, 29);
  // A held-back dose leaves the due count (A-181), and an extra dose never passes 100 %.
  const held = adherenceStats({ protocols: [p], logs, sinceMs: since, nowMs: NOW, held: { 1: 2 } });
  assert.equal(held.perProtocol[0].due, 28);
  const extra = adherenceStats({ protocols: [p], logs: [...logs, { protocol_id: 1, outcome: 'Taken', logged_at: at(11, 5, 20).toISOString() }], sinceMs: since, nowMs: NOW });
  assert.ok(extra.perProtocol[0].counted <= extra.perProtocol[0].due);
});

// ── AR-10: the day the run of doses starts ───────────────────────────────────────────────────
const day = (s) => new Date(s + 'T12:00:00');
const counts = (entries) => Object.fromEntries(entries.map(([d, n]) => [day(d).toDateString(), n]));

test('AR-10: doseRun gives the count of doseStreak and the day the run starts', () => {
  const p = { interval_days: 1, doses_per_day: 1, start_date: '2026-09-01', created_at: '2026-09-01T08:00:00Z' };
  const c = counts([['2026-10-02', 1], ['2026-10-03', 1], ['2026-10-04', 1]]);
  const r = doseRun(p, c, day('2026-10-05'));
  assert.equal(r.doses, 3);
  assert.equal(r.since.toDateString(), day('2026-10-02').toDateString());
  // today taken: the run includes today
  const r2 = doseRun(p, counts([['2026-10-04', 1], ['2026-10-05', 1]]), day('2026-10-05'));
  assert.equal(r2.doses, 2);
  assert.equal(r2.since.toDateString(), day('2026-10-04').toDateString());
  // nothing in a row: no start day
  assert.deepEqual(doseRun(p, {}, day('2026-10-05')), { doses: 0, since: null });
});

test('AR-10: a weekly run starts on its first due day, rest days skipped; reportStreakRuns matches reportStreaks', () => {
  const p = { id: 7, interval_days: 7, doses_per_day: 1, start_date: '2026-10-03', created_at: new Date(2026, 9, 3, 8).toISOString(), active: 1 };
  const logs = [3, 10, 17, 24].map((d) => ({ protocol_id: 7, outcome: 'Taken', logged_at: at(10, d).toISOString() }));
  const now = at(10, 31, 20);
  const runs = reportStreakRuns([p], logs, now);
  assert.equal(runs[7].count, reportStreaks([p], logs, now)[7]);
  assert.equal(runs[7].count, 4);
  assert.equal(new Date(runs[7].sinceMs).toDateString(), at(10, 3).toDateString());
});

// ── Dates: numeric in the report (AR-3) ──────────────────────────────────────────────────────
test('AR-3: numeric report dates in each language (English keeps the month name: never 03/04 ambiguity)', () => {
  const d = at(10, 26);
  assert.equal(formatDate(d, 'pt', 'numeric'), '26/10/2026');
  assert.equal(formatDate(d, 'es', 'numeric'), '26/10/2026');
  assert.equal(formatDate(d, 'fr', 'numeric'), '26/10/2026');
  assert.equal(formatDate(d, 'it', 'numeric'), '26/10/2026');
  assert.equal(formatDate(d, 'de', 'numeric'), '26.10.2026');
  assert.equal(formatDate(d, 'en', 'numeric'), 'Oct 26, 2026');
  assert.equal(formatDate(at(11, 3), 'pt', 'numericDayMonth'), '03/11');
  assert.equal(formatDate(at(11, 3), 'de', 'numericDayMonth'), '03.11.');
  assert.equal(formatDate(at(11, 3), 'en', 'numericDayMonth'), 'Nov 3');
});

// ── The builder ──────────────────────────────────────────────────────────────────────────────
const NOW = at(11, 24, 9, 15).getTime();
const SINCE = at(10, 26, 0).getTime();
function model(over = {}) {
  return {
    reportName: 'Marina Costa Silva',
    sinceMs: SINCE,
    nowMs: NOW,
    overall: { due: 34, counted: 33, taken: 33, skipped: 1, missed: 0, adherence: 97 },
    protocols: [
      { id: 1, name: 'L-Carnitina', endedAtMs: null, dose: '2 cápsulas', frequency: 'Diariamente', due: 30, counted: 29, taken: 29, skipped: 1, missed: 0, adherence: 97, unrecorded: 0, streak: 12, streakSinceMs: at(11, 13).getTime(), vialRemaining: 54 },
      { id: 2, name: 'Retatrutida', endedAtMs: null, dose: '2 mg', frequency: 'A cada 7 dias', due: 4, counted: 4, taken: 4, skipped: 0, missed: 0, adherence: 100, unrecorded: 0, streak: 6, streakSinceMs: at(10, 12).getTime(), vialRemaining: 2 },
    ],
    unsync: null,
    gaps: [],
    ...over,
  };
}
const build = (m, l = 'pt', extra = {}) => require('../lib/adherenceReportDoc').buildAdherenceReport(m, { t: tFor(l), language: l, timeFormat: '24h', ...extra });

test('AR-1/AR-3/AR-4: the top says what the report is, the name, the period and the generation date and time', () => {
  const { text, html } = build(model());
  const lines = text.split('\n');
  assert.equal(lines[0], 'RELATÓRIO DE ADESÃO');
  assert.match(text, /Este relatório foi gerado pelo aplicativo DoseTrace, um diário pessoal em que a própria pessoa registra as doses que toma\. O aplicativo não mede, não verifica e não interpreta nada/);
  assert.match(text, /As doses previstas seguem o horário que a própria pessoa configurou no aplicativo\./);
  assert.ok(text.includes('Nome: Marina Costa Silva\n'));
  assert.ok(text.includes('Período: 26/10/2026 a 24/11/2026 (últimos 30 dias, até a hora em que o relatório foi gerado)\n'));
  assert.ok(text.includes(`Gerado em: 24/11/2026 às ${CLOCK}\n`), 'the app clock (lib/timeFormat), the 12/24 h choice');
  assert.ok(text.includes(`Gerado pelo DoseTrace em 24/11/2026 às ${CLOCK}.`));
  // the marks / observations belong to feat/dose-observation: not promised here
  assert.doesNotMatch(text, /jejum|refeição|observaç/i);
  for (const s of ['Relatório de adesão', 'Gerado pelo aplicativo DoseTrace', 'Marina Costa Silva', `24/11/2026 às ${CLOCK}`, '26/10/2026 a 24/11/2026']) assert.ok(html.includes(s), s);
});

test('AR-2: without a full name there is no name line, in the text or the PDF', () => {
  const { text, html } = build(model({ reportName: null }));
  assert.doesNotMatch(text, /^Nome:/m);
  assert.doesNotMatch(html, />Nome</);
  const blank = build(model({ reportName: '   ' }));
  assert.doesNotMatch(blank.text, /^Nome:/m);
});

test('AR-2: the builder never reads a nickname or an e-mail (it gets only reportName)', () => {
  const src = read('lib/adherenceReportDoc.js');
  assert.doesNotMatch(src, /display_name|email|user_metadata/);
  const settings = read('screens/SettingsScreen.js');
  assert.doesNotMatch(settings, /user\.user_metadata\?\.display_name \|\| user\.email/);
});

test('AR-5: the summary counts the protocols listed and the ended ones, the overall %, the pair and the sums', () => {
  const { text } = build(model());
  assert.ok(text.includes('Protocolos neste relatório: 2 (nenhum encerrado)\n'));
  assert.ok(text.includes('Adesão geral: 97%\n'));
  assert.ok(text.includes('Doses registradas como tomadas ÷ doses previstas no período: 33 de 34.\n'));
  assert.ok(text.includes('34 doses previstas; 33 registradas como tomadas; 1 marcada como não tomada; 0 sem nenhum registro.\n'));
  const ended = build(model({ protocols: model().protocols.map((p, i) => (i === 1 ? { ...p, endedAtMs: at(11, 20).getTime() } : p)) }));
  assert.ok(ended.text.includes('Protocolos neste relatório: 2 (1 encerrado)\n'));
  assert.match(ended.text, /RETATRUTIDA · Encerrado em 20 de nov\./);
  const two = build(model({ overall: { due: 1, counted: 1, taken: 1, skipped: 2, missed: 1, adherence: 100 } }));
  assert.ok(two.text.includes('1 dose prevista; 1 registrada como tomada; 2 marcadas como não tomadas; 1 sem nenhum registro.'));
});

test('AR-6 to AR-11: each protocol in self-explaining lines', () => {
  const { text } = build(model());
  const block = text.slice(text.indexOf('L-CARNITINA'), text.indexOf('RETATRUTIDA'));
  for (const line of [
    'Dose configurada: 2 cápsulas, diariamente',
    'Doses previstas no período, pelo horário que a pessoa configurou: 30',
    'Doses registradas como tomadas: 29',
    'Doses que a pessoa marcou como não tomadas (decidiu não tomar): 1',
    'Doses previstas sem nenhum registro (não se sabe se foram tomadas): 0',
    'Adesão: 97%. Doses registradas como tomadas ÷ doses previstas no período (29 de 30).',
    'Doses tomadas seguidas, sem falha, até a data do relatório: 12 (desde 13/11)',
    'Doses restantes no frasco atual, pela conta do app a partir das doses registradas: 54',
  ]) assert.ok(block.includes(line + '\n'), line);
  assert.ok(text.includes('Doses tomadas seguidas, sem falha, até a data do relatório: 6 (desde 12/10, antes do período)'));
});

test('AR-9/AR-10/AR-11: nothing due → a dash, never a made-up %; a 0 run has no "desde"; no vial → no line', () => {
  const p = { ...model().protocols[0], due: 0, counted: 0, taken: 0, skipped: 0, missed: 0, adherence: null, streak: 0, streakSinceMs: null, vialRemaining: null };
  const { text } = build(model({ protocols: [p], overall: { due: 0, counted: 0, taken: 0, skipped: 0, missed: 0, adherence: null } }));
  assert.ok(text.includes('Adesão: —. Nenhuma dose prevista no período.\n'));
  assert.ok(text.includes('Adesão geral: —\n'));
  assert.ok(text.includes('Doses tomadas seguidas, sem falha, até a data do relatório: 0\n'));
  assert.doesNotMatch(text, /Doses restantes no frasco atual/);
  assert.doesNotMatch(text, /Adesão(?: geral)?: (0|100)%/);
});

test('AR-12: the asterisk notes in the third person, the per-protocol count and the gap line', () => {
  const ps = model().protocols.map((p, i) => (i === 0 ? { ...p, unrecorded: 3 } : p));
  const { text, html } = build(model({ protocols: ps, unsync: { never: false, sinceMs: at(11, 20).getTime() }, gaps: [{ fromMs: at(10, 27).getTime(), toMs: at(11, 12, 0).getTime() }] }));
  assert.ok(text.includes('Adesão geral: 97%*\n'));
  assert.ok(text.includes('* O celular da pessoa não sincroniza desde 20/11/2026: as doses previstas desde então ainda não estão contadas como "sem nenhum registro", então a adesão pode aparecer maior do que é.'));
  assert.ok(text.includes('Adesão: 97%. Doses registradas como tomadas ÷ doses previstas no período (29 de 30).*\nDoses ainda não contadas por isso: 3\n'));
  assert.ok(text.includes('* De 27/10 a 11/11, o celular da pessoa ficou mais de 14 dias sem sincronizar'));
  assert.ok(html.includes('Doses ainda não contadas por isso'));
  const never = build(model({ protocols: ps, unsync: { never: true, sinceMs: null } }));
  assert.ok(never.text.includes('* O celular da pessoa ainda não sincronizou'));
  assert.doesNotMatch(never.text, /não sincroniza desde/);
});

test('AR-13/AR-14: "Como ler este relatório", the no-judgement line and the disclaimer', () => {
  const { text, html } = build(model());
  assert.ok(text.includes('COMO LER ESTE RELATÓRIO\n'));
  for (const term of ['Dose prevista', 'Registrada como tomada', 'Marcada como não tomada', 'Sem nenhum registro', 'Adesão', 'Doses tomadas seguidas', 'Doses restantes no frasco', '* (asterisco)']) {
    assert.match(text, new RegExp(`^${term.replace(/[*()]/g, '\\$&')}: `, 'm'), term);
    assert.ok(html.includes(`<dt>${term}</dt>`), term);
  }
  assert.ok(text.includes('Uma dose a mais, fora do previsto, não passa de 100%.'));
  assert.ok(text.includes('O DoseTrace não avalia se a adesão é adequada.\n'));
  assert.ok(text.includes('Este é um resumo de acompanhamento de bem-estar gerado pelo usuário. Não constitui aconselhamento médico nem registro clínico.'));
  assert.ok(html.includes('O DoseTrace não avalia se a adesão é adequada.'));
});

test('AR-14: nothing judges — no good/bad words in any language, no colour per value in the PDF', () => {
  for (const l of LANGS) {
    const { text, html } = build(model(), l);
    assert.doesNotMatch(text, /\[\[/, `${l}: every key exists`);
    assert.doesNotMatch(text, /\b(good|bad|poor|excellent|great|low adherence|high adherence|should|recommend|bom|boa|ruim|baixa|deveria|recomend|bueno|malo|debería|bon|mauvais|devriez|gut|schlecht|solltest|buono|cattivo|dovresti)\b/i, l);
    // Only neutral greys on the paper (R = G = B within a few steps): no red / amber / green per value.
    for (const hex of html.match(/#[0-9a-f]{6}\b/gi) || []) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 12, `${l}: ${hex} is not a neutral grey`);
    }
    assert.doesNotMatch(html, /color:\s*(red|green|orange|yellow|rgb)/i, `${l}: no alert colour`);
  }
});

test('AR-15: the PDF page is A4 paper, escapes every typed value, a table per protocol, "Como ler" on its own page', () => {
  const ps = model().protocols.map((p, i) => (i === 0 ? { ...p, name: '<b>Zinc & Co</b>' } : p));
  const { html } = build(model({ protocols: ps, reportName: 'Ana <script>' }));
  assert.match(html, /@page\s*\{\s*size:\s*A4/);
  assert.ok(html.includes('&lt;b&gt;Zinc &amp; Co&lt;/b&gt;'));
  assert.ok(html.includes('Ana &lt;script&gt;'));
  assert.doesNotMatch(html, /<script/);
  assert.equal((html.match(/class="pr"/g) || []).length, 2);
  assert.match(html, /class="how"[^>]*>|page-break-before:\s*always/);
  assert.match(html, /background:\s*#fff/i);
});

test('AR-22: one named place for per-protocol extra sections — empty changes nothing, a section lands after the protocol', () => {
  const { buildAdherenceReport, NO_EXTRA_SECTIONS } = require('../lib/adherenceReportDoc');
  assert.deepEqual(NO_EXTRA_SECTIONS({ id: 1 }), []);
  const opts = { t: tFor('pt'), language: 'pt', timeFormat: '24h' };
  const plain = buildAdherenceReport(model(), opts);
  const empty = buildAdherenceReport(model(), { ...opts, extraSections: () => [] });
  assert.equal(empty.text, plain.text);
  assert.equal(empty.html, plain.html);
  const withOne = buildAdherenceReport(model(), { ...opts, extraSections: (p) => (p.id === 1 ? [{ title: 'Seção extra', lines: ['linha 1', 'linha <2>'] }] : []) });
  const block = withOne.text.slice(withOne.text.indexOf('L-CARNITINA'), withOne.text.indexOf('RETATRUTIDA'));
  assert.ok(block.indexOf('Seção extra\nlinha 1\nlinha <2>\n') > block.indexOf('Doses restantes no frasco atual'));
  assert.ok(withOne.html.includes('linha &lt;2&gt;'));
});

test('AR-24: every report string exists in the 6 languages with the same placeholders (the parity test covers the set)', () => {
  const keys = Object.keys(translations.en).filter((k) => /^report_/.test(k));
  assert.ok(keys.length > 40, 'the new report keys are in');
  for (const l of LANGS) for (const k of keys) assert.ok(translations[l][k], `${l}.${k}`);
  assert.equal(translations.pt.report_no_judgement, 'O DoseTrace não avalia se a adesão é adequada.');
  // French "vous", formal Portuguese: no "você" in the report (third person), no "a gente".
  for (const k of keys) assert.doesNotMatch(translations.pt[k], /\ba gente\b|\bdá para\b/, k);
  // the old app-word lines are gone (rebuild = replace)
  for (const k of ['report_header', 'report_user', 'report_outcome_line', 'report_active_protocols', 'report_total_logged', 'report_dose_line', 'report_streak_line', 'report_vial_line', 'report_generated']) assert.ok(!(k in translations.en), k);
});

// ── The screen ───────────────────────────────────────────────────────────────────────────────
test('AR-15/AR-16: Settings builds the report with the builder; PDF is the main button, text the second; free', () => {
  const s = read('screens/SettingsScreen.js');
  const fn = s.slice(s.indexOf('async function handleAdherenceReport'), s.indexOf('function shareReport'));
  assert.match(fn, /buildAdherenceReport\(/);
  assert.match(fn, /reportStreakRuns\(/);
  assert.doesNotMatch(fn, /hasPremium|isPremium/);
  assert.match(s, /t\('report_share_pdf'\)/);
  assert.match(s, /t\('report_share_text'\)/);
  assert.ok(s.indexOf("t('report_share_pdf')") < s.indexOf("t('report_share_text')"), 'PDF first');
  const pdf = s.slice(s.indexOf('async function shareReportPdf'), s.indexOf('async function shareReportPdf') + 1400);
  assert.match(pdf, /hasNativeModule\('ExpoPrint'\)/);
  assert.match(pdf, /printToFileAsync\(\{ html: [^,]+, width: 595, height: 842 \}\)/);
  assert.match(pdf, /moveIntoSharedFile\(FileSystem, [^,]+, ADHERENCE_PDF_NAME\)/);
  assert.match(pdf, /removeExportFiles\(FileSystem\)/);
});

test('AR-15: the adherence PDF has a fixed name in the cache and the wipes remove it', () => {
  const { ADHERENCE_PDF_NAME, exportFilePaths } = require('../lib/exportFile');
  assert.equal(ADHERENCE_PDF_NAME, 'dosetrace_adherence_report.pdf');
  const paths = exportFilePaths({ cacheDirectory: 'c/', documentDirectory: 'd/' });
  assert.ok(paths.includes('c/' + ADHERENCE_PDF_NAME));
});
