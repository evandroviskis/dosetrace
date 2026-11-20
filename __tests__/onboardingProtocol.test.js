'use strict';
// The onboarding that shows the app and builds the first protocol (docs/specs/onboarding-protocol.md
// OB-1..OB-26): the steps, the draft protocol kept on the phone until the account exists, the one
// save path, the existing-account question (OP-2) and the 15-day builder (OB-26). Pure rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../lib/onboardingSteps');
const D = require('../lib/onboardingDraft');
const S = require('../lib/protocolSave');
const G = require('../lib/goalCategories');

const t = (k) => k;
const NOW = new Date(2026, 10, 20, 10, 0, 0); // Fri 20 Nov 2026, 10:00 local
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// ── OB-1 / OB-12 / OP-1: the order ──
test('OB-1: the pre-account order, Terms before the first health-data question, About + Routine merged (OP-1), the old single features screen gone', () => {
  assert.deepEqual(O.STEPS, [
    'splash', 'feat_syringe', 'feat_body', 'feat_reminders', 'feat_protocols', 'feat_labs',
    'help', 'goal', 'consent', 'tracking',
    'compound', 'form', 'vial', 'frequency', 'start', 'ready',
    'about', 'reminders',
  ]);
  assert.ok(!O.STEPS.includes('features'), 'the old "Feito para o seu protocolo" screen is removed');
  assert.ok(!O.STEPS.includes('routine'), 'OP-1: Routine is part of About you');
  assert.ok(O.STEPS.indexOf('consent') < O.STEPS.indexOf('tracking'), 'OB-12');
  assert.deepEqual(O.FEATURE_STEPS.map(O.featureKind), ['syringe', 'body', 'reminders', 'protocols', 'labs']);
});

test('OB-15 / OB-20: "How it comes" only when the compound exists in both forms; "Montar depois" drops the protocol steps', () => {
  const both = D.pickCompound({}, D.compoundChoices({ tracking: ['glp1'], query: 'tirz', t })[0]);
  const one = D.pickCompound({}, D.compoundChoices({ tracking: ['glp1'], query: 'retatru', t })[0]);
  assert.ok(O.activeSteps({ signedIn: false, protocol: both }).includes('form'));
  assert.ok(!O.activeSteps({ signedIn: false, protocol: one }).includes('form'), 'one form: taken from the catalog');
  assert.equal(one.form, 'recon');
  const skipped = O.activeSteps({ signedIn: false, protocol: one, skipped: true });
  for (const s of O.PROTOCOL_STEPS) assert.ok(!skipped.includes(s), `${s} dropped after Montar depois`);
  assert.deepEqual(skipped.slice(-2), ['about', 'reminders'], 'the onboarding goes on');
  assert.equal(O.skipTarget('compound'), 'about');
  assert.equal(O.skipTarget('feat_body'), 'help', 'OB-7: Pular on a feature screen goes to How DoseTrace can help');
});

test('OB-26: the builder for an existing account is the same protocol screens, then nothing else', () => {
  const p = D.pickCompound({}, D.compoundChoices({ tracking: ['glp1'], query: 'tirz', t })[0]);
  assert.deepEqual(O.activeSteps({ mode: 'builder', protocol: p }), ['compound', 'form', 'vial', 'frequency', 'start', 'ready']);
  assert.deepEqual(O.activeSteps({ mode: 'builder', protocol: {} }), ['compound', 'vial', 'frequency', 'start', 'ready']);
});

test('OP-1: the signed-in gate shows About you (with the routine) when any of its fields is missing', () => {
  assert.deepEqual(O.activeSteps({ signedIn: true, missing: ['activity'], consentAccepted: true }), ['about', 'finish']);
  assert.deepEqual(O.activeSteps({ signedIn: true, missing: ['country', 'provider'], consentAccepted: true }), ['about', 'finish']);
  assert.deepEqual(O.activeSteps({ signedIn: true, missing: ['goal', 'tracking', 'name'], consentAccepted: false }), ['goal', 'consent', 'tracking', 'about', 'finish']);
  const full = { goals: ['fitness'], tracking: ['oral'], name: 'Sam', gender: 'female', country: 'Italy', birthMonth: 0, birthYear: 1990, activity: 'light', provider: 'yes' };
  assert.equal(O.canContinue('about', full), true);
  assert.equal(O.canContinue('about', { ...full, activity: '' }), false, 'the routine is required on the merged screen');
  assert.equal(O.canContinue('about', { ...full, provider: '' }), false);
  // Only the shown step's fields are written: the merged About writes both groups.
  const out = O.accountPatch(full, {}, 'NOW', ['about', 'finish']);
  for (const k of ['display_name', 'gender', 'country', 'birth_year', 'birth_month', 'activity_level', 'has_provider']) assert.ok(k in out, k);
});

