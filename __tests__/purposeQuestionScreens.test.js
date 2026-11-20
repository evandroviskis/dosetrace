'use strict';
// "Para que você usa {produto}?" on the screens (docs/specs/purpose-question.md PQ-1..PQ-4,
// PQ-11..PQ-16): the manual form, the protocol assistant and the onboarding summary. Source-level
// for the screens (as the other screen tests) plus the pure parts of the onboarding draft.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const FORM = read('screens', 'ProtocolsScreen.js');
const ASSIST = read('screens', 'components', 'ProtocolAssistant.js');
const TILES = read('components', 'PurposeTiles.js');
const STEPS = read('screens', 'components', 'OnboardingProtocolSteps.js');
const ONB = read('screens', 'OnboardingFlowScreen.js');
const APP = read('App.js');
const I18N = read('i18n', 'translations.js');
const { translations: T } = require('../i18n/translations.js');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

test('PQ-1: the question sits on step 1, right after the product name, once a product is chosen; Next never needs it', () => {
  const step1 = FORM.slice(FORM.indexOf('{step === 1 && ('), FORM.indexOf('{step === 2 && ('));
  const spell = step1.indexOf("t('protocols_spelling_note')");
  const tiles = step1.indexOf('<PurposeTiles');
  assert.ok(spell > 0 && tiles > spell, 'after the name field and its notes');
  assert.match(step1, /\{name \? \(\n\s+<PurposeTiles key=\{type \+ ':' \+ \(compoundId \|\| name\)\} name=\{name\} ordered=\{purposeFor\(\{ type, compoundId, name, times: reminderTimes \}\)\} value=\{goals\} onToggle=\{toggleGoal\} t=\{t\} \/>/);
  const nextFn = FORM.slice(FORM.indexOf('if (step === 1) {'), FORM.indexOf('if (step === 1) {') + 300);
  assert.doesNotMatch(nextFn, /goals/, 'goals are optional');
  assert.match(TILES, /t\('purpose_q'\)\.replace\('\{name\}', name \|\| ''\)/);
  assert.match(TILES, /t\('purpose_sub'\)/);
});

test('PQ-2: equal tiles 2 per row with the onboarding tile look, 6 visible, then "Ver todos os objetivos (N)"', () => {
  assert.match(TILES, /import \{ tileStyles \} from '\.\/CompoundPills';/);
  assert.match(TILES, /StyleSheet\.create\(\{ \.\.\.tileStyles\(colors\), \.\.\.styles\(colors\) \}\)/);
  assert.match(TILES, /limit = 6/);
  assert.match(TILES, /style=\{\[s\.tile, on && s\.tileOn\]\}/);
  assert.match(TILES, /<View style=\{s\.tileGrid\}>/);
  assert.match(TILES, /t\('ob_goal_see_all'\)\.replace\('\{n\}', String\(v\.total\)\)/);
  assert.match(TILES, /accessibilityRole="checkbox" accessibilityState=\{\{ checked: on \}\}/);
  assert.doesNotMatch(TILES, /compoundPillStyles|s\.pill/, 'no pill cloud');
});

test('PQ-4: the old "Objetivo de bem-estar" pills row under the schedule is gone, with its string and lists', () => {
  assert.doesNotMatch(FORM, /protocols_wellness_goal|getWellnessKeys|WELLNESS_KEYS_(INJECTABLE|ORAL)/);
  assert.doesNotMatch(I18N, /protocols_wellness_goal/);
  const step4 = FORM.slice(FORM.indexOf('{step === 4 && ('), FORM.indexOf("{step === 5 && type === 'recon'"));
  assert.doesNotMatch(step4, /goals/);
  // One tile list in the app: the pure lib.
  assert.match(FORM, /import \{ purposeOrder, purposeProductKey, goalsAfterProductChange \} from '\.\.\/lib\/protocolPurpose';/);
});

test('PQ-5 / PQ-11: the form orders by her protocols, ended ones too, never the one being edited; Edit keeps the saved goals', () => {
  assert.match(FORM, /purposeOrder\(\{ type: ty, compoundId: cid, name: nm, protocols: \[\.\.\.protocols, \.\.\.endedProtocols\], excludeId: editingId, times, label: t, language \}\)/);
  // Edit fills the goals from the stored row (lib/protocolForm formFromProtocol → applyForm).
  assert.match(FORM, /setGoals\(f\.goals\);/);
  assert.match(read('lib', 'protocolForm.js'), /f\.goals = p\.goal \? p\.goal\.split\(','\)\.filter\(Boolean\) : \[\];/);
});

test('PQ-12: storage unchanged — protocols.goal is the comma-joined keys, no migration', () => {
  const { protocolPayload, newProtocolForm } = require('../lib/protocolForm');
  const f = newProtocolForm(new Date(2026, 10, 20, 12));
  f.name = 'Melatonina'; f.type = 'oral'; f.goals = ['wt_sleep_quality', 'wt_circadian'];
  const p = protocolPayload(f, () => 'daily', 'pt');
  assert.equal(p.goal, 'wt_sleep_quality,wt_circadian');
  const migs = fs.readdirSync(path.join(__dirname, '..', 'supabase', 'migrations'));
  assert.ok(!migs.some((m) => /purpose/i.test(m)), 'no purpose migration');
});

test('PQ-13: the assistant shows the same tiles before its summary / review card when it has a product, and saves the pick', () => {
  assert.match(ASSIST, /import PurposeTiles from '\.\.\/\.\.\/components\/PurposeTiles';/);
  assert.match(ASSIST, /!conv\.draft\.name \|\| !\['confirm', 'review'\]\.includes\(conv\.step\)/);
  assert.match(ASSIST, /k === 'summary' \|\| k === 'review'/);
  const at = ASSIST.indexOf('{m.id === purposeAt && (');
  assert.ok(at > 0 && at < ASSIST.indexOf('{renderMsg(m)}'), 'drawn before the card');
  assert.match(ASSIST, /ordered=\{purposeFor\(\{ type: conv\.draft\.type, compoundId: conv\.draft\.compoundId \|\| null, name: conv\.draft\.name, times: conv\.draft\.times \}\)\}/);
  assert.match(ASSIST, /onFinish\(conv\.outcome\.kind, withGoals\(A\.formFromConversation\(conv, baseForm\)\)\);/);
  assert.match(ASSIST, /onFinish\('handback', conv \? withGoals\(A\.formFromConversation\(conv, baseForm\)\) : null\);/);
  assert.match(ASSIST, /useState\(\(\) => \(Array\.isArray\(form && form\.goals\) \? form\.goals : \[\]\)\)/);
  assert.match(FORM, /purposeFor=\{purposeFor\}/);
  // The form takes the assistant's goals (finishAssistant → applyForm → setGoals).
  assert.match(FORM, /function finishAssistant\(kind, result\) \{[\s\S]{0,200}applyForm\(f\);/);
});

test('PQ-14: onboarding "Protocolo pronto" shows "Para: …" from her profile goals, and the protocol is saved with them', () => {
  const D = require('../lib/onboardingDraft');
  const t = (k) => T.pt[k] || k;
  const p = { name: 'Melatonina', form: 'oral', dose: '3', doseUnit: 'mg', freq: 'daily', time: '21:30', startMode: 'today' };
  const base = { t, language: 'pt', timeFormat: '24h', now: new Date(2026, 10, 20, 12), weekdayName: () => '', dateText: () => '20/11/2026' };
  const rows = D.summaryRows(p, { ...base, purpose: ['wt_sleep_quality', 'wt_stress_mgmt'] });
  assert.deepEqual(rows.slice(0, 2).map((r) => r.key), ['compound', 'purpose']);
  assert.equal(rows[1].label, 'Para');
  assert.equal(rows[1].value, 'Qualidade do sono, Gestão do estresse');
  assert.ok(!D.summaryRows(p, base).some((r) => r.key === 'purpose'), 'no goal that maps → no row');
  assert.ok(!D.summaryRows(p, { ...base, purpose: [] }).some((r) => r.key === 'purpose'));
  // The draft's purpose is what the account's protocol is saved with.
  const r = D.draftToForm({ ...p, purpose: ['wt_sleep_quality'] }, { now: new Date(2026, 10, 20, 12), language: 'pt' });
  assert.deepEqual(r.form.goals, ['wt_sleep_quality']);
  assert.deepEqual(D.draftToForm(p, { now: new Date(2026, 10, 20, 12), language: 'pt' }).form.goals, []);
  // The screens: the summary maps her goals; the flow stores them on the draft at "Protocolo pronto".
  assert.match(STEPS, /purposeFromProfile\(profileGoals, protocol\.form, compoundIdFor\(protocol\)\)/);
  assert.match(STEPS, /summaryRows\(protocol, \{ t, language, timeFormat, now, weekdayName: wd, dateText: \(iso\) => formatDate\(iso, language, 'dayMonthYear'\), purpose \}\)/);
  assert.match(ONB, /profileGoals=\{builder \? meta\.primary_goal : d\.goals\}/);
  assert.match(ONB, /if \(cur === 'ready'\) \{[\s\S]{0,400}purposeFromProfile\(builder \? meta\.primary_goal : d\.goals, protocol && protocol\.form, compoundIdFor\(protocol\)\)/);
  // The builder (an account that never made a protocol) gets her saved goals too.
  assert.match(APP, /params: \{ userId: user\.id, tracking: \(user\.user_metadata \|\| \{\}\)\.tracking_types \|\| \[\], goals: \(user\.user_metadata \|\| \{\}\)\.primary_goal \|\| '' \}/);
  assert.match(APP, /user_metadata: \{ tracking_types: Array\.isArray\(p\.tracking\) \? p\.tracking : \[\], primary_goal: p\.goals \|\| '' \}/);
  // No new onboarding question.
  assert.doesNotMatch(ONB, /purpose_q/);
});

test('PQ-3 / PQ-15: the new strings in 6 languages, natural, never advice ("recomendado")', () => {
  const ADVICE = /recomend|recommend|empfehl|empfohl|raccomand|consigl|aconsej|conseill|sugest|suggest|should|deveria|devrait|sollte|dovresti|deberías/i;
  for (const k of ['purpose_q', 'purpose_sub', 'ob_sum_for']) {
    for (const l of LANGS) {
      assert.ok(T[l][k], `${l} ${k}`);
      assert.doesNotMatch(T[l][k], ADVICE, `${l} ${k}`);
    }
  }
  for (const l of LANGS) assert.ok(T[l].purpose_q.includes('{name}'), l);
  assert.equal(T.pt.purpose_q, 'Para que você usa {name}?');
  assert.equal(T.pt.purpose_sub, 'Opcional. Escolha um ou mais.');
  assert.equal(T.pt.ob_sum_for, 'Para');
  assert.match(T.fr.purpose_q, /vous/, 'fr uses vous');
  assert.match(T.de.purpose_q, /\bdu\b/, 'de uses du');
});

test('PQ-16: the tiles use theme tokens only', () => {
  for (const src of [TILES]) {
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/);
  }
  assert.match(TILES, /color: c\.ink/);
});
