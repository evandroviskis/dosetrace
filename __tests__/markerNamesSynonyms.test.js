'use strict';
// Recording 2026-11-26 (Ads, video 3 on the emulator, pt account): the example report's
// "Vitamina D (25-OH)" was saved by the scan as "Vitamin D (25-OH)" and showed in ENGLISH, because the
// display list (lib/markerNames, A-207) only knew "Vitamin D (25-hydroxy)". The scan writes common
// English synonyms the list did not have; the production table holds several of them (25-Hydroxyvitamin D,
// Vitamin B-12, HbA1c, BUN, Thyroid Stimulating Hormone, Free Thyroxine, Mean Corpuscular Volume…).
// Every one of these must show in the app's language. The stored name never changes (charts keep their key).
const test = require('node:test');
const assert = require('node:assert/strict');
const { markerLabel } = require('../lib/markerNames');

const PT = {
  'Vitamin D (25-OH)': 'Vitamina D (25-OH)',
  '25-OH Vitamin D': 'Vitamina D (25-OH)',
  '25-Hydroxyvitamin D': 'Vitamina D (25-hidroxi)',
  'Vitamin B-12': 'Vitamina B12',
  'HbA1c': 'Hemoglobina glicada (HbA1c)',
  'BUN': 'Nitrogênio ureico (BUN)',
  'Thyroid Stimulating Hormone': 'TSH',
  'Free Thyroxine': 'T4 livre',
  'Mean Corpuscular Volume': 'VCM',
  'Mean Corpuscular Hemoglobin': 'HCM',
  'Mean Corpuscular Hemoglobin Concentration': 'CHCM',
  'Red Cell Distribution Width': 'RDW',
  'Platelet Count': 'Plaquetas',
  'Mean Platelet Volume': 'Volume plaquetário médio',
  'MPV': 'Volume plaquetário médio',
  'Prostate Specific Antigen': 'Antígeno prostático específico (PSA)',
  'Alanine Aminotransferase': 'ALT (TGP)',
  'Aspartate Aminotransferase': 'AST (TGO)',
  'Gamma-Glutamyl Transferase': 'GGT',
  'Gamma-GT': 'GGT',
  'Bilirubin': 'Bilirrubina',
  'Direct Bilirubin': 'Bilirrubina direta',
  'Indirect Bilirubin': 'Bilirrubina indireta',
  'Ionized Calcium': 'Cálcio iônico',
  'Lactate Dehydrogenase': 'Desidrogenase láctica (LDH)',
  'Estimated Mean Glucose': 'Glicose média estimada',
  'Neutrophils, absolute': 'Neutrófilos (absolutos)',
  'Lymphocytes, absolute': 'Linfócitos (absolutos)',
  'Monocytes, absolute': 'Monócitos (absolutos)',
  'Eosinophils, absolute': 'Eosinófilos (absolutos)',
  'Basophils, absolute': 'Basófilos (absolutos)',
};

test('markers saved under common English synonyms show in Portuguese', () => {
  for (const [stored, want] of Object.entries(PT)) assert.equal(markerLabel(stored, 'pt'), want, stored);
});

test('every synonym has a name in es, fr, de and it too (none falls back to the stored English)', () => {
  for (const stored of Object.keys(PT)) {
    for (const l of ['es', 'fr', 'de', 'it']) {
      const got = markerLabel(stored, l);
      assert.ok(typeof got === 'string' && got.length > 0, stored + ' ' + l);
    }
    // in English the stored name stays as stored
    assert.equal(markerLabel(stored, 'en'), stored);
  }
  assert.equal(markerLabel('Vitamin D (25-OH)', 'fr'), 'Vitamine D (25-OH)');
  assert.equal(markerLabel('Thyroid Stimulating Hormone', 'de'), 'TSH');
  assert.equal(markerLabel('Direct Bilirubin', 'it'), 'Bilirubina diretta');
});

test('a name the list does not know still shows exactly as stored', () => {
  assert.equal(markerLabel('Urine Epithelial Cells', 'pt'), 'Urine Epithelial Cells');
});
