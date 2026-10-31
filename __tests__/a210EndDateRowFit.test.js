// A-210 (Android pass 2026-10-31, Fold folded, pt): "Sem data" in "Termina em" wrapped onto two
// lines. In a row that opens something the value sat in a box already capped at 60% of the row and
// was capped again at 60% of that box (about 36% of the row). The value inside that box is no
// longer capped a second time.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('A-210: the value of a tap row is capped once (the end box), never twice', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/ProtocolsScreen.js'), 'utf8');
  assert.match(src, /<Text style=\{\[s\.rwVal, s\.rwValInTap, r\.muted && s\.rwValMuted\]\}>\{r\.value\}<\/Text>/);
  assert.match(src, /rwValInTap: \{ maxWidth: '100%', flexShrink: 1 \},/);
});
