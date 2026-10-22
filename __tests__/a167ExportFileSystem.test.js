'use strict';
// A-167 (found 2026-10-22 on the iPhone simulator, build-4 bundle): Settings › Download my data always
// said "Could not export your data". Since Expo SDK 54 the legacy methods (documentDirectory,
// writeAsStringAsync, …) imported from 'expo-file-system' throw on purpose; they live in
// 'expo-file-system/legacy'. lib/accountActions.js exportMyData still required the bare module.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
function files(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...files(rel));
    else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}

test('A-167: exportMyData uses the legacy file-system API (the bare module throws on SDK 54)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib/accountActions.js'), 'utf8');
  assert.match(src, /require\('expo-file-system\/legacy'\)/);
  assert.doesNotMatch(src, /require\('expo-file-system'\)/);
});

test('A-167 guard: no app file calls a legacy method through the bare expo-file-system module', () => {
  const offenders = [];
  for (const f of ['App.js', ...files('lib'), ...files('screens'), ...files('components')]) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (/(from\s+'expo-file-system'|require\('expo-file-system'\))/.test(s)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], 'import legacy methods from expo-file-system/legacy');
});
