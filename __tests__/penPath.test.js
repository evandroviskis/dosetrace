// Pen path (CP-1) — docs/specs/pen-path.md. Pure rules in lib/penPath.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const pen = require('../lib/penPath');

const proto = (penData, extra = {}) => ({ id: 1, type: 'pen', dose: '5', dose_unit: 'mg', interval_days: 7, doses_per_day: 1, vial_valid_days: 30, pen: JSON.stringify(penData), ...extra });
const NOW = new Date(2026, 10, 9, 12); // 2026-11-09

test('PN-28 the switch is off until every row is built', () => {
  assert.equal(pen.PEN_PATH_ENABLED, false);
});

test('PN-2 the short list: every pen has a kind, printed doses and label facts, no syringe data', () => {
  const ids = pen.PEN_CATALOG.map((e) => e.id);
  for (const id of ['mounjaro_kwikpen', 'mounjaro_single', 'zepbound_kwikpen', 'zepbound_single', 'ozempic', 'wegovy', 'saxenda', 'victoza', 'trulicity', 'xyosted']) assert.ok(ids.includes(id), id);
  for (const e of pen.PEN_CATALOG) {
    if (e.devices) { for (const d of e.devices) assert.ok(['single', 'fixed', 'dial'].includes(d.kind), d.id); continue; }
    assert.ok(['single', 'fixed', 'dial'].includes(e.kind), e.id);
    assert.ok(Array.isArray(e.doses) && e.doses.length > 0, e.id);
    assert.equal('concentration' in e || 'ml' in e || 'syringe' in e, false, e.id);
  }
  const kp = pen.catalogEntry('mounjaro_kwikpen');
  assert.equal(kp.kind, 'fixed');
  assert.equal(kp.perPen, 4);
  assert.deepEqual(kp.doses, [2.5, 5, 7.5, 10, 12.5, 15]);
  assert.equal(pen.catalogEntry('mounjaro_single').kind, 'single');
  assert.equal(pen.catalogEntry('mounjaro_single').fridgeDays, 21);
  assert.equal(pen.catalogEntry('trulicity').fridgeDays, 14);
});

test('PN-3 type B: doses per pen come from the pen, never from mg arithmetic', () => {
  const p = { kind: 'fixed', perPen: 4 };
  assert.equal(pen.dosesPerPen(p, 5), 4);
  assert.equal(pen.dosesPerPen(p, 10), 4);
});

test('PN-4 type C: only printed doses; doses per pen from the label number, never total ÷ dose', () => {
  const p = { kind: 'dial', doses: [0.6, 1.2, 1.8], perDose: { '0.6': 30, '1.2': 15, '1.8': 10 } };
  assert.equal(pen.dosesPerPen(p, 1.8), 10);
  assert.equal(pen.dosesPerPen(p, 1), null, 'a dose not printed on the dial is refused');
  assert.equal(pen.isPrintedDose(p, 1.2), true);
  assert.equal(pen.isPrintedDose(p, 1.5), false);
  // no label number for that dose → unknown (the box is asked), never 18 ÷ 3
  assert.equal(pen.dosesPerPen({ kind: 'dial', doses: [3], perDose: {} }, 3), null);
});

test('PN-5 type A: each pen is one dose; the stock is the count', () => {
  const p = { kind: 'single', stock: 3 };
  assert.equal(pen.dosesPerPen(p, 75), 1);
  const after = pen.afterTaken(proto(p), null, '2026-11-09');
  assert.equal(after.pen.stock, 2);
  assert.equal(after.vial, null, 'no vial and no "vial finished" window for a single-dose pen');
  const last = pen.afterTaken(proto({ kind: 'single', stock: 0 }), null, '2026-11-09');
  assert.equal(last.pen.stock, 0, 'never below zero');
});

test('PN-9 a new pen opens on the day of its first dose; PN-19 a skipped dose never takes from it', () => {
  const p = proto({ kind: 'fixed', perPen: 4, stock: 1 });
  const vial = { id: 9, total_doses: 4, doses_taken: 0, mixed_on: null };
  const after = pen.afterTaken(p, vial, '2026-11-09');
  assert.equal(after.vial.doses_taken, 1);
  assert.equal(after.vial.mixed_on, '2026-11-09');
  const again = pen.afterTaken(p, { ...vial, doses_taken: 1, mixed_on: '2026-11-02' }, '2026-11-09');
  assert.equal(again.vial.mixed_on, '2026-11-02', 'the opening date is never moved by a later dose');
  assert.equal(pen.takesFromPen('Skipped'), false);
  assert.equal(pen.takesFromPen('Missed'), false);
  assert.equal(pen.takesFromPen('Taken'), true);
});

