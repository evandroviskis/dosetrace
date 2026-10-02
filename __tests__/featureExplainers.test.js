'use strict';
// Today redesign part 18 (approved 2026-09-30 as V26 / handoff item 28, re-approved on the Today
// page 2026-10-02): the 8 free-feature explainers, exactly the prototype's EXPLAINERS + FX
// (docs/design/prototype.html "Free-feature explainers"). Rules (DESIGN.md): shown the first time
// someone reaches a feature they have not used, never on launch, "Not now" / "Try it", at most one
// a day, never on the dose-logging path, gone once the feature is used. Example numbers only.
// "Used" is read from the user's own synced data (protocols, vials, dose logs, biomarkers, calc
// inputs), so it follows the account across devices; "already shown" is a per-user, per-device
// flag in AsyncStorage (a one-time explainer is not user-entered data).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations } = require('../i18n/translations.js');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const exists = (...p) => fs.existsSync(path.join(ROOT, ...p));
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const KEYS = ['recon', 'vial', 'remind', 'sites', 'log', 'energy', 'labsman', 'notes'];

const lib = () => {
  assert.ok(exists('lib', 'featureExplainers.js'), 'lib/featureExplainers.js not built yet');
  return require('../lib/featureExplainers');
};
const day = (d, h = 10) => new Date(2026, 9, d, h, 0).getTime();

test('part 18: the eight explainers in the prototype order, with the approved copy', () => {
  const { EXPLAINERS } = lib();
  assert.deepEqual(EXPLAINERS.map((x) => x.key), KEYS);
  const en = translations.en;
  const want = {
    recon: ['Never guess the draw', 'Enter your vial, the water you add and your dose. DoseTrace works out how many units to draw on your syringe, so the math is done for you.'],
    vial: ['Know when a vial runs low', 'Every dose you log comes off the vial. DoseTrace shows the doses and days left and warns you before you run out.'],
    remind: ['A reminder at the right time', 'Get a reminder when a dose is due and mark it complete right from the notification.'],
    sites: ['Rotate your injection sites', 'Log where you injected and see your own rotation at a glance, with the spot you have not used the longest.'],
    log: ['Keep your streak', 'Every dose you log fills your week and your streak, so you see at a glance how consistent you have been.'],
    energy: ['Your daily numbers', 'From your weight, height, age and activity, DoseTrace estimates your resting burn, your daily burn and a protein range, using standard formulas.'],
    labsman: ['All your lab values in one place', 'Type in values from any lab report and keep them together by date, with the units on your report.'],
    notes: ['Notes on your doses', 'Add a note when you log a dose, like how you felt or when you took it, and find it later in your dose log.'],
  };
  for (const x of EXPLAINERS) {
    assert.equal(en[x.titleKey], want[x.key][0], x.key);
    assert.equal(en[x.bodyKey], want[x.key][1], x.key);
    for (const l of LANGS) {
      assert.ok(translations[l][x.titleKey], `${l} ${x.titleKey}`);
      assert.ok(translations[l][x.bodyKey], `${l} ${x.bodyKey}`);
    }
  }
  assert.equal(en.xp_try, 'Try it');
  assert.equal(en.xp_note, 'Example numbers. You see this until you first use the feature.');
  assert.equal(en.paywall_hero_example, 'Example');
  assert.equal(en.today_vial_not_now, 'Not now');
});

test('part 18: shown once per feature, never when the feature is used, at most one a day', () => {
  const { pickExplainer, markShown, emptyState } = lib();
  let st = emptyState();
  // first reach of an unused feature → shown
  assert.equal(pickExplainer(st, [{ key: 'log', used: false }], day(2)), 'log');
  // used → never
  assert.equal(pickExplainer(st, [{ key: 'log', used: true }], day(2)), null);
  st = markShown(st, 'log', day(2));
  // the same day: no second explainer, even for another feature
  assert.equal(pickExplainer(st, [{ key: 'sites', used: false }], day(2, 22)), null);
  // the next day: another feature may show; the one already shown never again
  assert.equal(pickExplainer(st, [{ key: 'log', used: false }, { key: 'sites', used: false }], day(3)), 'sites');
  st = markShown(st, 'sites', day(3));
  assert.equal(pickExplainer(st, [{ key: 'log', used: false }, { key: 'sites', used: false }], day(9)), null);
  // unknown keys are ignored
  assert.equal(pickExplainer(emptyState(), [{ key: 'nope', used: false }], day(2)), null);
});

