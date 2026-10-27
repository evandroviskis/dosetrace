'use strict';
// Seen on the simulator 2026-10-27 (Quase todas → Editar frasco → Salvar): while the window faded out, the
// screen had already cleared its protocol, so a mixed vial's window showed the ready-to-use pen's "Data de
// validade — opcional" for a moment (and the name line vanished). Both vial windows keep the protocol they
// opened with until they are gone.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../screens/components/NewVialPrompt.js'), 'utf8');

test('Editar frasco and Novo frasco keep the protocol they opened with while fading out', () => {
  assert.match(src, /function useShownWhileClosing\(/);
  const edit = src.slice(src.indexOf('export function EditVialPrompt('));
  const add = src.slice(src.indexOf('export default function NewVialPrompt('), src.indexOf('export function EditVialPrompt('));
  for (const [name, body] of [['EditVialPrompt', edit], ['NewVialPrompt', add]]) {
    assert.match(body, /const protocol = useShownWhileClosing\(protocolProp\);/, name);
    assert.match(body, /const protocolName = useShownWhileClosing\(protocolNameProp\);/, name);
  }
  assert.match(edit, /export function EditVialPrompt\(\{ visible, protocol: protocolProp, protocolName: protocolNameProp,/);
  assert.match(add, /export default function NewVialPrompt\(\{ visible, mode = 'new', protocol: protocolProp, protocolName: protocolNameProp,/);
});
