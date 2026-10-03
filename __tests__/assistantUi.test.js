'use strict';
// The assistant's screens (AP-0, AP-1, AP-12, AP-13, AP-15, AP-16, AP-17, AP-19, AP-21): the
// four ways in, the explainer, the option-B syringe list, the consent first, the same Save as
// the form, theme tokens only, no emoji. Source checks + the explainer's numbers.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');
const { explainerModel } = require('../lib/fitExplainer');
const { newProtocolForm } = require('../lib/protocolForm');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const SCREEN = read('screens', 'ProtocolsScreen.js');
const ASSIST = read('screens', 'components', 'ProtocolAssistant.js');
const FX = read('screens', 'components', 'FitExplainer.js');
const PICK = read('screens', 'components', 'SyringePicker.js');
const NOW = new Date(2026, 9, 3, 10, 0);

test('AP-19: the new screens parse, use theme tokens only and draw no emoji', () => {
  for (const [name, src] of [['ProtocolAssistant', ASSIST], ['FitExplainer', FX], ['SyringePicker', PICK], ['ProtocolsScreen', SCREEN]]) {
    assert.doesNotThrow(() => parse(src, { sourceType: 'module', plugins: ['jsx'] }), name);
    assert.doesNotMatch(src, /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/, `${name}: raw hex`);
    assert.doesNotMatch(src, /'(white|black)'|rgba?\(/, `${name}: named or rgba colour`);
    assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, `${name}: emoji`);
  }
});