test('navigation is by step name, so a list that changes under the screen never skips or repeats a step', () => {
  const steps = O.activeSteps({ signedIn: false, protocol: {} });
  assert.equal(O.nextStep(steps, 'compound'), 'vial');
  assert.equal(O.prevStep(steps, 'vial'), 'compound');
  assert.equal(O.nextStep(steps, 'reminders'), null);
  assert.equal(O.prevStep(steps, 'splash'), null);
});

// ── OB-8 / OB-9 ──
test('OB-8: How DoseTrace can help — five options, multi-select, needed to continue', () => {
  assert.deepEqual(O.HELP_OPTIONS.map((h) => h.key), ['syringe', 'reminders', 'body', 'organize', 'labs']);
  assert.equal(O.canContinue('help', { help: [] }), false);
  assert.equal(O.canContinue('help', { help: ['labs', 'body'] }), true);
  assert.deepEqual(O.toggleHelp(['labs'], 'body'), ['labs', 'body']);
  assert.deepEqual(O.toggleHelp(['labs', 'body'], 'labs'), ['body']);
});

test('OB-9: the app opens on her FIRST choice; without a protocol the protocol choices open Protocols', () => {
  assert.deepEqual(O.landingFor(['labs', 'syringe'], { hasProtocol: true }), { kind: 'labs' });
  assert.deepEqual(O.landingFor(['syringe'], { hasProtocol: true }), { kind: 'protocol' });
  assert.deepEqual(O.landingFor(['reminders'], { hasProtocol: true }), { kind: 'today' });
  assert.deepEqual(O.landingFor(['body'], { hasProtocol: true }), { kind: 'curve' });
  assert.deepEqual(O.landingFor(['organize'], { hasProtocol: true }), { kind: 'protocols' });
  assert.deepEqual(O.landingFor(['syringe'], { hasProtocol: false }), { kind: 'protocols' });
  assert.deepEqual(O.landingFor(['body'], { hasProtocol: false }), { kind: 'protocols' });
  assert.equal(O.landingFor([], { hasProtocol: true }), null);
});

// ── OB-10 / OB-11: goals by category ──
test('OB-10: 4 categories and their goals by popularity (founder 2026-11-20: Qualidade do sono was hidden by the alphabetical 12), all 18 shown at once', () => {
  const tr = (k) => ({
    goal_cat_body: 'Corpo', goal_cat_hormones: 'Hormônios e energia', goal_cat_recovery: 'Recuperação', goal_cat_health: 'Saúde e longevidade',
    profile_goal_body: 'Composição corporal', profile_goal_fitness: 'Fitness', profile_goal_strength: 'Força e potência', profile_goal_fat_loss: 'Perda de gordura', profile_goal_endurance: 'Resistência',
    profile_goal_energy: 'Energia e vitalidade', profile_goal_hormonal: 'Equilíbrio hormonal', profile_goal_stress: 'Gestão do estresse', profile_goal_mood: 'Humor e saúde mental', profile_goal_sleep: 'Qualidade do sono', profile_goal_sexual: 'Saúde sexual',
    profile_goal_skin: 'Pele e colágeno', profile_goal_recovery: 'Recuperação e cicatrização', profile_goal_joint: 'Saúde articular e óssea',
    profile_goal_wellness: 'Bem-estar', profile_goal_immune: 'Função imunológica', profile_goal_longevity: 'Longevidade', profile_goal_cardio: 'Saúde cardiovascular',
  })[k] || k;
  const v = G.goalSections(tr, { selected: [] });
  // the order of the base on 2026-11-20 (accounts' primary_goal counts), most chosen first
  assert.deepEqual(v.sections.map((s) => s.label), ['Corpo', 'Hormônios e energia', 'Saúde e longevidade', 'Recuperação']);
  assert.deepEqual(v.sections[0].items.map((i) => i.label), ['Composição corporal', 'Perda de gordura', 'Força e potência', 'Resistência', 'Fitness']);
  assert.deepEqual(v.sections[1].items.map((i) => i.label).slice(0, 3), ['Energia e vitalidade', 'Qualidade do sono', 'Saúde sexual']);
  assert.equal(v.sections.reduce((n, s) => n + s.items.length, 0), 18);
  assert.equal(v.total, 18);
  assert.equal(v.hidden, 0);
  // The same stored keys as before (PROFILE_GOALS), each in exactly one category.
  const keys = G.GOAL_CATEGORIES.flatMap((c) => c.goals).sort();
  assert.deepEqual(keys, ['body_composition', 'cardiovascular', 'endurance', 'energy', 'fat_loss', 'fitness', 'hormonal_balance', 'immune', 'joint_bone', 'longevity', 'mood', 'recovery', 'sexual_health', 'skin_collagen', 'sleep', 'strength', 'stress', 'wellness']);
});