test('PN-13/PN-15 type B state: doses left, days to the validity after opening, closed pens', () => {
  const p = proto({ kind: 'fixed', perPen: 4, stock: 1 });
  const s = pen.penState({ total_doses: 4, doses_taken: 2, mixed_on: '2026-10-26' }, p, NOW);
  assert.equal(s.capacity, 4);
  assert.equal(s.remaining, 2);
  assert.equal(s.stock, 1);
  assert.equal(s.daysLeft, 16); // 26/10 + 30 = 25/11
  // "I don't remember" the opening date: no countdown, never an invented date
  assert.equal(pen.penState({ total_doses: 4, doses_taken: 2, mixed_on: null }, p, NOW).daysLeft, null);
  // no validity given: no countdown (never the powder's 30-day default)
  assert.equal(pen.penState({ total_doses: 4, doses_taken: 2, mixed_on: '2026-10-26' }, { ...p, vial_valid_days: null }, NOW).daysLeft, null);
  // past the validity: what is left is to discard, never available
  const past = pen.penState({ total_doses: 4, doses_taken: 2, mixed_on: '2026-09-01' }, p, NOW);
  assert.equal(past.expired, true);
  assert.equal(past.available, 0);
});

test('PN-14 pen-low: the 7-days-or-last-dose rule over the pen in use plus the closed pens', () => {
  const weekly = proto({ kind: 'fixed', perPen: 4, stock: 1 });
  // 2 left + 1 closed pen (4) = 6 weekly doses = 42 days → not low
  assert.equal(pen.penState({ total_doses: 4, doses_taken: 2, mixed_on: '2026-10-26' }, weekly, NOW).low, false);
  const none = proto({ kind: 'fixed', perPen: 4, stock: 0 });
  const s = pen.penState({ total_doses: 4, doses_taken: 3, mixed_on: '2026-10-26' }, none, NOW);
  assert.equal(s.low, true);
  assert.equal(s.lastDoseInPen, true);
  assert.equal(s.noClosedPens, true);
  // daily dial pen with 5 doses left and no stock = 5 days → low
  const daily = proto({ kind: 'dial', doses: [3], perDose: { 3: 6 }, stock: 0 }, { dose: '3', interval_days: 1 });
  assert.equal(pen.penState({ total_doses: 6, doses_taken: 1, mixed_on: '2026-11-08' }, daily, NOW).low, true);
  // single-dose: 3 weekly pens = 21 days → not low; 1 pen → low
  assert.equal(pen.penState(null, proto({ kind: 'single', stock: 3 }), NOW).low, false);
  assert.equal(pen.penState(null, proto({ kind: 'single', stock: 1 }), NOW).low, true);
  // never low before the first dose of a new pen
  assert.equal(pen.penState({ total_doses: 4, doses_taken: 0, mixed_on: null }, none, NOW).low, false);
});

test('PN-16 a dose change on a fixed pen asks a new pen; capacity never recalculated from mg', () => {
  const p = proto({ kind: 'fixed', perPen: 4, stock: 2, catalog: 'mounjaro_kwikpen' }, { dose: '10' });
  const r = pen.changeDoseRecords(p, { id: 3, total_doses: 4, doses_taken: 1, mixed_on: '2026-11-02' }, { dose: 5, newStock: 3 });
  assert.equal(r.retireVial, 3);
  assert.equal(r.vial.total_doses, 4, 'a 4×10 mg KwikPen changed to 5 mg stays 4');
  assert.equal(r.vial.doses_taken, 0);
  assert.equal(r.vial.mixed_on, null);
  assert.equal(JSON.parse(r.protocolUpdate.pen).stock, 3, 'P3: the stock is only of the new dose');
  assert.equal(r.protocolUpdate.dose, '5');
  // dial pen: the same pen, a printed dose only; its per-pen count follows the label number
  const d = proto({ kind: 'dial', doses: [0.6, 1.2, 1.8], perDose: { 0.6: 30, 1.2: 15, 1.8: 10 }, stock: 1 }, { dose: '1.2' });
  assert.throws(() => pen.changeDoseRecords(d, { id: 4, total_doses: 15, doses_taken: 3 }, { dose: 1.5 }), /printed/);
});

test('PN-17 editing a past dose never changes a pen capacity', () => {
  assert.equal(pen.capacityAfterDoseEdit({ total_doses: 4 }, proto({ kind: 'fixed', perPen: 4 }), { dose: '2.5' }), 4);
});

test('PN-18 discard this pen: keeps the leftover in the history, takes 1 from the stock, never a dose', () => {
  const p = proto({ kind: 'fixed', perPen: 4, stock: 2 });
  const r = pen.discardRecords(p, { id: 5, total_doses: 4, doses_taken: 0, mixed_on: null });
  assert.equal(r.retireVial, 5);
  assert.equal(r.vial.total_doses, 4);
  assert.equal(JSON.parse(r.protocolUpdate.pen).stock, 1);
  assert.equal(r.doseLog, undefined);
  const empty = pen.discardRecords(proto({ kind: 'fixed', perPen: 4, stock: 0 }), { id: 6, total_doses: 4, doses_taken: 2 });
  assert.equal(empty.vial, null, 'no closed pen left: no pen in use (New pen is offered)');
});

