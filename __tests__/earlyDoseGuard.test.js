'use strict';
// Dose marked before its time (docs/specs/early-dose-guard.md, founder 2026-11-19 10:42 "Siga. Aprovo
// tudo.", option B, 2 h; picture docs/design/early-dose-guard.html). Real case: SLU-PP-332 at 08:00
// and 20:00; at 08:10 the card offered Concluir for 20:00 and one tap wrote it 12 h early. Today now
// splits its doses into "Agora" and "Mais tarde hoje", and a Concluir more than 2 h before the dose's
// time asks first. The rule is pure (lib/earlyDose.js); the screen parts are source tests, as the
// other Today tests (no React Native renderer in plain Node).
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { EARLY_LIMIT_MS, isEarlyTake, splitTodayDoses, hoursLeft, laterInLabel } = require('../lib/earlyDose');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const TODAY = read('screens/TodayScreen.js');

function loadTranslations() {
  const src = read('i18n/translations.js');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const TR = loadTranslations();
const tFor = (lang) => (k) => (TR[lang][k] != null ? TR[lang][k] : k);

const local = (h, min = 0) => new Date(2026, 10, 17, h, min, 0, 0).getTime();
const iso = (ms) => new Date(ms).toISOString();
let nextId = 1;
const row = (pid, outcome, ms) => ({ id: nextId++, protocol_id: pid, outcome, logged_at: iso(ms) });
const proto = (id, name, times, over = {}) => ({
  id, user_id: 'u1', name, type: 'oral', active: 1, start_date: '2026-11-01', interval_days: 1,
  doses_per_day: times ? times.split(',').length : 1, reminder_time: times, dose: 500, dose_unit: 'mcg',
  created_at: iso(new Date(2026, 9, 1, 7, 0).getTime()), ...over,
});
const SLU = proto(1, 'SLU-PP-332', '08:00,20:00');
const BPC = proto(2, 'BPC-157', '09:00');
const GHK = proto(3, 'GHK-Cu', '22:00');

// The function body from its declaration to the next top-level function of the component.
function fnBody(src, sig) {
  const i = src.indexOf(sig);
  assert.ok(i >= 0, `${sig} exists`);
  const j = src.indexOf('\n  function ', i + sig.length);
  return src.slice(i, j > 0 ? j : undefined);
}
function constBlock(src, name) {
  const i = src.indexOf(`  const ${name} = `);
  assert.ok(i > 0, `${name} exists`);
  const j = src.indexOf('\n  const ', i + 10);
  return src.slice(i, j > 0 ? j : undefined);
}

test('ED-1: more than 2 h before its time is early; 2 h or less, late or untimed is not', () => {
  assert.equal(EARLY_LIMIT_MS, 2 * 60 * 60 * 1000);
  const slot = local(20);
  assert.equal(isEarlyTake(slot, local(8, 10)), true, '08:10 for 20:00');
  assert.equal(isEarlyTake(slot, local(17, 59)), true, '2 h 1 min before');
  assert.equal(isEarlyTake(slot, local(18, 0)), false, 'exactly 2 h before writes directly');
  assert.equal(isEarlyTake(slot, local(19, 30)), false);
  assert.equal(isEarlyTake(slot, local(21, 0)), false, 'a late dose');
  assert.equal(isEarlyTake(null, local(8)), false, 'no time to compare');
  assert.equal(isEarlyTake(undefined, local(8)), false);
});

test("ED-2: the founder's 08:10 case splits into Agora and Mais tarde hoje", () => {
  const logs = [row(1, 'Taken', local(8, 2))];
  const r = splitTodayDoses({ cards: [BPC, SLU, GHK], logs, nowMs: local(8, 10) });
  assert.deepEqual(r.now.map((p) => p.name), ['BPC-157']);
  assert.deepEqual(r.later.map((x) => x.protocol.name), ['SLU-PP-332', 'GHK-Cu']);
  assert.equal(r.later[0].slot.slotMs, local(20), 'the 20:00 slot');
  assert.equal(r.later[0].slot.ti, 1);
  assert.equal(r.later[1].slot.slotMs, local(22));
  // Before the 08:00 dose is marked, SLU-PP-332 is in Agora with its 08:00 dose.
  const r2 = splitTodayDoses({ cards: [SLU, BPC, GHK], logs: [], nowMs: local(7, 50) });
  assert.deepEqual(r2.now.map((p) => p.name), ['SLU-PP-332', 'BPC-157']);
  // Later rows sorted by their time.
  const r3 = splitTodayDoses({ cards: [GHK, SLU], logs, nowMs: local(8, 10) });
  assert.deepEqual(r3.later.map((x) => x.protocol.name), ['SLU-PP-332', 'GHK-Cu']);
});

test('ED-2: Today renders Agora cards and the Mais tarde hoje list inside the doses block', () => {
  assert.match(TODAY, /import \{ isEarlyTake, splitTodayDoses, hoursLeft, laterInLabel \} from '\.\.\/lib\/earlyDose';/);
  assert.match(TODAY, /const doseSplit = splitTodayDoses\(\{ cards: todayCards\.filter\(p => !focusCard \|\| p\.id !== focusCard\.id\), logs: todayRows, nowMs: Date\.now\(\) \}\);/);
  const doses = constBlock(TODAY, 'dosesEl');
  const order = ["t('today_now_title')", '{nowCards.map(p => renderDoseCard(p))}', "t('today_later_title')", 'laterDoses.map((it, i) => renderLaterRow(it, i))', 'todayCards.length === 0 && allDoneToday', 'takenNames.length > 0'];
  let at = -1;
  for (const piece of order) {
    const k = doses.indexOf(piece, at + 1);
    assert.ok(k > at, `${piece} in order`);
    at = k;
  }
  // The skeleton measures the Agora cards (the ones drawn as cards).
  assert.match(TODAY, /doseIdsRef\.current = nowCards\.map\(\(p\) => p\.id\);/);
});

test('ED-3: time left reads em 11 h 50 min (and em 12 h on the hour)', () => {
  const pt = tFor('pt');
  assert.equal(laterInLabel(local(20), local(8, 10), pt), 'em 11 h 50 min');
  assert.equal(laterInLabel(local(22), local(8, 10), pt), 'em 13 h 50 min');
  assert.equal(laterInLabel(local(20), local(8, 0), pt), 'em 12 h');
  assert.equal(laterInLabel(local(20), local(8, 10), tFor('en')), 'in 11 h 50 min');
  assert.equal(laterInLabel(local(20), local(8, 10), tFor('de')), 'in 11 Std. 50 Min.');
});

test('ED-3: a later row has the dot, name and time, dose and time left, Concluir and no Pular', () => {
  const row = fnBody(TODAY, 'function renderLaterRow(');
  assert.match(row, /displayColor\(p\.color\) \|\| colors\.data/, 'the protocol colour dot');
  assert.match(row, /\{name\} · \{time\}/);
  assert.match(row, /\{amount\}<\/Text> · \{inLabel\}/);
  assert.match(row, /laterInLabel\(slot\.slotMs, Date\.now\(\), t\)/);
  assert.match(row, /handleTake\(p, null, 0, \{ slot \}\)/, 'Concluir takes that slot through the one take');
  assert.match(row, /t\('today_mark_taken'\)/);
  assert.ok(!/today_skip|skipDose/.test(row), 'no Pular in the later list');
  assert.match(row, /book \? openDoseOnPage\(p\) : navigation\.navigate\('Protocols', \{ openProtocolId: p\.id \}\)/, 'the row opens the protocol');
  assert.match(row, /isPickedDose\(p\.id, todayKey\)/, 'outlined on the Fold while its page is open');
});

test('ED-4: the section count stays and each block shows its own count', () => {
  const doses = constBlock(TODAY, 'dosesEl');
  assert.match(doses, /dosesTakenLabel\(doneDoses, totalDoses, t, language\)/, 'Doses N de M concluídas');
  assert.match(doses, /nowCards\.length > 0 && laterDoses\.length > 0 && \(/, 'Agora is labelled when both blocks exist');
  assert.match(doses, /<Text style=\{s\.labCount\}>\{nowCards\.length\}<\/Text>/);
  assert.match(doses, /<Text style=\{s\.labCount\}>\{laterDoses\.length\}<\/Text>/);
});

test('ED-5: an early Concluir asks first and writes nothing until Sim', () => {
  const h = fnBody(TODAY, 'function handleTake(');
  const pend = h.indexOf('pendingPromptFor(');
  const guard = h.indexOf('isEarlyTake(slot.slotMs, tapMs)');
  const site = h.indexOf('needsSiteQuestion(p.type)');
  const write = h.indexOf('markTaken(p,');
  assert.ok(pend > 0 && guard > pend, "after yesterday's which-day question");
  assert.ok(site > guard && write > guard, 'before the site question and any write');
  assert.match(h.slice(guard - 40, guard + 200), /if \(!opts\.earlyConfirmed && isEarlyTake\(slot\.slotMs, tapMs\)\) \{/);
  assert.match(h.slice(guard, site), /askEarlyTake\(p, slot,/);
  assert.match(h.slice(guard, site), /return;/, 'nothing else runs');
  const ask = fnBody(TODAY, 'function askEarlyTake(');
  assert.match(ask, /t\('today_early_title'\)\.replace\('\{time\}', time\)/);
  assert.match(ask, /t\('today_early_body'\)\.replace\('\{name\}', name\)\.replace\('\{dose\}', dose\)\.replace\('\{n\}', String\(hoursLeft\(slot\.slotMs, Date\.now\(\)\)\)\)/);
  assert.match(ask, /\{ label: t\('back'\), kind: 'secondary', onPress: onBack \}, \{ label: t\('today_early_yes'\), kind: 'primary', onPress: onYes \}/);
  assert.match(ask, /onDismiss: onBack/, 'a tap outside or back is Voltar');
  assert.ok(!/markTaken|recordDoseTaken/.test(ask), 'the question writes nothing');
});

test('ED-5: about 12 hours left at 08:10 for 20:00', () => {
  assert.equal(hoursLeft(local(20), local(8, 10)), 12);
  assert.equal(hoursLeft(local(22), local(8, 10)), 14);
  assert.equal(hoursLeft(local(20), local(17, 31)), 2);
  const pt = TR.pt;
  const body = pt.today_early_body.replace('{name}', 'SLU-PP-332').replace('{dose}', '500 mcg').replace('{n}', '12');
  assert.equal(body, 'SLU-PP-332, 500 mcg. Faltam cerca de 12 horas. Marcar como concluída agora?');
  assert.equal(pt.today_early_title.replace('{time}', '20:00'), 'Esta dose é para as 20:00');
});

test('ED-6: Sim runs the same take for the same slot at the time of the Sim tap', () => {
  const h = fnBody(TODAY, 'function handleTake(');
  const guard = h.indexOf('isEarlyTake(slot.slotMs, tapMs)');
  assert.match(h.slice(guard, guard + 400), /\(\) => handleTake\(p, null, 0, \{ \.\.\.opts, earlyConfirmed: true, tapMs: Date\.now\(\) \}\)/);
  assert.match(h.slice(guard, guard + 400), /\(\) => resetTake\(p\.id\)/, 'Voltar leaves the button as it was');
  // The confirmed take keeps opts.slot (the same slot), so the write, the reminder cancel (ti + 1)
  // and Undo are the card's own.
  assert.match(h, /const slot = opts\.slot \|\| \{ slotMs: null, flipRowId: null, ti: null \};/);
  assert.match(h, /const write = \{ tapMs, slotMs: slot\.slotMs, flipRowId: slot\.flipRowId \};/);
  assert.match(h, /const cancelUpTo = Math\.max\(Number\.isFinite\(slot\.ti\) \? slot\.ti \+ 1 : 0, opts\.cancelUpTo \|\| 0\);/);
});

test('ED-7: at 18:00 the 20:00 dose is in Agora and writes directly', () => {
  const logs = [row(1, 'Taken', local(8, 2))];
  const r = splitTodayDoses({ cards: [SLU, GHK], logs, nowMs: local(18, 0) });
  assert.deepEqual(r.now.map((p) => p.name), ['SLU-PP-332']);
  assert.deepEqual(r.later.map((x) => x.protocol.name), ['GHK-Cu'], '22:00 still later at 18:00 (4 h)');
  assert.equal(isEarlyTake(local(20), local(18, 0)), false);
  // A late dose stays in Agora.
  const late = splitTodayDoses({ cards: [BPC], logs: [], nowMs: local(11, 0) });
  assert.deepEqual(late.now.map((p) => p.name), ['BPC-157']);
  assert.equal(late.later.length, 0);
});

test('ED-7: Today follows the clock every minute while open', () => {
  assert.match(TODAY, /useClock\(\{ everyMinute: true, enabled: isFocused \}\);/);
  // The split is computed in render from Date.now(), so every tick re-evaluates it.
  assert.match(constBlock(TODAY, 'doseSplit'), /nowMs: Date\.now\(\)/);
});

test('ED-8: the rule sits in handleTake, the one take every Today button uses', () => {
  // The card's button, its skipped line, the caught-up line, the later row and My Protocols' focus
  // take all go through handleTake with their slot.
  assert.match(TODAY, /onTake=\{\(rect\) => handleTake\(p, rect, 0, \{ slot: opts\.takeSlot \|\| cp\.next, cancelUpTo: opts\.cancelUpTo \}\)\}/);
  assert.match(TODAY, /handleTake\(p, null, 0, \{ slot: sk \}\)/);
  assert.match(TODAY, /handleTake\(sp\.protocol, null, 0, \{ slot: sp\.slot \}\)/);
  assert.match(TODAY, /handleTake\(focusCard, null, 0, \{ slot: cp\.next \}\)/);
  // The card's button does not show "taken" before the answer.
  assert.match(TODAY, /function TakeButton\(\{[^}]*confirmFirst/);
  assert.match(TODAY, /if \(askFirst \|\| confirmFirst\) \{ onTake\(null\); return; \}/);
  assert.match(TODAY, /confirmFirst=\{isEarlyTake\(\(opts\.takeSlot \|\| cp\.next\)\.slotMs, Date\.now\(\)\)\}/);
});

test("ED-8: the notification's own Concluir never asks", () => {
  const na = read('lib/notificationActions.js');
  assert.ok(!/earlyDose|isEarlyTake/.test(na));
});

test('ED-9: a once-a-day 20:00 dose at 08:00 is later; a skipped slot keeps the card in Agora', () => {
  const once = proto(4, 'Vitamin D', '20:00');
  const r = splitTodayDoses({ cards: [once], logs: [], nowMs: local(8, 0) });
  assert.equal(r.later.length, 1);
  assert.equal(r.later[0].slot.slotMs, local(20));
  // Untimed: stays in Agora.
  const untimed = proto(5, 'Creatine', null, { doses_per_day: 1 });
  assert.equal(splitTodayDoses({ cards: [untimed], logs: [], nowMs: local(8, 0) }).now.length, 1);
  // 08:00 skipped (written at its slot), 20:00 next: the card stays whole in Agora with its line.
  const skipped = splitTodayDoses({ cards: [SLU], logs: [row(1, 'Skipped', local(8, 0))], nowMs: local(8, 10) });
  assert.deepEqual(skipped.now.map((p) => p.name), ['SLU-PP-332']);
  assert.equal(skipped.later.length, 0);
});

test('ED-10: the reminder dose stays on top and out of both blocks', () => {
  assert.match(constBlock(TODAY, 'focusEl'), /renderDoseCard\(focusCard, \{ highlight: true/);
  assert.match(constBlock(TODAY, 'doseSplit'), /todayCards\.filter\(p => !focusCard \|\| p\.id !== focusCard\.id\)/);
  // Pending from yesterday, the caught-up card and Tomorrow / Next 5 days keep their sources.
  assert.match(constBlock(TODAY, 'pendingEl'), /pendingYest\.length > 0/);
  assert.match(TODAY, /const allDoneToday = todayCards\.length === 0 && totalCount > 0;/);
  assert.match(constBlock(TODAY, 'upcomingEl'), /foldRow\('tom'/);
});

test('ED-11: the new strings exist in all six languages, pt as the picture', () => {
  const keys = ['today_now_title', 'today_later_title', 'today_later_in_hm', 'today_later_in_h', 'today_early_title', 'today_early_body', 'today_early_yes'];
  for (const lang of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of keys) assert.ok(TR[lang][k] && TR[lang][k].trim(), `${lang}.${k}`);
    assert.match(TR[lang].today_early_title, /\{time\}/);
    assert.match(TR[lang].today_early_body, /\{name\}[\s\S]*\{dose\}[\s\S]*\{n\}/);
    assert.match(TR[lang].today_later_in_hm, /\{h\}[\s\S]*\{m\}/);
  }
  assert.equal(TR.pt.today_now_title, 'Agora');
  assert.equal(TR.pt.today_later_title, 'Mais tarde hoje');
  assert.equal(TR.pt.today_early_yes, 'Sim, concluí agora');
  assert.equal(TR.pt.back, 'Voltar');
  assert.equal(TR.pt.today_mark_taken, 'Concluir');
});

test('ED-11: accessibility labels and headers', () => {
  const doses = constBlock(TODAY, 'dosesEl');
  assert.match(doses, /<Text style=\{s\.subLabText\} accessibilityRole="header">\{t\('today_now_title'\)\}<\/Text>/);
  assert.match(doses, /<Text style=\{s\.subLabText\} accessibilityRole="header">\{t\('today_later_title'\)\}<\/Text>/);
  const row = fnBody(TODAY, 'function renderLaterRow(');
  assert.match(row, /accessibilityLabel=\{`\$\{name\}, \$\{time\}, \$\{amount\}, \$\{inLabel\}`\}/);
  assert.match(row, /accessibilityLabel=\{`\$\{t\('today_mark_taken'\)\}, \$\{name\}, \$\{time\}`\}/);
});

test('ED-12: the new styles use theme tokens only', () => {
  for (const name of ['subLabText', 'laterLab', 'laterList', 'earlyRow', 'earlyRowSep', 'earlyRowPicked', 'laterMain']) {
    const m = TODAY.match(new RegExp(`\\n  ${name}: \\{[^\\n]*\\}`));
    assert.ok(m, `${name} style exists`);
    assert.ok(!/#[0-9a-fA-F]{3,8}|'white'|'black'|rgba?\(/.test(m[0]), `${name} uses tokens`);
  }
  const row = fnBody(TODAY, 'function renderLaterRow(');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|'white'|'black'/.test(row));
  // No emoji in the new strings.
  for (const lang of Object.keys(TR)) {
    for (const k of ['today_now_title', 'today_later_title', 'today_later_in_hm', 'today_later_in_h', 'today_early_title', 'today_early_body', 'today_early_yes']) {
      assert.ok(!/\p{Extended_Pictographic}/u.test(TR[lang][k]), `${lang}.${k} has no emoji`);
    }
  }
});