test('OB-14: the catalog filtered by the category she picked (aliases too), one row per compound, alphabetical', () => {
  const tr = (k) => ({ lyo_tirzepatide: 'Tirzepatida', rtu_tirzepatide: 'Tirzepatida', lyo_semaglutide: 'Semaglutida', rtu_semaglutide: 'Semaglutida' })[k] || k;
  const glp = D.compoundChoices({ tracking: ['glp1'], query: '', t: tr });
  const labels = glp.map((e) => e.label);
  assert.ok(labels.includes('Tirzepatida') && labels.includes('Semaglutida'));
  assert.equal(labels.filter((l) => l === 'Tirzepatida').length, 1, 'both forms are one row');
  assert.ok(!glp.some((e) => e.forms.recon === 'lyo_bpc_157'), 'no peptide in the GLP-1 list');
  assert.deepEqual(labels, labels.slice().sort((a, b) => a.localeCompare(b)));
  assert.deepEqual(D.compoundChoices({ tracking: ['glp1'], query: 'mounjaro', t: tr }).map((e) => e.label), ['Tirzepatida'], 'aliases');
  assert.ok(D.compoundChoices({ tracking: ['oral'], query: '', t }).every((e) => e.forms.oral));
  assert.ok(D.compoundChoices({ tracking: ['peptides'], query: 'bpc', t }).some((e) => e.forms.recon === 'lyo_bpc_157'));
  assert.ok(D.compoundChoices({ tracking: ['hormones'], query: 'test c', t }).some((e) => e.forms.rtu === 'rtu_testosterone_cypionate'));
  assert.equal(D.listTitleKey(['glp1']), 'ob_cmp_title_glp1');
  assert.equal(D.listTitleKey(['glp1', 'oral']), 'ob_cmp_title_any');
});

test('OB-14: a typed name is kept exactly as written; the app never suggests one', () => {
  const p = D.typedCompound({}, '  Meu composto X ', ['peptides']);
  assert.equal(p.name, 'Meu composto X');
  assert.equal(p.base, null);
  assert.equal(D.compoundIdFor({ ...p, form: 'recon' }), null);
  assert.equal(O.canContinue('compound', { protocol: p }), true);
  assert.equal(O.canContinue('compound', { protocol: D.typedCompound({}, '   ', ['peptides']) }), false);
  assert.equal(D.typedCompound({}, 'Ômega', ['oral']).form, 'oral', 'only oral picked: it is oral');
  assert.equal(D.needsForm(D.typedCompound({}, 'X', ['glp1'])), true, 'an injectable typed name asks how it comes');
});

test('OB-15: the form comes from the catalog when there is only one; the chosen form sets the compound id', () => {
  const tir = D.pickCompound({}, D.compoundChoices({ tracking: ['glp1'], query: 'tirz', t })[0]);
  assert.equal(tir.form, null);
  assert.equal(D.needsForm(tir), true);
  assert.equal(D.compoundIdFor({ ...tir, form: 'recon' }), 'lyo_tirzepatide');
  assert.equal(D.compoundIdFor({ ...tir, form: 'rtu' }), 'rtu_tirzepatide');
  assert.equal(O.canContinue('form', { protocol: tir }), false);
  assert.equal(O.canContinue('form', { protocol: { ...tir, form: 'rtu' } }), true);
});

