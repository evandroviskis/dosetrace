'use strict';
// Council 2026-10-26 (UX), confirmed on the iPhone 17 Pro Max simulator: in "Editar frasco" (and the
// New vial window) the iPhone number pad covered Cancelar / Salvar, has no Return key, and a tap
// outside the field did nothing — the person was stuck. Rule: on iPhone the window rises above the
// keyboard (KeyboardAvoidingView, padding) and a tap anywhere on the card closes the keyboard; the
// Android path (useSheetKeyboard) is unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../screens/components/NewVialPrompt.js'), 'utf8');

test('iPhone: both vial windows rise above the keyboard', () => {
  assert.match(src, /KeyboardAvoidingView/);
  const frame = src.slice(src.indexOf('function KeyboardFrame('), src.indexOf('function KeyboardFrame(') + 400);
  assert.match(frame, /Platform\.OS === 'ios'/);
  assert.match(frame, /behavior="padding"/);
  const modals = src.split('<Modal visible={!!visible}').slice(1);
  assert.equal(modals.length, 2, 'New vial + Edit vial');
  for (const m of modals) assert.match(m.slice(0, 400), /<KeyboardFrame>/);
});

test('iPhone: a tap on the card closes the number pad', () => {
  const pb = src.slice(src.indexOf('function PromptBody('), src.indexOf('function PromptBody(') + 600);
  assert.match(pb, /Keyboard\.dismiss/);
  assert.match(pb, /TouchableWithoutFeedback/);
  // Android keeps its scrolling body.
  assert.match(pb, /<ScrollView \{\.\.\.scrollProps\} contentContainerStyle=\{style\} keyboardShouldPersistTaps="handled"/);
});
