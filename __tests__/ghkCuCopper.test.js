'use strict';
// Copper this cycle (docs/specs/ghk-cu-copper.md; picture docs/design/ghk-cu-cobre-ciclo.html, approved
// 2026-11-24): the math (lib/copperCycle), the texts as drawn, the six languages, the protocol page wiring
// and the theme tokens of the new parts.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sliceBlock, read } = require('./helpers/extractFn');
const C = require('../lib/copperCycle');
const { translations } = (() => {
  const src = read('i18n/translations.js').replace(/^export const /gm, 'const ');
  // eslint-disable-next-line no-new-func
  return new Function(`${src}\nreturn { translations };`)();
})();

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const tr = (l) => (k) => (translations[l][k] != null ? translations[l][k] : k);
const pt = tr('pt');
const L = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0);
const iso = (y, mo, d, h = 9) => L(y, mo, d, h).toISOString();

// A GHK-Cu protocol created on 3 Nov with 18 Taken doses of 2 mg (picture column 2).
function pure(over = {}) {
  return { id: 7, compound_id: 'lyo_ghk_cu', name: 'GHK-Cu', type: 'recon', amount: '50', unit: 'mg', dose: '2', dose_unit: 'mg',
    start_date: '2026-11-03', created_at: iso(2026, 11, 3, 8), active: 1, copper_form: null, ghk_cu_mg: null, ...over };
}
function klow(over = {}) {
  return { id: 9, compound_id: 'lyo_klow', name: 'KLOW', type: 'recon', amount: '80', unit: 'mg', dose: '4', dose_unit: 'mg',
    start_date: '2026-11-03', created_at: iso(2026, 11, 3, 8), active: 1, copper_form: null, ghk_cu_mg: null, ...over };
}
function taken(pid, n, amount, unit = 'mg', from = 3) {
  return Array.from({ length: n }, (_, i) => ({ id: 1000 + pid * 100 + i, protocol_id: pid, outcome: 'Taken', logged_at: iso(2026, 11, from + i, 9),
    dose_amount: amount, dose_unit: unit, sync_status: 'synced' }));
}

// ── CU-4: the factors ────────────────────────────────────────────────────────────────────────────
test('CU-4: copper fractions from the molar masses of the picture (standard atomic weights)', () => {
  assert.deepEqual(C.FORM_IDS, ['complex', 'acetate', 'bis']);
  assert.ok(Math.abs(C.COPPER_MW - 63.546) < 1e-9);
  assert.ok(Math.abs(C.formMolarMass('complex') - 401.9) < 0.05);
  assert.ok(Math.abs(C.formMolarMass('acetate') - 462.0) < 0.05);
  assert.ok(Math.abs(C.formMolarMass('bis') - 862.4) < 0.05);
  assert.equal((C.copperFraction('complex') * 100).toFixed(1), '15.8');
  assert.equal((C.copperFraction('acetate') * 100).toFixed(1), '13.8');
  assert.equal((C.copperFraction('bis') * 100).toFixed(1), '7.4');
  assert.equal(C.copperFraction(null), null, 'Não sei has no single fraction');
  assert.equal(C.copperFraction('anything'), null);
});

