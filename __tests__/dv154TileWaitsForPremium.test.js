// DV-154 (DL-34; parked-error sweep 2026-10-31): while Premium was still unknown (null), the Journey curve tile
// showed the Premium tag and a tap opened the free preview — a paying user saw "Premium" on their own feature for
// a moment. Unknown now waits: no tag, and a tap does nothing until the answer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-154: only premium === false shows the tag and opens the preview; null waits', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/JourneyScreen.js'), 'utf8');
  assert.match(src, /tag=\{premium === false \? t\('paywall_premium'\) : null\}/);
  assert.match(src, /if \(premium === null\) return; \/\/ DV-154/);
  assert.match(src, /if \(premium === false\) \{ setPreviewKey\('serum'\); return; \}/);
});
