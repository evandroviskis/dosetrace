'use strict';
// The screens and the App wiring of the onboarding protocol (docs/specs/onboarding-protocol.md OB-1,
// OB-7, OB-9, OB-11, OB-13, OB-20..OB-26). Source-level, as the other screen tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const ONB = read('screens', 'OnboardingFlowScreen.js');
const STEPS = read('screens', 'components', 'OnboardingProtocolSteps.js');
const APP = read('App.js');
const { translations: T } = require('../i18n/translations.js');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

test('OB-1: the screen renders every step of the signed order and the old features list is gone', () => {
  assert.match(ONB, /cur === 'intro' \? \(\s*<OnboardingIntro onDone=\{next\} \/>/, 'OB-27: the intro video');
  assert.doesNotMatch(ONB, /OnboardingFeature\b/, 'the five feature screens are gone');
  for (const s of ["cur === 'help'", "cur === 'goal'", "cur === 'consent'", "cur === 'tracking'", 'isProtocolStep', "cur === 'about'", "cur === 'reminders'"]) assert.ok(ONB.includes(s), s);
  assert.doesNotMatch(ONB, /ob_features_title|ob_feat1_t|AccumulationHero/, 'the single "Feito para o seu protocolo" screen is removed');
  assert.doesNotMatch(ONB, /cur === 'routine'/, 'OP-1: no separate routine screen');
  // Navigation is by step name (lib/onboardingSteps nextStep / prevStep).
  assert.match(ONB, /let n = nextStep\(steps, cur\);/);
  assert.match(ONB, /const p = prevStep\(steps, cur\);/);
});

test('OB-27 / OB-20: "Pular" is the video\'s own, "Montar depois" on every protocol screen, Back keeps the answers', () => {
  assert.doesNotMatch(ONB, /t\('ob_skip'\)/, 'the flow has no Pular of its own any more (components/OnboardingIntro has it)');
  assert.match(ONB, /\{isProtocolStep && !builder && \([\s\S]{0,160}onPress=\{skip\}[\s\S]{0,160}t\('ob_build_later'\)/);
  assert.match(ONB, /setSkipped\(true\);\n\s+await persist\(\{ skipped: true \}\);/);
  const back = ONB.slice(ONB.indexOf('function back() {'), ONB.indexOf('function back() {') + 260);
  assert.doesNotMatch(back, /setProtocol|setHelp|setD\(/, 'Back changes no answer');
});

test('OB-11 / OB-13: goals and "what you use" are the same components in onboarding and Edit profile', () => {
  const settings = read('screens', 'SettingsScreen.js');
  assert.match(ONB, /<GoalTiles value=\{d\.goals\}/);
  assert.match(settings, /<GoalTiles value=\{primaryGoals\}/);
  assert.match(ONB, /<CompoundPills value=\{d\.tracking\}/);
  assert.match(settings, /<CompoundPills value=\{trackingTypes\}/);
  const tiles = read('components', 'CompoundPills.js');
  assert.match(tiles, /style=\{\[s\.tile, s\.tileTall, on && s\.tileOn\]\}/, '4 equal icon tiles');
  assert.doesNotMatch(ONB, /ob_goal_sub/, 'OB-10: the false sub-text is gone');
});

test('OB-16 / OB-19: no syringe and no units before the account; the builder (account exists) shows the syringe math', () => {
  const vial = STEPS.slice(STEPS.indexOf('function VialStep('), STEPS.indexOf('// ── Frequency and time'));
  assert.doesNotMatch(vial, /SyringeScale|computeDraw|drawUnits|ob_ready_units/, 'the vial screen has no syringe');
  assert.match(STEPS, /\{protocol\.form === 'oral' \? null : mode === 'builder' \? <SyringeMath [^>]*\/> : <PreparingCard [^>]*\/>\}/);
  assert.match(STEPS, /<SyringeScale units=\{0\}/, 'the preparing card shows an empty syringe');
  for (const l of LANGS) {
    assert.ok(T[l].ob_ready_prep_title && T[l].ob_ready_prep_body, l);
    assert.doesNotMatch(T[l].ob_ready_prep_body, /\d/, `${l}: no number before the account`);
  }
  assert.equal(T.pt.ob_ready_prep_body, 'A quantidade para puxar na seringa aparece assim que terminarmos a criação da sua conta.');
});

test('OB-17: the time is hers — the time card starts empty and the wheel opens on 12:00 (never the clock)', () => {
  assert.match(STEPS, /p\.time \? formatTime\(p\.time, language, timeFormat\) : t\('protocols_time_missing_title'\)/);
  assert.match(STEPS, /timeColumns\(wheelStartTime\(p\.time\)/);
  assert.doesNotMatch(STEPS, /new Date\(\)\.getHours\(\)/);
});

test('OB-21: no AI and no network in the onboarding screens', () => {
  for (const src of [ONB, STEPS, read('components', 'GoalTiles.js')]) {
    assert.doesNotMatch(src, /assistantClient|protocolAssistant|functions\.invoke|fetch\(/);
  }
  assert.doesNotMatch(STEPS, /supabase/);
});

test('OB-22: the draft is saved in its own store as she goes and handed off on Create account / Sign in', () => {
  assert.match(ONB, /await draftStore\.save\(\{ help, protocol, skipped, language, \.\.\.over \}\);/);
  const toAuth = ONB.slice(ONB.indexOf('async function toAuth('), ONB.indexOf('async function finish('));
  assert.match(toAuth, /await draftStore\.markHandoff\(\)/);
  assert.match(ONB, /Promise\.all\(\[loadOnboarding\(\), draftStore\.load\(\)\]\)/, 'reopened after an app kill');
});

test('OB-22 / OB-23 / OB-26: App runs the draft after the import, deferred — never inside onAuthStateChange', () => {
  const cb = APP.slice(APP.indexOf('supabase.auth.onAuthStateChange('), APP.indexOf('// Sign in with Apple: if the user revokes'));
  assert.doesNotMatch(cb, /afterSignInOnboarding|applyOnboardingDraft/);
  const signIn = APP.slice(APP.indexOf('const onSignedIn = (session) => {'), APP.indexOf('setSignInHandler(onSignedIn);'));
  const at = signIn.indexOf('await afterSignInOnboarding(session.user)');
  assert.ok(at > 0, 'on SIGNED_IN');
  assert.ok(signIn.indexOf('setTimeout(async () => {') < at, 'deferred');
  assert.ok(signIn.indexOf('const step = await signInDeviceStep(') < at, 'after the device step / import');
  assert.ok(signIn.indexOf('if (step.held) return;') < at, 'never while held');
  assert.match(APP, /await afterSignInOnboarding\(s\.user\)/, 'after the cross-account sheet too');
  assert.match(APP, /await afterSignInOnboarding\(session\.user\)\.catch\(\(\) => \{\}\);\n\n\s+\/\/ Schedule reminders AFTER the initial import/, 'cold start (a kill before the sign-in finished)');
  // OP-2: the question, locked, keep / discard; at the limit Premium / discard.
  assert.match(APP, /title: t\('ob_keep_title'\)[\s\S]{0,200}locked: true/);
  assert.match(APP, /title: t\('ob_limit_title'\)[\s\S]{0,200}locked: true/);
  // The routes.
  assert.match(APP, /<Stack\.Screen name="EntryOffer"/);
  assert.match(APP, /<Stack\.Screen name="ProtocolBuilder" component=\{ProtocolBuilderRoute\}/);
  assert.match(APP, /<OnboardingFlowScreen session=\{\{ user \}\} mode="builder" onBuilderDone=\{done\} \/>/);
  // OB-26: the mark on the account before the builder opens (shown once).
  assert.match(APP, /await markBuilderShown\(\);\n\s+goPending\(\{ screen: 'ProtocolBuilder'/);
  assert.match(read('lib', 'onboardingApp.js'), /supabase\.auth\.updateUser\(\{ data: builderShownPatch\(/);
});

test('OB-24: the reminders screen names her dose; the permission is asked only there', () => {
  assert.match(ONB, /reminderLine\(builtProtocol, \{ t, timeFormat, language, weekdayName: weekdayPhrase\(t\) \}\)/);
  const asks = ONB.match(/askAndRemember\(/g) || [];
  assert.equal(asks.length, 1);
  assert.match(ONB, /async function enableNotifications\(\) \{\n\s+await askAndRemember\(Notifications, AsyncStorage\);/);
  assert.doesNotMatch(STEPS, /Notifications|askAndRemember|requestPermissions/);
  assert.equal(T.pt.ob_wd_long_1, 'Toda segunda-feira');
  assert.equal(T.pt.ob_rem_weekly, '{day} às {time}, para {compound}.');
});

test('OB-25: the new screens use theme tokens only and no emoji', () => {
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  for (const [name, src] of [['onboarding', ONB], ['steps', STEPS], ['goals', read('components', 'GoalTiles.js')], ['tiles', read('components', 'CompoundPills.js')]]) {
    const body = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/, `${name}: no raw colour`);
    assert.doesNotMatch(body, EMOJI, `${name}: no emoji`);
  }
  for (const l of LANGS) for (const k of Object.keys(T.en).filter((x) => x.startsWith('ob_wd_') || x.startsWith('ob_cmp_') || x.startsWith('ob_vial_'))) assert.ok(T[l][k], `${l}.${k}`);
});
