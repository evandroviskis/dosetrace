'use strict';
// Journey dashboard (founder approved 2026-09-29): the Dose accumulation tile shows the
// same "Est. level" number as the Curve screen. The estimate used to live inline in
// SerumCurveScreen (fetchData + the model useMemo). It moved to lib/serumModel.js so the
// screen and the tile share one function. Guard: the lib returns EXACTLY what the old
// in-screen math computed (copied below verbatim as the reference) for a single
// compound, a blend component, a fast compound, a depot ester with a modeled peak, a
// creation-day protocol, a future start, and the IU / no-dose / no-data exclusions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { getHalfLifeEntry, curveUnit, doseInCurveUnit, amountFraction } = require('../lib/halfLives');
const { expectedDosesOn } = require('../lib/schedule');
const { BLEND_IDS, blendComponents } = require('../lib/compounds');
const { translations } = require('../i18n/translations');

// ── Reference: the old in-screen math (SerumCurveScreen.js at bb906f8, lines 155-457) ──
const PAST_DAYS = 14;
const STEP_HOURS = 6;
const DOSE_SLOTS = { 1: [12], 2: [6, 18], 3: [6, 12, 18], 4: [0, 6, 12, 18] };
function oldMatchName(protocol) {
  if (protocol.compound_id && translations.en[protocol.compound_id]) return translations.en[protocol.compound_id];
  return protocol.name || '';
}
// fetchData: blend expansion + the charted list; the screen opens on active[0].
function oldActive(rawAll, t) {
  // Palette B (2026-10-02): Lavender, Coral, Teal, Amber at their both-theme hexes.
  const BLEND_COLORS = ['#756CD1', '#CE5025', '#098787', '#AC6900'];
  const raw = (rawAll || []).filter(p => ['recon', 'rtu'].includes(p.type));
  const expanded = [];
  for (const p of raw) {
    const comps = p.compound_id && BLEND_IDS.includes(p.compound_id) ? blendComponents(p.compound_id, p.dose) : null;
    if (comps && comps.length) {
      comps.forEach((c, idx) => expanded.push({
        ...p, id: `${p.id}__${c.id}`, compound_id: c.id, dose: c.dose,
        color: BLEND_COLORS[idx % BLEND_COLORS.length],
        __label: `${t(p.compound_id)} · ${t(c.id)} ${t('blend_est_marker')}`, __blend: p.compound_id,
      }));
    } else {
      expanded.push(p);
    }
  }
  const entryOf = (p) => getHalfLifeEntry(oldMatchName(p));
  const noDose = (p) => !(Number(p.dose) > 0);
  const isIU = (p) => { const e = entryOf(p); return e != null && !noDose(p) && doseInCurveUnit(p.dose, p.dose_unit, e) == null; };
  const active = expanded.filter(p => entryOf(p) != null && !noDose(p) && !isIU(p));
  const nameOf = (p) => p.__blend ? t(p.__blend) : (p.compound_id ? t(p.compound_id) : p.name);
  const uniqNames = (list) => [...new Set(list.map(nameOf).filter(Boolean))];
  return {
    active,
    iu: uniqNames(expanded.filter(isIU)),
    noData: uniqNames(expanded.filter(p => entryOf(p) == null)),
    noDose: uniqNames(expanded.filter(p => entryOf(p) != null && noDose(p))),
  };
}
// The model useMemo, one series: nowLevel (the "Est. level") + doses + the readout.
function oldSeries(p, now, futureDays) {
  const stepMs = STEP_HOURS * 3600 * 1000;
  const s0 = new Date(now - PAST_DAYS * 24 * 3600 * 1000);
  s0.setHours(Math.floor(s0.getHours() / STEP_HOURS) * STEP_HOURS, 0, 0, 0);
  const start = s0.getTime();
  const end = now + futureDays * 24 * 3600 * 1000;
  const DAY_MS = 86400000;
  const entry = getHalfLifeEntry(oldMatchName(p));
  const doseMg = doseInCurveUnit(p.dose, p.dose_unit, entry) || 0;
  const lookbackDays = Math.min(600, Math.max(PAST_DAYS + 2, Math.ceil(6 * entry.hours / 24)));
  let scanStart = now - lookbackDays * DAY_MS;
  if (p.start_date) {
    const sd = new Date(p.start_date + 'T00:00:00').getTime();
    if (isFinite(sd) && sd > scanStart) scanStart = sd;
  }
  const scanStartDay = new Date(scanStart); scanStartDay.setHours(0, 0, 0, 0);
  const snap = (ts) => start + Math.round((ts - start) / stepMs) * stepMs;
  const doses = [];
  for (let dts = scanStartDay.getTime(); dts <= end; dts += DAY_MS) {
    const day = new Date(dts);
    const cnt = expectedDosesOn(p, day);
    const slots = DOSE_SLOTS[cnt] || DOSE_SLOTS[4];
    for (let k = 0; k < cnt; k++) {
      const dd = new Date(day); dd.setHours(slots[k % slots.length], 0, 0, 0);
      doses.push(snap(dd.getTime()));
    }
  }
  let nowLevel = 0;
  for (const d of doses) if (d <= now) nowLevel += doseMg * amountFraction(entry, (now - d) / 3600000);
  const dosesInWindow = doses.filter(ts => ts >= start && ts <= now).length;
  const levelAtDate = (T) => {
    let lv = 0;
    for (const d of doses) if (d <= T) lv += doseMg * amountFraction(entry, (T - d) / 3600000);
    return lv;
  };
  return { nowLevel, unit: curveUnit(entry), doses, start, dosesInWindow, levelAtDate, doseMg, entry };
}

