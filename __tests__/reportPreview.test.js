'use strict';
// Settings part 3 (approved 2026-09-29, "All approved"): "the adherence report is shown before
// the share sheet ('This is exactly what your provider will receive')". The report went straight
// to the share sheet. It now opens on a preview page with that line, the exact text, Cancel and
// Share; Share opens the system share sheet only after the preview has closed (iOS cannot
// present it over a page sheet).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { read, sliceBlock } = require('./helpers/extractFn');
const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
const tr = mod.exports.translations;

test('the report opens a preview instead of the share sheet', () => {
  const s = read('screens/SettingsScreen.js');
  const fn = sliceBlock(s, 'async function handleAdherenceReport() {');
  assert.match(fn, /setReportPreview\(report\)/);
  assert.doesNotMatch(fn, /Share\.share\(/);
});

test('the preview shows the line and the exact text; Share runs after it closed', () => {
  const s = read('screens/SettingsScreen.js');
  assert.match(s, /<Modal\s+visible=\{!!reportPreview\}[\s\S]*?presentationStyle="pageSheet"[\s\S]*?onRequestClose=/);
  assert.match(s, /t\('settings_report_preview_note'\)/);
  assert.match(s, /<Text style=\{s\.reportText\} selectable>\{reportShown\}<\/Text>/);
  assert.match(s, /pendingShare\.current = reportPreview;\s*setReportPreview\(null\);/);
  assert.match(s, /onDismiss=\{runPendingShare\}/);
});

test('the line and the Share label in six languages', () => {
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.ok(tr[l].settings_report_preview_note && tr[l].settings_report_share, l);
  assert.equal(tr.en.settings_report_preview_note, 'This is exactly what your provider will receive.');
});