test('CU-4: the picture\'s numbers — 36 mg → 2,65 a 5,69 mg; complex → 5,69 mg; KLOW 50 of 80 → 45 mg → 3,32 a 7,11 mg', () => {
  const m = C.copperCycle(pure(), taken(7, 18, 2));
  assert.equal(m.kind, 'pure');
  assert.equal(m.count, 18);
  assert.equal(m.dosesMg, 36);
  assert.equal(m.ghkMg, 36);
  assert.equal(C.mgText(m.copper.low, 'pt'), '2,65');
  assert.equal(C.mgText(m.copper.high, 'pt'), '5,69');
  const k = C.copperCycle(pure({ copper_form: 'complex' }), taken(7, 18, 2));
  assert.equal(k.copper.low, k.copper.high, 'a form gives one number');
  assert.equal(C.mgText(k.copper.low, 'pt'), '5,69');
  const b = C.copperCycle(klow({ ghk_cu_mg: 50 }), taken(9, 18, 4));
  assert.equal(b.kind, 'blend');
  assert.equal(b.dosesMg, 72);
  assert.equal(b.ghkMg, 45);
  assert.equal(C.mgText(b.copper.low, 'pt'), '3,32');
  assert.equal(C.mgText(b.copper.high, 'pt'), '7,11');
  const bc = C.copperCycle(klow({ ghk_cu_mg: 50, copper_form: 'complex' }), taken(9, 18, 4));
  assert.equal(C.mgText(bc.copper.low, 'pt'), '7,11');
  assert.equal(C.mgText(bc.copper.low, 'en'), '7.11', 'the app language decimal mark');
});

// ── CU-1: which protocols ────────────────────────────────────────────────────────────────────────
test('CU-1: only GHK-Cu, GLOW and KLOW — never Wolverine or any other protocol', () => {
  assert.equal(C.copperKind({ compound_id: 'lyo_ghk_cu' }), 'pure');
  assert.equal(C.copperKind({ compound_id: 'lyo_glow' }), 'blend');
  assert.equal(C.copperKind({ compound_id: 'lyo_klow' }), 'blend');
  assert.equal(C.copperKind({ compound_id: 'lyo_wolverine' }), null);
  assert.equal(C.copperKind({ compound_id: 'lyo_bpc_157' }), null);
  assert.equal(C.copperKind({ name: 'GHK-Cu' }), 'pure', 'a typed name without a compound id');
  assert.equal(C.copperKind({ name: 'ghk cu' }), 'pure');
  assert.equal(C.copperKind({ name: 'KLOW' }), 'blend');
  assert.equal(C.copperKind({ name: 'Glow serum' }), null, 'never a loose match');
  assert.equal(C.copperCycle({ compound_id: 'lyo_bpc_157', dose: '250', dose_unit: 'mcg', start_date: '2026-11-03' }, []), null);
  assert.equal(C.copperCycle(pure({ dose_unit: 'IU' }), []), null, 'a dose that is not a mass: no section');
});

// ── CU-2: the cycle ──────────────────────────────────────────────────────────────────────────────
test('CU-2: Skipped, Missed, deleted, other protocols and the declared past never count', () => {
  const logs = [
    ...taken(7, 3, 2),
    { id: 1, protocol_id: 7, outcome: 'Skipped', logged_at: iso(2026, 11, 10), dose_amount: 2, dose_unit: 'mg' },
    { id: 2, protocol_id: 7, outcome: 'Missed', logged_at: iso(2026, 11, 11), dose_amount: null, dose_unit: null },
    { id: 3, protocol_id: 7, outcome: 'Taken', logged_at: iso(2026, 11, 12), dose_amount: 2, dose_unit: 'mg', sync_status: 'deleted' },
    { id: 4, protocol_id: 8, outcome: 'Taken', logged_at: iso(2026, 11, 12), dose_amount: 2, dose_unit: 'mg' },
    // The estimated past: a row from before the protocol was added (declared, lib/declared).
    { id: 5, protocol_id: 7, outcome: 'Taken', logged_at: iso(2026, 10, 20), dose_amount: 2, dose_unit: 'mg' },
  ];
  const p = pure({ start_date: '2026-10-15' });
  const m = C.copperCycle(p, logs);
  assert.equal(m.count, 3);
  assert.equal(m.dosesMg, 6);
});

test('CU-2: the cycle starts on the start date\'s local day; a Taken dose before it is not in the cycle', () => {
  const p = pure({ start_date: '2026-11-05', created_at: iso(2026, 11, 1, 8) });
  const logs = [...taken(7, 2, 2, 'mg', 3), ...taken(7, 2, 2, 'mg', 5).map((l) => ({ ...l, id: l.id + 50 }))];
  assert.equal(C.copperCycle(p, logs).count, 2);
  // The first minute of the start day counts (local day, not UTC).
  const first = { id: 99, protocol_id: 7, outcome: 'Taken', logged_at: L(2026, 11, 5, 0, 1).toISOString(), dose_amount: 2, dose_unit: 'mg' };
  assert.equal(C.copperCycle(p, [first]).count, 1);
});

