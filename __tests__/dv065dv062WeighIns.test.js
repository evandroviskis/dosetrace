// Parked-error sweep 2026-10-31 (DIVERGENCES DV-065 / DV-062, both "No (bug)").
// DV-065: only the weigh-in edit sheet kept 25–300 kg / 3–70 % / 30–250 cm; "Log today's weight",
// "+ Add a past weigh-in", the reality-check start sheet and the Your numbers weight field saved any
// number (850 kg as a weigh-in and as the check's start). Every entry path now refuses it with the
// existing one-line message (cal_wi_invalid).
// DV-062: deleting the weigh-in of the day the Your numbers weight came from left the plan on the
// deleted value; it now takes the newest weigh-in left.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { weighInValuesOk } = require('../lib/weighInEdit');
const { afterWeighInDelete } = require('../lib/numbersWeight');

test('DV-065: the same ranges as the edit sheet', () => {
  assert.equal(weighInValuesOk({ weightKg: 80 }), true);
  assert.equal(weighInValuesOk({ weightKg: 850 }), false);
  assert.equal(weighInValuesOk({ weightKg: 8 }), false);
  assert.equal(weighInValuesOk({ weightKg: 80, bodyFatPct: 90 }), false);
  assert.equal(weighInValuesOk({ weightKg: 80, bodyFatPct: 18, waistCm: 400 }), false);
  assert.equal(weighInValuesOk({ weightKg: 80, bodyFatPct: null, waistCm: null }), true);
});

test('DV-065: every entry path checks before writing', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/components/CalculatorSection.js'), 'utf8');
  const body = (h, next) => src.slice(src.indexOf(h), src.indexOf(next, src.indexOf(h) + h.length));
  assert.match(body('function saveTodayWeighIn(', '\n  }\n'), /if \(!weighInValuesOk\(\{ weightKg, bodyFatPct: bfv, waistCm: waistCmNew \}\)\) \{ setWiBad\(true\); return; \}/);
  assert.match(body('function saveBackfillWeighIn(', '\n  }\n'), /if \(!weighInValuesOk\(\{ weightKg, bodyFatPct: bfv \}\)\) \{ setBfBad\(true\); return; \}/);
  assert.match(body('async function startRealityCheck(', '\n  }\n'), /if \(!weighInValuesOk\(\{ weightKg: kg \}\)\) \{ setRcBad\(true\); return; \}/);
  assert.match(body('function commitWeightField(', '\n  }\n'), /if \(kg != null && !weighInValuesOk\(\{ weightKg: kg \}\)\) \{ const back = hasWeighIns \? weight : \(entered \|\| ''\); if \(!hasWeighIns\) setWeightNow\(back\); setWeightField\(back\); setWeightBad\(true\); return; \}/);
  for (const flag of ['wiBad', 'bfBad', 'rcBad', 'weightBad']) assert.match(src, new RegExp(`\\{${flag} \\? <Text style=\\{s\\.tnote\\}>\\{t\\('cal_wi_invalid'\\)\\}</Text> : null\\}`), flag);
});

test('DV-062: deleting the weigh-in Your numbers came from takes the newest one left', () => {
  const snaps = [{ date: '2026-10-29', weightKg: 86 }, { date: '2026-10-25', weightKg: 87 }];
  assert.deepEqual(afterWeighInDelete({ weightAt: '2026-10-31', deletedDate: '2026-10-31', snapshots: snaps }), { date: '2026-10-29', weightKg: 86 });
  // another day deleted: Your numbers keeps its weight
  assert.equal(afterWeighInDelete({ weightAt: '2026-10-31', deletedDate: '2026-10-29', snapshots: snaps }), null);
  // nothing left: the typed weight stays (never blank)
  assert.equal(afterWeighInDelete({ weightAt: '2026-10-31', deletedDate: '2026-10-31', snapshots: [] }), null);
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/components/CalculatorSection.js'), 'utf8');
  const del = src.slice(src.indexOf('function deleteWeighInNow('), src.indexOf('function confirmDeleteWeighIn('));
  assert.match(del, /afterWeighInDelete\(\{ weightAt, deletedDate: weEdit\.date, snapshots: rows \}\)/);
  assert.match(del, /setWeightAt\(next\.date\)/);
});
