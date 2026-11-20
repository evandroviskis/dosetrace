// OB-2..OB-7 (docs/specs/onboarding-protocol.md; picture docs/design/onboarding-protocolo.html
// section 2, founder 2026-11-20): the five animated FEATURE screens at the start of the onboarding,
// in the approved order and copy. The example numbers come from the app's own math (lib/obFeatures),
// the labs screen never judges a value, Reduce Motion shows the last frame, theme tokens only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const {
  FEATURE_KINDS, SYRINGE_EXAMPLE, syringeUnits, halfLifeSteps, accumulation, BODY_EXAMPLE,
  LAB_EXAMPLE, LAB_MONTHS, isMonotone, PROTOCOL_EXAMPLE, REMINDER_EXAMPLE,
} = require('../lib/obFeatures');

function loadTranslations() {
  const src = read('i18n/translations.js');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const tr = loadTranslations();
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const SRC = 'components/OnboardingFeatures.js';
const src = () => read(SRC);
const block = (s, from, to) => { const a = s.indexOf(from); assert.ok(a >= 0, `missing ${from}`); const b = to ? s.indexOf(to, a + from.length) : s.length; return s.slice(a, b < 0 ? s.length : b); };

test('OB-2..6: the five feature kinds exist, in the approved order', () => {
  assert.deepEqual(FEATURE_KINDS, ['syringe', 'body', 'reminders', 'protocols', 'labs']);
  const s = src();
  assert.match(s, /export const FEATURE_KINDS = KINDS;/);
  assert.match(s, /export default function OnboardingFeature\(\{ kind, width \}\)/);
  for (const k of FEATURE_KINDS) assert.match(s, new RegExp(`${k}: \\{ titleKey: 'obf_[a-z]+_title', subKey: 'obf_[a-z]+_sub'`), k);
});

test('OB-2: the syringe example is 50 units from 10 mg in 2 mL and a 2,5 mg dose (lib/doseMath)', () => {
  assert.deepEqual([SYRINGE_EXAMPLE.amount, SYRINGE_EXAMPLE.water, SYRINGE_EXAMPLE.dose], ['10', '2', '2.5']);
  assert.equal(syringeUnits(), 50);
  const s = block(src(), 'function SyringeFeature(', 'function BodyFeature(');
  assert.match(s, /syringeUnits\(\)/, 'the units come from the dose math, never typed');
  assert.match(s, /<SyringeScale /);
  for (const k of ['obf_syr_l_compound', 'obf_syr_l_diluent', 'obf_syr_l_vial', 'obf_syr_l_dose', 'obf_ex_compound1', 'obf_ex_diluent', 'obf_syr_units']) assert.match(s, new RegExp(`t\\('${k}'\\)`), k);
  assert.match(s, /t\('paywall_hero_example'\)/, 'labelled Example');
});

test('OB-3: one dose halves every half-life (100 → 50 → 25 → 12,5 mg) and repeated doses add up', () => {
  assert.equal(BODY_EXAMPLE.halfLifeDays, 7);
  assert.deepEqual(halfLifeSteps().map((x) => [x.day, x.mg]), [[0, 100], [7, 50], [14, 25], [21, 12.5]]);
  const a = accumulation();
  assert.deepEqual(a.doseDays, [0, 7, 14, 21]);
  assert.deepEqual(a.peaks.map((p) => Math.round(p * 1000) / 1000), [100, 150, 175, 187.5]);
  assert.ok(a.points.every((p, i) => i === 0 || p.day >= a.points[i - 1].day), 'time never goes back');
  const s = block(src(), 'function BodyFeature(', 'function RemindersFeature(');
  assert.match(s, /halfLifeSteps\(\)/);
  assert.match(s, /accumulation\(\)/);
  assert.match(s, /doseDays\.map\(/, 'each dose is marked on the chart');
  for (const k of ['obf_body_intro', 'obf_body_day', 'obf_body_step0', 'obf_body_step1', 'obf_body_step2', 'obf_body_step3', 'obf_body_adds', 'obf_body_legend', 'obf_body_foot']) assert.match(s, new RegExp(`t\\('${k}'\\)`), k);
});

test('OB-4: two reminders arrive, Taken is tapped, the dose is logged at 08:02, times in the person\'s format', () => {
  assert.deepEqual(REMINDER_EXAMPLE, { first: '08:00', logged: '08:02', second: '21:00' });
  const s = block(src(), 'function RemindersFeature(', 'function ProtocolsFeature(');
  for (const k of ['obf_rem_now', 'obf_rem_msg_time', 'obf_rem_msg', 'obf_rem_taken', 'obf_rem_snooze', 'obf_rem_done']) assert.match(s, new RegExp(`t\\('${k}'\\)`), k);
  assert.match(s, /formatTime\(/);
  assert.match(s, /<CheckMark /);
});

test('OB-4: the sub-text names the same button the notification shows, in 6 languages', () => {
  for (const l of LANGS) assert.ok(tr[l].obf_rem_sub.includes(tr[l].obf_rem_taken), `${l}: ${tr[l].obf_rem_sub}`);
});

test('OB-5: three example protocols come in one by one, times in the person\'s format', () => {
  assert.deepEqual(PROTOCOL_EXAMPLE.map((p) => p.nameKey), ['obf_ex_compound1', 'obf_ex_compound2', 'obf_ex_supplement']);
  assert.deepEqual(PROTOCOL_EXAMPLE.map((p) => p.time), ['08:00', '08:00', '21:00']);
  const s = block(src(), 'function ProtocolsFeature(', 'function LabsFeature(');
  assert.match(s, /PROTOCOL_EXAMPLE\.map\(/);
  assert.match(s, /formatTime\(p\.time, language, timeFormat\)/);
  assert.match(s, /at=\{[^}]*i \*/, 'each card enters after the one before');
  assert.match(s, /t\('paywall_hero_example'\)/);
});

test('OB-6: labs show only Glucose, LDL and Vitamin D, values that go up and down, every point with value and month', () => {
  assert.deepEqual(LAB_EXAMPLE.map((m) => m.key), ['glucose', 'ldl', 'vitd']);
  assert.deepEqual(LAB_EXAMPLE.map((m) => m.unit), ['mg/dL', 'mg/dL', 'ng/mL']);
  for (const m of LAB_EXAMPLE) {
    assert.equal(m.values.length, LAB_MONTHS.length, m.key);
    assert.equal(isMonotone(m.values), false, `${m.key} must not read as a trend`);
  }
  assert.equal(isMonotone([1, 2, 3]), true);
  const s = block(src(), 'function LabsFeature(', 'function LabChart(');
  const chart = block(src(), 'function LabChart(', '// ---- end labs');
  assert.match(s, /LAB_EXAMPLE\.map\(/);
  assert.match(chart, /MONTHS_SHORT\[/, 'the month under each point');
  assert.match(chart, /String\(v\)/, 'the value over each point');
  // one neutral colour for every series; no range/zone/target/reference, no good/bad tone
  const tones = new Set((chart.match(/c\.(data|ok|risk|attention|emph|depot|dataBand)\b/g) || []));
  assert.deepEqual([...tones], ['c.data']);
  assert.doesNotMatch(s + chart, /range|zone|target|reference|band|normal|optimal/i);
  for (const l of LANGS) assert.doesNotMatch(JSON.stringify([tr[l].obf_lab_glucose, tr[l].obf_lab_ldl, tr[l].obf_lab_vitd]), /testo|estr|horm|shbg|lh\b|fsh/i, l);
  assert.match(s, /t\('obf_lab_foot'\)/);
});

test('OB-7: Reduce Motion shows the final frame (one previewFx clock per screen, nothing else animates)', () => {
  const fx = read('components/previewFx.js');
  assert.match(fx, /const t = useSharedValue\(reduce \? dur : 0\);/);
  const s = src();
  for (const name of ['SyringeFeature', 'BodyFeature', 'RemindersFeature', 'ProtocolsFeature', 'LabsFeature']) {
    const b = block(s, `function ${name}(`, '\nfunction ');
    assert.match(b, /useFxClock\(/, `${name} runs on the shared clock`);
  }
  assert.doesNotMatch(s, /withTiming|withRepeat|withSpring|withDelay|setInterval|setTimeout|Animated\.timing/, 'no second animation source that would ignore Reduce Motion');
  // the syringe's units follow the clock (the last frame is the full 50)
  assert.match(block(s, 'function SyringeFeature(', 'function BodyFeature('), /useAnimatedReaction\(/);
});

test('OB-7: the flow keeps Skip and Continue; the feature component has no buttons of its own', () => {
  assert.doesNotMatch(src(), /TouchableOpacity|Pressable|onPress/);
});

test('every obf_ copy key exists, non-empty, in the 6 languages; the component uses only existing keys', () => {
  const used = [...src().matchAll(/t\('([a-z0-9_]+)'\)/g)].map((m) => m[1]);
  const literals = [...src().matchAll(/'(obf_[a-z0-9_]+)'/g)].map((m) => m[1]);
  const dataKeys = [...read('lib/obFeatures.js').matchAll(/'(obf_[a-z0-9_]+)'/g)].map((m) => m[1]);
  const keys = new Set([...used, ...literals, ...dataKeys]);
  assert.ok(keys.size > 40, `${keys.size} keys`);
  for (const k of keys) for (const l of LANGS) assert.ok(typeof tr[l][k] === 'string' && tr[l][k].length > 0, `${l}.${k}`);
  const enObf = Object.keys(tr.en).filter((k) => k.startsWith('obf_'));
  for (const k of enObf) assert.ok(keys.has(k), `unused key ${k}`);
});

test('the Portuguese copy is the approved picture, word for word', () => {
  const pt = tr.pt;
  assert.equal(pt.obf_syr_title, 'Quanto puxar na seringa, sem fazer conta');
  assert.equal(pt.obf_syr_sub, 'Você informa o frasco e a dose; o DoseTrace faz a conta.');
  assert.equal(pt.obf_body_title, 'Quanto ainda resta no seu corpo?');
  assert.equal(pt.obf_body_sub, 'Todo composto tem uma meia-vida: o tempo que o corpo leva para eliminar a metade do que você tomou.');
  assert.equal(pt.obf_body_intro.replace('{name}', 'Composto 1').replace('{days}', '7'), 'Uma aplicação de Composto 1 (meia-vida de 7 dias):');
  assert.equal(pt.obf_body_step1.replace('{amount}', '50 mg'), 'Resta a metade: 50 mg');
  assert.equal(pt.obf_body_adds, 'Se você aplica de novo antes de acabar, uma dose se soma à outra. O DoseTrace faz essa conta com as doses que você registra e mostra tudo num gráfico.');
  assert.equal(pt.obf_body_foot, 'Exemplo simplificado. É uma estimativa calculada, não um exame.');
  assert.equal(pt.obf_rem_title, 'Um aviso na hora de cada dose');
  assert.equal(pt.obf_rem_sub, 'Toque em Tomei direto na notificação.');
  assert.equal(pt.obf_rem_done.replace('{time}', '08:02'), 'Dose registrada às 08:02');
  assert.equal(pt.obf_pro_title, 'Tudo o que você toma, num lugar só');
  assert.equal(pt.obf_pro_sub, 'Cada protocolo com a sua dose e o seu horário. No Premium, sem limites.');
  assert.equal(pt.obf_pro_weekly.replace('{dose}', '2,5 mg').replace('{time}', '08:00'), '2,5 mg · toda segunda, 08:00');
  assert.equal(pt.obf_lab_title, 'Seus exames de sangue, ao longo do tempo');
  assert.equal(pt.obf_lab_sub, 'Envie o seu exame, em PDF ou foto: os valores entram sozinhos e viram gráficos.');
  assert.equal(pt.obf_lab_foot, 'Exemplo, valores fictícios. O DoseTrace registra seus exames; não interpreta resultados.');
});

test('the feature screens use theme tokens only: no raw colour, no emoji', () => {
  const s = src().replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(s, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/);
  assert.doesNotMatch(s, /\p{Extended_Pictographic}/u);
  for (const l of LANGS) for (const [k, v] of Object.entries(tr[l])) if (k.startsWith('obf_')) assert.doesNotMatch(v, /\p{Extended_Pictographic}/u, `${l}.${k}`);
  // the protocol dots are the user protocol palette (deliberately fixed, DESIGN.md §2.4)
  assert.match(src(), /paletteHex\(p\.dot\)/);
});

test('example decimals follow the app language (2,5 mg / 12,5 mg in Portuguese)', () => {
  const s = src();
  assert.match(block(s, 'function BodyFeature(', 'function RemindersFeature('), /demoDec\(/);
  assert.match(block(s, 'function ProtocolsFeature(', 'function LabsFeature('), /demoDec\(/);
  assert.match(block(s, 'function SyringeFeature(', 'function BodyFeature('), /demoDec\(/);
});