test('CU-2: a corrected time is judged by its slot (slot_at), like the rest of the app', () => {
  const p = pure();
  // Logged at 3 Nov 07:00 after "Alterar horário" from a 3 Nov 21:00 slot: inside the cycle by its slot.
  const row = { id: 1, protocol_id: 7, outcome: 'Taken', logged_at: L(2026, 11, 2, 23).toISOString(), slot_at: L(2026, 11, 3, 21).toISOString(), dose_amount: 2, dose_unit: 'mg' };
  assert.equal(C.copperCycle(p, [row]).count, 1);
});

test('CU-2: a new run (Retomar) is a new protocol row — its cycle has none of the earlier run\'s doses; "Continuar" keeps the row', () => {
  const old = pure({ id: 7, active: 0, ended_at: iso(2026, 11, 20) });
  const fresh = pure({ id: 70, start_date: '2026-11-24', created_at: iso(2026, 11, 24, 8) });
  const logs = taken(7, 18, 2);
  assert.equal(C.copperCycle(old, logs).count, 18, 'the ended run keeps its own total');
  assert.equal(C.copperCycle(fresh, logs).count, 0, 'a new cycle starts from zero');
  assert.equal(C.copperCycle(fresh, logs).dosesMg, 0);
  const kept = pure({ still_going_at: iso(2026, 11, 22) }); // "Continuar" / "Continua": the same row
  assert.equal(C.copperCycle(kept, logs).count, 18);
});

// ── CU-3: each dose with its own amount ─────────────────────────────────────────────────────────
test('CU-3: every dose with its own recorded amount; mcg converted; the sum in mg', () => {
  const logs = [
    { id: 1, protocol_id: 7, outcome: 'Taken', logged_at: iso(2026, 11, 4), dose_amount: 1, dose_unit: 'mg' },
    { id: 2, protocol_id: 7, outcome: 'Taken', logged_at: iso(2026, 11, 5), dose_amount: 1500, dose_unit: 'mcg' },
    { id: 3, protocol_id: 7, outcome: 'Taken', logged_at: iso(2026, 11, 6), dose_amount: '0,5', dose_unit: 'mg' },
  ];
  const m = C.copperCycle(pure(), logs);
  assert.equal(m.count, 3);
  assert.ok(Math.abs(m.dosesMg - 3) < 1e-9);
});

test('CU-3: a row without a stamp counts at the dose in force then (dose_history); a non-mass row is not summed', () => {
  const p = pure({ dose: '2', dose_unit: 'mg', dose_history: JSON.stringify([{ from: null, dose: 1, unit: 'mg' }, { from: iso(2026, 11, 10, 0), dose: 2, unit: 'mg' }]) });
  const logs = [
    { id: 1, protocol_id: 7, outcome: 'Taken', logged_at: iso(2026, 11, 5), dose_amount: null, dose_unit: null },
    { id: 2, protocol_id: 7, outcome: 'Taken', logged_at: iso(2026, 11, 12), dose_amount: null, dose_unit: null },
    { id: 3, protocol_id: 7, outcome: 'Taken', logged_at: iso(2026, 11, 13), dose_amount: 10, dose_unit: 'IU' },
  ];
  const m = C.copperCycle(p, logs);
  assert.equal(m.dosesMg, 3);
  assert.equal(m.count, 2, 'only the doses that were summed are counted');
});

