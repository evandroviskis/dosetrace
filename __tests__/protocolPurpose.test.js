'use strict';
// "Para que você usa {produto}?" (docs/specs/purpose-question.md PQ-5..PQ-12, PQ-14): the order of
// the goal tiles, which tiles show, and the onboarding's profile goal → protocol goal table. Pure.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/protocolPurpose');
const { translations: T } = require('../i18n/translations.js');

const tFor = (lang) => (k) => T[lang][k] || k;
const order = (o) => P.purposeOrder({ language: 'pt', label: tFor('pt'), protocols: [], ...o });
const alpha = (keys, lang = 'pt') => [...keys].sort((a, b) => tFor(lang)(a).localeCompare(tFor(lang)(b), lang));

test('PQ-9: the type lists are the ones the form always had (oral 17, injectable 30), no key twice', () => {
  assert.equal(P.purposeKeysFor('oral').length, 17);
  assert.equal(P.purposeKeysFor('recon').length, 30);
  assert.deepEqual(P.purposeKeysFor('rtu'), P.purposeKeysFor('recon'));
  for (const type of ['oral', 'recon']) assert.equal(new Set(P.purposeKeysFor(type)).size, P.purposeKeysFor(type).length);
  for (const k of [...P.purposeKeysFor('oral'), ...P.purposeKeysFor('recon')]) for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.ok(T[l][k], `${l} ${k}`);
});

test('PQ-7: a product with no history and no table entry → every key, alphabetical in the app language', () => {
  const keys = P.purposeKeysFor('recon');
  for (const lang of ['pt', 'en', 'de']) {
    assert.deepEqual(P.purposeOrder({ type: 'recon', compoundId: 'lyo_bpc_157', name: 'BPC-157', protocols: [], label: tFor(lang), language: lang }), alpha(keys, lang));
  }
  // A typed name of her own with nothing before: the same.
  assert.deepEqual(order({ type: 'oral', compoundId: null, name: 'Meu chá' }), alpha(P.purposeKeysFor('oral')));
});

test('PQ-6: melatonin → sleep and circadian first; vitamin C → immune and antioxidant, never sleep', () => {
  const mel = order({ type: 'oral', compoundId: 'oral_melatonin', name: 'Melatonina' });
  assert.deepEqual(mel.slice(0, 2), ['wt_sleep_quality', 'wt_circadian']);
  assert.ok(mel.includes('wt_circadian'), 'the circadian key joins the capsule list for melatonin');
  assert.equal(mel.length, 18);
  // Council 2026-11-20 (regulatory): injectable melatonin, glutathione and NAD+ have no approved
  // injectable use, so they are not in the table: their tiles are in the normal order.
  const lyoMel = order({ type: 'recon', compoundId: 'lyo_melatonin', name: 'Melatonin' });
  assert.deepEqual(lyoMel, alpha(P.purposeKeysFor('recon')));
  for (const id of ['lyo_melatonin', 'lyo_glutathione', 'lyo_nad_plus']) assert.equal(P.TYPICAL_PURPOSE[id], undefined, id);
  const c = order({ type: 'oral', compoundId: 'oral_vit_c', name: 'Vitamina C' });
  assert.deepEqual(c.slice(0, 2), ['wt_immune', 'wt_antioxidant_def']);
  assert.ok(c.indexOf('wt_sleep_quality') > 1, 'vitamin C never pulls sleep up');
  assert.deepEqual(P.TYPICAL_PURPOSE.oral_vit_c.filter((k) => /sleep|circadian|rest/.test(k)), []);
  // After the table: the rest, alphabetical.
  assert.deepEqual(mel.slice(2), alpha(P.purposeKeysFor('oral').filter((k) => k !== 'wt_sleep_quality')));
});

test('PQ-6: the curated table holds wellness keys only (wt_*, each with a label in 6 languages) and no disease words', () => {
  const all = new Set([...P.purposeKeysFor('oral'), ...P.purposeKeysFor('recon')]);
  const disease = /diabet|cancer|câncer|depress|insulin|obes|hipert|hypert|disease|doença|treat|tratamento|cure|cura/i;
  for (const [id, keys] of Object.entries(P.TYPICAL_PURPOSE)) {
    assert.ok(/^(oral|lyo|rtu)_/.test(id), id);
    assert.ok(keys.length >= 1 && keys.length <= 3, `${id}: a short list`);
    for (const k of keys) {
      assert.ok(all.has(k), `${id}: ${k} is a wellness key`);
      for (const l of ['en', 'pt']) assert.doesNotMatch(T[l][k], disease, `${id} ${k} ${l}`);
    }
  }
  // Never for peptides without an approved use, never for anabolic steroids (council, picture 2026-11-20).
  for (const id of ['lyo_bpc_157', 'lyo_tb_500', 'lyo_retatrutide', 'lyo_ipamorelin', 'rtu_trenbolone_acetate', 'rtu_nandrolone_decanoate', 'rtu_insulin_glargine']) assert.equal(P.TYPICAL_PURPOSE[id], undefined, id);
});

