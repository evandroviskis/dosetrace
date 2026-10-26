'use strict';
// A-132 (founder 2026-10-20, docs/design/a132-expired-vial-new-vial.html, spec docs/specs/a132-new-vial.md):
// an expired reconstituted vial that still has doses left could not be replaced — the alert opened the
// Protocols list, "New vial" there was for ready-to-use only, "+ Add vial" on Today only showed with no
// vial and "Log new vial" only after the last dose. Now:
//   screen 2 (A): "+ New vial" on Today's card when the vial is past its window;
//   screen 3: "New vial" on the protocol page for reconstituted vials too (any active vial);
//   screen 4: the "New vial" window (title, body + a line about the old vial, Cancel / Start new);
//   the one-vial alert opens that protocol's page; starting a new vial retires the old one with its
//   doses as they were (never rewritten) — one write path, the one Today used after the last dose.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud, seedSyncedProtocol } = require('./helpers/syncHarness');
const { loadFn, read, sliceBlock } = require('./helpers/extractFn');
const { markTakenDay, planMarkTaken } = require('../lib/markTaken');
const { pushPending } = require('../lib/syncCore');
const NV = require('../lib/newVial');

const USER = 'user-A';

function app(db) {
  const getDB = () => db;
  const fromDb = (name) => loadFn('lib/database.js', `export function ${name}(`, name, { getDB });
  const f = {};
  for (const n of ['getProtocolById', 'getActiveVials', 'insertVial', 'updateVial', 'deactivateVialsByProtocol', 'insertDoseLog', 'updateDoseLog', 'deleteDoseLog', 'getLogsSince', 'doseLogBySourceKey', 'withImmediateTransaction', 'recordDoseTapKey']) f[n] = fromDb(n);
  f.updateProtocol = () => {};
  f.recordDoseTaken = loadFn('lib/doseActions.js', 'export function recordDoseTaken(', 'recordDoseTaken', { ...f, markTakenDay, planMarkTaken });
  return f;
}

// The review account's case: Tirzepatide mixed Sep 13, 30-day window, 4 doses, 1 used.
function tirzepatide(db) {
  const id = seedSyncedProtocol(db, USER, { remote_id: 'p-tirz', updated_at: '000001', name: 'Tirzepatide' });
  db.runSync(`UPDATE protocols SET amount = '10', unit = 'mg', dose = '2.5', dose_unit = 'mg', water = '1', interval_days = 7, vial_valid_days = 30, start_date = '2026-09-13' WHERE id = ?`, [id]);
  const vialId = db.runSync(
    `INSERT INTO vials (remote_id, user_id, protocol_id, protocol_remote_id, mixed_on, water_ml, total_doses, doses_taken, active, created_at, updated_at, sync_status)
     VALUES ('v-old', ?, ?, 'p-tirz', '2026-09-13', 1, 4, 1, 1, '2026-09-13T08:00:00.000Z', '000001', 'synced')`, [USER, id]).lastInsertRowId;
  db.runSync(
    `INSERT INTO dose_logs (remote_id, user_id, protocol_id, protocol_remote_id, outcome, logged_at, injection_site, updated_at, sync_status)
     VALUES ('d-1', ?, ?, 'p-tirz', 'Taken', '2026-09-13T08:05:00.000Z', 'abdomen_left', '000001', 'synced')`, [USER, id]);
  return { id, vialId, protocol: db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [id]) };
}
const vialRow = (db, id) => db.getFirstSync('SELECT * FROM vials WHERE id = ?', [id]);
const logs = (db) => db.getAllSync(`SELECT id, remote_id, protocol_id, outcome, logged_at, injection_site, sync_status FROM dose_logs WHERE sync_status != 'deleted' ORDER BY id`);