// ── CU-7 / CU-9: blends ─────────────────────────────────────────────────────────────────────────
test('CU-7: a blend without the GHK-Cu amount has no copper and never uses a recipe', () => {
  for (const p of [klow(), klow({ compound_id: 'lyo_glow', name: 'GLOW', amount: '70' })]) {
    const m = C.copperCycle(p, taken(9, 18, 4));
    assert.equal(m.kind, 'blend');
    assert.equal(m.needsGhk, true);
    assert.equal(m.copper, null);
    assert.equal(m.ghkMg, null);
    assert.equal(m.dosesMg, 72, 'the mixture in the doses is still shown');
  }
  assert.doesNotMatch(read('lib/copperCycle.js'), /BLEND_RATIOS|blendComponents/, 'the common recipe is never read here');
});

test('CU-9: a blend uses each dose × (GHK-Cu of the vial ÷ vial total); a vial total in mcg is converted; above the total = not given', () => {
  const m = C.copperCycle(klow({ ghk_cu_mg: 50, amount: '80000', unit: 'mcg' }), taken(9, 18, 4));
  assert.equal(m.totalMg, 80);
  assert.equal(m.ghkMg, 45);
  const over = C.copperCycle(klow({ ghk_cu_mg: 90 }), taken(9, 18, 4));
  assert.equal(over.needsGhk, true, 'a vial total edited lower later: the ask comes back');
  const none = C.copperCycle(klow({ amount: null, ghk_cu_mg: 50 }), taken(9, 18, 4));
  assert.equal(none.needsGhk, true);
  assert.equal(none.canAsk, false, 'no vial total: nothing to divide by');
});

test('CU-8: the amount is read with parseDecimal(text, language), above zero and not above the vial total', () => {
  assert.deepEqual(C.parseGhkAmount('50', 'pt', 80), { mg: 50 });
  assert.deepEqual(C.parseGhkAmount('12,5', 'pt', 80), { mg: 12.5 });
  assert.deepEqual(C.parseGhkAmount('12.5', 'en', 80), { mg: 12.5 });
  assert.deepEqual(C.parseGhkAmount('80', 'pt', 80), { mg: 80 });
  assert.deepEqual(C.parseGhkAmount('81', 'pt', 80), { error: 'over' });
  assert.deepEqual(C.parseGhkAmount('0', 'pt', 80), { error: 'invalid' });
  assert.deepEqual(C.parseGhkAmount('', 'pt', 80), { error: 'invalid' });
  assert.deepEqual(C.parseGhkAmount('abc', 'pt', 80), { error: 'invalid' });
});

// ── CU-5 / CU-7 / CU-9 / CU-10: the texts as drawn ─────────────────────────────────────────────
const BASE = 'Soma das doses marcadas como concluídas desde o início deste ciclo, cada uma com a quantidade registrada nela; doses puladas ou perdidas não entram.';
const RANGE = 'A parte de cobre depende da forma do GHK-Cu: 15,8% no complexo, 13,8% no acetato e 7,4% quando são duas moléculas de GHK por cobre. Como a forma não foi informada, o app mostra a faixa entre a menor e a maior. Escolha a forma em Forma no rótulo para ver um número só.';
const RESTART = 'Ao retomar o protocolo, um novo ciclo começa do zero.';
const CLOSING = 'É aritmética a partir do que você registrou; o DoseTrace não avalia a quantidade.';
const view = (p, logs, opts = {}) => C.copperView(C.copperCycle(p, logs), p, { t: pt, language: 'pt', ...opts });

test('CU-5 / CU-10: pure GHK-Cu, "Não sei" — rows, the range line, summary and "Como é calculado" as drawn', () => {
  const v = view(pure(), taken(7, 18, 2));
  assert.equal(v.title, 'Cobre neste ciclo');
  assert.equal(v.summary, '2,65 a 5,69 mg · 18 doses');
  assert.deepEqual(v.rows.map((r) => [r.label, r.value]), [
    ['Início do ciclo', '3 de nov.'], ['Doses concluídas', '18'], ['GHK-Cu nas doses', '36 mg'], ['Forma no rótulo', 'Não sei'], ['Cobre elementar', '2,65 a 5,69 mg'],
  ]);
  const form = v.rows[3];
  assert.equal(form.tap, 'form');
  assert.equal(form.muted, true, '"Não sei" reads muted, as drawn');
  const cu = v.rows[4];
  assert.equal(cu.mark, true);
  assert.equal(cu.note, 'Entre 2,65 e 5,69 mg: a forma não está no rótulo. 36 mg × 7,4% a 36 mg × 15,8%.');
  assert.equal(v.why, `${BASE} ${RANGE} ${RESTART}`);
  assert.equal(v.closing, CLOSING);
  assert.equal(v.ask, null);
});