// ── OB-16: vial and dose ──
test('OB-16: vial and dose read with parseDecimal in the app language; "Ainda não sei" passes without numbers', () => {
  const p = { name: 'Tirzepatida', form: 'recon', amount: '10', unit: 'mg', water: '2', dose: '2,5', doseUnit: 'mg' };
  assert.equal(O.canContinue('vial', { protocol: p, language: 'pt' }), true);
  assert.equal(O.canContinue('vial', { protocol: { ...p, water: '' }, language: 'pt' }), false);
  assert.equal(O.canContinue('vial', { protocol: { ...p, dose: 'abc' }, language: 'pt' }), false);
  assert.equal(O.canContinue('vial', { protocol: { form: 'recon', vialUnknown: true }, language: 'pt' }), true);
  assert.deepEqual(D.vialFields('recon'), ['amount', 'water', 'dose']);
  assert.deepEqual(D.vialFields('rtu'), ['amount', 'ml', 'dose']);
  assert.deepEqual(D.vialFields('oral'), ['dose']);
  // The small vial's label follows what is typed; the liquid rises with the diluent.
  assert.deepEqual(D.vialPicture({ ...p, amount: '20' }, 'pt'), { label: '20 mg', filled: true });
  assert.deepEqual(D.vialPicture({ ...p, water: '' }, 'pt'), { label: '10 mg', filled: false });
  assert.deepEqual(D.vialPicture({ form: 'recon', unit: 'mg' }, 'pt'), { label: '', filled: false });
});

// ── OB-17 / OB-18 ──
test('OB-17: frequency tiles map to the app schedule; a weekly dose needs its day; the time is hers (never a default)', () => {
  assert.deepEqual(D.FREQUENCIES.map((f) => f.key), ['daily', 'alt', 'weekly', 'custom']);
  const base = { name: 'X', form: 'recon' };
  assert.equal(O.canContinue('frequency', { protocol: { ...base, freq: 'daily' } }), false, 'no time yet');
  assert.equal(O.canContinue('frequency', { protocol: { ...base, freq: 'daily', time: '08:00' } }), true);
  assert.equal(O.canContinue('frequency', { protocol: { ...base, freq: 'weekly', time: '08:00' } }), false, 'the day');
  assert.equal(O.canContinue('frequency', { protocol: { ...base, freq: 'weekly', weekday: 1, time: '08:00' } }), true);
  assert.equal(O.canContinue('frequency', { protocol: { ...base, freq: 'custom', time: '08:00' } }), false);
  assert.equal(O.canContinue('frequency', { protocol: { ...base, freq: 'custom', interval: 5, time: '08:00' } }), true);
  assert.equal(D.intervalOf({ freq: 'daily' }), 1);
  assert.equal(D.intervalOf({ freq: 'alt' }), 2);
  assert.equal(D.intervalOf({ freq: 'weekly' }), 7);
  assert.equal(D.intervalOf({ freq: 'custom', interval: 10 }), 10);
});

test('OB-18: when she starts — today / already started / another day; the start date follows the weekly day', () => {
  const daily = { freq: 'daily', time: '08:00' };
  assert.equal(D.startDateFor({ ...daily, startMode: 'today' }, NOW), iso(2026, 11, 20));
  assert.equal(D.startDateFor({ ...daily, startMode: 'later', laterOn: iso(2026, 11, 25) }, NOW), iso(2026, 11, 25));
  assert.equal(D.startDateFor({ ...daily, startMode: 'started', startedOn: iso(2026, 10, 25) }, NOW), iso(2026, 10, 25));
  const mon = { freq: 'weekly', weekday: 1, time: '08:00' }; // Monday
  assert.equal(D.startDateFor({ ...mon, startMode: 'today' }, NOW), iso(2026, 11, 23), 'the next Monday');
  assert.equal(D.startDateFor({ ...mon, startMode: 'started', startedOn: iso(2026, 10, 26) }, NOW), iso(2026, 10, 26), 'a Monday stays');
  assert.equal(D.startDateFor({ ...mon, startMode: 'started', startedOn: iso(2026, 10, 25) }, NOW), iso(2026, 10, 26), 'snapped to her Monday');
  assert.equal(O.canContinue('start', { protocol: { ...daily, startMode: 'later', laterOn: iso(2026, 11, 20) }, now: NOW }), false, 'another day is after today');
  assert.equal(O.canContinue('start', { protocol: { ...daily, startMode: 'started', startedOn: iso(2026, 11, 25) }, now: NOW }), false, 'started is before today');
  assert.equal(O.canContinue('start', { protocol: { ...daily, startMode: 'today' }, now: NOW }), true);
});

