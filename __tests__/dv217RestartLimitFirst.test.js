// DV-217 (parked-error sweep 2026-10-31; PRD-PROT-90, flow 05 §7.2): Restart asked the duplicate warning and
// the container question, and only then refused at the free limit — a question whose answer is refused must
// not be asked. The limit is checked first now (the later check in restartProtocol stays as the safety net).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-217: askRestart checks the free limit before any question', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/ProtocolsScreen.js'), 'utf8');
  const fn = src.slice(src.indexOf('async function askRestart(p, { openAfter = false } = {}) {'), src.indexOf('const restartingRef = useRef(false);'));
  assert.ok(fn.length > 0, 'askRestart is async');
  const limit = fn.indexOf('if (await isOverFreeLimit()) { promptUpgrade(); return; }');
  assert.ok(limit > 0 && limit < fn.indexOf('setScreenSheet('), 'the limit before the first sheet');
});
