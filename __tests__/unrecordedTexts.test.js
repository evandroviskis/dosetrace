'use strict';
// UP-2 / UP-13 / UP-14 / UP-24 / UP-28 / UP-34 / UP-35 / UP-36: the sheet, the card and the lab line read as
// the approved picture (docs/design/unrecorded-period.html), in Portuguese exactly, in every language without a
// leftover placeholder; the summary comes from the plan that writes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const U = require('../lib/unrecordedPeriod');
const X = require('../lib/unrecordedText');
const { formatDate } = require('../lib/localeFormat');
const { formatTime } = require('../lib/timeFormat');

function load() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const TR = load();
const tOf = (lang) => (k) => (TR[lang][k] != null ? TR[lang][k] : TR.en[k] != null ? TR.en[k] : k);

const L = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
const NOW = L(2026, 11, 3, 10);
const opts = { nowMs: NOW, pulledThroughMs: NOW - 60000, zoneHistory: null };
const p = { id: 1, user_id: 'u', name: 'Testosterona Cipionato', type: 'recon', dose: '125', dose_unit: 'mg', reminder_time: '09:00', doses_per_day: 1, interval_days: 7, start_date: '2026-10-05', active: 1, created_at: new Date(L(2026, 10, 5, 8)).toISOString() };
const ctx = (lang) => ({
  t: tOf(lang), language: lang, name: p.name,
  fmtDay: (ms) => formatDate(new Date(ms), lang, 'dayMonth'),
  fmtTime: (hhmm) => formatTime(hhmm, lang, '24h'),
  freqLabel: (i) => (i === 7 ? 'Semanalmente' : 'Diariamente'),
});

test('UP-2: the question reads in Portuguese exactly as approved', () => {
  const ask = { protocol: p, entries: U.gapEntries(p, [], opts) };
  const q = X.questionTexts(ask, { ...ctx('pt'), index: 0, total: 3 });
  assert.equal(q.title, `De ${formatDate(new Date(L(2026, 10, 5)), 'pt', 'dayMonth')} a ${formatDate(new Date(L(2026, 10, 19)), 'pt', 'dayMonth')} há 3 doses de Testosterona Cipionato sem registro. Você tomou?`);
  assert.equal(q.sub, `125 mg · Semanalmente · ${formatTime('09:00', 'pt', '24h')}`); // the app's own time format; A-134 no split
  assert.equal(q.counter, '1 de 3');
  assert.equal(q.counterA11y, 'Pergunta 1 de 3');
  assert.equal(q.noneSub, 'As 3 doses entram como puladas. A curva não as soma.');
  assert.equal(q.appLine, null);
  const t = tOf('pt');
  assert.equal(t('unrec_all'), 'Tomei todas no horário');
  assert.equal(t('unrec_pick'), 'Escolher quais');
  assert.equal(t('unrec_none'), 'Não tomei');
  assert.equal(t('unrec_unknown'), 'Não lembro');
  assert.equal(t('unrec_later'), 'Agora não');
});

test('UP-36: the line naming the app\'s rows and the person\'s row (picture section 5)', () => {
  const sem = { ...p, name: 'Semaglutida', start_date: '2026-09-04', created_at: new Date(L(2026, 9, 1, 8)).toISOString(), reminder_time: '20:00' };
  const logs = [
    { id: 1, protocol_id: 1, outcome: 'Missed', logged_at: new Date(L(2026, 9, 4, 20)).toISOString() },
    { id: 2, protocol_id: 1, outcome: 'Missed', logged_at: new Date(L(2026, 9, 11, 20)).toISOString(), outcome_by_person: 0 },
    { id: 3, protocol_id: 1, outcome: 'Missed', logged_at: new Date(L(2026, 9, 18, 20)).toISOString(), outcome_by_person: 1 },
  ];
  const [ask] = U.unrecordedAsks([sem], logs, opts);
  assert.equal(ask.entries.length, 6);
  assert.deepEqual(ask.kept, [L(2026, 9, 18, 20)]);
  const q = X.questionTexts(ask, { ...ctx('pt'), name: 'Semaglutida', personMarked: ask.kept });
  assert.match(q.appLine, /^Inclui .+, que o app marcou sozinho como perdidas\.$/);
  assert.match(q.personLine, /^A de .+, marcada por você, fica como está\.$/);
});