test('CU-5 / CU-10: pure GHK-Cu with the complex — one number and the form\'s sentence', () => {
  const v = view(pure({ copper_form: 'complex' }), taken(7, 18, 2));
  assert.equal(v.summary, '5,69 mg · 18 doses');
  assert.equal(v.rows[3].value, 'Complexo GHK-Cu');
  assert.ok(!v.rows[3].muted);
  assert.equal(v.rows[4].value, '5,69 mg');
  assert.equal(v.rows[4].note, '36 mg × 15,8% = 5,69 mg');
  assert.equal(v.why, `${BASE} No complexo GHK-Cu (C14H22CuN6O4, 401,9 g/mol), o átomo de cobre (63,55 g/mol) é 15,8% do peso. ${RESTART}`);
  for (const f of ['acetate', 'bis']) {
    const w = view(pure({ copper_form: f }), taken(7, 18, 2));
    assert.ok(w.why.startsWith(BASE) && w.why.endsWith(RESTART));
    assert.match(w.why, f === 'acetate' ? /C14H22CuN6O4·C2H4O2, 462,0 g\/mol.*13,8% do peso/ : /C32H54CuN12O12, 862,4 g\/mol.*7,4% do peso/);
  }
});

test('CU-7: KLOW without the amount — no copper, the ask, the button and the no-recipe line', () => {
  const v = view(klow(), taken(9, 18, 4), { name: 'KLOW' });
  assert.equal(v.summary, 'Falta o GHK-Cu do frasco');
  assert.deepEqual(v.rows.map((r) => [r.label, r.value]), [['Início do ciclo', '3 de nov.'], ['Doses concluídas', '18'], ['KLOW nas doses', '72 mg']]);
  assert.deepEqual(v.ask, { line: 'Informe quanto de GHK-Cu o frasco tem para ver o cobre.', button: 'Informar o GHK-Cu do frasco', note: 'A mistura muda de fornecedor para fornecedor; o app não supõe uma receita.' });
  assert.equal(v.why, null, 'nothing to explain yet');
});

test('CU-9 / CU-10: KLOW with 50 of 80 mg — the rows, the division line, the range and the blend sentence', () => {
  const v = view(klow({ ghk_cu_mg: 50 }), taken(9, 18, 4), { name: 'KLOW' });
  assert.equal(v.summary, '3,32 a 7,11 mg · 18 doses');
  assert.deepEqual(v.rows.map((r) => [r.label, r.value, r.tap || null]), [
    ['Início do ciclo', '3 de nov.', null], ['Doses concluídas', '18', null], ['KLOW nas doses', '72 mg', null],
    ['GHK-Cu no frasco', '50 de 80 mg', 'ghk'], ['GHK-Cu nas doses', '45 mg', null], ['Forma no rótulo', 'Não sei', 'form'], ['Cobre elementar', '3,32 a 7,11 mg', null],
  ]);
  assert.equal(v.rows[4].note, '72 mg × 50 ÷ 80 = 45 mg');
  assert.equal(v.rows[6].note, 'Entre 3,32 e 7,11 mg: a forma não está no rótulo. 45 mg × 7,4% a 45 mg × 15,8%.');
  assert.equal(v.why, `${BASE} O GHK-Cu de cada dose é a parte dele no frasco que você informou (50 de 80 mg). ${RANGE} ${RESTART}`);
  assert.equal(v.closing, CLOSING);
});