test('OB-18: already started asks the app\'s past-doses question with its count, and needs an answer', () => {
  const p = { freq: 'weekly', weekday: 1, time: '08:00', startMode: 'started', startedOn: iso(2026, 10, 26), form: 'recon' };
  assert.equal(D.pastCount(p, NOW), 4, 'Mondays 26/10, 2/11, 9/11, 16/11');
  assert.equal(O.canContinue('start', { protocol: p, now: NOW }), false);
  for (const a of ['yes', 'almost', 'no']) assert.equal(O.canContinue('start', { protocol: { ...p, pastAnswer: a }, now: NOW }), true, a);
  assert.deepEqual(D.pastAnswers(4), ['yes', 'almost', 'no']);
  assert.deepEqual(D.pastAnswers(1), ['yes', 'no'], 'one dose: no "Quase todas" (the form\'s rule)');
});

// ── OB-19 / OB-24 ──
test('OB-19: the ready summary has no syringe units; OB-24: the reminder line names her day, time and compound', () => {
  const tr = (k) => ({ ob_freq_weekly_on: 'toda {day}, {time}', weekday_1: 'segunda', ob_rem_weekly: 'Toda {day} às {time}, para a {compound}.', ob_sum_vial: '{amount} + {water} de diluente', ob_sum_since_n: '{date}, {n} doses' })[k] || k;
  const p = { name: 'Tirzepatida', form: 'recon', amount: '10', unit: 'mg', water: '2', dose: '2,5', doseUnit: 'mg', freq: 'weekly', weekday: 1, time: '08:00', startMode: 'started', startedOn: iso(2026, 10, 26), pastAnswer: 'yes' };
  const rows = D.summaryRows(p, { t: tr, language: 'pt', timeFormat: 'auto', now: NOW, weekdayName: () => 'segunda', dateText: () => '26/10/2026' });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  assert.equal(byKey.compound, 'Tirzepatida');
  assert.equal(byKey.vial, '10 mg + 2 mL de diluente');
  assert.equal(byKey.dose, '2,5 mg');
  const hm = require('../lib/timeFormat').formatTime('08:00', 'pt', 'auto');
  assert.equal(byKey.frequency, `toda segunda, ${hm}`, 'the time in her format');
  assert.equal(byKey.since, '26/10/2026, 4 doses');
  assert.ok(!JSON.stringify(rows).match(/unidade|units|UI\b/), 'no syringe units before the account');
  assert.equal(D.reminderLine(p, { t: tr, timeFormat: 'auto', language: 'pt', weekdayName: () => 'segunda-feira' }), `Toda segunda-feira às ${hm}, para a Tirzepatida.`);
});

