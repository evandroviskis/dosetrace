'use strict';
// Dose mark and observation, option B (founder 2026-11-24 13:02 / 13:06 EST; picture
// docs/design/dose-jejum-refeicao-treino.html; checklist docs/specs/dose-observation.md DO-1..DO-29).
// A completed dose may carry "Em jejum" or "Com refeição" and a free observation, set afterwards in the
// dose sheet; per protocol, "Repetir nas próximas doses" copies them into every new completed dose.
// Written before the code (CLAUDE.md evolution rule 1): every test here failed first.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeDb, makeCloud, seedSyncedProtocol } = require('./helpers/syncHarness');
const { loadFn, sliceBlock } = require('./helpers/extractFn');
const { pushPending, pullChanges, fullImport, TABLES } = require('../lib/syncCore');
const { toCloudPayload, CLEARABLE_COLUMNS } = require('../lib/syncMappers');
const MT = require('../lib/markTaken');
const PE = require('../lib/protocolEnd');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const OBS = () => require('../lib/doseObservation');
function loadTranslations() {
  const src = read('i18n/translations.js');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const TR = loadTranslations();
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const tFor = (lang) => (k) => (TR[lang][k] != null ? TR[lang][k] : k);
const pt = tFor('pt');
const USER = 'user-obs';
const fromDb = (db, name, extra = {}) => loadFn('lib/database.js', `export function ${name}(`, name, { getDB: () => db, PE, ...dbObs(), ...extra });
const dbObs = () => { const O = OBS(); return { cleanContext: O.cleanContext, cleanNote: O.cleanNote }; };
const cols = (db, t) => db.getAllSync(`PRAGMA table_info(${t})`).map((c) => c.name);
const LOG = read('screens/LogScreen.js');
const TODAY = read('screens/TodayScreen.js');
const COMP = () => read('screens/components/DoseObservation.js');

function seedDose(db, pid, over = {}) {
  return db.runSync(
    `INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, dose_context, dose_note, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [USER, pid, over.protocol_remote_id || 'p-1', over.outcome || 'Taken', over.logged_at || '2026-11-24T10:00:00.000Z', over.dose_context ?? null, over.dose_note ?? null, over.updated_at || '2026-11-24T10:00:00.000Z', over.sync_status || 'pending'],
  ).lastInsertRowId;
}
const dl = (db, id) => db.getFirstSync('SELECT * FROM dose_logs WHERE id = ?', [id]);
const missing = (table, col) => ({ data: null, error: { code: 'PGRST204', message: `Could not find the '${col}' column of '${table}' in the schema cache` } });
const NEW = { dose_logs: ['dose_context', 'dose_note'], protocols: ['repeat_dose_context', 'repeat_dose_note'] };
// A cloud whose tables do not have the new columns yet (the migration is not applied).
function unmigratedCloud() {
  const cloud = makeCloud();
  const state = { migrated: false };
  const ins = cloud.insert.bind(cloud);
  const upd = cloud.update.bind(cloud);
  const lacks = (t, p) => !state.migrated && (NEW[t] || []).find((c) => c in p);
  cloud.insert = async (t, p, ...rest) => { const c = lacks(t, p); return c ? missing(t, c) : ins(t, p, ...rest); };
  cloud.update = async (t, rid, p, ...rest) => { const c = lacks(t, p); return c ? missing(t, c) : upd(t, rid, p, ...rest); };
  return { cloud, state };
}

// ── Data and sync ─────────────────────────────────────────────────────────────

test('DO-1: the local schema has the four columns, new install and upgrade', () => {
  const db = makeDb();
  for (const c of NEW.dose_logs) assert.ok(cols(db, 'dose_logs').includes(c), c);
  for (const c of NEW.protocols) assert.ok(cols(db, 'protocols').includes(c), c);
  // An older install: the columns are added on start (initDatabase runs the upgrade).
  const { upgradeDoseObservation } = require('../lib/schema');
  const old = makeDb();
  const raw = old._raw;
  raw.exec('ALTER TABLE dose_logs DROP COLUMN dose_context; ALTER TABLE dose_logs DROP COLUMN dose_note; ALTER TABLE protocols DROP COLUMN repeat_dose_context; ALTER TABLE protocols DROP COLUMN repeat_dose_note;');
  upgradeDoseObservation(old);
  upgradeDoseObservation(old); // twice is harmless
  for (const c of NEW.dose_logs) assert.ok(cols(old, 'dose_logs').includes(c), c);
  for (const c of NEW.protocols) assert.ok(cols(old, 'protocols').includes(c), c);
  assert.match(read('lib/database.js'), /upgradeDoseObservation\(db\);/, 'initDatabase runs it');
});

test('DO-2: a dose row always sends dose_context and dose_note, NULL included; a protocol its repeat columns', () => {
  assert.deepEqual(CLEARABLE_COLUMNS.dose_logs, ['dose_context', 'dose_note']);
  for (const c of NEW.protocols) assert.ok(CLEARABLE_COLUMNS.protocols.includes(c), c);
  const base = { outcome: 'Taken', logged_at: 'x', protocol_remote_id: 'p' };
  const set = toCloudPayload('dose_logs', { ...base, dose_context: 'fasted', dose_note: 'Antes da yoga' });
  assert.equal(set.dose_context, 'fasted');
  assert.equal(set.dose_note, 'Antes da yoga');
  const cleared = toCloudPayload('dose_logs', { ...base, dose_context: null, dose_note: null });
  assert.ok('dose_context' in cleared && cleared.dose_context === null, 'a removed mark is sent as NULL');
  assert.ok('dose_note' in cleared && cleared.dose_note === null, 'a cleared observation is sent as NULL');
  const p = toCloudPayload('protocols', { name: 'L', remote_id: 'r', repeat_dose_context: null, repeat_dose_note: null });
  assert.ok('repeat_dose_context' in p && p.repeat_dose_context === null);
  assert.ok('repeat_dose_note' in p && p.repeat_dose_note === null);
  assert.equal(toCloudPayload('protocols', { name: 'L', remote_id: 'r', repeat_dose_context: 'meal', repeat_dose_note: 'x' }).repeat_dose_context, 'meal');
});

test('DO-3: pull writes the cloud\'s values, NULL included; a cloud without the key keeps the local ones', async () => {
  const cloud = makeCloud();
  const db = makeDb();
  const pid = seedSyncedProtocol(db, USER, { remote_id: 'p-1', updated_at: '000001' });
  const id = seedDose(db, pid, { dose_context: 'fasted', dose_note: 'Antes da yoga' });
  await pushPending(db, cloud, USER);
  const remote = cloud.rows('dose_logs', USER)[0];
  assert.equal(remote.dose_context, 'fasted');
  assert.equal(remote.dose_note, 'Antes da yoga');
  // Changed in the cloud (another session of the same phone's account): NULL included.
  await cloud.update('dose_logs', remote.id, { dose_context: 'meal', dose_note: null });
  await pullChanges(db, cloud, USER);
  assert.equal(dl(db, id).dose_context, 'meal');
  assert.equal(dl(db, id).dose_note, null, 'a cloud NULL is written (a cleared observation)');
  // A cloud row without the key (an older server copy) leaves the local values.
  const r = cloud.rows('dose_logs', USER)[0];
  const { dose_context, dose_note, ...without } = r; // eslint-disable-line no-unused-vars
  cloud._store.dose_logs.set(r.id, { ...without, injection_site: 'left', updated_at: cloud._stamp() });
  await pullChanges(db, cloud, USER);
  assert.equal(dl(db, id).injection_site, 'left');
  assert.equal(dl(db, id).dose_context, 'meal', 'no key: the local mark stays');
  // A reinstall gets them back (import).
  await cloud.update('dose_logs', r.id, { dose_context: 'fasted', dose_note: 'Antes de dormir' });
  const fresh = makeDb();
  seedSyncedProtocol(fresh, USER, { remote_id: 'p-1', updated_at: '000001' });
  await pullChanges(fresh, cloud, USER);
  const got = fresh.getFirstSync('SELECT dose_context, dose_note FROM dose_logs');
  assert.deepEqual({ ...got }, { dose_context: 'fasted', dose_note: 'Antes de dormir' }, 'a reinstall gets them back');
});

test('DO-3: the protocol\'s repeat columns come down on a pull and an import, NULL included', async () => {
  const cloud = makeCloud();
  const db = makeDb();
  const pid = db.runSync(`INSERT INTO protocols (user_id, name, type, color, dose, dose_unit, interval_days, doses_per_day, active, repeat_dose_context, repeat_dose_note, created_at, updated_at, sync_status) VALUES (?, 'L-Carnitina', 'oral', '#185FA5', '2', 'caps', 1, 1, 1, 'fasted', 'Antes da yoga', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z', 'pending')`, [USER]).lastInsertRowId;
  await pushPending(db, cloud, USER);
  const rp = cloud.rows('protocols', USER)[0];
  assert.equal(rp.repeat_dose_context, 'fasted');
  assert.equal(rp.repeat_dose_note, 'Antes da yoga');
  await cloud.update('protocols', rp.id, { repeat_dose_context: null, repeat_dose_note: null });
  await pullChanges(db, cloud, USER);
  const p = db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [pid]);
  assert.equal(p.repeat_dose_context, null, 'repeat switched off in the cloud comes down');
  assert.equal(p.repeat_dose_note, null);
  await cloud.update('protocols', rp.id, { repeat_dose_context: 'meal', repeat_dose_note: 'Almoço' });
  const fresh = makeDb();
  await fullImport(fresh, cloud, USER);
  const f = fresh.getFirstSync('SELECT repeat_dose_context, repeat_dose_note FROM protocols');
  assert.deepEqual({ ...f }, { repeat_dose_context: 'meal', repeat_dose_note: 'Almoço' });
});

test('DO-4: before the migration the push never fails, the values wait on the phone and go up once accepted; a NULL is never re-sent', async () => {
  const { cloud, state } = unmigratedCloud();
  const db = makeDb();
  const pid = seedSyncedProtocol(db, USER, { remote_id: 'p-1', updated_at: '000001' });
  // The cloud knows the protocol (it was pushed before this version).
  cloud._store.protocols.set('p-1', { id: 'p-1', user_id: USER, name: 'X', type: 'recon', updated_at: cloud._stamp() });
  const a = seedDose(db, pid, { dose_context: 'fasted', dose_note: 'Antes da yoga' });
  const b = seedDose(db, pid, { logged_at: '2026-11-23T10:00:00.000Z' }); // nothing marked
  db.runSync("UPDATE protocols SET repeat_dose_context = 'fasted', repeat_dose_note = 'Antes da yoga', sync_status = 'pending' WHERE id = ?", [pid]);
  await pushPending(db, cloud, USER);
  assert.equal(dl(db, a).sync_status, 'synced', 'the push did not fail');
  assert.equal(dl(db, b).sync_status, 'synced');
  assert.equal(db.getFirstSync('SELECT sync_status FROM protocols WHERE id = ?', [pid]).sync_status, 'synced');
  const ra = cloud.rows('dose_logs', USER).find((r) => r.id === dl(db, a).remote_id);
  assert.equal(ra.dose_context, undefined, 'the cloud has no column yet');
  assert.match(dl(db, a).optional_pending || '', /dose_context/);
  assert.match(dl(db, a).optional_pending || '', /dose_note/);
  assert.equal(dl(db, b).optional_pending, null, 'a NULL waits for nothing');
  // A pull of the row without the column keeps the phone's values.
  cloud._store.dose_logs.set(ra.id, { ...ra, injection_site: 'left', updated_at: cloud._stamp() });
  await pullChanges(db, cloud, USER);
  assert.equal(dl(db, a).dose_context, 'fasted');
  assert.equal(dl(db, a).dose_note, 'Antes da yoga');
  // The founder applies the migration: NULL on every row; a pull before the re-send never clobbers.
  state.migrated = true;
  for (const t of ['dose_logs', 'protocols']) for (const r of cloud.rows(t, USER)) cloud._store[t].set(r.id, { ...r, ...Object.fromEntries(NEW[t].map((c) => [c, null])), updated_at: cloud._stamp() });
  await pullChanges(db, cloud, USER);
  assert.equal(dl(db, a).dose_context, 'fasted', 'a value still waiting to go up is never clobbered');
  assert.equal(db.getFirstSync('SELECT repeat_dose_note FROM protocols WHERE id = ?', [pid]).repeat_dose_note, 'Antes da yoga');
  await pushPending(db, cloud, USER);
  const after = cloud.rows('dose_logs', USER).find((r) => r.id === dl(db, a).remote_id);
  assert.equal(after.dose_context, 'fasted', 're-sent once accepted');
  assert.equal(after.dose_note, 'Antes da yoga');
  assert.equal(cloud._store.protocols.get('p-1').repeat_dose_context, 'fasted');
  assert.equal(dl(db, a).optional_pending, null);
});

test('DO-5: the migration is additive and the purge trigger blanks the repeat columns', () => {
  const sql = read('supabase/migrations/20261124000000_dose_observation.sql');
  assert.match(sql, /alter table public\.dose_logs add column if not exists dose_context text/i);
  assert.match(sql, /alter table public\.dose_logs add column if not exists dose_note text/i);
  assert.match(sql, /alter table public\.protocols add column if not exists repeat_dose_context text/i);
  assert.match(sql, /alter table public\.protocols add column if not exists repeat_dose_note text/i);
  assert.match(sql, /check \(dose_context is null or dose_context in \('fasted', 'meal'\)\)/i);
  assert.doesNotMatch(sql, /\bdrop\b(?![^\n]*ROLLBACK)(?![^\n]*if exists (dose_context|dose_note|repeat_dose_context|repeat_dose_note))/i, 'nothing is dropped (only in the rollback note)');
  assert.doesNotMatch(sql, /^\s*(update public\.dose_logs|delete from)/im, 'no data change');
  assert.doesNotMatch(sql, /create policy|drop policy|disable row level security/i, 'RLS unaffected');
  assert.match(sql, /new\.repeat_dose_context := null;/);
  assert.match(sql, /new\.repeat_dose_note := null;/);
  assert.match(sql, /NOT APPLIED/);
});

test('DO-5: the tombstone push carries no repeat value', () => {
  const src = read('lib/syncCore.js');
  const fn = sliceBlock(src, 'async function insertTombstone(');
  assert.match(fn, /delete payload\.repeat_dose_context; delete payload\.repeat_dose_note;/);
});

// ── The take paths ──────────────────────────────────────────────────────────────

const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();
const NOW = local(2026, 11, 24, 7, 2);
function fakeTake({ protocol, logs = [] }) {
  const calls = [];
  const O = OBS();
  return {
    calls,
    run: (opts) => loadFn('lib/doseActions.js', 'export function recordDoseTaken(', 'recordDoseTaken', {
      getProtocolById: (id) => (protocol.id === id ? protocol : null),
      getLogsSince: () => logs,
      getActiveVials: () => [],
      insertDoseLog: (row) => { calls.push(['insert', row]); return 100; },
      updateDoseLog: (id, f) => calls.push(['update', id, f]),
      updateVial: () => {}, updateProtocol: () => {},
      planMarkTaken: MT.planMarkTaken, markTakenDay: MT.markTakenDay,
      repeatOf: O.repeatOf,
    })(protocol.id, opts),
  };
}
const oral = { id: 1, user_id: USER, remote_id: 'p-1', name: 'L-Carnitina', type: 'oral', active: 1, doses_per_day: 1, interval_days: 1, reminder_time: '07:00', start_date: '2026-11-01', created_at: '2026-11-01T07:00:00.000Z' };

test('DO-6: without repeat a take writes no mark and no observation', () => {
  const f = fakeTake({ protocol: oral });
  const r = f.run({ tapMs: NOW, atNow: true, applyRepeat: true });
  const ins = f.calls.find((c) => c[0] === 'insert')[1];
  assert.equal(ins.dose_context, undefined);
  assert.equal(ins.dose_note, undefined);
  assert.equal(r.observation, null);
});

test('DO-6: the sheet never opens by itself', () => {
  // Opened only by a tap on a row (the Dose log) or by Today's row (openLogId / openRequest).
  const calls = [...LOG.matchAll(/openDoseSheet\(/g)].length;
  assert.ok(calls <= 5, `openDoseSheet is called only from the row tap, the gate wait and Today's request (${calls})`);
  assert.match(LOG, /: openDoseSheet\(log\)\}/, 'the row tap');
  assert.doesNotMatch(TODAY, /openDoseSheet/, 'Today never opens it itself after a take');
  assert.doesNotMatch(sliceBlock(TODAY, 'async function markTaken('), /openLogId|openDoseFromToday/);
});

test('DO-21: with repeat on every entry point\'s new dose gets the mark and the observation', () => {
  const rep = { ...oral, repeat_dose_context: 'fasted', repeat_dose_note: 'Antes da yoga' };
  const f = fakeTake({ protocol: rep });
  const r = f.run({ tapMs: NOW, atNow: true, applyRepeat: true });
  const ins = f.calls.find((c) => c[0] === 'insert')[1];
  assert.equal(ins.dose_context, 'fasted');
  assert.equal(ins.dose_note, 'Antes da yoga');
  assert.deepEqual(r.observation, { dose_context: 'fasted', dose_note: 'Antes da yoga' });
  // A flipped row (Pendentes de ontem over yesterday's Missed row) gets them in the same write.
  const missedRow = { id: 70, protocol_id: 1, outcome: 'Missed', logged_at: new Date(local(2026, 11, 23, 7)).toISOString() };
  const g = fakeTake({ protocol: rep, logs: [missedRow] });
  g.run({ tapMs: NOW, dayKey: '2026-11-23', slotMs: local(2026, 11, 23, 7), applyRepeat: true });
  const up = g.calls.find((c) => c[0] === 'update');
  assert.equal(up[1], 70);
  assert.equal(up[2].dose_context, 'fasted');
  assert.equal(up[2].dose_note, 'Antes da yoga');
  // Without applyRepeat (the Dose log's correction): nothing.
  const h = fakeTake({ protocol: rep });
  const r2 = h.run({ tapMs: NOW, atNow: true });
  assert.equal(h.calls.find((c) => c[0] === 'insert')[1].dose_context, undefined);
  assert.equal(r2.observation, null);
  // Only the note set: the mark stays empty.
  const k = fakeTake({ protocol: { ...oral, repeat_dose_note: 'Antes de dormir' } });
  k.run({ tapMs: NOW, atNow: true, applyRepeat: true });
  const ik = k.calls.find((c) => c[0] === 'insert')[1];
  assert.equal(ik.dose_context, null);
  assert.equal(ik.dose_note, 'Antes de dormir');
});

test('DO-21: Today, the notification and Pendentes de ontem pass applyRepeat; the Dose log never', () => {
  const mark = sliceBlock(TODAY, 'async function markTaken(');
  assert.match(mark, /recordDoseTaken\(protocol\.id, \{ \.\.\.\(opts\.write \|\| \{\}\), applyRepeat: true \}\)/);
  const pend = sliceBlock(TODAY, 'function writePending(');
  assert.match(pend, /recordDoseTaken\(protocolId, \{ \.\.\.write, applyRepeat: true \}\)/);
  const notif = read('lib/notificationActions.js');
  assert.match(notif, /recordDoseTaken\(protocolId, \{ atNow: true, sourceKey, applyRepeat: true \}\)/);
  assert.match(notif, /recordDoseTaken\(protocolId, \{ dayKey: target\.dayKey, slotMs: target\.slotMs, sourceKey, applyRepeat: true \}\)/);
  const row = sliceBlock(LOG, 'function markRowTaken(');
  assert.doesNotMatch(row, /applyRepeat/, 'a correction in the Dose log is described there, never stamped');
  assert.match(read('lib/doseActions.js'), /const rep = opts\.applyRepeat \? repeatOf\(protocol\) : null;/);
});

test('DO-22: the toast names what was applied', () => {
  const { takenToastText } = OBS();
  const applied = { dose_context: 'fasted', dose_note: 'Antes da yoga' };
  assert.equal(takenToastText({ base: pt('today_dose_logged'), applied, t: pt }), 'Dose registrada · Em jejum · Antes da yoga');
  assert.equal(takenToastText({ base: pt('today_site_saved').replace('{site}', 'Abdome, esquerda'), applied, t: pt }), 'Local salvo · Abdome, esquerda · Em jejum · Antes da yoga');
  assert.equal(takenToastText({ base: 'Dose registrada', applied: { dose_context: null, dose_note: 'Antes\nde dormir  ' }, t: pt }), 'Dose registrada · Antes de dormir', 'one line');
  assert.equal(takenToastText({ base: 'Dose registrada', applied: null, t: pt }), 'Dose registrada');
  const mark = sliceBlock(TODAY, 'async function markTaken(');
  assert.match(mark, /text: takenText\(opts\.toastText, res\)/);
  const pend = sliceBlock(TODAY, 'function writePending(');
  assert.match(pend, /text: takenText\(toastText, res\)/);
});

// ── Rules ───────────────────────────────────────────────────────────────────────

test('DO-7: the marks are exclusive and a second tap removes the mark', () => {
  const { toggleContext, cleanContext } = OBS();
  assert.equal(toggleContext(null, 'fasted'), 'fasted');
  assert.equal(toggleContext('fasted', 'meal'), 'meal', 'Com refeição takes Em jejum away');
  assert.equal(toggleContext('meal', 'fasted'), 'fasted');
  assert.equal(toggleContext('fasted', 'fasted'), null, 'a second tap removes it');
  assert.equal(cleanContext('training'), null, 'only the two marks exist');
});

test('DO-7: the sheet shows the two pills with the tick and saves on the tap', () => {
  const c = COMP();
  assert.match(c, /t\('dose_obs_marks_title'\)/);
  assert.match(c, /t\('dose_obs_optional'\)/);
  assert.match(c, /\['fasted', 'meal'\]\.map/);
  assert.match(c, /accessibilityState=\{\{ selected: on \}\}/);
  assert.match(c, /\{on \? <FeatureIcon name="check"/);
  assert.match(c, /onPress=\{\(\) => onContext\(toggleContext\(log\.dose_context, k\)\)\}/);
  // The protocol form's pill: 1 px line; chosen = 1.5 px ink.
  assert.match(c, /pill: \{[^}]*borderWidth: 1, borderColor: c\.line/);
  assert.match(c, /pillOn: \{[^}]*borderWidth: 1\.5, borderColor: c\.ink/);
  // The write: on the tap, through the guarded write (DO-13).
  assert.match(LOG, /function setSheetContext\(log, value\)[\s\S]{0,200}setDoseObservation\(log\.id, \{ dose_context: value \}\)/);
});

test('DO-8: the help text is the picture\'s in 6 languages and is a placeholder', () => {
  assert.equal(TR.pt.dose_obs_note_placeholder, 'Escreva o que quiser: quando tomou (antes da yoga, antes de dormir) ou como se sentiu depois. Fica no seu histórico e no relatório para o seu médico.');
  assert.equal(TR.en.dose_obs_note_placeholder, 'Write anything: when you took it (before yoga, before bed) or how you felt afterwards. It stays in your history and in the report for your doctor.');
  assert.equal(TR.es.dose_obs_note_placeholder, 'Escribe lo que quieras: cuándo la tomaste (antes del yoga, antes de dormir) o cómo te sentiste después. Queda en tu historial y en el informe para tu médico.');
  assert.equal(TR.fr.dose_obs_note_placeholder, "Écrivez ce que vous voulez : quand vous l'avez prise (avant le yoga, avant de dormir) ou ce que vous avez ressenti ensuite. Cela reste dans votre historique et dans le rapport pour votre médecin.");
  assert.equal(TR.de.dose_obs_note_placeholder, 'Schreib, was du möchtest: wann du sie genommen hast (vor dem Yoga, vor dem Schlafen) oder wie es dir danach ging. Es bleibt in deinem Verlauf und im Bericht für deinen Arzt.');
  assert.equal(TR.it.dose_obs_note_placeholder, "Scrivi quello che vuoi: quando l'hai presa (prima dello yoga, prima di dormire) o come stavi dopo. Resta nel tuo storico e nel report per il tuo medico.");
  assert.equal(TR.pt.dose_obs_note_title, 'Observação');
  const c = COMP();
  assert.match(c, /placeholder=\{t\('dose_obs_note_placeholder'\)\}/, 'a placeholder: gone when typing, never saved');
  assert.match(c, /multiline/);
});

test('DO-9: Cancelar and Salvar appear only when the text differs', () => {
  const { noteDirty } = OBS();
  assert.equal(noteDirty('', null), false);
  assert.equal(noteDirty('Antes da yoga', null), true);
  assert.equal(noteDirty('Antes da yoga', 'Antes da yoga'), false);
  assert.equal(noteDirty('', 'Antes da yoga'), true, 'erasing a saved observation is a change too');
  const c = COMP();
  assert.match(c, /\{dirty && \(\s*<View style=\{s\.acts2\}>/);
  assert.match(c, /onPress=\{cancelNote\}[\s\S]{0,200}t\('cancel'\)/);
  assert.match(c, /onPress=\{saveNote\}[\s\S]{0,200}t\('save'\)/);
});

test('DO-10: closing the sheet saves the typed observation', () => {
  const { noteToSave, noteDraftKey } = OBS();
  assert.equal(noteDraftKey(12), 'doseNote:12');
  assert.equal(noteToSave(undefined, 'x'), undefined, 'no draft: nothing to save');
  assert.equal(noteToSave({ text: 'Antes da yoga', base: '' }, null), 'Antes da yoga');
  assert.equal(noteToSave({ text: '  Antes da yoga \n', base: '' }, null), 'Antes da yoga', 'trimmed');
  assert.equal(noteToSave({ text: 'same', base: 'same' }, 'same'), undefined);
  assert.equal(noteToSave({ text: '   ', base: 'x' }, 'x'), null, 'erased: cleared');
  // Every way out of the sheet saves first (close, a tap outside, back, Concluído, another action),
  // and the app going to the background too.
  assert.match(sliceBlock(LOG, 'function closeDoseSheet('), /flushNote\(\);/);
  assert.match(sliceBlock(LOG, 'function leaveSheetThen('), /flushNote\(\);/);
  assert.match(LOG, /AppState\.addEventListener\('change', \(st\) => \{ if \(st !== 'active'\) flushNote\(\); \}\)/);
  assert.match(sliceBlock(LOG, 'function flushNote('), /noteToSave\(getDraft\(noteDraftKey\(log\.id\)\), log\.dose_note\)/);
  // The draft is the shared in-memory store (A-77), so a fold or another screen keeps it.
  assert.match(COMP(), /setDraft\(noteDraftKey\(log\.id\), noteDraftValue\(getDraft\(noteDraftKey\(log\.id\)\), text, log\.dose_note\)\)/);
});

test('DO-11: the emergency number follows the region', () => {
  const { emergencyFor } = OBS();
  assert.deepEqual(emergencyFor('BR'), { number: '192', kind: 'samu' });
  assert.deepEqual(emergencyFor('US'), { number: '911', kind: 'plain' });
  assert.deepEqual(emergencyFor('GB'), { number: '999', kind: 'plain' });
  for (const eu of ['PT', 'DE', 'FR', 'IT', 'ES', 'IE', 'PL', 'SE']) assert.deepEqual(emergencyFor(eu), { number: '112', kind: 'plain' }, eu);
  assert.deepEqual(emergencyFor('JP'), { number: '112', kind: 'local' });
  assert.deepEqual(emergencyFor(null), { number: '112', kind: 'local' });
});

test('DO-11: pt copy, oral says depois da dose, the tap opens the dialer', () => {
  const { emergencyText } = OBS();
  const br = emergencyText({ region: 'BR', oral: false, t: pt });
  assert.equal(`${br.question} ${br.call}`, 'Falta de ar, inchaço ou tontura forte depois da aplicação? Ligue para o 192 (SAMU).');
  assert.equal(br.tel, 'tel:192');
  const o = emergencyText({ region: 'BR', oral: true, t: pt });
  assert.equal(o.question, 'Falta de ar, inchaço ou tontura forte depois da dose?');
  assert.equal(emergencyText({ region: 'JP', oral: false, t: pt }).call, 'Ligue para o 112 ou o número de emergência local.');
  assert.equal(emergencyText({ region: 'US', oral: false, t: tFor('en') }).call, 'Call 911.');
  const c = COMP();
  assert.match(c, /Linking\.openURL\(sos\.tel\)/);
  assert.match(c, /<FeatureIcon name="warning" size=\{14\} color=\{colors\.risk\} \/>/);
  // Fixed: computed from the region and the dose type only — never from what is typed.
  assert.match(c, /const sos = emergencyText\(\{ region, oral, t \}\);/);
});

test('DO-12: the big Concluído sits above Excluir esta dose', () => {
  const sheet = LOG.slice(LOG.indexOf('{/* The dose sheet'), LOG.indexOf('<DoseEditSheet'));
  const big = sheet.indexOf('style={s.doneBtn}');
  const del = sheet.indexOf("t('log_delete_dose')");
  assert.ok(big > 0 && del > big, 'the big Concluído, then Excluir esta dose');
  assert.match(sheet, /style=\{s\.doneBtn\} onPress=\{closeDoseSheet\}/);
  assert.match(sheet, /<Text style=\{s\.sheetDone\}>\{t\('done'\)\}<\/Text>/, 'the small one stays');
  assert.match(LOG, /doneBtn: \{[^}]*backgroundColor: c\.act/);
});

test('DO-13: only a Taken, non-declared dose can carry a mark', () => {
  const { canObserveDose } = OBS();
  const created = '2026-11-01T08:00:00.000Z';
  assert.equal(canObserveDose({ outcome: 'Taken', logged_at: '2026-11-24T07:02:00.000Z', protocol_created_at: created }), true);
  for (const o of ['Skipped', 'Missed', 'NoDose']) assert.equal(canObserveDose({ outcome: o, logged_at: '2026-11-24T07:02:00.000Z', protocol_created_at: created }), false, o);
  assert.equal(canObserveDose({ outcome: 'Taken', logged_at: '2026-10-01T07:00:00.000Z', protocol_created_at: created }), false, 'declared history');
  assert.match(LOG, /\{canObserveDose\(shownSheet\) && \(\s*<DoseObservation/);
});

test('DO-13: a row leaving Taken loses its mark and observation', () => {
  const db = makeDb();
  const pid = seedSyncedProtocol(db, USER, { remote_id: 'p-1', updated_at: '000001' });
  const upd = fromDb(db, 'updateDoseLog');
  const id = seedDose(db, pid, { dose_context: 'fasted', dose_note: 'Antes da yoga' });
  upd(id, { outcome: 'Missed', outcome_by_person: 0 }); // Today's Undo of a completed Missed dose
  assert.equal(dl(db, id).dose_context, null);
  assert.equal(dl(db, id).dose_note, null);
  const id2 = seedDose(db, pid, { dose_context: 'meal', dose_note: 'x' });
  upd(id2, { outcome: 'Skipped' });
  assert.equal(dl(db, id2).dose_context, null);
  // Not an outcome change: kept.
  const id3 = seedDose(db, pid, { dose_context: 'meal', dose_note: 'x' });
  upd(id3, { injection_site: 'left' });
  assert.equal(dl(db, id3).dose_context, 'meal');
});

test('DO-13: the sheet\'s write lands only on a row still Taken', () => {
  const db = makeDb();
  const pid = seedSyncedProtocol(db, USER, { remote_id: 'p-1', updated_at: '000001' });
  const set = fromDb(db, 'setDoseObservation');
  const id = seedDose(db, pid, { sync_status: 'synced' });
  assert.equal(set(id, { dose_context: 'fasted' }), true);
  assert.equal(dl(db, id).dose_context, 'fasted');
  assert.equal(dl(db, id).sync_status, 'pending', 'it goes up on the next sync');
  assert.equal(set(id, { dose_note: '  Antes da yoga  ' }), true);
  assert.equal(dl(db, id).dose_note, 'Antes da yoga');
  assert.equal(set(id, { dose_context: 'training' }), true);
  assert.equal(dl(db, id).dose_context, null, 'an unknown mark is never stored');
  const skipped = seedDose(db, pid, { outcome: 'Skipped' });
  assert.equal(set(skipped, { dose_note: 'x' }), false, 'an Undo got there first: nothing written');
  assert.equal(dl(db, skipped).dose_note, null);
  db.runSync("UPDATE dose_logs SET sync_status = 'deleted' WHERE id = ?", [id]);
  assert.equal(set(id, { dose_note: 'late' }), false, 'a deleted dose is never revived');
});

test('DO-14: the unrecorded answers and the past-start history never write a mark', () => {
  const actions = read('lib/doseActions.js');
  const save = sliceBlock(actions, 'export function saveUnrecordedAnswer(');
  assert.doesNotMatch(save, /dose_context|dose_note|applyRepeat|repeatOf/);
  assert.doesNotMatch(read('lib/unrecordedPeriod.js'), /dose_context|dose_note|repeat_dose/);
  assert.doesNotMatch(read('lib/pastDoses.js'), /dose_context|dose_note|repeat_dose|applyRepeat/);
  // An insert without the fields stores none, whatever the protocol repeats.
  const db = makeDb();
  const pid = seedSyncedProtocol(db, USER, { remote_id: 'p-1', updated_at: '000001' });
  db.runSync("UPDATE protocols SET repeat_dose_context = 'fasted', repeat_dose_note = 'x' WHERE id = ?", [pid]);
  const ins = fromDb(db, 'insertDoseLog');
  const id = ins({ user_id: USER, protocol_id: pid, outcome: 'Taken', logged_at: '2026-06-01T07:00:00.000Z', slot_at: '2026-06-01T07:00:00.000Z' });
  assert.equal(dl(db, id).dose_context, null);
  assert.equal(dl(db, id).dose_note, null);
  // insertDoseLog keeps them only on a Taken row.
  const sk = ins({ user_id: USER, protocol_id: pid, outcome: 'Skipped', logged_at: '2026-06-02T07:00:00.000Z', dose_context: 'fasted', dose_note: 'x' });
  assert.equal(dl(db, sk).dose_context, null);
  const tk = ins({ user_id: USER, protocol_id: pid, outcome: 'Taken', logged_at: '2026-06-03T07:00:00.000Z', dose_context: 'meal', dose_note: 'Almoço' });
  assert.equal(dl(db, tk).dose_context, 'meal');
  assert.equal(dl(db, tk).dose_note, 'Almoço');
});

test('DO-15: time and dose corrections keep the mark; Undo of a new dose deletes it', () => {
  const db = makeDb();
  const pid = seedSyncedProtocol(db, USER, { remote_id: 'p-1', updated_at: '000001' });
  const upd = fromDb(db, 'updateDoseLog');
  const id = seedDose(db, pid, { dose_context: 'fasted', dose_note: 'Antes da yoga' });
  const { timeEditFields } = require('../lib/doseEdit');
  upd(id, timeEditFields(dl(db, id), new Date(2026, 10, 24, 6, 30).getTime()));
  upd(id, { dose_amount: 3, dose_unit: 'mg' });
  assert.equal(dl(db, id).dose_context, 'fasted');
  assert.equal(dl(db, id).dose_note, 'Antes da yoga');
  // "Desde quando você usa {nova dose}?" rewrites only the amounts of the rows.
  const src = read('lib/database.js');
  const fix = sliceBlock(src, 'export function updateProtocol(');
  for (const m of fix.matchAll(/UPDATE dose_logs SET ([^`]*?) WHERE/g)) assert.doesNotMatch(m[1], /dose_context|dose_note/);
  // Undo of a new dose deletes the row (its mark and observation with it).
  assert.deepEqual(MT.planUndoTake({ logId: 9, flipped: false }).deleteIds, [9]);
});

test('DO-16: the Dose log row shows the mark line and the observation cut at 2 lines', () => {
  const item = LOG.slice(LOG.indexOf('renderItem={({ item: log'), LOG.indexOf('ListFooterComponent'));
  assert.match(item, /\{markOf\(log\) \? \(\s*<View style=\{s\.detailRow\}>\s*<FeatureIcon name="tag" size=\{13\} color=\{colors\.ink3\} \/>\s*<Text style=\{s\.logDetail\}>\{markOf\(log\)\}<\/Text>/);
  assert.match(item, /\{noteOf\(log\) \? \(\s*<View style=\{\[s\.detailRow, s\.noteRow\]\}>\s*<FeatureIcon name="chat" size=\{13\} color=\{colors\.ink3\} \/>\s*<Text style=\{s\.logDetail\} numberOfLines=\{2\} ellipsizeMode="tail">\{noteOf\(log\)\}<\/Text>/);
  assert.match(LOG, /const markOf = \(log\) => \(canObserveDose\(log\) \? markLabel\(log\.dose_context, t\) : null\);/);
});

test('DO-17: Today\'s completed row shows one line and opens the dose sheet', () => {
  const { observationLine } = OBS();
  assert.equal(observationLine({ outcome: 'Taken', dose_context: 'fasted', dose_note: 'Antes da yoga' }, pt), 'Em jejum · Antes da yoga');
  assert.equal(observationLine({ outcome: 'Taken', dose_context: null, dose_note: 'linha 1\nlinha 2' }, pt), 'linha 1 linha 2');
  assert.equal(observationLine({ outcome: 'Taken' }, pt), null);
  const taken = TODAY.slice(TODAY.indexOf('{todayTaken.map(l => {'), TODAY.indexOf('// Part 10, closed'));
  assert.match(taken, /<TouchableOpacity key=\{l\.id\} style=\{s\.takenRow\} onPress=\{\(\) => openDoseFromToday\(l\)\}/);
  assert.match(taken, /const obs = observationLine\(l, t\);/);
  assert.match(taken, /<FeatureIcon name="tag" size=\{12\} color=\{colors\.ink3\} \/>\s*<Text style=\{s\.takenObsText\} numberOfLines=\{1\}>\{obs\}<\/Text>/);
  assert.match(taken, /<RowChevron color=\{colors\.tick\} \/>/);
  const open = sliceBlock(TODAY, 'function openDoseFromToday(');
  assert.match(open, /if \(book\) \{ bookSelect\('log'\); setLogOpen\(\{ logId: l\.id, n: Date\.now\(\) \}\); return; \}/);
  assert.match(open, /navigation\.navigate\('Log', \{ openLogId: l\.id \}\)/);
  assert.match(TODAY, /<LogScreen embedded [^>]*openRequest=\{logOpen\}/);
  // The Dose log opens the asked dose's sheet once its rows are read; from Today, closing goes back.
  assert.match(LOG, /const openLogId = !embedded && route && route\.params \? route\.params\.openLogId : null;/);
  assert.match(sliceBlock(LOG, 'function closeDoseSheet('), /if \(backOnClose\.current\) \{ backOnClose\.current = false; try \{ navigation\.goBack\(\); \} catch \{ \/\* nothing to go back to \*\/ \} \}/);
});

test('DO-18: the export carries the mark and the observation', () => {
  const db = makeDb();
  const pid = seedSyncedProtocol(db, USER, { remote_id: 'p-1', updated_at: '000001' });
  seedDose(db, pid, { dose_context: 'fasted', dose_note: 'Antes da yoga' });
  db.runSync("UPDATE protocols SET repeat_dose_context = 'fasted' WHERE id = ?", [pid]);
  const { exportTableNames } = require('../lib/exportTables');
  const exp = loadFn('lib/database.js', 'export function getAllDataForExport(', 'getAllDataForExport', { getDB: () => db, exportTableNames, TABLES })(USER);
  assert.equal(exp.dose_logs[0].dose_context, 'fasted');
  assert.equal(exp.dose_logs[0].dose_note, 'Antes da yoga');
  assert.equal(exp.protocols[0].repeat_dose_context, 'fasted');
});

test('DO-19: the curve, labs and AI never read the observation', () => {
  const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const files = [
    ...fs.readdirSync(path.join(ROOT, 'lib')).filter((f) => /^(serum|curve|lab|ai|nutrition|foodThread|protocolAssistant|bloodwork)/i.test(f)).map((f) => `lib/${f}`),
    ...walk('supabase/functions').filter((f) => /\.(ts|js)$/.test(f)),
    ...['screens/SerumCurveScreen.js', 'screens/BodyScreen.js'].filter((f) => fs.existsSync(path.join(ROOT, f))),
  ];
  assert.ok(files.length > 5);
  for (const f of files) assert.doesNotMatch(read(f), /dose_note|dose_context|repeat_dose/, f);
});

test('DO-20: repeat shown after the first mark or observation, copies this dose, off clears', () => {
  const { repeatShown, repeatOf, repeatOnFields, REPEAT_OFF, repeatBody } = OBS();
  const p = { id: 1, name: 'L-Carnitina' };
  const bare = { outcome: 'Taken' };
  assert.equal(repeatShown(bare, p), false, 'off by default and hidden until something is marked or written');
  assert.equal(repeatShown({ ...bare, dose_context: 'fasted' }, p), true);
  assert.equal(repeatShown({ ...bare, dose_note: 'Antes da yoga' }, p), true);
  assert.equal(repeatShown(bare, { ...p, repeat_dose_note: 'x' }), true, 'repeat on: always shown');
  assert.equal(repeatShown({ outcome: 'Skipped', dose_context: 'fasted' }, p), false);
  assert.equal(repeatOf(p), null);
  assert.deepEqual(repeatOnFields({ dose_context: 'fasted', dose_note: ' Antes da yoga ' }), { repeat_dose_context: 'fasted', repeat_dose_note: 'Antes da yoga' });
  assert.deepEqual(REPEAT_OFF, { repeat_dose_context: null, repeat_dose_note: null });
  assert.equal(repeatBody({ repeat_dose_context: 'fasted', repeat_dose_note: 'Antes da yoga' }, 'L-Carnitina', pt),
    'Cada dose concluída de L-Carnitina já sai com “Em jejum” e “Antes da yoga”. Você pode trocar ou apagar em qualquer dose.');
  assert.equal(repeatBody({ repeat_dose_context: 'meal', repeat_dose_note: null }, 'Berberina', pt),
    'Cada dose concluída de Berberina já sai com “Com refeição”. Você pode trocar ou apagar em qualquer dose.');
  // Switching on saves the typed text first, then copies this dose; it never writes another dose.
  const sw = sliceBlock(LOG, 'function setSheetRepeat(');
  assert.match(sw, /const fresh = on \? flushNote\(\) : null;/);
  assert.match(sw, /updateProtocol\(log\.protocol_id, on \? repeatOnFields\(fresh \|\| log\) : REPEAT_OFF\)/);
  assert.doesNotMatch(sw, /updateDoseLog|setDoseObservation|insertDoseLog/, 'past doses are never touched');
  assert.match(COMP(), /<GradSwitch value=\{repeatOn\} onValueChange=\{onRepeat\}/);
});

test('DO-23: the dead notes / pre_tags UI is gone', () => {
  assert.doesNotMatch(LOG, /pre_tags|parseTags|log\.notes|tagRow|tagText/);
});

test('DO-24: the privacy policy lists the dose mark and observation in every copy', () => {
  const words = {
    en: 'whether you took a dose fasting or with a meal, the observation you write about a dose',
    es: 'si tomaste una dosis en ayunas o con comida, la observación que escribes sobre una dosis',
    pt: 'se tomou uma dose em jejum ou com refeição, a observação que você escreve sobre uma dose',
    fr: 'si vous avez pris une dose à jeun ou avec un repas, la remarque que vous écrivez sur une dose',
    de: 'ob du eine Dosis nüchtern oder zum Essen genommen hast, die Anmerkung, die du zu einer Dosis schreibst',
    it: "se hai preso una dose a digiuno o con un pasto, la nota che scrivi su una dose",
  };
  for (const l of LANGS) assert.ok(TR[l].settings_privacy_body.includes(words[l]), l);
  assert.ok(read('docs/legal/privacy-policy-2026-10.md').includes(words.en));
  assert.ok(read('web/privacy-policy.html').includes(words.en));
  assert.ok(read('docs/legal/privacy-policy-2026-10.pt.md').includes(words.pt));
  for (const l of LANGS) assert.ok(TR[l].settings_privacy_body.includes({ en: 'November 24, 2026', es: '24 de noviembre de 2026', pt: '24 de novembro de 2026', fr: '24 novembre 2026', de: '24. November 2026', it: '24 novembre 2026' }[l]), `${l}: dated`);
});

test('DO-25: the report seam counts marks beside sem marca and groups the observations', () => {
  const { observationSummary } = OBS();
  const P = [{ id: 1, created_at: '2026-10-01T00:00:00.000Z' }, { id: 2, created_at: '2026-10-01T00:00:00.000Z' }];
  const at = (d, h = 7) => new Date(2026, 10, d, h, 2).toISOString();
  const logs = [
    { protocol_id: 1, outcome: 'Taken', logged_at: at(20), dose_context: 'fasted', dose_note: 'Antes da yoga' },
    { protocol_id: 1, outcome: 'Taken', logged_at: at(21), dose_context: 'fasted', dose_note: 'Antes da yoga ' },
    { protocol_id: 1, outcome: 'Taken', logged_at: at(22), dose_context: 'fasted', dose_note: 'Acordei tarde', },
    { protocol_id: 1, outcome: 'Taken', logged_at: at(23) },
    { protocol_id: 1, outcome: 'Skipped', logged_at: at(24), dose_context: 'meal' }, // never counted
    { protocol_id: 1, outcome: 'Taken', logged_at: new Date(2026, 8, 1).toISOString(), dose_context: 'meal' }, // declared history
    { protocol_id: 2, outcome: 'Taken', logged_at: at(20, 12), dose_context: 'meal' },
  ];
  const out = observationSummary({ logs, protocols: P, fromMs: new Date(2026, 7, 1).getTime(), toMs: new Date(2026, 10, 25).getTime() });
  const one = out.find((x) => x.protocolId === 1);
  assert.deepEqual({ taken: one.taken, fasted: one.fasted, meal: one.meal, none: one.none }, { taken: 4, fasted: 3, meal: 0, none: 1 });
  assert.equal(one.notes.length, 2);
  assert.deepEqual(one.notes[0], { text: 'Antes da yoga', count: 2, firstMs: Date.parse(at(20)), lastMs: Date.parse(at(21)) });
  assert.deepEqual(one.notes[1], { text: 'Acordei tarde', count: 1, firstMs: Date.parse(at(22)), lastMs: Date.parse(at(22)) });
  const two = out.find((x) => x.protocolId === 2);
  assert.equal(two.meal, 1);
  assert.deepEqual(two.notes, []);
  // The window: outside it, nothing.
  assert.deepEqual(observationSummary({ logs, protocols: P, fromMs: Date.parse(at(23)), toMs: Date.parse(at(23)) + 1 }).find((x) => x.protocolId === 1).none, 1);
  // The report itself is unchanged until its own picture is approved.
  assert.doesNotMatch(read('lib/adherenceReport.js'), /dose_context|dose_note|observationSummary/);
});

test('DO-26: every new string exists in the 6 languages and pt is formal', () => {
  const keys = Object.keys(TR.en).filter((k) => k.startsWith('dose_obs_'));
  assert.ok(keys.length >= 14, keys.join(','));
  for (const l of LANGS) for (const k of keys) assert.ok(TR[l][k], `${l}.${k}`);
  for (const k of keys) assert.doesNotMatch(TR.pt[k], /\b(dá para|a gente|tu)\b/i, k);
  assert.match(TR.fr.dose_obs_repeat_body, /\bVous\b|\bvous\b/);
  assert.match(TR.de.dose_obs_repeat_body, /\bDu\b/);
  assert.match(TR.es.dose_obs_repeat_body, /\bPuedes\b/);
  assert.match(TR.it.dose_obs_repeat_body, /\bPuoi\b/);
});

test('DO-28: the tag glyph is in the FeatureIcon set', () => {
  const svg = read('assets/feature-icons/tag.svg');
  assert.match(svg, /stroke="__C__" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"/);
  assert.match(read('components/featureIconsData.js'), /\n  tag: `<svg/);
  for (const f of ['screens/LogScreen.js', 'screens/TodayScreen.js', 'screens/components/DoseObservation.js']) {
    assert.doesNotMatch(read(f), /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, `${f}: no emoji`);
  }
});

test('DO-29: a restart copies the repeat setting', () => {
  const db = makeDb();
  const pid = db.runSync(`INSERT INTO protocols (user_id, name, type, color, dose, dose_unit, interval_days, doses_per_day, active, ended_at, repeat_dose_context, repeat_dose_note, created_at, updated_at, sync_status) VALUES (?, 'L-Carnitina', 'oral', '#185FA5', '2', 'caps', 1, 1, 0, '2026-11-01T00:00:00Z', 'fasted', 'Antes da yoga', '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z', 'synced')`, [USER]).lastInsertRowId;
  const nid = PE.restartAsNew(db, pid, { nowIso: '2026-11-24T10:00:00.000Z', todayKey: '2026-11-24' });
  const n = db.getFirstSync('SELECT repeat_dose_context, repeat_dose_note FROM protocols WHERE id = ?', [nid]);
  assert.deepEqual({ ...n }, { repeat_dose_context: 'fasted', repeat_dose_note: 'Antes da yoga' });
});
