// Found on the S25 2026-10-31 19:17 EDT, fixed on the spot (founder rule 19:08 EDT): Today's badge for a
// dose still to take said "Agora" in Portuguese — a 09:10 Zinc dose showed "Agora" at 19:17. The other
// languages say "Due" / "Pendiente" / "À prendre" / "Fällig" / "Da prendere"; Portuguese says
// "Pendente", the word the app already uses for this ("Pendente de ontem"; one term per concept).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('the due badge reads "Pendente" in Portuguese, never "Agora"', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'i18n/translations.js'), 'utf8');
  const vals = [...src.matchAll(/^\s*today_due:\s*(["'])(.*)\1,/gm)].map((m) => m[2]);
  assert.deepEqual(vals, ['Due', 'Pendiente', 'Pendente', 'À prendre', 'Fällig', 'Da prendere']);
});
