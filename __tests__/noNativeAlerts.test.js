'use strict';
// Pre-build pass 2026-10-03, M4: 28 native alerts were left (Settings 15, Today 7, Dose log 3,
// food chat 2, NutritionLogger 1) and the food chat still asked the AI consent in a native
// alert. Ledger: "DoseTrace sheets replace native iOS alerts everywhere" — only OS-owned UI
// stays (system permission prompts, the share sheet, the store purchase sheets). This guard
// fails if Alert (react-native) is used anywhere in the app's code. ALLOW lists a file only
// with the reason the OS requires it (none today).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');

const ROOT = path.join(__dirname, '..');
const ALLOW = {
  // 'path/to/file.js': 'why the OS requires a native alert here',
};

function jsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(rel));
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

function alertUses(src) {
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
  const hits = [];
  const visit = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'ImportDeclaration' && n.source.value === 'react-native'
      && n.specifiers.some((sp) => sp.imported && sp.imported.name === 'Alert')) hits.push(`import Alert (line ${n.loc.start.line})`);
    if (n.type === 'MemberExpression' && n.object.type === 'Identifier' && n.object.name === 'Alert'
      && n.property.type === 'Identifier' && (n.property.name === 'alert' || n.property.name === 'prompt')) hits.push(`Alert.${n.property.name} (line ${n.loc.start.line})`);
    for (const k of Object.keys(n)) {
      if (k === 'loc') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === 'string') visit(v);
    }
  };
  visit(ast);
  return hits;
}

test('the guard sees a native alert', () => {
  assert.equal(alertUses("import { Alert } from 'react-native';\nAlert.alert('a', 'b');").length, 2);
  assert.equal(alertUses("// Alert.alert(t('error'))\nconst x = 1;").length, 0, 'comments do not count');
});

test('no native alert in screens/, components/, lib/ or App.js (DoseTrace sheets only)', () => {
  const files = [...jsFiles('screens'), ...jsFiles('components'), ...jsFiles('lib'), 'App.js'];
  const found = [];
  for (const f of files) {
    if (ALLOW[f]) continue;
    for (const h of alertUses(fs.readFileSync(path.join(ROOT, f), 'utf8'))) found.push(`${f}: ${h}`);
  }
  assert.deepEqual(found, []);
});

test('every allow-listed file says why the OS requires it', () => {
  for (const [f, why] of Object.entries(ALLOW)) assert.ok(why && why.length > 10, f);
});

// The sheet keeps what the native alerts did.
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('a sheet closed without a button runs onDismiss (the alert\'s cancelable onDismiss)', () => {
  const src = read('screens/components/ProtocolParts.js');
  const dt = src.slice(src.indexOf('export function DTSheet'), src.indexOf('export function DTActionSheet'));
  assert.match(dt, /const dismiss = \(\) => \{ after\.queue\(shown\.onDismiss\); onClose\(\); \}/);
  assert.match(dt, /onRequestClose=\{dismiss\}/);
  assert.match(dt, /style=\{s\.scrim\} onPress=\{dismiss\}/);
});

test('Settings: sign out and both delete steps ask with Cancel first and the action in the risk colour', () => {
  const src = read('screens/SettingsScreen.js');
  const so = src.slice(src.indexOf('async function handleSignOut'), src.indexOf('function handleDeleteAccount'));
  assert.match(so, /\{ label: t\('cancel'\), kind: 'secondary' \},\s*\{ label: t\('settings_signout'\), kind: 'danger'/);
  const del = src.slice(src.indexOf('function handleDeleteAccount'), src.indexOf('async function executeAccountDeletion'));
  assert.match(del, /\{ label: t\('cancel'\), kind: 'secondary' \},\s*\/\/[^\n]*\n[^\n]*\n\s*\{ label: t\('settings_delete_confirm'\), kind: 'danger'/);
  assert.match(del, /\{ label: t\('cancel'\), kind: 'secondary' \},\s*\{ label: t\('settings_delete_final_confirm'\), kind: 'danger', onPress: \(\) => executeAccountDeletion\(\) \}/);
});

test('Settings: after a deletion the Apple note clears the phone however it is closed, once', () => {
  const src = read('screens/SettingsScreen.js');
  assert.match(src, /teardown: true,\s*buttons: \[\{ label: t\('done'\), kind: 'primary', onPress: runTeardown \}\]/);
  assert.match(src, /if \(closing && closing\.teardown\) runTeardown\(\);/);
  assert.match(src, /if \(tornDown\.current\) return;/);
});

test('Settings: Edit profile errors are shown from inside the Edit profile sheet', () => {
  const src = read('screens/SettingsScreen.js');
  const save = src.slice(src.indexOf('async function saveProfile'), src.indexOf('async function handleExportData'));
  assert.equal((save.match(/setEditSheet\(/g) || []).length, 2);
  assert.doesNotMatch(save, /setSheet\(|notice\(|errorSheet\(/);
});

test('Today: the site picker\'s Android-back question is asked from inside the picker; the day question is a sheet with Cancel', () => {
  const src = read('screens/TodayScreen.js');
  assert.match(src, /sheet=\{siteSheet\}\s*onSheetClose=\{\(\) => setSiteSheet\(null\)\}/);
  const back = src.slice(src.indexOf('function handleBodyMapBack'), src.indexOf('function handleBodyMapSkip'));
  assert.match(back, /\{ label: t\('today_site_back_stay'\), kind: 'secondary' \},\s*\{ label: t\('today_site_back_leave'\), kind: 'danger'/);
  assert.match(src, /onDismiss: \(\) => resetTake\(p\.id\)/, 'a tap outside the day question puts the button back');
  assert.match(src, /todaySheetOpenRef\.current;\n/, 'the sheet counts as one of Today\'s popups');
  const body = read('screens/components/BodyMapModal.js');
  const tail = body.slice(body.lastIndexOf('</KeyboardAvoidingView>'));
  assert.match(tail, /<DTSheet config=\{sheet\}/);
});

test('food chat: the AI consent is the DoseTrace sheet with the shared key, never a native alert', () => {
  const src = read('screens/FoodChatScreen.js');
  assert.match(src, /hasAIConsent\(\)/);
  assert.match(src, /grantAIConsent\(\)/);
  assert.match(src, /onDismiss: \(\) => resolve\(false\)/);
  assert.doesNotMatch(read('lib/aiConsent.js'), /requestAIConsent|from 'react-native'/);
});