test('PN-22/PN-23 days out of the fridge: countdown, alert two days before, passed after the limit', () => {
  const p = { kind: 'single', stock: 3, fridgeDays: 21, fridgeOut: { count: 1, since: '2026-11-09' } };
  const s = pen.fridgeState(p, NOW);
  assert.equal(s.count, 1);
  assert.equal(s.until, '2026-11-30');
  assert.equal(s.daysLeft, 21);
  assert.equal(s.passed, false);
  assert.equal(pen.fridgeAlertDate(p), '2026-11-28');
  const late = pen.fridgeState({ ...p, fridgeOut: { count: 1, since: '2026-10-18' } }, NOW);
  assert.equal(late.passed, true);
  assert.equal(late.daysOut, 22);
  assert.equal(pen.fridgeState({ ...p, fridgeOut: null }, NOW), null);
  // a dose taken uses a pen that is out of the fridge first
  const after = pen.afterTaken(proto(p), null, '2026-11-10');
  assert.equal(after.pen.stock, 2);
  assert.equal(after.pen.fridgeOut, null);
});

test('PN-10 dose steps: each period recorded with its own dose; "I don\'t remember" stops there', () => {
  const steps = [{ dose: 2.5, since: '2026-08-04' }, { dose: 5, since: '2026-09-01' }, { dose: 7.5, since: '2026-10-01' }];
  const r = pen.stepsToPast(steps, { interval_days: 7, doses_per_day: 1, anchor: '2026-11-09' }, '2026-11-09');
  assert.deepEqual(r.periods.map((x) => [x.dose, x.from, x.to, x.count]), [[2.5, '2026-08-04', '2026-08-31', 4], [5, '2026-09-01', '2026-09-30', 4], [7.5, '2026-10-01', '2026-11-08', 5]]);
  assert.equal(r.total, 13);
  assert.equal(r.doses[0].dose, 2.5);
  assert.equal(r.doses[r.doses.length - 1].dose, 7.5);
  assert.equal(r.start, '2026-08-10', 'the schedule keeps its weekday: the first Monday of the first step');
  assert.deepEqual(r.doseHistory.map((e) => [e.from && e.from.slice(0, 10), e.dose]), [[null, 2.5], ['2026-09-01', 5], ['2026-10-01', 7.5]]);
  assert.deepEqual(pen.stepsToPast([], { interval_days: 7, anchor: '2026-11-09' }, '2026-11-09').doses, []);
});

test('PN-24 turn into pen: never touches doses or history; the ml count is not copied', () => {
  const rtu = { id: 7, type: 'rtu', dose: '5', dose_unit: 'mg', concentration: '8.3', dose_history: '[{"x":1}]', start_date: '2026-08-01' };
  const r = pen.turnIntoPenRecords(rtu, { id: 11, total_doses: 8, doses_taken: 5 }, { kind: 'fixed', perPen: 4, catalog: 'mounjaro_kwikpen', remaining: 2, openedOn: '2026-10-26', validDays: 30, stock: 1 });
  assert.equal(r.protocolUpdate.type, 'pen');
  assert.equal('dose_history' in r.protocolUpdate, false);
  assert.equal('start_date' in r.protocolUpdate, false);
  assert.equal(r.retireVial, 11);
  assert.equal(r.vial.total_doses, 4);
  assert.equal(r.vial.doses_taken, 2);
  assert.equal(r.vial.mixed_on, '2026-10-26');
  assert.equal(r.protocolUpdate.vial_valid_days, 30);
});

test('PN-8 what already happened: doses left is 0 up to the printed number', () => {
  assert.equal(pen.validRemaining(2, 4), true);
  assert.equal(pen.validRemaining(0, 4), true);
  assert.equal(pen.validRemaining(5, 4), false);
  assert.equal(pen.validRemaining(1.5, 4), false);
  const v = pen.startedPenVial({ perPen: 4, remaining: 2, openedOn: null });
  assert.equal(v.doses_taken, 2);
  assert.equal(v.mixed_on, null);
});