// ── OB-22: the draft to the save ──
test('OB-22: the draft becomes the form the manual form saves (vial, dose, schedule, start), numbers in the typed language', () => {
  const p = { name: 'Tirzepatida', base: 'tirzepatide', forms: { recon: 'lyo_tirzepatide', rtu: 'rtu_tirzepatide' }, form: 'recon', amount: '10', unit: 'mg', water: '2', dose: '2,5', doseUnit: 'mg', freq: 'weekly', weekday: 1, time: '08:00', startMode: 'today' };
  const r = D.draftToForm(p, { now: NOW });
  assert.equal(r.form.name, 'Tirzepatida');
  assert.equal(r.form.compoundId, 'lyo_tirzepatide');
  assert.equal(r.form.type, 'recon');
  assert.equal(r.form.amount, '10');
  assert.equal(r.form.water, '2');
  assert.equal(r.form.dose, '2,5');
  assert.equal(r.form.intervalDays, 7);
  assert.deepEqual(r.form.reminderTimes, ['08:00']);
  assert.equal(r.startDate, iso(2026, 11, 23));
  assert.equal(r.form.startDate, r.startDate);
  assert.equal(r.skipVial, false);
  assert.equal(r.mixedOn, null, 'a vial she has not mixed yet has no mix date (never a future one)');
  assert.equal(D.draftToForm({ ...p, startMode: 'today', freq: 'daily' }, { now: NOW }).mixedOn, iso(2026, 11, 20));
  const unknown = D.draftToForm({ ...p, vialUnknown: true }, { now: NOW });
  assert.equal(unknown.skipVial, true, '"Ainda não sei esses números": the protocol without the vial');
  assert.equal(unknown.form.amount, '');
  assert.equal(unknown.form.water, '');
  assert.equal(unknown.form.dose, '');
  const rtu = D.draftToForm({ ...p, form: 'rtu', amount: '10', ml: '4', water: undefined }, { now: NOW, language: 'pt' });
  assert.equal(rtu.form.compoundId, 'rtu_tirzepatide');
  assert.equal(rtu.form.concentration, '2,5', '10 mg in 4 mL = 2,5 mg/mL, written in her language');
  assert.equal(rtu.form.vialMl, '4');
  const oral = D.draftToForm({ name: 'Creatina', base: 'creatine', forms: { oral: 'oral_creatine' }, form: 'oral', dose: '5', doseUnit: 'mg', freq: 'daily', time: '09:00', startMode: 'today' }, { now: NOW });
  assert.equal(oral.form.type, 'oral');
  assert.equal(oral.form.servingStrength, '5');
  assert.equal(oral.form.servingUnits, '1');
});

test('OB-22: the shared save writes the same rows as the manual form, then the past-doses answer', () => {
  const rows = { protocols: [], vials: [], updates: [], vialUpdates: [] };
  const { protocolPayload, rtuVialFields } = require('../lib/protocolForm');
  const { parseDecimal, dosesPerVial } = require('../lib/doseMath');
  const { pastStartAsk, pastStartWrites } = require('../lib/pastDoses');
  const p = { name: 'Tirzepatida', base: 'tirzepatide', forms: { recon: 'lyo_tirzepatide' }, form: 'recon', amount: '10', unit: 'mg', water: '2', dose: '2,5', doseUnit: 'mg', freq: 'weekly', weekday: 1, time: '08:00', startMode: 'started', startedOn: iso(2026, 10, 26), pastAnswer: 'yes' };
  const r = D.draftToForm(p, { now: NOW, language: 'pt' });
  const out = S.insertNewProtocol({ form: r.form, userId: 'u1', language: 'pt', frequencyLabel: () => 'weekly', startDate: r.startDate, skipVial: r.skipVial, mixedOn: r.mixedOn }, {
    insertProtocol: (row) => { rows.protocols.push(row); return 7; },
    insertVial: (row) => { rows.vials.push(row); return 9; },
    protocolPayload, parseDecimal, dosesPerVial, rtuVialFields,
  });
  assert.deepEqual(out, { newId: 7, newVialId: 9 });
  assert.equal(rows.protocols[0].user_id, 'u1');
  assert.equal(rows.protocols[0].dose, 2.5, '"2,5" read in Portuguese');
  assert.equal(rows.protocols[0].amount, 10);
  assert.equal(rows.protocols[0].compound_id, 'lyo_tirzepatide');
  assert.equal(rows.protocols[0].start_date, iso(2026, 10, 26));
  assert.equal(rows.protocols[0].reminder_time, '08:00');
  assert.equal(rows.vials[0].total_doses, 4, '10 mg ÷ 2,5 mg');
  assert.equal(rows.vials[0].water_ml, 2);
  const saved = { id: 7, ...rows.protocols[0], type: 'recon' };
  const vial = { id: 9, ...rows.vials[0] };
  const w = S.applyPastAnswer({ newId: 7, newVialId: 9, answer: 'yes', nowMs: NOW.getTime(), today: iso(2026, 11, 20) }, {
    getProtocolById: () => saved, getVialById: () => vial,
    updateProtocol: (id, patch) => rows.updates.push(patch), updateVial: (id, patch) => rows.vialUpdates.push(patch),
    pastStartAsk, pastStartWrites, historyQuestion: () => true,
  });
  assert.ok(w);
  assert.deepEqual(rows.vialUpdates, [{ doses_taken: 4, active: 0 }], 'the 4 doses since the start used the 4-dose vial (the form\'s rule)');
  const rowsNo = [];
  S.applyPastAnswer({ newId: 7, newVialId: null, answer: 'no', nowMs: NOW.getTime(), today: iso(2026, 11, 20) }, {
    getProtocolById: () => saved, getVialById: () => null, updateProtocol: (id, patch) => rowsNo.push(patch), updateVial() {},
    pastStartAsk, pastStartWrites, historyQuestion: () => true,
  });
  assert.deepEqual(rowsNo, [{ history_from: iso(2026, 11, 20) }], 'Não: the curve starts today; nothing in the Dose log');
});