test('PQ-5: her own past choices for the same product come first (ended protocols too, most chosen first)', () => {
  const protocols = [
    { id: 1, compound_id: 'oral_melatonin', name: 'Melatonina', goal: 'wt_mental,wt_stress_mgmt', active: 0, ended_at: '2026-10-01' },
    { id: 2, compound_id: 'oral_melatonin', name: 'Melatonina', goal: 'wt_stress_mgmt' },
    { id: 3, compound_id: 'oral_zinc', name: 'Zinco', goal: 'wt_immune,wt_kidney_wellness' }, // another product
  ];
  const mel = order({ type: 'oral', compoundId: 'oral_melatonin', name: 'Melatonina', protocols });
  assert.deepEqual(mel.slice(0, 4), ['wt_stress_mgmt', 'wt_mental', 'wt_sleep_quality', 'wt_circadian']);
  assert.ok(mel.indexOf('wt_kidney_wellness') > 3, 'another product’s goals are not pulled up');
  // The same typed name (no compound id), case and spaces aside.
  const typed = [{ id: 7, compound_id: null, name: 'Chá de Camomila ', goal: 'wt_sleep_quality,wt_digestive_wellness' }];
  assert.deepEqual(order({ type: 'oral', compoundId: null, name: 'chá de camomila', protocols: typed }).slice(0, 2), ['wt_sleep_quality', 'wt_digestive_wellness']);
  // The protocol being edited is not its own history.
  assert.deepEqual(order({ type: 'oral', compoundId: 'oral_melatonin', name: 'Melatonina', protocols: [protocols[1]], excludeId: 2 }).slice(0, 2), ['wt_sleep_quality', 'wt_circadian']);
  // A past goal from another type's list joins the tiles (she chose it for this product) — once.
  const cross = order({ type: 'oral', compoundId: 'oral_creatine', name: 'Creatina', protocols: [{ id: 9, compound_id: 'oral_creatine', name: 'Creatina', goal: 'wt_muscle' }] });
  assert.equal(cross[0], 'wt_muscle');
  assert.equal(cross.filter((k) => k === 'wt_muscle').length, 1);
});

test('PQ-5: a goal whose label is already on screen is not added twice (wt_stress and wt_stress_mgmt read the same)', () => {
  const r = order({ type: 'oral', compoundId: 'oral_ashwagandha', name: 'Ashwagandha', protocols: [{ id: 1, compound_id: 'oral_ashwagandha', name: 'Ashwagandha', goal: 'wt_stress' }] });
  const labels = r.map(tFor('pt'));
  assert.equal(new Set(labels).size, labels.length, 'no label twice');
});

test('PQ-8: a dose at night (18:00 to 04:00) moves the sleep key up within its group', () => {
  assert.equal(P.isNightTime('18:00'), true);
  assert.equal(P.isNightTime('23:59'), true);
  assert.equal(P.isNightTime('00:30'), true);
  assert.equal(P.isNightTime('04:00'), true);
  assert.equal(P.isNightTime('04:01'), false);
  assert.equal(P.isNightTime('17:59'), false);
  assert.equal(P.isNightTime('09:00'), false);
  assert.equal(P.isNightTime(''), false);
  assert.equal(P.isNightTime(null), false);
  // Group c (no table, no history): the sleep key leaves its alphabetical place and goes first.
  const night = order({ type: 'oral', compoundId: null, name: 'Meu chá', times: ['22:00'] });
  assert.equal(night[0], 'wt_sleep_quality');
  const day = order({ type: 'oral', compoundId: null, name: 'Meu chá', times: ['08:00'] });
  assert.notEqual(day[0], 'wt_sleep_quality');
  // Group b: magnesium's table is [stress, sleep]; at night sleep goes first within the table group.
  assert.deepEqual(P.TYPICAL_PURPOSE.oral_mag_bisglycinate, ['wt_stress_mgmt', 'wt_sleep_quality']);
  assert.deepEqual(order({ type: 'oral', compoundId: 'oral_mag_bisglycinate', name: 'Magnésio', times: ['08:00'] }).slice(0, 2), ['wt_stress_mgmt', 'wt_sleep_quality']);
  assert.deepEqual(order({ type: 'oral', compoundId: 'oral_mag_bisglycinate', name: 'Magnésio', times: ['08:00', '21:30'] }).slice(0, 2), ['wt_sleep_quality', 'wt_stress_mgmt']);
  // Group a stays above group b: a past choice is never passed by the sleep key of the table.
  const past = [{ id: 1, compound_id: 'oral_mag_bisglycinate', name: 'Magnésio', goal: 'wt_joint_health' }];
  assert.deepEqual(order({ type: 'oral', compoundId: 'oral_mag_bisglycinate', name: 'Magnésio', protocols: past, times: ['22:00'] }).slice(0, 3), ['wt_joint_health', 'wt_sleep_quality', 'wt_stress_mgmt']);
  // Injectable: the sleep key of that list (Otimização do sono).
  assert.equal(order({ type: 'recon', compoundId: null, name: 'X', times: ['23:00'] })[0], 'wt_sleep_opt');
});