test('PN-12 the pen data and its closed pens sync with the protocol (never AsyncStorage alone)', () => {
  const { toCloudPayload, OPTIONAL_COLUMNS } = require('../lib/syncMappers');
  assert.ok(OPTIONAL_COLUMNS.protocols.includes('pen'));
  const data = JSON.stringify({ kind: 'fixed', perPen: 4, stock: 2 });
  const payload = toCloudPayload('protocols', { id: 1, name: 'Mounjaro', type: 'pen', pen: data, user_id: 'u' }, 'u');
  assert.equal(payload.pen, data);
  assert.equal(payload.type, 'pen');
  const fs = require('fs');
  const path = require('path');
  assert.match(fs.readFileSync(path.join(__dirname, '../lib/schema.js'), 'utf8'), /\bpen TEXT\b/);
  assert.match(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261109200000_protocol_pen.sql'), 'utf8'), /add column if not exists pen text/);
});

test('PN-5 / PN-9 marking taken: a single-dose pen takes one pen; a new pen opens on its first dose; undo gives the pen back', () => {
  const { planMarkTaken, planUndoTake } = require('../lib/markTaken');
  const nowMs = new Date(2026, 10, 9, 9, 0).getTime();
  const base = { id: 1, user_id: 'u', type: 'pen', dose: '5', dose_unit: 'mg', interval_days: 7, doses_per_day: 1, start_date: '2026-11-02', reminder_time: '08:00' };
  const single = { ...base, pen: JSON.stringify({ kind: 'single', stock: 3, fridgeOut: { count: 1, since: '2026-11-08' } }) };
  const plan = planMarkTaken({ protocol: single, vial: null, dayKey: '2026-11-09', atNow: true, nowMs });
  assert.ok(plan.insert);
  assert.equal(JSON.parse(plan.penUpdate.pen).stock, 2);
  assert.equal(JSON.parse(plan.penUpdate.pen).fridgeOut, null);
  assert.equal(plan.vialFinished, false);
  const undo = planUndoTake({ logId: 9, protocolId: 1, penTaken: true, prevPen: single.pen }, { penNow: plan.penUpdate.pen });
  assert.equal(JSON.parse(undo.penRestore.pen).stock, 3);
  assert.deepEqual(JSON.parse(undo.penRestore.pen).fridgeOut, { count: 1, since: '2026-11-08' });

  const fixed = { ...base, pen: JSON.stringify({ kind: 'fixed', perPen: 4, stock: 1 }) };
  const fresh = planMarkTaken({ protocol: fixed, vial: { id: 4, total_doses: 4, doses_taken: 0, mixed_on: null, created_at: '2026-11-01T10:00:00Z' }, dayKey: '2026-11-09', atNow: true, nowMs });
  assert.equal(fresh.vialUpdate.doses_taken, 1);
  assert.equal(fresh.vialUpdate.mixed_on, '2026-11-09');
  assert.equal(fresh.penUpdate, null);
  // a started pen whose opening day the person does not remember never gets an invented date
  const unknown = planMarkTaken({ protocol: fixed, vial: { id: 5, total_doses: 4, doses_taken: 2, mixed_on: null, created_at: '2026-11-01T10:00:00Z' }, dayKey: '2026-11-09', atNow: true, nowMs });
  assert.equal('mixed_on' in unknown.vialUpdate, false);
});

test('PN-5 deleting a Taken dose of a single-dose pen gives the pen back; a vial pen goes back on its vial', () => {
  const { planDeleteDose } = require('../lib/deleteDose');
  const protocol = { id: 1, type: 'pen', dose: '5', dose_unit: 'mg', interval_days: 7, doses_per_day: 1, pen: JSON.stringify({ kind: 'single', stock: 2 }) };
  const plan = planDeleteDose({ id: 7, protocol_id: 1, outcome: 'Taken', logged_at: '2026-11-09T12:00:00Z' }, { protocol, vials: [], takenLogs: [] });
  assert.deepEqual(plan.deleteIds, [7]);
  assert.equal(JSON.parse(plan.penRestore.pen).stock, 3);
  assert.equal(plan.supply, 'pen');
  const skipped = planDeleteDose({ id: 8, protocol_id: 1, outcome: 'Skipped', logged_at: '2026-11-09T12:00:00Z' }, { protocol, vials: [], takenLogs: [] });
  assert.equal(skipped.penRestore, undefined, 'PN-19: a skip never took a pen');
});

test('PN-4 label facts: Ozempic counts as printed; Saxenda and Victoza print none, so none is invented', () => {
  const low = pen.catalogEntry('ozempic_low');
  assert.equal(pen.dosesPerPen(low, 0.25), 4);
  assert.equal(pen.dosesPerPen(pen.catalogEntry('ozempic_8'), 1), 8);
  assert.equal(pen.dosesPerPen(pen.catalogEntry('saxenda'), 3), null);
  assert.equal(pen.dosesPerPen(pen.catalogEntry('victoza'), 1.8), null);
  assert.equal(pen.validDaysFor(pen.catalogEntry('ozempic_1'), 'US'), 56);
  assert.equal(pen.validDaysFor(pen.catalogEntry('ozempic_1'), 'BR'), 42);
});