test('part 18: the shown state is kept per user (AsyncStorage, merged, never clobbered)', async () => {
  const { loadExplainerState, saveShown, storageKey } = lib();
  const mem = new Map();
  const store = { getItem: async (k) => (mem.has(k) ? mem.get(k) : null), setItem: async (k, v) => { mem.set(k, v); } };
  assert.equal(storageKey('u1'), 'dosetrace_explainers_v1:u1');
  await saveShown(store, 'u1', 'log', day(2));
  await saveShown(store, 'u1', 'vial', day(4));
  const s1 = await loadExplainerState(store, 'u1');
  assert.ok(s1.shown.log && s1.shown.vial, 'both kept');
  const s2 = await loadExplainerState(store, 'u2');
  assert.deepEqual(s2.shown, {}, 'another user starts fresh');
  // a broken value never throws
  mem.set('dosetrace_explainers_v1:u3', '{oops');
  assert.deepEqual((await loadExplainerState(store, 'u3')).shown, {});
});

test('part 18: the sheet is the prototype explainerSheet — title, close, Example + animation, body, Not now / Try it, the note', () => {
  assert.ok(exists('components', 'FeatureExplainers.js'), 'components/FeatureExplainers.js not built yet');
  const src = read('components', 'FeatureExplainers.js');
  assert.match(src, /export function FeatureExplainerSheet\(/);
  for (const fx of ['ReconFx', 'VialFx', 'RemindFx', 'SitesFx', 'LogFx', 'EnergyFx', 'LabsmanFx', 'NotesFx']) assert.match(src, new RegExp(`function ${fx}\\(`), fx);
  assert.match(src, /useFxClock\(/, 'the Premium-preview engine (UI-thread clock, Reduce Motion = last frame)');
  assert.match(src, /t\('paywall_hero_example'\)/);
  assert.match(src, /t\('today_vial_not_now'\)/);
  assert.match(src, /t\('xp_try'\)/);
  assert.match(src, /t\('xp_note'\)/);
  assert.match(src, /title: \{[^}]*fontSize: 22[^}]*fontWeight: '700'/);
  assert.match(src, /btnNo: \{[^}]*flex: 1[^}]*backgroundColor: c\.well/);
  assert.match(src, /btnTry: \{[^}]*flex: 1\.4[^}]*backgroundColor: c\.act/);
  assert.doesNotMatch(src, /#[0-9a-fA-F]{6}\b/, 'theme tokens only (the body image marks use the fixed figure set)');
  assert.doesNotMatch(src, /\p{Extended_Pictographic}/u, 'no emoji');
});

test('part 18: the gates sit where each free feature lives — never on Today (the dose-logging path)', () => {
  const gate = read('components', 'FeatureExplainerGate.js');
  assert.match(gate, /useFocusEffect\(/, 'on reaching the screen, never on launch');
  assert.match(gate, /pickExplainer\(/);
  assert.match(gate, /saveShown\(/);
  const protos = read('screens', 'ProtocolsScreen.js');
  assert.match(protos, /<FeatureExplainerGate[^>]*candidates=\{protocolExplainers\}/);
  for (const k of ['recon', 'vial', 'remind']) assert.match(protos, new RegExp(`key: '${k}'`));
  const log = read('screens', 'LogScreen.js');
  assert.match(log, /\{!embedded && <FeatureExplainerGate candidates=\{logExplainers\} \/>\}/, 'not on Today\'s right page');
  for (const k of ['log', 'sites']) assert.match(log, new RegExp(`key: '${k}'`));
  assert.match(read('screens', 'ProgressScreen.js'), /key: 'energy'/);
  assert.match(read('screens', 'BodyScreen.js'), /key: 'labsman'/);
  assert.doesNotMatch(read('screens', 'TodayScreen.js'), /FeatureExplainerGate/);
});