const serum = require('../lib/serumModel');
const t = (k) => (translations.en[k] != null ? translations.en[k] : k);

const NOW_LIST = [
  new Date(2026, 8, 30, 15, 37, 12).getTime(),  // mid-afternoon, off the 6h grid
  new Date(2026, 9, 1, 12, 0, 0).getTime(),     // exactly on a dose slot
  new Date(2026, 9, 26, 3, 5, 0).getTime(),     // around the EU clock change
  new Date(2026, 10, 2, 23, 59, 0).getTime(),   // around the US clock change
  new Date(2027, 2, 29, 6, 0, 0).getTime(),     // on a grid line, spring
];

const PROTOCOLS = [
  { id: 'cyp', type: 'rtu', compound_id: 'rtu_testosterone_cypionate', name: 'Testosterone Cypionate', dose: 100, dose_unit: 'mg', interval_days: 7, doses_per_day: 1, start_date: '2026-06-01', reminder_time: '09:00' },
  { id: 'wolv', type: 'recon', compound_id: 'lyo_wolverine', name: 'Wolverine', dose: 5, dose_unit: 'mg', interval_days: 1, doses_per_day: 1, start_date: '2026-08-20', reminder_time: '08:00' },
  { id: 'bpc', type: 'recon', compound_id: 'lyo_bpc_157', name: 'BPC-157', dose: 250, dose_unit: 'mcg', interval_days: 1, doses_per_day: 2, start_date: '2026-09-01', reminder_time: '08:00,20:00' },
  { id: 'sema', type: 'recon', compound_id: 'lyo_semaglutide', name: 'Semaglutide', dose: 0.5, dose_unit: 'mg', interval_days: 7, doses_per_day: 1, start_date: '2026-09-10', reminder_time: '10:00' },
  { id: 'tirz', type: 'rtu', name: 'Tirzepatide', dose: 5, dose_unit: 'mg', interval_days: 7, doses_per_day: 1, reminder_time: '10:00' },
  { id: 'future', type: 'rtu', compound_id: 'rtu_testosterone_cypionate', name: 'Testosterone Cypionate', dose: 100, dose_unit: 'mg', interval_days: 7, doses_per_day: 1, start_date: '2027-12-01', reminder_time: '09:00' },
  { id: 'today', type: 'recon', compound_id: 'lyo_bpc_157', name: 'BPC-157', dose: 0.5, dose_unit: 'mg', interval_days: 1, doses_per_day: 3, start_date: '2026-09-30', created_at: new Date(2026, 8, 30, 13, 0, 0).toISOString(), reminder_time: '08:00,14:00,20:00' },
  { id: 'hcg', type: 'recon', compound_id: 'lyo_hcg', name: 'HCG', dose: 500, dose_unit: 'IU', interval_days: 3, doses_per_day: 1, start_date: '2026-09-01', reminder_time: '09:00' },
  { id: 'iu', type: 'recon', compound_id: 'lyo_semaglutide', name: 'Semaglutide', dose: 10, dose_unit: 'IU', interval_days: 7, doses_per_day: 1, reminder_time: '09:00' },
  { id: 'nodose', type: 'rtu', compound_id: 'rtu_testosterone_cypionate', name: 'Testosterone Cypionate', dose: 0, dose_unit: 'mg', interval_days: 7, doses_per_day: 1, reminder_time: '09:00' },
  { id: 'nodata', type: 'recon', name: 'Mystery peptide', dose: 1, dose_unit: 'mg', interval_days: 1, doses_per_day: 1, reminder_time: '09:00' },
  { id: 'oral', type: 'oral', name: 'Zinc', dose: 25, dose_unit: 'mg', interval_days: 1, doses_per_day: 1, reminder_time: '09:00' },
];

test('the charted list (what the curve can open on) is unchanged, blends expanded', () => {
  const old = oldActive(PROTOCOLS, t);
  const now = serum.splitCurveProtocols(PROTOCOLS, t);
  assert.deepEqual(now.active, old.active);
  assert.deepEqual(now.iu, old.iu);
  assert.deepEqual(now.noData, old.noData);
  assert.deepEqual(now.noDose, old.noDose);
  assert.ok(old.active.some(p => p.__blend === 'lyo_wolverine'), 'fixture covers a blend component');
  assert.ok(!old.active.some(p => p.id === 'iu'), 'an IU dose of a mass-dosed compound is not charted');
  assert.ok(old.active.some(p => p.id === 'hcg'), 'HCG charts in IU');
});

