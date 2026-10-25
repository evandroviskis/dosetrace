'use strict';
// A-172 (Gate B review of the A-167 fix, 2026-10-22; 1.3.2): My Body › Export records left its
// health files on the phone after the share — the CSV in documentDirectory/dosetrace_records.csv
// (inside the iCloud / Android backups, never removed) and the PDF in expo-print's own
// cache/Print/<uuid>.pdf (a new file on every export, never removed). Now both go through
// lib/exportFile like Download my data: the cache folder (never backed up), fixed names, older
// copies removed before each export and by the sign-out / delete / account-switch wipes (the wipe
// already calls clearExportFile, A-167). Only the app's own copies are touched: a copy the user
// saved elsewhere through the share sheet (Files, Drive, mail) is a separate file and stays.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ef = require('../lib/exportFile');

const ROOT = path.join(__dirname, '..');
const FS = { cacheDirectory: 'file:///cache/', documentDirectory: 'file:///docs/' };

test('A-172: the records CSV and PDF have fixed names in the cache folder', () => {
  assert.equal(ef.RECORDS_CSV_NAME, 'dosetrace_records.csv');
  assert.equal(ef.RECORDS_PDF_NAME, 'dosetrace_records.pdf');
  assert.equal(ef.sharedFilePath(FS, ef.RECORDS_CSV_NAME), 'file:///cache/dosetrace_records.csv');
  assert.equal(ef.sharedFilePath(FS, ef.RECORDS_PDF_NAME), 'file:///cache/dosetrace_records.pdf');
  assert.equal(ef.exportFilePath(FS), 'file:///cache/dosetrace_export.json');
});

test('A-172: the wipe list covers every shared health file, in the cache and the 1.2.x/1.3.x Documents copy, plus the expo-print folder', () => {
  const paths = ef.exportFilePaths(FS).sort();
  assert.deepEqual(paths, [
    'file:///cache/Print/',
    'file:///cache/dosetrace_export.json',
    'file:///cache/dosetrace_records.csv',
    'file:///cache/dosetrace_records.pdf',
    'file:///docs/dosetrace_export.json',
    'file:///docs/dosetrace_records.csv',
    'file:///docs/dosetrace_records.pdf',
  ]);
  // Only the app's own sandbox folders: never a path outside the cache / Documents roots.
  assert.ok(paths.every((p) => p.startsWith(FS.cacheDirectory) || p.startsWith(FS.documentDirectory)));
});

test('A-172: removeExportFiles (the sign-out / delete / switch wipe) deletes every one of them, idempotently, never throwing', async () => {
  const calls = [];
  const fsMock = { ...FS, deleteAsync: async (p, o) => { calls.push([p, o]); if (p.endsWith('.pdf')) throw new Error('gone'); } };
  await ef.removeExportFiles(fsMock);
  assert.deepEqual(calls.map((c) => c[0]).sort(), ef.exportFilePaths(FS).sort());
  assert.ok(calls.every((c) => c[1] && c[1].idempotent === true));
});

test('A-172: moveIntoSharedFile moves the expo-print PDF to its fixed cache name; on a failed move the cache file is shared as is', async () => {
  const calls = [];
  const okFs = { ...FS,
    deleteAsync: async (p, o) => { calls.push(['delete', p, o]); },
    moveAsync: async (o) => { calls.push(['move', o.from, o.to]); },
  };
  const uri = await ef.moveIntoSharedFile(okFs, 'file:///cache/Print/ABC.pdf', ef.RECORDS_PDF_NAME);
  assert.equal(uri, 'file:///cache/dosetrace_records.pdf');
  assert.deepEqual(calls, [
    ['delete', 'file:///cache/dosetrace_records.pdf', { idempotent: true }],
    ['move', 'file:///cache/Print/ABC.pdf', 'file:///cache/dosetrace_records.pdf'],
  ]);
  const badFs = { ...FS, deleteAsync: async () => {}, moveAsync: async () => { throw new Error('no'); } };
  assert.equal(await ef.moveIntoSharedFile(badFs, 'file:///cache/Print/ABC.pdf', ef.RECORDS_PDF_NAME), 'file:///cache/Print/ABC.pdf');
});

test('A-172: My Body export writes the CSV and the PDF through lib/exportFile, never to documentDirectory', () => {
  const src = fs.readFileSync(path.join(ROOT, 'screens/BodyScreen.js'), 'utf8');
  const body = src.slice(src.indexOf('async function doExport(kind)'), src.indexOf('function formatDate(dateStr)'));
  assert.doesNotMatch(body, /documentDirectory/);
  assert.match(body, /removeExportFiles\(FileSystem\)/);
  assert.match(body, /sharedFilePath\(FileSystem, RECORDS_CSV_NAME\)/);
  assert.match(body, /moveIntoSharedFile\(FileSystem, res\.uri, RECORDS_PDF_NAME\)/);
  // Older copies go before the new file is made (the wipe also clears expo-print's folder).
  assert.ok(body.indexOf('removeExportFiles(FileSystem)') < body.indexOf('writeAsStringAsync'));
  assert.ok(body.indexOf('removeExportFiles(FileSystem)') < body.indexOf('printToFileAsync'));
  assert.match(src, /from '\.\.\/lib\/exportFile'/);
});

test('A-172: no other screen or module writes a health file outside lib/exportFile', () => {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) files.push(p);
    }
  };
  for (const d of ['screens', 'components', 'lib']) walk(path.join(ROOT, d));
  files.push(path.join(ROOT, 'App.js'));
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(ROOT, f);
    if (rel === path.join('lib', 'exportFile.js')) continue;
    assert.doesNotMatch(src, /documentDirectory/, rel + ' uses documentDirectory');
  }
});