// ── OB-22: durable draft store ──
function memStorage() {
  const m = new Map();
  return { m, getItem: async (k) => (m.has(k) ? m.get(k) : null), setItem: async (k, v) => { m.set(k, String(v)); }, removeItem: async (k) => { m.delete(k); } };
}

test('OB-22: the draft is kept in its own key (survives an app kill), never in the onboarding answers the sign-out wipe clears', async () => {
  const st = memStorage();
  const store = D.createDraftStore(st);
  await store.save({ help: ['labs'] }, NOW.toISOString());
  await store.save({ protocol: { name: 'X' } }, NOW.toISOString());
  // A new store over the same storage = the app opened again after a kill.
  const again = await D.createDraftStore(st).load(NOW.getTime());
  assert.deepEqual(again.help, ['labs']);
  assert.equal(again.protocol.name, 'X');
  assert.ok(again.createdAt && again.expiresAt);
  assert.equal(D.DRAFT_KEY, 'dt_onboarding_draft');
  assert.notEqual(D.DRAFT_KEY, 'dt_onboarding_data', 'not the stash clearOnboarding removes');
  await store.markHandoff(NOW.toISOString());
  assert.ok((await store.load(NOW.getTime())).handoffAt);
  // Expired: gone.
  const later = NOW.getTime() + (D.DRAFT_TTL_DAYS + 1) * 86400000;
  assert.equal(await store.load(later), null);
  assert.equal(st.m.has(D.DRAFT_KEY), false, 'an expired draft is removed');
});

test('OB-22: the sign-out wipe never deletes the draft of someone who has not signed in yet', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '../lib/signedOut.js'), 'utf8');
  assert.doesNotMatch(src, /onboardingDraft|DRAFT_KEY|dt_onboarding_draft|clearDraft/, 'no wipe step names the draft');
  const app = fs.readFileSync(path.join(__dirname, '../App.js'), 'utf8');
  const wipe = app.slice(app.indexOf('const wipeDeps = () => ({'), app.indexOf('// DV-242 (AD-102 = B): the cross-account guard'));
  assert.doesNotMatch(wipe, /onboardingDraft|draftStore|clearOnboardingDraft/, 'the wipe deps do not clear the draft');
  const store = fs.readFileSync(path.join(__dirname, '../lib/onboardingStore.js'), 'utf8');
  const clear = store.slice(store.indexOf('export async function clearOnboarding'), store.indexOf('export async function clearOnboarding') + 300);
  assert.doesNotMatch(clear, /draft/i, 'clearOnboarding leaves the draft alone');
});