test('AP-1: four ways in, one window — Build (new, empty step 1), Finish (any other step), the dose step, Ask AI on the warning', () => {
  assert.match(SCREEN, /const firstDoor = hasNewProtocolInput\(currentForm\(\), searchQuery\) \|\| name \? 'finish' : 'build';/);
  assert.match(SCREEN, /\{!editingId && aiDoor\('dose', 'ap_door_dose_sub'\)\}/);
  assert.equal((SCREEN.match(/aiDoor\('finish', 'ap_door_finish_sub'\)/g) || []).length, 3, 'steps 2, 4 and 5');
  assert.match(SCREEN, /onPress=\{\(\) => openAssistant\('fit'\)\}/, 'Ask AI for help on the warning');
  assert.match(SCREEN, /onAskAI=\{\(\) => \{ setExplainerOpen\(false\); setTimeout\(\(\) => openAssistant\('fit'\), 450\); \}\}/, 'and from the explainer');
  assert.match(SCREEN, /\{assistant \? \(\s*<ProtocolAssistant/, 'the same window, inside the add / edit sheet');
});

test('AP-15: the shared AI consent is asked first; declining leaves the form', () => {
  const fn = SCREEN.slice(SCREEN.indexOf('async function openAssistant('), SCREEN.indexOf('function assistantCatalog('));
  assert.match(fn, /if \(!\(await hasAIConsent\(\)\)\)/);
  assert.match(fn, /label: t\('ai_consent_agree'\), kind: 'primary', onPress: async \(\) => \{ await grantAIConsent\(\); setAssistant\(\{ door \}\); \}/);
  assert.match(fn, /\{ label: t\('cancel'\), kind: 'secondary' \}/);
});

test('AP-16 / AP-0: closing, an error or "Continue in the form" go back to the form with every answer kept', () => {
  assert.match(ASSIST, /onFinish\('handback', conv \? A\.formFromConversation\(conv, baseForm\) : null\)/);
  // the weekly limit (reached at the first answer to the AI) blocks; other failures are a notice
  assert.match(ASSIST, /if \(n\.key === 'ap_err_quota' \|\| n\.key === 'ap_err_quota_nodate'\) \{ setBlocked\(n\); setPhase\('blocked'\); return; \}/);
  assert.match(ASSIST, /\{t\('ap_opt_form'\)\}/);
  const fin = SCREEN.slice(SCREEN.indexOf('function finishAssistant('), SCREEN.indexOf('// Done (AP-26)'));
  assert.match(fin, /applyForm\(f\);/);
  assert.match(fin, /setStep\(Math\.max\(1, Math\.min\(stepForHandback\(f\)/);
  // a failed answer keeps the typed text in the box
  assert.match(ASSIST, /if \(r\.error\) \{[\s\S]*?A\.notice\(cur, n\.key, n\.params\)[\s\S]*?return;\s*\}\s*setText\(''\);/);
});

test('AP-17 / AP-26: Done saves through the form\'s own saveProtocol (same fields, vial, reminders, backfill offer)', () => {
  assert.match(SCREEN, /if \(kind === 'save'\) \{ setPendingSave\(true\); return; \}/);
  assert.match(SCREEN, /useEffect\(\(\) => \{\s*if \(!pendingSave\) return;\s*setPendingSave\(false\);\s*saveProtocol\(\);\s*\}, \[pendingSave\]\);/);
  assert.doesNotMatch(ASSIST, /insertProtocol|updateProtocol|insertVial/, 'the assistant never writes data itself');
});

test('AP-7: the label photo goes through the same vial-scan path (consent, shared quota, edge function)', () => {
  assert.match(SCREEN, /scanLabel=\{extractVialLabel\}/);
  const fn = SCREEN.slice(SCREEN.indexOf('async function extractVialLabel('), SCREEN.indexOf('// ── The AI protocol assistant'));
  assert.match(fn, /supabase\.functions\.invoke\('extract-bloodwork', \{\s*body: \{ kind: 'vial'/);
  assert.match(fn, /\{ quota: true \}/);
});

test('AP-12: the "?" on the dose field, the red warning and the red syringe open the explainer', () => {
  assert.match(SCREEN, /<TouchableOpacity style=\{s\.qBtn\} onPress=\{\(\) => setExplainerOpen\(true\)\}/);
  assert.match(SCREEN, /<Pressable style=\{\[s\.warnbox, s\.warnboxRisk\]\} onPress=\{\(\) => setExplainerOpen\(true\)\}/);
  assert.match(SCREEN, /<Pressable disabled=\{!drawOver\} onPress=\{\(\) => setExplainerOpen\(true\)\}/);
  assert.match(FX, /t\('fx_key_medicine'\)\.replace\('\{unit\}', model\.keyUnit\)/, 'the key is always shown');
  assert.match(FX, /t\('fx_key_liquid'\)/);
  assert.match(FX, /onPress=\{\(\) => onSplit\(sp\.each, sp\.n\)\}/);
  assert.match(SCREEN, /function chooseSplit\(each, n\) \{\s*setDose\(inputNumber\(each, language\)\);/, 'a split fills the user\'s own number divided (and asks the spacing)');
  assert.match(FX, /useReducedMotion\(\)/, 'Reduce Motion shows the last frame');
});

test('AP-12: the explainer\'s numbers are the user\'s (the NAD+ case) and the splits only divide their dose', () => {
  const f = { ...newProtocolForm(NOW), type: 'recon', amount: '1000', unit: 'mg', water: '7', dose: '240', doseUnit: 'mg', syringeSize: 100 };
  const m = explainerModel(f, 'en');
  assert.equal(m.params.perml, '142.9');
  assert.equal(m.params.ml, '1.68');
  assert.equal(m.params.holds, '1');
  assert.equal(m.params.full, '142.9');
  assert.equal(m.over, true);
  assert.deepEqual(m.splits.map((x) => [x.n, x.eachText, x.fits]), [[2, '120', true], [3, '80', true], [7, '34.29', true]]);
  const pt = explainerModel({ ...f, amount: '1.000' }, 'pt');
  assert.equal(pt.params.perml, '142,9');
  // a mcg dose against a mg vial is explained in the dose's unit
  const mcg = explainerModel({ ...f, amount: '5', water: '1', dose: '6000', doseUnit: 'mcg', syringeSize: 100 }, 'en');
  assert.equal(mcg.params.perml, '5000');
  assert.equal(mcg.keyUnit, 'mcg');
  // ready to use
  const rtu = explainerModel({ ...f, type: 'rtu', concentration: '250', concentrationUnit: 'mg', dose: '420' }, 'en');
  assert.equal(rtu.params.perml, '250');
  assert.equal(rtu.params.ml, '1.68');
  assert.equal(explainerModel({ ...f, dose: '' }, 'en'), null);
  assert.equal(explainerModel({ ...f, type: 'oral' }, 'en'), null);
});

test('AP-13: the injectable dose field reads "Dose per injection" with its one-line hint', () => {
  assert.equal((SCREEN.match(/<Fld s=\{s\} label=\{doseLabel\} labelExtra=\{doseQ\} hint=\{t\('protocols_dose_hint'\)\}>/g) || []).length, 2, 'powder and ready to use');
});

test('AP-21: Ready to use gets the option-B row and grouped list; a powder keeps the insulin syringes', () => {
  assert.match(SCREEN, /<SyringePickerRow size=\{syringeSize\} language=\{language\} t=\{t\} onPress=\{\(\) => setSyrPickerOpen\(true\)\} \/>/);
  assert.match(PICK, /syringeGroups\(type\)\.map/);
  assert.match(PICK, /t\(g\.titleKey\)\.toUpperCase\(\)/);
  assert.match(SCREEN, /setSyringeSize\(\(sz\) => allowedSyringe\(typeOpt\.val, sz\)\)/, 'switching to a powder drops an ml syringe');
  // over the syringe still blocks a powder only (as before); ready to use shows it
  assert.match(SCREEN, /const drawExceedsSyringe = type === 'recon' && wizardDraw\.exceedsSyringe;/);
  assert.match(SCREEN, /const drawOver = type !== 'oral' && wizardDraw\.exceedsSyringe;/);
});

test('AP-10: fields the user set by hand are tracked (the form\'s defaults are not answers)', () => {
  for (const k of ['water', 'syringe', 'schedule', 'start', 'type', 'mixed']) assert.match(SCREEN, new RegExp(`touch\\('${k}'\\)`), k);
  assert.match(SCREEN, /ctx=\{\{ touched: Array\.from\(touchedRef\.current\), visitedStep, mixedOn: skipVial \? null : formMixedOn\(\), skipVial, editing: !!editingId \}\}/);
});
