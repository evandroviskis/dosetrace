'use strict';
// AD-80 (founder 2026-10-26 "A para os dois", picture docs/design/ad80-edit-vial.html, spec
// docs/specs/a132-new-vial.md EV-1..): "Editar frasco" beside "Novo frasco" on the protocol page's
// vial block (option A) for reconstituted AND ready-to-use vials; the edit windows as drawn (recon:
// mix date, validity in days, doses already used, a mix date after today refused; RTU: the box's
// month/year and doses already used); the ready-to-use "Novo frasco" asks the new box's month/year
// with the form's pills (option A, blank allowed) and starts a new vial row as A-132 does.
// Edits never touch the dose history.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud, seedSyncedProtocol } = require('./helpers/syncHarness');
const { loadFn, read, sliceBlock } = require('./helpers/extractFn');
const { pushPending } = require('../lib/syncCore');
const { supplyState } = require('../lib/supplyLow');
const { daysUntilExpiry } = require('../lib/vialExpiry');
const NV = require('../lib/newVial');
const VE = require('../lib/vialEdit');

const USER = 'user-A';
const OCT20 = new Date(2026, 9, 20, 9, 41);

function app(db) {
  const getDB = () => db;
  const fromDb = (name) => loadFn('lib/database.js', `export function ${name}(`, name, { getDB });
  const f = {};
  for (const n of ['getActiveVials', 'insertVial', 'updateVial', 'deactivateVialsByProtocol', 'updateProtocol', 'getProtocolById']) f[n] = fromDb(n);
  return f;
}
const vialRow = (db, id) => db.getFirstSync('SELECT * FROM vials WHERE id = ?', [id]);
const protoRow = (db, id) => db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [id]);
const logs = (db) => db.getAllSync(`SELECT id, remote_id, protocol_id, outcome, logged_at, injection_site, sync_status FROM dose_logs ORDER BY id`);

// The picture's two cases. Tirzepatide (recon, 8 doses): marked Sep 13 by mistake (it was Oct 13),
// the label says 28 days, 1 dose used before it was logged. Testosterone Cypionate (RTU, 20 doses,
// 18 used, box Mar 2027).
function seed(db) {
  const tirz = seedSyncedProtocol(db, USER, { remote_id: 'p-tirz', updated_at: '000001', name: 'Tirzepatide' });
  db.runSync(`UPDATE protocols SET amount = '20', unit = 'mg', dose = '2.5', dose_unit = 'mg', water = '2', interval_days = 7, vial_valid_days = NULL WHERE id = ?`, [tirz]);
  const tv = db.runSync(`INSERT INTO vials (remote_id, user_id, protocol_id, protocol_remote_id, mixed_on, water_ml, total_doses, doses_taken, active, created_at, updated_at, sync_status)
    VALUES ('v-tirz', ?, ?, 'p-tirz', '2026-09-13', 2, 8, 1, 1, '2026-09-13T08:00:00.000Z', '000001', 'synced')`, [USER, tirz]).lastInsertRowId;
  const test_ = seedSyncedProtocol(db, USER, { remote_id: 'p-test', updated_at: '000001', name: 'Testosterone Cypionate' });
  db.runSync(`UPDATE protocols SET type = 'rtu', dose = '100', dose_unit = 'mg', concentration = '200', concentration_unit = 'mg', interval_days = 7 WHERE id = ?`, [test_]);
  const rv = db.runSync(`INSERT INTO vials (remote_id, user_id, protocol_id, protocol_remote_id, mixed_on, water_ml, total_doses, doses_taken, expires_on, active, created_at, updated_at, sync_status)
    VALUES ('v-test', ?, ?, 'p-test', NULL, 10, 20, 18, '2027-03-31', 1, '2026-08-01T08:00:00.000Z', '000001', 'synced')`, [USER, test_]).lastInsertRowId;
  for (const [rid, pid, prid] of [['d-1', tirz, 'p-tirz'], ['d-2', test_, 'p-test']]) {
    db.runSync(`INSERT INTO dose_logs (remote_id, user_id, protocol_id, protocol_remote_id, outcome, logged_at, injection_site, updated_at, sync_status)
      VALUES (?, ?, ?, ?, 'Taken', '2026-10-13T08:05:00.000Z', 'abdomen_left', '000001', 'synced')`, [rid, USER, pid, prid]);
  }
  return { tirz, tv, test: test_, rv };
}

