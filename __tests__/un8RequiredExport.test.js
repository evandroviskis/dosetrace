'use strict';
// A-127 UN-8 (docs/specs/update-notice.md; founder 2026-10-20 "1.3.2 recommendations accepted": the
// required-update screen offers "Exportar meus dados"). The screen still cannot be closed and still
// deletes nothing; the export is the ONE export of Settings (lib/accountActions exportMyData), never
// a second implementation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { read, sliceBlock } = require('./helpers/extractFn');

const { requiredExport, createRequiredExport } = require('../lib/requiredExport');

const t = (k) => `[${k}]`;
const user = { id: 'u1', email: 'a@b.c', user_metadata: {} };

test('UN-8 the export is the Settings export: exportMyData(user, "Baixar meus dados" title) once; shared = nothing more to show', async () => {
  const calls = [];
  const sheet = await requiredExport({ user, t, exportMyData: async (...a) => { calls.push(a); return { shared: true }; } });
  assert.deepEqual(calls, [[user, '[settings_export_title]']]);
  assert.equal(sheet, null);
});

test('UN-8 no share sheet on the phone (saved): the Settings "done" words; a failure: the Settings error words', async () => {
  const saved = await requiredExport({ user, t, exportMyData: async () => ({ saved: true }) });
  assert.equal(saved.title, '[settings_export_title]');
  assert.equal(saved.body, '[settings_export_done]');
  assert.equal(saved.icon, 'check');
  assert.equal(saved.buttons.length, 1);
  const failed = await requiredExport({ user, t, exportMyData: async () => { throw new Error('disk full'); } });
  assert.equal(failed.body, '[settings_export_error]');
  assert.equal(failed.icon, 'warning');
  assert.equal(failed.buttons.length, 1);
});

test('UN-8 signed out (no user): no export runs and nothing is shown', async () => {
  let ran = false;
  const r = await requiredExport({ user: null, t, exportMyData: async () => { ran = true; return { shared: true }; } });
  assert.equal(r, null);
  assert.equal(ran, false);
});

test('UN-8 a second tap while the export runs is ignored (one share sheet at a time)', async () => {
  let release;
  let n = 0;
  const exp = createRequiredExport();
  const exportMyData = () => { n++; return new Promise((res) => { release = () => res({ shared: true }); }); };
  const first = exp.run({ user, t, exportMyData });
  assert.equal(exp.busy(), true);
  const second = await exp.run({ user, t, exportMyData });
  assert.equal(second, null);
  assert.equal(n, 1);
  release();
  await first;
  assert.equal(exp.busy(), false);
});

test('UN-8 the required screen: the Settings row words (Baixar meus dados) as the secondary button under "Atualizar", only when an export is offered; still no close, Android back still stays', () => {
  const src = read('components/UpdateNotice.js');
  const body = sliceBlock(src, 'export function UpdateRequiredScreen(');
  assert.match(body, /^export function UpdateRequiredScreen\(\{ reason, onUpdate, onExport, exporting \}\)/);
  assert.match(body, /t\('settings_export_title'\)/);
  const upd = body.indexOf("t('upd_update')");
  const exp = body.indexOf("t('settings_export_title')");
  assert.ok(upd > 0 && exp > upd, 'Atualizar first, the export below it (the stacked DTSheet order)');
  assert.match(body, /\{onExport \? \(/, 'the button exists only when an export is offered');
  assert.match(body, /disabled=\{!!exporting\}/);
  assert.match(body, /hardwareBackPress', \(\) => true/, 'Android back still stays on the screen');
  assert.doesNotMatch(body, /onClose|onRequestClose|navigation\.goBack/, 'nothing closes it');
  // Theme tokens only: the secondary button is the DTSheet secondary (well + ink).
  const styles = sliceBlock(src, 'const requiredStyles = (c) => StyleSheet.create(');
  assert.match(styles, /btnSecondary: \{[^}]*backgroundColor: c\.well/);
  assert.match(styles, /btnSecondaryText: \{[^}]*color: c\.ink\b/);
  assert.doesNotMatch(styles, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba\(/);
});

test('UN-8 App: the export is offered only while signed in, through the ONE export (lib/accountActions exportMyData)', () => {
  const src = read('App.js');
  assert.match(src, /import \{ signOutIntended, exportMyData \} from '\.\/lib\/accountActions';/);
  assert.match(src, /import \{ createRequiredExport \} from '\.\/lib\/requiredExport';/);
  // The handler runs the shared guard with the real export and shows its answer in a DoseTrace sheet.
  assert.match(src, /requiredExportRef\.current\.run\(\{ user: session && session\.user, t, exportMyData \}\)/);
  const root = src.slice(src.indexOf('if (updateRequired) {'), src.indexOf('const navTheme = navThemeFor('));
  assert.match(root, /<UpdateRequiredScreen reason=\{updateRequired\.reason\} onUpdate=\{upd\.onRequiredUpdate\} onExport=\{session && session\.user \? onRequiredExport : null\} exporting=\{requiredExporting\} \/>/);
  assert.match(root, /<DTSheet config=\{requiredExportSheet\} onClose=\{\(\) => setRequiredExportSheet\(null\)\} \/>/);
});

test('UN-8 never a second export implementation: no file write or share sheet outside lib/accountActions', () => {
  const src = read('lib/requiredExport.js') + read('components/UpdateNotice.js');
  assert.doesNotMatch(src, /writeAsStringAsync|shareAsync|expo-sharing|expo-file-system|getAllDataForExport/);
});

test('UN-4 / UN-8 the required screen still deletes nothing (the export path included)', () => {
  const src = read('lib/requiredExport.js') + read('components/UpdateNotice.js');
  assert.doesNotMatch(src, /clearLocalDatabase|signOut|removeItem\(/);
  assert.doesNotMatch(src, /DELETE FROM|\.delete\(|getDB|executeSql|runSql/i);
});

function loadTranslations() {
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8').replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };';
  const mod = { exports: {} };
  new Function('module', 'exports', src)(mod, mod.exports);
  return mod.exports.translations;
}

test('UN-8 / UN-7 one term per concept: the button is the Settings row (settings_export_title, Baixar meus dados x6); no second key for it', () => {
  const tr = loadTranslations();
  assert.equal(tr.pt.settings_export_title, 'Baixar meus dados');
  assert.equal(tr.en.settings_export_title, 'Download my data');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.equal(tr[l].upd_req_export, undefined, l + ' has no upd_req_export');
  assert.doesNotMatch(read('components/UpdateNotice.js'), /upd_req_export/);
});