test('CU-2: the ended run\'s page titles it "Cobre no ciclo"; one dose reads in the singular', () => {
  assert.equal(view(pure({ active: 0, ended_at: iso(2026, 11, 20) }), taken(7, 18, 2), { ended: true }).title, 'Cobre no ciclo');
  assert.equal(view(pure({ copper_form: 'complex' }), taken(7, 1, 2)).summary, '0,316 mg · 1 dose');
  assert.equal(view(pure(), []).summary, '0 mg · 0 doses', 'no dose yet: zero, never a range of zeros');
});

test('CU-6: the form sheet — the line and the four options with their small line, as drawn', () => {
  assert.equal(pt('copper_form_hint'), 'Opcional. Muda só a parte de cobre da conta. Se o rótulo diz apenas "GHK-Cu", escolha Não sei.');
  assert.deepEqual(C.formOptions(pt, 'pt').map((o) => [o.id, o.label, o.sub]), [
    [null, 'Não sei', 'Mostra a faixa: 7,4% a 15,8% de cobre'],
    ['complex', 'Complexo GHK-Cu', '15,8% de cobre · um cobre por GHK'],
    ['acetate', 'Acetato de GHK-Cu', '13,8% de cobre · "GHK-Cu acetate"'],
    ['bis', 'Duas moléculas de GHK por cobre', '7,4% de cobre · "prezatide copper acetate"'],
  ]);
});

test('CU-8: the amount sheet texts, as drawn', () => {
  assert.equal(pt('copper_ghk_title'), 'Quanto de GHK-Cu tem no frasco?');
  assert.equal(pt('copper_ghk_body').replace('{name}', 'KLOW').replace('{total}', '80'), 'KLOW, frasco de 80 mg. Veja o rótulo ou o certificado do fornecedor.');
  assert.equal(pt('copper_ghk_unit').replace('{total}', '80'), 'mg de 80 mg');
  assert.equal(pt('copper_ghk_hint'), 'Opcional. Sem esse número, o app não calcula o cobre desta mistura.');
});

// ── CU-10: no judgement ─────────────────────────────────────────────────────────────────────────
test('CU-10: no text says whether an amount is much, little, safe, a limit or a target (6 languages)', () => {
  const bad = /\b(too much|too little|safe|unsafe|limit|toxic|recommend|should|target|excess|deficien|demais|pouco|segur|limite|tóxic|recomend|deveria|meta|exces|poco|seguro|recomiend|trop|peu|sûr|limite|toxique|recommand|zu viel|zu wenig|sicher|grenzwert|giftig|empfehl|troppo|poco|sicur|tossic|raccomand)/i;
  for (const l of LANGS) for (const k of C.TEXT_KEYS) assert.doesNotMatch(translations[l][k], bad, `${l}.${k}`);
});

// ── CU-14: six languages ────────────────────────────────────────────────────────────────────────
test('CU-14: every new text exists in all 6 languages, with the same placeholders', () => {
  assert.ok(C.TEXT_KEYS.length >= 30);
  const ph = (s) => (s.match(/\{[a-zA-Z]+\}/g) || []).sort().join();
  for (const l of LANGS) for (const k of C.TEXT_KEYS) {
    assert.ok(typeof translations[l][k] === 'string' && translations[l][k].trim(), `${l}.${k}`);
    assert.equal(ph(translations[l][k]), ph(translations.en[k]), `${l}.${k} placeholders`);
  }
  // Every language renders the four cases without a raw key left.
  for (const l of LANGS) {
    for (const [p, logs, name] of [[pure(), taken(7, 18, 2)], [pure({ copper_form: 'acetate' }), taken(7, 18, 2)], [klow(), taken(9, 18, 4), 'KLOW'], [klow({ ghk_cu_mg: 50 }), taken(9, 18, 4), 'KLOW']]) {
      const v = C.copperView(C.copperCycle(p, logs), p, { t: tr(l), language: l, name });
      const all = [v.title, v.summary, v.why || '', v.closing, ...v.rows.flatMap((r) => [r.label, r.value, r.note || '']), ...(v.ask ? Object.values(v.ask) : [])].join(' | ');
      assert.doesNotMatch(all, /copper_|\{[a-zA-Z]+\}/, `${l}: ${all}`);
    }
  }
  assert.equal(C.copperView(C.copperCycle(pure(), taken(7, 18, 2)), pure(), { t: tr('en'), language: 'en' }).summary, '2.65 to 5.69 mg · 18 doses');
  assert.equal(C.copperView(C.copperCycle(pure(), taken(7, 18, 2)), pure(), { t: tr('fr'), language: 'fr' }).summary, '2,65 à 5,69 mg · 18 doses');
});