test('UP-14: the summary is the plan\'s (Tomei todas, Não tomei, Escolher quais, Não lembro, vial, bottle)', () => {
  const daily = { ...p, id: 2, name: 'BPC-157', interval_days: 1, reminder_time: '08:00', start_date: '2026-09-30', created_at: new Date(L(2026, 9, 30, 7)).toISOString() };
  const e = U.gapEntries(daily, [], opts);
  assert.equal(e.length, 20);
  const vial = { id: 9, protocol_id: 2, mixed_on: '2026-09-15', total_doses: 20, doses_taken: 15, active: 1 };
  const all = U.planUnrecordedAnswer({ protocol: daily, entries: e, choice: 'all', vial, nowMs: NOW });
  const s = X.summaryText(all.summary, ctx('pt'));
  assert.match(s, /^20 doses entram como concluídas, de .+ a .+\. Frasco de .+: as 5 doses que restavam foram usadas e ele fica concluído\. As outras 15 vieram de frascos que não estão no app\.$/);
  const none = U.planUnrecordedAnswer({ protocol: daily, entries: e, choice: 'none', vial, nowMs: NOW });
  assert.match(X.summaryText(none.summary, ctx('pt')), /^As 20 doses, de .+ a .+, entram como puladas\. O frasco não muda\.$/);
  const pick = U.planUnrecordedAnswer({ protocol: daily, entries: e, choice: 'pick', picked: new Set(e.slice(0, 14).map((x) => x.slotMs)), nowMs: NOW });
  assert.match(X.summaryText(pick.summary, ctx('pt')), /^14 doses entram como concluídas e 6 como puladas\./);
  const unk = U.planUnrecordedAnswer({ protocol: daily, entries: e, choice: 'unknown', nowMs: NOW });
  assert.match(X.summaryText(unk.summary, ctx('pt')), /ficam sem registro, como estão hoje: não entram no Registro de doses e a curva não as soma\. Esta pergunta não volta para elas\./);
  const oral = U.planUnrecordedAnswer({ protocol: { ...daily, type: 'oral' }, entries: e, choice: 'all', nowMs: NOW });
  assert.match(X.summaryText(oral.summary, ctx('pt')), /O pote não muda\.$/);
});

test('UP-24 / UP-34: the card and the lab line', () => {
  const c = X.cardTexts({ n: 26, k: 3, fromMs: L(2026, 9, 30, 8), toMs: L(2026, 10, 19, 9), beforeMs: L(2026, 10, 20) }, ctx('pt'));
  assert.match(c.title, /^Doses sem registro antes de 20 de out\.?$/);
  assert.match(c.body, /^26 doses de 3 protocolos, de .+ a .+, não têm nenhum registro\. A curva não as soma\.$/);
  assert.equal(c.action, 'Responder');
  assert.equal(X.labLineTexts(0, ctx('pt')), null);
  const l = X.labLineTexts(13, ctx('pt'));
  assert.equal(l.line, 'Há 13 doses perdidas antes deste exame');
  assert.equal(l.link, 'Ver no Registro de doses');
  assert.equal(X.labLineTexts(1, ctx('pt')).line, 'Há 1 dose perdida antes deste exame');
});

test('UP-28: every language fills every text (no {placeholder} left, no English leak in the five others)', () => {
  const keys = Object.keys(TR.en).filter((k) => k.startsWith('unrec_') || k.startsWith('lab_missed_'));
  assert.ok(keys.length >= 50);
  for (const lang of ['es', 'pt', 'fr', 'de', 'it']) {
    for (const k of keys) {
      assert.ok(TR[lang][k], `${lang}.${k}`);
      if (!['unrec_week', 'unrec_counter'].includes(k)) assert.notEqual(TR[lang][k], TR.en[k], `${lang}.${k} is translated`);
    }
  }
  const daily = { ...p, interval_days: 1, start_date: '2026-09-30', created_at: new Date(L(2026, 9, 30, 7)).toISOString() };
  const e = U.gapEntries(daily, [], opts);
  for (const lang of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    const c = ctx(lang);
    const q = X.questionTexts({ protocol: daily, entries: e }, { ...c, index: 1, total: 2 });
    for (const s of [q.title, q.sub, q.noneSub, q.counter, q.counterA11y]) assert.doesNotMatch(s, /\{[a-z]+\}/, `${lang}: ${s}`);
    for (const choice of ['all', 'none', 'pick', 'unknown']) {
      const plan = U.planUnrecordedAnswer({ protocol: daily, entries: e, choice, picked: new Set([e[0].slotMs]), vial: { id: 1, mixed_on: '2026-10-10', total_doses: 30, doses_taken: 0 }, nowMs: NOW });
      assert.doesNotMatch(X.summaryText(plan.summary, c), /\{[a-z]+\}/, `${lang} ${choice}`);
    }
    const one = X.questionTexts({ protocol: daily, entries: e.slice(0, 1) }, c);
    assert.doesNotMatch(one.title, /\{[a-z]+\}/);
    assert.doesNotMatch(X.cardTexts({ n: 1, k: 1, fromMs: NOW, toMs: NOW, beforeMs: NOW }, c).body, /\{[a-z]+\}/);
  }
});

test('UP-29: the A-181 line and the report gap line no longer say those doses are never recorded', () => {
  assert.doesNotMatch(TR.pt.log_unsynced_old, /não são registradas depois/);
  assert.match(TR.pt.log_unsynced_old, /o app pergunta sobre elas/);
  assert.doesNotMatch(TR.pt.report_gap, /não foram registradas/);
  assert.match(TR.pt.report_gap, /sem registro não entram neste relatório/);
  for (const lang of ['en', 'es', 'fr', 'de', 'it']) assert.match(TR[lang].report_gap, /\{from\}[\s\S]*\{to\}/);
});