// ── OB-23 / OP-2 ──
test('OB-23 / OP-2: a new account gets the draft silently; an existing one is asked; never above the free limit; expired is dropped', () => {
  const draft = { createdAt: '2026-11-20T09:00:00.000Z', expiresAt: '2026-12-04T09:00:00.000Z', handoffAt: '2026-11-20T09:30:00.000Z', protocol: { name: 'Tirzepatida' } };
  const fresh = { id: 'u', created_at: '2026-11-20T09:31:00.000Z' };
  const old = { id: 'u', created_at: '2025-01-01T00:00:00.000Z' };
  const now = Date.parse('2026-11-20T09:35:00.000Z');
  assert.equal(D.applyDecision({ draft, user: fresh, nowMs: now, activeCount: 0, limit: 3, premium: false }), 'insert');
  assert.equal(D.applyDecision({ draft, user: old, nowMs: now, activeCount: 0, limit: 3, premium: false }), 'ask', 'existing account: keep or discard');
  assert.equal(D.applyDecision({ draft, user: old, nowMs: now, activeCount: 3, limit: 3, premium: false }), 'limit', 'never a fourth free protocol');
  assert.equal(D.applyDecision({ draft, user: old, nowMs: now, activeCount: 3, limit: 3, premium: true }), 'ask');
  assert.equal(D.applyDecision({ draft: { ...draft, handoffAt: null }, user: fresh, nowMs: now, activeCount: 0, limit: 3, premium: false }), 'ask', 'not handed off in this flow: never silent');
  assert.equal(D.applyDecision({ draft: { ...draft, protocol: null }, user: fresh, nowMs: now, activeCount: 0, limit: 3, premium: false }), 'none');
  assert.equal(D.applyDecision({ draft: { ...draft, skipped: true }, user: fresh, nowMs: now, activeCount: 0, limit: 3, premium: false }), 'none', 'Montar depois');
  assert.equal(D.applyDecision({ draft, user: fresh, nowMs: Date.parse('2026-12-05T00:00:00Z'), activeCount: 0, limit: 3, premium: false }), 'drop');
  assert.equal(D.applyDecision({ draft: { ...draft, applyingAt: '2026-11-20T09:32:00.000Z' }, user: fresh, nowMs: now, activeCount: 1, limit: 3, premium: false }), 'check', 'a save cut off half-way is checked, never written twice');
});

// ── OB-21 ──
test('OB-21: no AI and no network with the draft before the account', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const f of ['lib/onboardingDraft.js', 'lib/onboardingSteps.js', 'lib/onboardingDraftStore.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.doesNotMatch(src, /fetch\(|lib\/supabase|\.\/supabase|assistantClient|functions\.invoke|protocolAssistant/, `${f}: no network, no AI`);
  }
});

// ── OB-26 ──
test('OB-26: accounts 15+ days old that never created a protocol (ended, deleted and tombstones count) see the builder once', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  const user = (days, meta = {}) => ({ id: 'u', created_at: new Date(now - days * 86400000).toISOString(), user_metadata: meta });
  assert.equal(D.builderEligible({ user: user(15), nowMs: now, everCount: 0, synced: true }), true);
  assert.equal(D.builderEligible({ user: user(14), nowMs: now, everCount: 0, synced: true }), false, 'under 15 days');
  assert.equal(D.builderEligible({ user: user(30), nowMs: now, everCount: 1, synced: true }), false, 'any protocol ever (active, ended, deleted, tombstone)');
  assert.equal(D.builderEligible({ user: user(30, { protocol_builder_shown_at: '2026-11-19T00:00:00Z' }), nowMs: now, everCount: 0, synced: true }), false, 'shown once (the mark is on the account)');
  assert.equal(D.builderEligible({ user: user(30), nowMs: now, everCount: 0, synced: false }), false, 'only after this account\'s data is on the phone (a new phone is not "no protocol")');
  assert.deepEqual(D.builderShownPatch('2026-11-20T12:00:00Z'), { protocol_builder_shown_at: '2026-11-20T12:00:00Z' }, 'one key: Supabase merges user_metadata, nothing else is rewritten');
});

test('a step that leaves the list (Como vem after another compound) moves on to the next shown step, never back to the start', () => {
  const steps = O.activeSteps({ signedIn: false, protocol: { name: 'X', form: 'recon', forms: { recon: 'lyo_x' } } });
  assert.ok(!steps.includes('form'));
  assert.equal(O.stepNear(steps, 'form'), 'vial');
  assert.equal(O.stepNear(steps, 'compound'), 'compound');
  assert.equal(O.stepNear(['about', 'finish'], null), 'about');
  assert.equal(O.stepNear(['about', 'finish'], 'goal'), 'about', 'signed-in steps hydrating');
  assert.equal(O.stepNear(O.activeSteps({ signedIn: false, protocol: {}, skipped: true }), 'vial'), 'about', 'Montar depois: on to About you');
});