test('PQ-2 / PQ-10 / PQ-11: 6 visible, then all; a selected tile is always visible; a stored key outside the list stays selected', () => {
  const ordered = order({ type: 'oral', compoundId: 'oral_melatonin', name: 'Melatonina' });
  const v = P.purposeTiles(ordered, []);
  assert.deepEqual(v.keys, ordered.slice(0, 6));
  assert.equal(v.total, 18);
  assert.equal(v.hidden, 12);
  assert.deepEqual(v.legacy, []);
  const all = P.purposeTiles(ordered, [], { expanded: true });
  assert.deepEqual(all.keys, ordered);
  assert.equal(all.hidden, 0);
  // Selected beyond the 6: shown after them, in list order.
  const late = [ordered[14], ordered[9]];
  const sel = P.purposeTiles(ordered, late);
  assert.deepEqual(sel.keys, [...ordered.slice(0, 6), ordered[9], ordered[14]]);
  assert.equal(sel.hidden, 10);
  // A stored key not in the list (an old one, or from the other type) stays visible and selected.
  const leg = P.purposeTiles(ordered, ['wt_anabolic', 'wt_sleep_quality', 'old_key']);
  assert.deepEqual(leg.legacy, ['wt_anabolic', 'old_key']);
  assert.ok(leg.keys.includes('wt_sleep_quality'));
  // A short list: no link.
  assert.equal(P.purposeTiles(['a', 'b'], []).hidden, 0);
});

test('PQ-12: storage is the same comma-separated goal string, parsed and written as before', () => {
  assert.deepEqual(P.goalKeys('wt_sleep_quality,wt_circadian'), ['wt_sleep_quality', 'wt_circadian']);
  assert.deepEqual(P.goalKeys(''), []);
  assert.deepEqual(P.goalKeys(null), []);
  assert.deepEqual(P.goalKeys(' wt_a , ,wt_b'), ['wt_a', 'wt_b']);
  const { formFromProtocol, protocolPayload } = require('../lib/protocolForm');
  assert.equal(typeof formFromProtocol, 'function');
  assert.equal(typeof protocolPayload, 'function');
});

test('PQ-14: profile goals → protocol goals by type (small table, wellness keys of that type only)', () => {
  // Mapped through the product's curated table (PQ-17): the same profile goal reads in the product's own key.
  assert.deepEqual(P.purposeFromProfile(['sleep'], 'oral', 'oral_melatonin'), ['wt_sleep_quality']);
  assert.deepEqual(P.purposeFromProfile(['sleep'], 'recon', 'lyo_melatonin'), [], 'no table entry for injectable melatonin (council 2026-11-20)');
  assert.deepEqual(P.purposeFromProfile(['fat_loss', 'strength', 'sleep'], 'rtu', 'rtu_semaglutide'), ['wt_weight']);
  assert.deepEqual(P.purposeFromProfile(['fat_loss', 'immune'], 'oral', 'oral_zinc'), ['wt_immune'], 'a goal with no key in that list is left out');
  assert.deepEqual(P.purposeFromProfile(['wellness'], 'recon', 'lyo_glutathione'), [], 'no loose mapping');
  assert.deepEqual(P.purposeFromProfile(['sleep', 'sleep', 'nope'], 'oral', 'oral_melatonin'), ['wt_sleep_quality']);
  assert.deepEqual(P.purposeFromProfile('sleep,stress', 'oral', 'oral_mag_bisglycinate'), ['wt_sleep_quality', 'wt_stress_mgmt'], 'the stored primary_goal string too');
  assert.deepEqual(P.purposeFromProfile(null, 'oral'), []);
  const { GOAL_KEY_T } = require('../lib/goalCategories');
  for (const g of Object.keys(P.PROFILE_PURPOSE)) assert.ok(GOAL_KEY_T[g], `${g} is a profile goal`);
  for (const [g, m] of Object.entries(P.PROFILE_PURPOSE)) {
    if (m.injectable) assert.ok(P.purposeKeysFor('recon').includes(m.injectable), g);
    if (m.oral) assert.ok(P.purposeKeysFor('oral').includes(m.oral), g);
  }
});
