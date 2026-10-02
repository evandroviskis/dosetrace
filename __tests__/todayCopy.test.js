'use strict';
// Today redesign (founder 2026-10-02: "A, dias coloridos, confirmo os ícones") — the words:
// part 2  snooze strip "Tomorrow / In 3 days" only ("Later today", "Remove" and the X go);
// part 5  "4 of 5 complete" (founder 2026-10-02: no more "taken");
// part 7  the full site name "Last: Abdomen, lower left · 1d ago" (stored data unchanged);
// part 8  "1 dose remaining" / "N doses remaining" + one vial cell per dose (prototype cells());
// part 12 "1 dose" in the Tomorrow / Next 5 days folds;
// part 15 "Site saved · {site}" (Q22 = A); part 16 the sheet title "Injection site".
// Every new string exists in all 6 languages (the parity test covers the key set).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations } = require('../i18n/translations.js');

const ROOT = path.join(__dirname, '..');
const exists = (...p) => fs.existsSync(path.join(ROOT, ...p));
const tOf = (lang) => (k) => (translations[lang][k] != null ? translations[lang][k] : k);
const t = tOf('en');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

test('the new Today strings exist in all 6 languages', () => {
  for (const k of ['today_doses_taken', 'today_dose_one', 'today_vial_remaining_one', 'today_reminder_tag', 'today_site_saved', 'today_sites_n']) {
    for (const l of LANGS) assert.ok(translations[l][k], `${l}: ${k}`);
  }
  assert.equal(translations.en.today_doses_taken, '{x} of {y} complete');
  assert.equal(translations.en.today_site_saved, 'Site saved · {site}');
  assert.equal(translations.en.today_reminder_tag, 'reminder');
});

test('part 16: the site sheet title is "Injection site" (was "Pick site(s)")', () => {
  const want = { en: 'Injection site', es: 'Sitio de inyección', pt: 'Local da injeção', fr: "Site d'injection", de: 'Injektionsstelle', it: 'Sito di iniezione' };
  for (const l of LANGS) assert.equal(translations[l].bodymap_title, want[l], l);
});

test('part 5 / 8 / 12: counts read as words, singular handled', () => {
  assert.ok(exists('lib', 'todayFormat.js'), 'lib/todayFormat.js not built yet');
  const f = require('../lib/todayFormat');
  assert.equal(f.dosesTakenLabel(4, 5, t), '4 of 5 complete');
  assert.equal(f.dosesTakenLabel(0, 1, tOf('de')), '0 von 1 erledigt');
  assert.equal(f.doseCountLabel(1, t), '1 dose');
  assert.equal(f.doseCountLabel(5, t), '5 doses');
  assert.equal(f.doseCountLabel(1, tOf('de')), '1 Dosis');
  assert.equal(f.vialRemainingLabel(1, t), '1 dose remaining');
  assert.equal(f.vialRemainingLabel(2, t), '2 doses remaining');
  assert.equal(f.vialRemainingLabel(0, t), '0 doses remaining');
});

test('part 8: vial cells — one per dose, remaining ones filled (prototype cells(total, left))', () => {
  const f = require('../lib/todayFormat');
  const v = f.vialCells(4, 2);
  assert.equal(v.cellW, 12);
  assert.equal(v.width, 48);
  assert.deepEqual(v.cells[0], { x: 0.5, w: 9, filled: true });
  assert.deepEqual(v.cells[3], { x: 36.5, w: 9, filled: false });
  assert.equal(f.vialCells(20, 13).cellW, 7, 'floor(150 / 20)');
  // A vial with more doses than fit as readable cells shows the text only (no 0-wide cells).
  assert.equal(f.vialCells(40, 10), null);
  assert.equal(f.vialCells(0, 0), null);
});

test('part 7: the last-site line names the full site, stored data unchanged', () => {
  const { describeStored, summarizeStored } = require('../lib/injectionSites');
  assert.equal(typeof describeStored, 'function', 'describeStored not built yet');
  const one = JSON.stringify({ type: 'subq', sites: ['abdomen_ll'] });
  assert.equal(describeStored(one, t), 'Abdomen, lower left');
  assert.equal(describeStored(one, tOf('de')), 'Bauch, unten links');
  const two = JSON.stringify({ type: 'subq', sites: ['abdomen_ll', 'thigh_f_r'] });
  assert.equal(describeStored(two, t), `2 sites · ${t('group_abdomen')}, ${t('group_thigh')}`);
  assert.equal(describeStored('left glute', t), '“left glute”');
  assert.equal(describeStored(null, t), null);
  // the group summary other screens use is unchanged
  assert.equal(summarizeStored(one, t), t('group_abdomen'));
  const today = fs.readFileSync(path.join(ROOT, 'screens', 'TodayScreen.js'), 'utf8');
  assert.match(today, /describeStored\(l\.injection_site, t\)/);
  assert.doesNotMatch(today, /summarizeStored/);
});

test('part 2: snooze "Tomorrow" = 09:00 tomorrow, "In 3 days" = 09:00 in three days', () => {
  const f = require('../lib/todayFormat');
  const now = new Date(2026, 9, 2, 14, 30).getTime();
  assert.equal(f.snoozeUntil('tomorrow', now), new Date(2026, 9, 3, 9, 0).getTime());
  assert.equal(f.snoozeUntil('in3', now), new Date(2026, 9, 5, 9, 0).getTime());
  assert.deepEqual(f.SNOOZE_KINDS, ['tomorrow', 'in3']);
});

// Sim check 2026-10-02: a site used today read "Last: Abdomen, lower right · 0d ago".
test('last site used today reads "today", never "0d ago" (6 languages)', () => {
  const fs = require('fs');
  const path = require('path');
  const assert = require('node:assert/strict');
  const { translations } = require('../i18n/translations.js');
  const want = { en: 'Last: {site} · today', es: 'Último: {site} · hoy', pt: 'Último: {site} · hoje', fr: "Dernier: {site} · aujourd'hui", de: 'Letzte: {site} · heute', it: 'Ultimo: {site} · oggi' };
  for (const [l, v] of Object.entries(want)) assert.equal(translations[l].today_last_site_today, v, l);
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'TodayScreen.js'), 'utf8');
  assert.match(src, /lastSite\.daysAgo === 0 \? t\('today_last_site_today'\)/);
});
