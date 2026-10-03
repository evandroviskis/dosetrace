'use strict';
// Pre-build pass 2026-10-03, M1: Settings → Edit profile → Country never opened. The country
// sheet was a SIBLING of the Edit profile sheet, so iOS refused to present it ("Attempt to
// present … which is already presenting"); afterwards every Settings sheet stopped opening and
// a profile without a country could not be saved. A popup opened from inside another popup must
// be rendered inside it (presented from it). This guard checks every screen and component.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { siblingStacking } = require('./helpers/modalStacking');

const ROOT = path.join(__dirname, '..');
function jsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(rel));
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

test('the detector finds the old Settings layout (country sheet beside Edit profile)', () => {
  const old = `
    export default function S() {
      const [showEditProfile, setShowEditProfile] = useState(false);
      const [showCountryPicker, setShowCountryPicker] = useState(false);
      return (<View>
        <Modal visible={showEditProfile}><TouchableOpacity onPress={() => setShowCountryPicker(true)} /></Modal>
        <Modal visible={showCountryPicker}><Text>Country</Text></Modal>
      </View>);
    }`;
  assert.equal(siblingStacking(old).length, 1);
  const nested = old.replace('<TouchableOpacity onPress={() => setShowCountryPicker(true)} /></Modal>\n        <Modal visible={showCountryPicker}><Text>Country</Text></Modal>',
    '<TouchableOpacity onPress={() => setShowCountryPicker(true)} /><Modal visible={showCountryPicker}><Text>Country</Text></Modal></Modal>');
  assert.equal(siblingStacking(nested).length, 0);
});

test('the country sheet is presented from inside the Edit profile sheet', () => {
  const src = fs.readFileSync(path.join(ROOT, 'screens/SettingsScreen.js'), 'utf8');
  const edit = src.search(/<Modal\s+visible=\{showEditProfile\}/);
  const country = src.search(/<Modal\s+visible=\{showCountryPicker\}/);
  assert.ok(edit > 0 && country > edit, 'country sheet after the edit sheet opens');
  const editClose = src.indexOf('</Modal>', src.indexOf('</Modal>', country) + 1);
  assert.ok(editClose > country, 'the edit sheet closes after the country sheet');
  assert.deepEqual(siblingStacking(src), []);
});

test('no screen or component opens a popup from inside another popup while rendering it beside it', () => {
  const files = [...jsFiles('screens'), ...jsFiles('components')];
  const found = [];
  for (const f of files) {
    for (const msg of siblingStacking(fs.readFileSync(path.join(ROOT, f), 'utf8'))) found.push(`${f}: ${msg}`);
  }
  assert.deepEqual(found, []);
});

// A page sheet closed by a swipe down must reset its state (onRequestClose), or the state
// stays "open" and the next tap can never present it again.
test('every page sheet resets its state when swiped down (onRequestClose)', () => {
  const { parse } = require('@babel/parser');
  const missing = [];
  for (const f of [...jsFiles('screens'), ...jsFiles('components')]) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (!src.includes('pageSheet')) continue;
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const visit = (n) => {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'JSXOpeningElement' && n.name.name === 'Modal') {
        const names = n.attributes.filter((a) => a.type === 'JSXAttribute').map((a) => a.name.name);
        const sheet = n.attributes.some((a) => a.type === 'JSXAttribute' && a.name.name === 'presentationStyle' && a.value && a.value.value === 'pageSheet');
        if (sheet && !names.includes('onRequestClose')) missing.push(`${f}:${n.loc.start.line}`);
      }
      for (const k of Object.keys(n)) {
        const v = n[k];
        if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === 'string') visit(v);
      }
    };
    visit(ast);
  }
  assert.deepEqual(missing, []);
});