// ── NV-5 / NV-6: the data rule ─────────────────────────────────────────────────────────────
test('NV-6: a new vial over an expired one with doses left never rewrites the old vial or its doses', () => {
  const db = makeDb(); const a = app(db); const { id, vialId, protocol } = tirzepatide(db);
  const before = vialRow(db, vialId);
  const logsBefore = logs(db);
  const newId = NV.startNewVial(protocol, '2026-10-20', USER, a);
  const old = vialRow(db, vialId);
  assert.equal(old.active, 0, 'the old vial leaves use (history)');
  for (const k of ['doses_taken', 'total_doses', 'mixed_on', 'water_ml', 'remote_id', 'protocol_id', 'created_at']) {
    assert.equal(old[k], before[k], `old vial ${k} unchanged`);
  }
  assert.deepEqual(logs(db), logsBefore, 'the dose history is untouched');
  const fresh = vialRow(db, newId);
  assert.equal(fresh.mixed_on, '2026-10-20');
  assert.equal(fresh.doses_taken, 0);
  assert.equal(fresh.total_doses, 4, '10 mg / 2.5 mg');
  assert.equal(fresh.active, 1);
  const active = a.getActiveVials(USER).filter((v) => v.protocol_id === id);
  assert.deepEqual(active.map((v) => v.id), [newId], 'never two active vials');
});

test('NV-6: the old and the new vial reach the cloud through syncCore, the old one with its 1 dose used', async () => {
  const db = makeDb(); const a = app(db); const cloud = makeCloud();
  const { protocol } = tirzepatide(db);
  cloud._store.protocols.set('p-tirz', { id: 'p-tirz', user_id: USER, name: 'Tirzepatide', updated_at: '000001' });
  cloud._store.vials.set('v-old', { id: 'v-old', user_id: USER, protocol_id: 'p-tirz', mixed_on: '2026-09-13', total_doses: 4, doses_taken: 1, active: true, updated_at: '000001' });
  NV.startNewVial(protocol, '2026-10-20', USER, a);
  await pushPending(db, cloud, USER);
  const rows = cloud.rows('vials', USER);
  const old = rows.find((r) => r.id === 'v-old');
  assert.ok(old, 'the old vial is still in the cloud');
  assert.equal(Number(old.doses_taken), 1);
  assert.equal(old.mixed_on, '2026-09-13');
  assert.ok(!old.active, 'pushed as out of use');
  const fresh = rows.find((r) => r.id !== 'v-old');
  assert.ok(fresh && fresh.mixed_on === '2026-10-20' && Number(fresh.doses_taken) === 0 && !!fresh.active);
  assert.equal(db.getAllSync(`SELECT * FROM vials WHERE sync_status = 'pending'`).length, 0, 'both pushed');
});