// ── CU-1: the protocol page ─────────────────────────────────────────────────────────────────────
const PROT = read('screens/ProtocolsScreen.js');
const TODAY = read('screens/TodayScreen.js');
const SHEETS = read('screens/components/CopperSheets.js');

test('CU-1: the section sits after "Detalhes da dose" and before the note, closed (CollapsibleSection)', () => {
  const detail = sliceBlock(PROT, 'export function ProtocolDetail(');
  const dose = detail.indexOf("title={t('protocols_step_dose')}");
  const copper = detail.indexOf('<CopperSection');
  const note = detail.indexOf('<NoteFrame');
  assert.ok(dose > 0 && copper > dose && note > copper, 'Detalhes da dose → Cobre → Notas');
  const sec = sliceBlock(PROT, 'function CopperSection(');
  assert.match(sec, /<CollapsibleSection /);
  assert.doesNotMatch(sec, /forceOpen/, 'arrives closed on every visit');
  assert.match(sec, /copperCycle\(p, logs\)/);
  assert.match(sec, /if \(!model\) return null;/, 'nothing on any other protocol');
});

test('CU-1 / CU-6 / CU-8: the page and the Fold page pass the protocol\'s Taken rows and save the two values on the protocol', () => {
  assert.match(PROT, /copperLogs=\{getProtocolTakenLogs\(p\.id\)\}/);
  assert.match(PROT, /onCopperSave=\{saveCopper\}/);
  const save = sliceBlock(PROT, 'function saveCopper(');
  assert.match(save, /updateProtocol\(id, fields\)/);
  assert.match(save, /requestSync\(\)/);
  assert.match(TODAY, /copperLogs=\{getProtocolTakenLogs\(p\.id\)\}/);
  assert.match(TODAY, /onCopperSave=\{saveCopper\}/);
  const db = read('lib/database.js');
  assert.match(db, /export function getProtocolTakenLogs\(protocolId\)/);
});

test('CU-6 / CU-8: the sheets save only through onSave; Não sei clears; the field uses parseGhkAmount and inputNumber', () => {
  const form = sliceBlock(SHEETS, 'export function CopperFormSheet(');
  assert.match(form, /formOptions\(t, language\)/);
  assert.match(form, /onSave\(\{ copper_form: o\.id \}\)/);
  const amt = sliceBlock(SHEETS, 'export function GhkAmountSheet(');
  assert.match(amt, /parseGhkAmount\(text, language, totalMg\)/);
  assert.match(amt, /inputNumber\(/);
  assert.match(amt, /onSave\(\{ ghk_cu_mg: null \}\)/);
  assert.match(amt, /onSave\(\{ ghk_cu_mg: r\.mg \}\)/);
  assert.match(amt, /keyboardType="decimal-pad"/);
});

// ── CU-15: theme tokens ─────────────────────────────────────────────────────────────────────────
test('CU-15: the new parts use theme tokens only (no raw colours)', () => {
  for (const part of [SHEETS, sliceBlock(PROT, 'function CopperSection(')]) {
    assert.doesNotMatch(part, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/);
  }
  assert.match(SHEETS, /backgroundColor: c\.scrim/);
  assert.match(SHEETS, /backgroundColor: c\.raised/);
});
