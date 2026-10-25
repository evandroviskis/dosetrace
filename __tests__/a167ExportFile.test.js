'use strict';
// A-167 council (build 5, 2026-10-22: regulatory-privacy + backend + UX): once Download my data
// worked, it left the whole health record in documentDirectory/dosetrace_export.json for good —
// inside the iCloud / Android backups and still there after sign-out or account deletion — and the
// file left out the profile kept in the account's user_metadata (name, birth year, sex, activity,
// goals, reminder settings, calculator inputs). Now: the file is written to the cache folder (never
// backed up), every older copy (cache + the 1.2.x Documents one) is removed before a new export and
// by the sign-out / delete / account-switch wipes, and the export carries a "profile" key.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { exportFilePath, exportFilePaths, removeExportFiles, profileForExport, EXPORT_FILE_NAME } = require('../lib/exportFile');

const ROOT = path.join(__dirname, '..');
const FS = { cacheDirectory: 'file:///cache/', documentDirectory: 'file:///docs/' };

test('A-167: the export file lives in the cache folder (never in the backed-up Documents folder)', () => {
  assert.equal(EXPORT_FILE_NAME, 'dosetrace_export.json');
  assert.equal(exportFilePath(FS), 'file:///cache/dosetrace_export.json');
  assert.ok(!exportFilePath(FS).startsWith(FS.documentDirectory));
});

test('A-167: removeExportFiles deletes the cache copy AND the 1.2.x Documents copy, idempotently, never throwing', async () => {
  const calls = [];
  const fsMock = { ...FS, deleteAsync: async (p, o) => { calls.push([p, o]); if (p.includes('docs')) throw new Error('gone'); } };
  await removeExportFiles(fsMock);
  assert.deepEqual(calls.map((c) => c[0]).sort(), exportFilePaths(FS).sort());
  assert.ok(calls.every((c) => c[1] && c[1].idempotent === true));
  // A-172 widened the list (records CSV/PDF, expo-print folder); both export copies stay on it.
  assert.ok(exportFilePaths(FS).includes('file:///cache/dosetrace_export.json'));
  assert.ok(exportFilePaths(FS).includes('file:///docs/dosetrace_export.json'));
  await removeExportFiles({}); // no file system module / no folders: nothing to do, no throw
});

test('A-167: the export carries the profile from user_metadata, without internal migration markers', () => {
  const user = { user_metadata: {
    display_name: 'Teste 1985', birth_year: 1985, birth_month: 3, gender: 'male', activity_level: 'moderate',
    primary_goal: ['wellness'], dose_reminders: true, calc_inputs: { weight: 80 },
    rc_store_migrated: true, calc_history_migrated_v55: true,
  } };
  const p = profileForExport(user);
  assert.equal(p.display_name, 'Teste 1985');
  assert.equal(p.birth_year, 1985);
  assert.equal(p.gender, 'male');
  assert.deepEqual(p.calc_inputs, { weight: 80 });
  assert.ok(!('rc_store_migrated' in p));
  assert.ok(!('calc_history_migrated_v55' in p));
  assert.deepEqual(profileForExport({}), {});
  assert.deepEqual(profileForExport(null), {});
});

test('A-167: exportMyData writes to the cache path, clears older copies first and adds the profile', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib/accountActions.js'), 'utf8');
  const body = src.slice(src.indexOf('export async function exportMyData'), src.indexOf('export async function requestAccountDeletion'));
  assert.match(body, /removeExportFiles\(FileSystem\)/);
  assert.match(body, /exportFilePath\(FileSystem\)/);
  assert.match(body, /profile:\s*profileForExport\(user\)/);
  assert.doesNotMatch(body, /documentDirectory/);
  assert.ok(body.indexOf('removeExportFiles(FileSystem)') < body.indexOf('writeAsStringAsync'));
});

test('A-167: the sign-out / delete wipe and the account-switch guard remove the export file', () => {
  const so = fs.readFileSync(path.join(ROOT, 'lib/signedOut.js'), 'utf8');
  const steps = so.slice(so.indexOf('function runWipeSteps'));
  assert.match(steps, /d\.clearExportFile/);
  const app = fs.readFileSync(path.join(ROOT, 'App.js'), 'utf8');
  const wipe = app.slice(app.indexOf('const wipeDeps = () => ({'), app.indexOf('const guardDeps = () => ({'));
  assert.match(wipe, /clearExportFile/);
  const guard = app.slice(app.indexOf('const guardDeps = () => ({'));
  assert.match(guard.slice(0, guard.indexOf('});')), /clearExportFile/);
  const ag = fs.readFileSync(path.join(ROOT, 'lib/accountGuard.js'), 'utf8');
  assert.match(ag, /clearExportFile/);
});
