'use strict';
// Found on the simulator 2026-10-03 (round 4): saving a NEW protocol failed with "Couldn't save
// your changes" — ReferenceError: protocolPayload doesn't exist (ProtocolsScreen calls it but never
// imported it from lib/protocolForm since 3cee468; Edit kept working through editPatch). Guard:
// every lib/protocolForm export a screen calls is imported by that screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const exportsOf = Object.keys(require('../lib/protocolForm'));
for (const f of ['screens/ProtocolsScreen.js', 'screens/AssistantScreen.js', 'screens/TodayScreen.js']) {
  test(`${f} imports every lib/protocolForm function it calls`, () => {
    const p = path.join(__dirname, '..', f);
    if (!fs.existsSync(p)) return;
    const src = fs.readFileSync(p, 'utf8');
    const m = src.match(/import \{([^}]*)\} from '\.\.\/lib\/protocolForm';/);
    const imported = new Set(m ? m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean) : []);
    const code = src.replace(/\/\/[^\n]*/g, '');
    for (const name of exportsOf) {
      if (new RegExp(`(?:^|[^\\w$.]|\\.\\.\\.)${name}\\(`).test(code)) assert.ok(imported.has(name), `${f} calls ${name}( without importing it`);
    }
  });
}