// Data review 2026-10-26 (finding 2): retire + insert were two separate writes — a failure in
// between left the protocol with no active vial and lost the typed date. Now all or nothing.
test('NV-6 (review): a failing insert rolls the old vial back into use (one transaction)', () => {
  const db = makeDb(); const a = app(db); const { id, vialId, protocol } = tirzepatide(db);
  const before = vialRow(db, vialId);
  const failing = { ...a, insertVial: (v) => { a.insertVial(v); throw new Error('disk I/O'); } };
  assert.throws(() => NV.startNewVial(protocol, '2026-10-20', USER, failing), /disk I\/O/);
  assert.deepEqual(vialRow(db, vialId), before, 'the old vial is still the active one, unchanged');
  assert.deepEqual(a.getActiveVials(USER).filter((v) => v.protocol_id === id).map((v) => v.id), [vialId], 'no half-written vial');
  assert.equal(db.getAllSync('SELECT * FROM vials').length, 1);
  assert.match(sliceBlock(read('lib/newVial.js'), 'function startNewVial('), /db\.withImmediateTransaction\(/);
});

// Data review 2026-10-26 (finding 3): a double tap on "Start new" / "Save" ran the save twice
// (each awaits the user before writing) — two vials, the first retired at once, an empty ghost
// synced forever. The primary button takes a latch once per opening; an error shown inside the
// window frees it (so the person can correct and try again); closing and reopening frees it.
test('NV-5 (review): one save per opening of the window — a double tap writes once', () => {
  const { createOpenLatch } = require('../lib/busyGuard');
  const latch = createOpenLatch();
  assert.equal(latch.take(), true, 'first tap');
  assert.equal(latch.take(), false, 'second tap while saving / fading out: ignored');
  latch.release();
  assert.equal(latch.take(), true, 'after an error sheet or a new opening');
  const comp = read('screens/components/NewVialPrompt.js');
  for (const fn of ['export default function NewVialPrompt(', 'export function EditVialPrompt(']) {
    const body = sliceBlock(comp, fn);
    assert.match(body, /const latch = useRef\(createOpenLatch\(\)\)\.current;/, fn);
    assert.match(body, /useEffect\(\(\) => \{ if \(visible\) latch\.release\(\); \}, \[visible\]\);/, `${fn} frees on open`);
    assert.match(body, /useEffect\(\(\) => \{ if \(sheet\) latch\.release\(\); \}, \[sheet\]\);/, `${fn} frees on an error`);
    assert.match(body, /onPrimary=\{\(\) => \{ if \(!latch\.take\(\)\) return;/, `${fn} primary button`);
  }
  // the Today path: one tap = one vial (the queue of the second call never reaches the database)
  const db = makeDb(); const a = app(db); const { protocol } = tirzepatide(db);
  const tap = () => { if (latch.take()) NV.startNewVial(protocol, '2026-10-20', USER, a); };
  latch.release(); tap(); tap();
  assert.equal(db.getAllSync('SELECT * FROM vials').length, 2, 'the old vial + ONE new vial');
});

test('NV-5: the last-dose path is the same write — the finished vial stays as the dose left it', () => {
  const db = makeDb(); const a = app(db); const { vialId, protocol } = tirzepatide(db);
  db.runSync('UPDATE vials SET doses_taken = 3 WHERE id = ?', [vialId]);
  const res = a.recordDoseTaken(protocol.id, { atNow: true });
  assert.equal(res.vialFinished, true);
  const finished = vialRow(db, vialId);
  assert.equal(finished.active, 0);
  assert.equal(finished.doses_taken, 4);
  const newId = NV.startNewVial(protocol, '2026-10-20', USER, a);
  assert.equal(vialRow(db, vialId).doses_taken, 4, 'finished vial untouched');
  assert.deepEqual(a.getActiveVials(USER).map((v) => v.id), [newId]);
});

test('NV-5: Today and the protocol page both write through lib/newVial startNewVial (one path)', () => {
  const today = read('screens/TodayScreen.js');
  const create = sliceBlock(today, 'async function createNewVial(');
  assert.match(create, /startNewVial\(continuationProtocol, mixDate, user\.id, \{ deactivateVialsByProtocol, insertVial, updateProtocol, withImmediateTransaction \}\)/);
  assert.doesNotMatch(create, /newVialRecords|insertVial\(vial\)/, 'no second write in Today');
  assert.match(create, /afterProtocolChange\(\)/);
  const prot = read('screens/ProtocolsScreen.js');
  const save = sliceBlock(prot, 'async function saveNewVial('); // AD-80: one save for both vial types
  assert.match(save, /startNewVial\(p, mixDate, user\.id, \{ deactivateVialsByProtocol, insertVial, updateProtocol, withImmediateTransaction \}\)/);
  assert.match(save, /afterProtocolChange\(\)/);
  assert.match(save, /requestSync\(\)/);
  const start = sliceBlock(read('lib/newVial.js'), 'function startNewVial(');
  assert.ok(start.indexOf('deactivateVialsByProtocol(') < start.indexOf('insertVial('), 'old vial out of use before the new one goes in');
  assert.doesNotMatch(start, /doses_taken|updateVial|dose_logs/, 'never rewrites a count or a dose');
});

// ── NV-1: Today's card ───────────────────────────────────────────────────────────────────
test('NV-1: "+ New vial" shows on Today\'s card only when a reconstituted vial is past its window', () => {
  const p = { type: 'recon', vial_valid_days: 30, amount: '10', unit: 'mg', dose: '2.5', dose_unit: 'mg' };
  const v = { mixed_on: '2026-09-13', total_doses: 4, doses_taken: 1 };
  assert.equal(NV.vialPastWindow(p, v, new Date(2026, 9, 20)), true, 'Oct 20: 7 days past');
  assert.equal(NV.vialPastWindow(p, v, new Date(2026, 9, 13)), true, 'Oct 13: the last day of the window reads Past window');
  assert.equal(NV.vialPastWindow(p, v, new Date(2026, 9, 12)), false, '1 day left');
  assert.equal(NV.vialPastWindow({ ...p, vial_valid_days: null }, v, new Date(2026, 9, 12)), false, 'default 30 days');
  assert.equal(NV.vialPastWindow(p, null, new Date(2026, 9, 20)), false, 'no vial: "+ Add vial" instead');
  assert.equal(NV.vialPastWindow(p, { ...v, mixed_on: null }, new Date(2026, 9, 20)), false);
  assert.equal(NV.vialPastWindow({ ...p, type: 'rtu' }, v, new Date(2026, 9, 20)), false, 'ready-to-use: not this card');
  const today = read('screens/TodayScreen.js');
  const at = today.indexOf("t('today_new_vial')");
  assert.ok(at > 0, 'the card draws the control');
  const ctl = today.slice(today.lastIndexOf('<TouchableOpacity', at), at + 40);
  assert.match(ctl, /vialPastWindow\(p, vial, new Date\(\)\)|style=\{s\.newVialBtn\}/);
  assert.match(ctl, /onPress=\{\(\) => showVialPromptFor\(p\)\}/);
  assert.match(ctl, /<Text style=\{s\.addVialText\}>\{t\('today_new_vial'\)\}<\/Text>/, 'same type as "+ Add vial" (one set)');
  assert.match(today, /\{pastWindow && \(\s*<TouchableOpacity style=\{s\.newVialBtn\}/);
  assert.match(today, /const pastWindow = vialPastWindow\(p, vial, new Date\(\)\);/);
  assert.match(today, /newVialBtn: \{ flexBasis: '100%', minHeight: 32, justifyContent: 'center' \}/);
});

// ── NV-2: the protocol page ──────────────────────────────────────────────────────────────
test('NV-2: "New vial" on the protocol page for every active reconstituted vial (expired or not); RTU unchanged', () => {
  const recon = { type: 'recon' }; const rtu = { type: 'rtu' };
  assert.equal(NV.showsNewVialButton(recon, { doses_taken: 1 }), true);
  assert.equal(NV.showsNewVialButton(recon, { doses_taken: 0 }), true, 'recon: any active vial');
  assert.equal(NV.showsNewVialButton(recon, null), false);
  assert.equal(NV.showsNewVialButton(rtu, { doses_taken: 1 }), true);
  assert.equal(NV.showsNewVialButton(rtu, { doses_taken: 0 }), false, 'RTU: as before, only a used vial');
  assert.equal(NV.showsNewVialButton({ type: 'oral' }, { doses_taken: 2 }), false);
  const prot = read('screens/ProtocolsScreen.js');
  const block = sliceBlock(prot, 'function ProtocolVialBlock(');
  assert.match(block, /\{showsNewVialButton\(p, vial\) && \(\s*<TouchableOpacity style=\{\[s\.obtn2, s\.vbtn\]\} onPress=\{\(\) => onRefillVial\(p\.id\)\}/);
  assert.match(block, /<FeatureIcon name="repeat" size=\{18\} color=\{c\.ink\} \/>\s*<Text style=\{s\.obtn2Text\}>\{t\('protocols_new_vial'\)\}<\/Text>/);
  // A recon vial opens the "New vial" window; RTU keeps its confirm sheet.
  const ask = sliceBlock(prot, 'function askRefillVial(');
  // (AD-80: ready-to-use opens the same window, asking the new box's month/year.)
  assert.match(ask, /if \(p && \(p\.type === 'recon' \|\| p\.type === 'rtu'\)\) \{ openNewVialWindow\(p\); return; \}/);
  assert.match(prot, /<NewVialPrompt\s+visible=\{!!newVialFor\}\s+mode="new"/);
  // Today's book page (Fold): a recon vial's "New vial" opens Today's own window.
  const today = read('screens/TodayScreen.js');
  assert.match(today, /onRefillVial=\{p\.type === 'recon' \? \(\) => showVialPromptFor\(p\) : toProtocol\}/);
});

// ── NV-3: the "New vial" window ──────────────────────────────────────────────────────────
test('NV-3: the window says "New vial" (Cancel / Start new) when asked for; after the last dose it is unchanged', () => {
  assert.deepEqual(NV.vialPromptKeys('new'), { title: 'protocols_new_vial', sub: 'protocols_new_vial_body', secondary: 'cancel', primary: 'protocols_start_new' });
  assert.deepEqual(NV.vialPromptKeys('finished'), { title: 'today_vial_done_title', sub: 'today_vial_done_sub', secondary: 'today_vial_finished', primary: 'today_vial_add' });
  // the line about the old vial (the review case: Sep 13, 3 doses left)
  const p = { type: 'recon', amount: '10', unit: 'mg', dose: '2.5', dose_unit: 'mg' };
  assert.deepEqual(NV.oldVialNote(p, { mixed_on: '2026-09-13', total_doses: 4, doses_taken: 1 }), { mixedOn: '2026-09-13', left: 3 });
  assert.deepEqual(NV.oldVialNote(p, { mixed_on: '2026-09-13', total_doses: 4, doses_taken: 4 }), { mixedOn: '2026-09-13', left: null }, 'no leftover: date only');
  assert.deepEqual(NV.oldVialNote({ type: 'recon' }, { mixed_on: '2026-09-13', doses_taken: 1 }), { mixedOn: '2026-09-13', left: null }, 'unknown capacity: date only');
  assert.equal(NV.oldVialNote(p, null), null, '"+ Add vial": no old vial, no line');
  // no mix date (AD-80): "the previous vial", with its leftover doses
  assert.deepEqual(NV.oldVialNote(p, { mixed_on: null, total_doses: 4, doses_taken: 1 }), { mixedOn: null, left: 3 });
  const comp = read('screens/components/NewVialPrompt.js');
  assert.match(comp, /const keys = vialPromptKeys\(mode\);/);
  assert.match(comp, /mode === 'new' \? oldVialNote\(protocol, oldVial\) : null/);
  assert.match(comp, /t\(pluralKey\('today_new_vial_old', note\.left, language\)\)/);
  assert.match(comp, /t\('today_new_vial_old_date'\)/);
  assert.match(comp, /secondary=\{t\(keys\.secondary\)\} onSecondary=\{onSecondary\}\s*primary=\{t\(keys\.primary\)\} onPrimary=\{\(\) => \{ if \(!latch\.take\(\)\) return; onPrimary\(\{ month: newVialMonth, day: newVialDay, expMonth, expYear \}\); \}\}/);
  assert.match(sliceBlock(comp, 'function Actions('), /onPress=\{onSecondary\}[\s\S]*\{secondary\}[\s\S]*onPress=\{onPrimary\}[\s\S]*\{primary\}/);
  // Today: "+ Add vial" and "+ New vial" open the "new" window; only the last-dose queue opens "finished".
  const today = read('screens/TodayScreen.js');
  assert.match(sliceBlock(today, 'function releasePendingVial('), /showVialPromptFor\(next\.item\.protocol, 0, 'finished'\)/);
  assert.match(sliceBlock(today, 'function showVialPromptFor('), /setVialPromptMode\(mode\);/);
  assert.match(today, /function showVialPromptFor\(protocol, delayMs = 0, mode = 'new'\)/);
  assert.match(today, /mode=\{vialPromptMode\}/);
  assert.match(today, /oldVial=\{continuationProtocol \? vials\[continuationProtocol\.id\] : null\}/);
});

// ── NV-4: the alert ──────────────────────────────────────────────────────────────────────
test('NV-4: the expired-vial alert for one vial opens that protocol\'s page; several open the list', () => {
  assert.deepEqual(NV.vialAlertTarget([{ protocolId: 7 }]), { screen: 'Protocols', params: { openProtocolId: 7 } });
  assert.deepEqual(NV.vialAlertTarget([{ protocolId: 7 }, { protocolId: 9 }]), { screen: 'Protocols', params: undefined });
  const today = read('screens/TodayScreen.js');
  assert.match(today, /exp\.push\(\{ name: p\.compound_id \? t\(p\.compound_id\) : p\.name, daysLeft, protocolId: p\.id \}\);/);
  assert.match(today, /const target = vialAlertTarget\(exp\);/);
  assert.match(today, /onPress: \(\) => navigation\.navigate\(target\.screen, target\.params\),\s*snoozeId: 'vial_expiry'/);
});

// ── NV-8: the words, 6 languages ─────────────────────────────────────────────────────────
function loadTranslations() {
  const src = read('i18n/translations.js');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
test('NV-8: the new words exist in all 6 languages, natively written, with their singular form', () => {
  const tr = loadTranslations();
  assert.equal(tr.en.today_new_vial, '+ New vial');
  assert.equal(tr.pt.today_new_vial, '+ Novo frasco');
  assert.equal(tr.pt.today_new_vial_old, 'O frasco de {date} vai para o histórico, com as {n} doses que sobraram.');
  assert.equal(tr.en.today_new_vial_old, 'The {date} vial goes to your history, with its {n} leftover doses.');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of ['today_new_vial', 'today_new_vial_old', 'today_new_vial_old_one', 'today_new_vial_old_date']) {
      assert.ok(tr[l][k], `${l}.${k}`);
      if (l !== 'en') assert.notEqual(tr[l][k], tr.en[k], `${l}.${k} translated`);
    }
    for (const k of ['today_new_vial_old', 'today_new_vial_old_one']) {
      assert.match(tr[l][k], /\{date\}/); assert.match(tr[l][k], /\{n\}/);
    }
    assert.match(tr[l].today_new_vial_old_date, /\{date\}/);
    assert.doesNotMatch(tr[l].today_new_vial_old_date, /\{n\}/);
    assert.ok(tr[l].today_new_vial.startsWith('+ '), `${l}: same "+ " shape as "+ Add vial"`);
    // the control's noun is the language's own "New vial" noun on the protocol page
    assert.ok(tr[l].today_new_vial.slice(2).toLowerCase() === tr[l].protocols_new_vial.toLowerCase(), `${l}: one term per concept`);
  }
  for (const k of ['today_new_vial', 'today_new_vial_old', 'today_new_vial_old_one', 'today_new_vial_old_date']) {
    assert.doesNotMatch(tr.pt[k], /a gente|dá para|Não deu/i, 'formal Portuguese');
  }
});

// ── NV-9 / NV-10: both themes and the app's type (the light + dark render pass is a device check) ──
test('NV-9: the window and the new controls use theme tokens only (both palettes resolve)', () => {
  const comp = read('screens/components/NewVialPrompt.js');
  assert.doesNotMatch(comp, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/, 'no raw colour in the window');
  assert.match(comp, /const \{ colors \} = useTheme\(\);/);
  const today = read('screens/TodayScreen.js');
  const at = today.indexOf('  newVialBtn: {');
  const btn = today.slice(at, today.indexOf('\n', at));
  assert.doesNotMatch(btn, /color|#/i, 'the control box draws no colour of its own');
});
test('NV-10: "+ New vial" is the "+ Add vial" type — the phone font below 22 pt (lib/fonts.js), one set', () => {
  const today = read('screens/TodayScreen.js');
  assert.match(today, /addVialText: \{ fontSize: 17, color: c\.ink, textDecorationLine: 'underline', textDecorationColor: c\.tick/);
  assert.equal((today.match(/<Text style=\{s\.addVialText\}>\{t\('today_(add|new)_vial'\)\}<\/Text>/g) || []).length, 2, 'both controls, one style');
  assert.doesNotMatch(today.slice(at0(today), at0(today) + 120), /fontFamily/, 'no font of its own');
  function at0(src) { return src.indexOf('  addVialText: {'); }
});
