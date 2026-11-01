// DV-201 (parked-error sweep 2026-10-31): an oversized PHOTO (vial label, lab photo, vaccine photo) said "Please
// choose a PDF under 10 MB". Photos get their own sentence (×6, es/fr/de/it wording to approve); PDFs keep theirs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { scanErrorSheet } = require('../lib/bodyScan');
const { translations } = require('../i18n/translations');

test('DV-201: a too-large photo never mentions PDF', () => {
  const t = (k) => translations.pt[k];
  assert.equal(scanErrorSheet('bigPhoto', t).body, translations.pt.scan_photo_too_large);
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.doesNotMatch(translations[l].scan_photo_too_large, /PDF/, l);
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.match(read('screens/ProtocolsScreen.js'), /if \(asset\.base64\.length > MAX_SCAN_BYTES \* 1\.4\) return fail\(t\('error'\), t\('scan_photo_too_large'\)\);/);
  assert.match(read('screens/BodyScreen.js'), /if \(base64\.length > MAX_FILE_BYTES \* 1\.4\) \{ notice\(scanErrorSheet\('bigPhoto', t\), true\); return; \}/);
  assert.match(read('screens/components/VaccinesSection.js'), /if \(asset\.base64\.length > MAX_FILE_BYTES \* 1\.4\) \{ notice\(scanErrorSheet\('bigPhoto', t\), true\); return; \}/);
});