// ── EV-1: where "Editar frasco" sits ─────────────────────────────────────────────────────
test('EV-1: "Edit vial" for every active reconstituted and ready-to-use vial; left of "New vial", alone full width', () => {
  assert.equal(VE.showsEditVialButton({ type: 'recon' }, { doses_taken: 0 }), true);
  assert.equal(VE.showsEditVialButton({ type: 'rtu' }, { doses_taken: 0 }), true, 'RTU with no dose used: Edit vial alone');
  assert.equal(VE.showsEditVialButton({ type: 'recon' }, null), false, 'no vial: "+ Add vial" on Today');
  assert.equal(VE.showsEditVialButton({ type: 'oral' }, { doses_taken: 1 }), false);
  const prot = read('screens/ProtocolsScreen.js');
  const block = sliceBlock(prot, 'function ProtocolVialBlock(');
  assert.match(block, /<View style=\{s\.vbtns\}>\s*\{showsEditVialButton\(p, vial\) && \(\s*<TouchableOpacity style=\{\[s\.obtn2, s\.vbtn\]\} onPress=\{\(\) => onEditVial\(p\.id\)\} accessibilityRole="button">\s*<Text style=\{s\.obtn2Text\}>\{t\('vial_edit_title'\)\}<\/Text>/, 'Edit vial first (left), no icon');
  assert.ok(block.indexOf("t('vial_edit_title')") < block.indexOf("t('protocols_new_vial')"), 'New vial on the right');
  assert.match(block, /<TouchableOpacity style=\{\[s\.obtn2, s\.vbtn\]\} onPress=\{\(\) => onRefillVial\(p\.id\)\} accessibilityRole="button">\s*<FeatureIcon name="repeat"/);
  assert.match(prot, /vbtns: \{ flexDirection: 'row', gap: 10 \}/);
  assert.match(prot, /vbtn: \{ flex: 1, minWidth: 0 \}/, 'same size side by side; full width alone');
  assert.match(prot, /onEditVial=\{openEditVial\}/);
  // Today's Fold book page opens the protocol page for an edit (as every other edit there).
  assert.match(read('screens/TodayScreen.js'), /onEditVial=\{toProtocol\}/);
});

// ── EV-2 / EV-4: the reconstituted edit window and its limits ─────────────────────────────────
test('EV-2: the reconstituted window opens with the current values (Sep 13, 30 days, 1 of 8)', () => {
  const p = { type: 'recon', vial_valid_days: null, amount: '20', unit: 'mg', dose: '2.5', dose_unit: 'mg' };
  const v = { mixed_on: '2026-09-13', total_doses: 8, doses_taken: 1 };
  assert.deepEqual(VE.editVialStart(p, v), { month: 8, day: '13', validDays: '30', dosesUsed: '1', capacity: 8, expMonth: null, expYear: null });
  const r = { type: 'rtu' };
  assert.deepEqual(VE.editVialStart(r, { expires_on: '2027-03-31', total_doses: 20, doses_taken: 18 }),
    { month: null, day: '', validDays: '', dosesUsed: '18', capacity: 20, expMonth: 2, expYear: 2027 });
  assert.equal(VE.editVialStart({ type: 'recon' }, { mixed_on: '2026-09-13', doses_taken: 1 }).capacity, null, 'no count: the field is hidden');
});

test('EV-4: validity takes whole numbers up to 3 digits (empty or 0 = 30); doses used 0..the vial\'s doses', () => {
  for (const ok of ['', '2', '28', '120']) assert.equal(VE.acceptValidDaysText(ok), true, ok);
  for (const bad of ['1000', '2.5', '2,5', '-1', 'a']) assert.equal(VE.acceptValidDaysText(bad), false, bad);
  assert.equal(VE.validDaysValue(''), 30);
  assert.equal(VE.validDaysValue('0'), 30);
  assert.equal(VE.validDaysValue('28'), 28);
  for (const ok of ['', '0', '2', '8']) assert.equal(VE.acceptDosesUsedText(ok, 8), true, ok);
  for (const bad of ['9', '12', '1.5', '-1']) assert.equal(VE.acceptDosesUsedText(bad, 8), false, bad);
});

test('EV-3: a mix date after today is refused — nothing written; the vial\'s own earlier year still saves', () => {
  assert.deepEqual(VE.editMixDate(9, '13', '2026-09-13', OCT20), { date: '2026-10-13' });
  assert.deepEqual(VE.editMixDate(10, '5', '2026-09-13', OCT20), { error: 'future' }, 'Nov 5 — never moved to last year');
  assert.deepEqual(VE.editMixDate(9, '20', '2026-09-13', OCT20), { date: '2026-10-20' }, 'today');
  assert.deepEqual(VE.editMixDate(1, '31', '2026-09-13', OCT20), { error: 'invalid' });
  // a vial mixed Dec 28 last year, edited on Jan 5: December still means that December
  assert.deepEqual(VE.editMixDate(11, '28', '2026-12-28', new Date(2027, 0, 5)), { date: '2026-12-28' });
  const db = makeDb(); const a = app(db); const { tirz, tv } = seed(db);
  const before = vialRow(db, tv);
  const res = VE.applyVialEdit(protoRow(db, tirz), before, { month: 10, day: '5', validDays: '28', dosesUsed: '2' }, OCT20, a);
  assert.deepEqual(res, { error: 'future' });
  assert.deepEqual(vialRow(db, tv), before, 'nothing is written');
  assert.equal(protoRow(db, tirz).vial_valid_days, null);
  const prot = read('screens/ProtocolsScreen.js');
  const save = sliceBlock(prot, 'async function saveVialEdit(');
  assert.match(save, /res\.error === 'future'[\s\S]*title: t\('vial_edit_future_title'\), body: t\('vial_edit_future_body'\)/);
  assert.match(save, /buttons: \[\{ label: t\('ok'\), kind: 'primary' \}\]/, 'OK returns to the window');
});

test('EV-2 / EV-5: Save changes only the vial (date, doses used) and the protocol\'s validity — never a dose', () => {
  const db = makeDb(); const a = app(db); const { tirz, tv } = seed(db);
  const logsBefore = logs(db);
  const res = VE.applyVialEdit(protoRow(db, tirz), vialRow(db, tv), { month: 9, day: '13', validDays: '28', dosesUsed: '2' }, OCT20, a);
  assert.deepEqual(res, { vialUpdate: { mixed_on: '2026-10-13', doses_taken: 2 }, protocolUpdate: { vial_valid_days: 28 } });
  const v = vialRow(db, tv); const p = protoRow(db, tirz);
  assert.equal(v.mixed_on, '2026-10-13'); assert.equal(v.doses_taken, 2); assert.equal(v.total_doses, 8); assert.equal(v.active, 1);
  assert.equal(p.vial_valid_days, 28, 'also for the next vials');
  assert.deepEqual(logs(db), logsBefore, 'the dose history is untouched');
  // the results as drawn: 6 of 8 left, 21 days left (Oct 13 + 28 = Nov 10), no longer past its window
  assert.equal(supplyState(v, p).remaining, 6);
  assert.equal(daysUntilExpiry(v.mixed_on, p.vial_valid_days, OCT20), 21);
  assert.equal(NV.vialPastWindow(p, v, OCT20), false, '"+ New vial" and the expired alert go');
  // unchanged values write nothing
  assert.deepEqual(VE.editVialPlan(p, v, { month: 9, day: '13', validDays: '28', dosesUsed: '2' }, OCT20), { vialUpdate: null, protocolUpdate: null });
  // an empty or 0 validity is the app default, and the default is not written over an unset one
  assert.equal(VE.editVialPlan({ ...p, vial_valid_days: null }, v, { month: 9, day: '13', validDays: '', dosesUsed: '2' }, OCT20).protocolUpdate, null);
});

test('EV-11: an edit reaches the cloud through syncCore (vial and protocol), the dose log as it was', async () => {
  const db = makeDb(); const a = app(db); const cloud = makeCloud(); const { tirz, tv } = seed(db);
  cloud._store.protocols.set('p-tirz', { id: 'p-tirz', user_id: USER, name: 'Tirzepatide', updated_at: '000001' });
  cloud._store.vials.set('v-tirz', { id: 'v-tirz', user_id: USER, protocol_id: 'p-tirz', mixed_on: '2026-09-13', total_doses: 8, doses_taken: 1, active: true, updated_at: '000001' });
  VE.applyVialEdit(protoRow(db, tirz), vialRow(db, tv), { month: 9, day: '13', validDays: '28', dosesUsed: '2' }, OCT20, a);
  await pushPending(db, cloud, USER);
  const cv = cloud._store.vials.get('v-tirz');
  assert.equal(cv.mixed_on, '2026-10-13'); assert.equal(Number(cv.doses_taken), 2);
  assert.equal(Number(cloud._store.protocols.get('p-tirz').vial_valid_days), 28);
  assert.equal(db.getAllSync(`SELECT * FROM dose_logs WHERE sync_status != 'synced'`).length, 0, 'no dose row touched');
});

// Data review 2026-10-26 (finding 1): the stored year was used as a fallback, so a future day was
// silently saved a year (or more) back. The year is never taken from the stored date: the mix date
// is the nearer of this year's and last year's day — after today → refused (the picture's Nov 5 on
// Oct 20), already past → saved (a December vial corrected in January).
test('EV-3 (review): a future day is never moved back to the stored year', () => {
  const JAN5 = new Date(2027, 0, 5, 10, 0);
  assert.deepEqual(VE.editMixDate(0, '14', '2026-12-28', JAN5), { error: 'future' }, 'Jan 14 on Jan 5 (was saved as 2026-01-14)');
  assert.deepEqual(VE.editMixDate(1, '3', '2026-12-28', JAN5), { error: 'future' }, 'Feb 3 on Jan 5 (was saved as 2026-02-03)');
  assert.deepEqual(VE.editMixDate(5, '10', '2025-12-01', JAN5), { error: 'future' }, 'Jun 10 on Jan 5 (was saved as 2025-06-10)');
  assert.deepEqual(VE.editMixDate(11, '28', '2025-12-01', JAN5), { date: '2026-12-28' }, 'last December, whatever the stored year');
  assert.deepEqual(VE.editMixDate(6, '20', null, JAN5), { date: '2026-07-20' }, 'last July: nearer than next July');
  assert.deepEqual(VE.editMixDate(10, '5', '2024-11-05', OCT20), { error: 'future' }, 'the picture: Nov 5 on Oct 20 is refused');
  assert.deepEqual(VE.editMixDate(0, '5', '2026-12-28', JAN5), { date: '2027-01-05' }, 'today');
  assert.doesNotMatch(sliceBlock(read('lib/vialEdit.js'), 'function editMixDate('), /prevMixedOn\.|prevYear|slice\(0, 4\)/, 'no stored-year fallback');
});

// ── EV-6: the ready-to-use edit window ───────────────────────────────────────────────────
test('EV-6: the ready-to-use window edits the box month/year (blank allowed) and the doses used', () => {
  const db = makeDb(); const a = app(db); const { test: pid, rv } = seed(db);
  const logsBefore = logs(db);
  assert.deepEqual(VE.applyVialEdit(protoRow(db, pid), vialRow(db, rv), { expMonth: 9, expYear: 2027, dosesUsed: '17' }, OCT20, a),
    { vialUpdate: { expires_on: '2027-10-31', doses_taken: 17 }, protocolUpdate: null });
  assert.equal(vialRow(db, rv).expires_on, '2027-10-31');
  VE.applyVialEdit(protoRow(db, pid), vialRow(db, rv), { expMonth: null, expYear: 2027, dosesUsed: '17' }, OCT20, a);
  assert.equal(vialRow(db, rv).expires_on, null, 'blank: no expiration date');
  assert.equal(vialRow(db, rv).mixed_on, null, 'no mix date on a ready-to-use vial');
  assert.deepEqual(logs(db), logsBefore);
  // the box date is the form's own rule (last day of the month) — one helper
  assert.equal(VE.boxExpiresOn(1, 2028), '2028-02-29');
  assert.match(read('lib/protocolForm.js'), /expiresOn = boxExpiresOn\(f\.vialExpMonth, f\.vialExpYear\);/);
  assert.deepEqual(VE.expiryYears(OCT20), [2026, 2027, 2028, 2029, 2030, 2031], 'the form\'s six years');
});

// ── EV-7 / EV-8: the ready-to-use "New vial" ─────────────────────────────────────────────
test('EV-7: RTU "New vial" starts a new vial row (blank box date unless picked); the old one keeps its doses and date', () => {
  const db = makeDb(); const a = app(db); const { test: pid, rv } = seed(db);
  const p = protoRow(db, pid); const old = vialRow(db, rv);
  const logsBefore = logs(db);
  const newId = NV.startNewVial(p, null, USER, a, { oldVial: old, expiresOn: VE.boxExpiresOn(9, 2027) });
  const prev = vialRow(db, rv);
  assert.equal(prev.active, 0);
  for (const k of ['doses_taken', 'total_doses', 'expires_on', 'water_ml']) assert.equal(prev[k], old[k], `old vial ${k} unchanged`);
  const fresh = vialRow(db, newId);
  assert.deepEqual([fresh.doses_taken, fresh.total_doses, fresh.water_ml, fresh.expires_on, fresh.mixed_on, fresh.active], [0, 20, 10, '2027-10-31', null, 1]);
  assert.deepEqual(a.getActiveVials(USER).filter((v) => v.protocol_id === pid).map((v) => v.id), [newId], 'never two active');
  assert.deepEqual(logs(db), logsBefore);
  // blank: no date at all (never the old box's date — the bug this fixes)
  const blankId = NV.startNewVial(p, null, USER, a, { oldVial: fresh, expiresOn: null });
  assert.equal(vialRow(db, blankId).expires_on, null);
  // the line about the old vial: "The previous vial goes to your history, with its 2 leftover doses."
  assert.deepEqual(NV.oldVialNote({ type: 'rtu' }, old), { mixedOn: null, left: 2 });
  assert.equal(NV.oldVialNote({ type: 'rtu' }, { ...old, doses_taken: 20 }), null, 'no leftover: the second sentence goes');
});

test('EV-7 / EV-8: the page opens the window for both types; RTU shows the box pills blank; one save path', () => {
  const prot = read('screens/ProtocolsScreen.js');
  const ask = sliceBlock(prot, 'function askRefillVial(');
  assert.match(ask, /if \(p && \(p\.type === 'recon' \|\| p\.type === 'rtu'\)\) \{ openNewVialWindow\(p\); return; \}/);
  assert.doesNotMatch(prot, /function refillVial\(/, 'the old same-row reset is gone (rebuild = replace)');
  const save = sliceBlock(prot, 'async function saveNewVial(');
  assert.match(save, /p\.type === 'rtu'[\s\S]*startNewVial\(p, null, user\.id, \{ deactivateVialsByProtocol, insertVial, updateProtocol \}, \{ oldVial: vialsByProtocol\[p\.id\], expiresOn: boxExpiresOn\(expMonth, expYear\) \}\)/);
  assert.match(save, /afterProtocolChange\(\)/); assert.match(save, /requestSync\(\)/);
  const comp = read('screens/components/NewVialPrompt.js');
  assert.match(comp, /const rtu = protocol && protocol\.type === 'rtu';/);
  assert.match(comp, /\{rtu \? \(\s*<BoxExpiryField/);
  assert.match(comp, /setExpMonth\(null\); setExpYear\(null\);/, 'starts blank, never the old box date');
  assert.match(comp, /t\(pluralKey\('today_new_vial_prev', note\.left, language\)\)/);
  // results: "Novo frasco" for RTU waits for the first dose; Edit vial stays (full width alone)
  assert.equal(NV.showsNewVialButton({ type: 'rtu' }, { doses_taken: 0 }), false);
  assert.equal(VE.showsEditVialButton({ type: 'rtu' }, { doses_taken: 0 }), true);
});

test('EV-2 / EV-6: one edit window component, its texts and fields as drawn', () => {
  const comp = read('screens/components/NewVialPrompt.js');
  const edit = sliceBlock(comp, 'export function EditVialPrompt(');
  assert.match(edit, /t\('vial_edit_title'\)/);
  assert.match(edit, /t\('vial_edit_body'\)/);
  assert.match(edit, /<MixDateField/);
  assert.match(edit, /t\('protocols_vial_valid'\)/);
  assert.match(edit, /\{t\('protocols_vial_valid_hint'\)\} \{t\('vial_edit_valid_next'\)\}/);
  assert.match(edit, /t\('vial_edit_used'\)/);
  assert.match(edit, /t\('vial_edit_of'\)\.replace\('\{total\}', String\(capacity\)\)/);
  assert.match(edit, /capacity != null && \(/, 'no count: no doses field');
  assert.match(edit, /<BoxExpiryField/);
  assert.match(edit, /t\('cancel'\)[\s\S]*t\('save'\)/);
  assert.match(edit, /acceptValidDaysText\(val\)/); assert.match(edit, /acceptDosesUsedText\(val, capacity\)/);
  const prot = read('screens/ProtocolsScreen.js');
  assert.match(prot, /<EditVialPrompt\s+visible=\{!!editVialFor\}/);
  const save = sliceBlock(prot, 'async function saveVialEdit(');
  assert.match(save, /applyVialEdit\(p, vialsByProtocol\[p\.id\], input, new Date\(\), \{ updateVial, updateProtocol \}\)/);
  assert.match(save, /afterProtocolChange\(\)/, 'the expiry alert and the 7-day / day-of notices are re-planned');
  assert.match(save, /requestSync\(\)/);
});

// ── EV-9 / EV-10: words and themes ───────────────────────────────────────────────────────
function loadTranslations() {
  const src = read('i18n/translations.js');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
test('EV-9: the new words in all 6 languages, as approved in Portuguese and English', () => {
  const tr = loadTranslations();
  const pt = { vial_edit_title: 'Editar frasco', vial_edit_body: 'Corrija os dados deste frasco. As doses já registradas não mudam.', vial_edit_valid_next: 'Vale também para os próximos frascos deste protocolo.', vial_edit_used: 'Doses já usadas', vial_edit_of: 'de {total}', vial_edit_future_title: 'Data no futuro', vial_edit_future_body: 'A data da reconstituição não pode ser depois de hoje.', today_new_vial_prev: 'O frasco anterior vai para o histórico, com as {n} doses que sobraram.' };
  const en = { vial_edit_title: 'Edit vial', vial_edit_body: 'Correct this vial’s details. The doses already logged don’t change.', vial_edit_valid_next: 'Also applies to this protocol’s next vials.', vial_edit_used: 'Doses already used', vial_edit_of: 'of {total}', vial_edit_future_title: 'Date in the future', vial_edit_future_body: 'The mix date can’t be after today.', today_new_vial_prev: 'The previous vial goes to your history, with its {n} leftover doses.' };
  for (const [k, v] of Object.entries(pt)) assert.equal(tr.pt[k], v, `pt.${k}`);
  for (const [k, v] of Object.entries(en)) assert.equal(tr.en[k], v, `en.${k}`);
  for (const l of ['es', 'fr', 'de', 'it']) {
    for (const k of [...Object.keys(en), 'today_new_vial_prev_one']) {
      assert.ok(tr[l][k], `${l}.${k}`);
      assert.notEqual(tr[l][k], tr.en[k], `${l}.${k} translated`);
    }
    assert.match(tr[l].vial_edit_of, /\{total\}/);
    assert.match(tr[l].today_new_vial_prev_one, /\{n\}/);
  }
});

test('EV-10: both themes — the edit window and the button row use theme tokens only; the app type', () => {
  const comp = read('screens/components/NewVialPrompt.js');
  assert.doesNotMatch(comp, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/);
  assert.doesNotMatch(comp, /fontFamily/, 'type from lib/fonts.js: phone font below 22 pt, Geist for the 22 pt title');
  const prot = read('screens/ProtocolsScreen.js');
  for (const k of ['vbtns', 'vbtn']) {
    const at = prot.indexOf(`  ${k}: {`);
    assert.ok(at > 0, k);
    assert.doesNotMatch(prot.slice(at, prot.indexOf('\n', at)), /#|color/i);
  }
});