test('estimatedLevelNow equals the screen\'s old Est. level for every charted protocol and time', () => {
  const active = oldActive(PROTOCOLS, t).active;
  for (const now of NOW_LIST) {
    for (const p of active) {
      const ref = oldSeries(p, now, 7);
      const got = serum.estimatedLevelNow(p, now);
      assert.ok(got, `${p.id}: charted, so a level`);
      assert.equal(got.value, ref.nowLevel, `${p.id} @ ${new Date(now).toString()}`);
      assert.equal(got.unit, ref.unit);
    }
  }
});

test('the fixtures exercise real values (not all zero)', () => {
  const now = NOW_LIST[0];
  const byId = Object.fromEntries(oldActive(PROTOCOLS, t).active.map(p => [p.id, p]));
  assert.ok(serum.estimatedLevelNow(byId.cyp, now).value > 10, 'weekly ester accumulates');
  assert.ok(serum.estimatedLevelNow(byId.sema, now).value > 0, 'modeled peak');
  assert.equal(serum.estimatedLevelNow(byId.future, now).value, 0, 'future start: nothing yet');
  assert.equal(serum.estimatedLevelNow(byId.hcg, now).unit, 'IU', 'IU compound keeps its unit');
  assert.ok(byId['wolv__lyo_bpc_157'] && byId['wolv__lyo_tb_500'], 'blend split into components');
});

test('scheduled doses, grid start and the date readout match the old math (screen uses the same lib)', () => {
  const active = oldActive(PROTOCOLS, t).active;
  for (const now of NOW_LIST) {
    for (const futureDays of [7, 90]) {
      const start = serum.curveGridStart(now);
      const end = now + futureDays * 24 * 3600 * 1000;
      for (const p of active) {
        const ref = oldSeries(p, now, futureDays);
        assert.equal(start, ref.start);
        const entry = getHalfLifeEntry(serum.matchName(p));
        const doses = serum.scheduledDoses(p, entry, start, end, now);
        assert.deepEqual(doses, ref.doses, `${p.id} doses`);
        const doseMg = doseInCurveUnit(p.dose, p.dose_unit, entry) || 0;
        for (const T of [now, now - 5 * 86400000, now + 3 * 86400000 + 7200000]) {
          assert.equal(serum.levelAt(doses, doseMg, entry, T), ref.levelAtDate(T));
        }
      }
    }
  }
});

test('not charted → null (IU-dosed, no dose, no half-life data, oral)', () => {
  const now = NOW_LIST[0];
  for (const id of ['iu', 'nodose', 'nodata', 'oral']) {
    assert.equal(serum.estimatedLevelNow(PROTOCOLS.find(p => p.id === id), now), null, id);
  }
});

test('the tile opens on the curve\'s default compound (first charted, blend → first component)', () => {
  const now = NOW_LIST[0];
  const def = serum.defaultCurveLevel(PROTOCOLS, now, t);
  const first = oldActive(PROTOCOLS, t).active[0];
  assert.equal(def.protocol.id, first.id);
  assert.equal(def.value, oldSeries(first, now, 7).nowLevel);
  const blendFirst = serum.defaultCurveLevel(PROTOCOLS.filter(p => p.id === 'wolv'), now, t);
  assert.equal(blendFirst.protocol.id, 'wolv__lyo_bpc_157');
  assert.equal(serum.defaultCurveLevel(PROTOCOLS.filter(p => p.id === 'iu' || p.id === 'oral'), now, t), null);
});

test('levelLabel keeps the screen\'s number format', () => {
  assert.equal(serum.levelLabel(0), '0');
  assert.equal(serum.levelLabel(-1), '0');
  assert.equal(serum.levelLabel(NaN), '0');
  assert.equal(serum.levelLabel(3.456), '3.5');
  assert.equal(serum.levelLabel(9.96), '10.0');
  assert.equal(serum.levelLabel(123.6), '124');
});

test('the Curve screen and the Journey tile read the estimate from lib/serumModel', () => {
  const curve = fs.readFileSync(path.join(__dirname, '..', 'screens', 'SerumCurveScreen.js'), 'utf8');
  assert.match(curve, /from '\.\.\/lib\/serumModel'/);
  assert.match(curve, /scheduledDoses\(/);
  assert.doesNotMatch(curve, /expectedDosesOn/, 'the screen no longer builds doses inline');
  const journey = fs.readFileSync(path.join(__dirname, '..', 'screens', 'JourneyScreen.js'), 'utf8');
  assert.match(journey, /defaultCurveLevel\(/);
});
