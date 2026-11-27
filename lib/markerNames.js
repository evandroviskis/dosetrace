// A-207 (founder 2026-10-31, "Pode executar agora"): the lab scan stores each marker under its
// English name so the same test from labs in different countries lands in one chart (extract-
// bloodwork prompt). The app shows that name in the app's language; the stored name never changes.
// A marker that is not in the list, or one the person renamed, shows exactly as stored.
// Keys: lib/exportRecords canonicalMarker (case, punctuation and word order merged).
// Pure CommonJS (node --test); Metro imports it fine.
const { canonicalMarker } = require('./exportRecords');

// English name → es, pt, fr, de, it (the names a lab report in that language prints).
const NAMES = [
  ['Hemoglobin', 'Hemoglobina', 'Hemoglobina', 'Hémoglobine', 'Hämoglobin', 'Emoglobina'],
  ['Hematocrit', 'Hematocrito', 'Hematócrito', 'Hématocrite', 'Hämatokrit', 'Ematocrito'],
  ['Red Blood Cells', 'Glóbulos rojos', 'Hemácias', 'Globules rouges', 'Erythrozyten', 'Globuli rossi'],
  ['White Blood Cells', 'Glóbulos blancos', 'Leucócitos', 'Globules blancs', 'Leukozyten', 'Globuli bianchi'],
  ['Leukocytes', 'Leucocitos', 'Leucócitos', 'Leucocytes', 'Leukozyten', 'Leucociti'],
  ['Platelets', 'Plaquetas', 'Plaquetas', 'Plaquettes', 'Thrombozyten', 'Piastrine'],
  ['Neutrophils', 'Neutrófilos', 'Neutrófilos', 'Neutrophiles', 'Neutrophile', 'Neutrofili'],
  ['Lymphocytes', 'Linfocitos', 'Linfócitos', 'Lymphocytes', 'Lymphozyten', 'Linfociti'],
  ['Monocytes', 'Monocitos', 'Monócitos', 'Monocytes', 'Monozyten', 'Monociti'],
  ['Eosinophils', 'Eosinófilos', 'Eosinófilos', 'Éosinophiles', 'Eosinophile', 'Eosinofili'],
  ['Basophils', 'Basófilos', 'Basófilos', 'Basophiles', 'Basophile', 'Basofili'],
  ['MCV', 'VCM', 'VCM', 'VGM', 'MCV', 'MCV'],
  ['MCH', 'HCM', 'HCM', 'TCMH', 'MCH', 'MCH'],
  ['MCHC', 'CHCM', 'CHCM', 'CCMH', 'MCHC', 'MCHC'],
  ['RDW', 'ADE', 'RDW', 'IDR', 'RDW', 'RDW'],
  ['Glucose', 'Glucosa', 'Glicose', 'Glucose', 'Glukose', 'Glucosio'],
  ['Fasting Glucose', 'Glucosa en ayunas', 'Glicose em jejum', 'Glycémie à jeun', 'Nüchternglukose', 'Glicemia a digiuno'],
  ['Hemoglobin A1c', 'Hemoglobina glicosilada (HbA1c)', 'Hemoglobina glicada (HbA1c)', 'Hémoglobine glyquée (HbA1c)', 'HbA1c', 'Emoglobina glicata (HbA1c)'],
  ['Insulin', 'Insulina', 'Insulina', 'Insuline', 'Insulin', 'Insulina'],
  ['Total Cholesterol', 'Colesterol total', 'Colesterol total', 'Cholestérol total', 'Gesamtcholesterin', 'Colesterolo totale'],
  ['HDL Cholesterol', 'Colesterol HDL', 'Colesterol HDL', 'Cholestérol HDL', 'HDL-Cholesterin', 'Colesterolo HDL'],
  ['LDL Cholesterol', 'Colesterol LDL', 'Colesterol LDL', 'Cholestérol LDL', 'LDL-Cholesterin', 'Colesterolo LDL'],
  ['Non-HDL Cholesterol', 'Colesterol no HDL', 'Colesterol não HDL', 'Cholestérol non-HDL', 'Non-HDL-Cholesterin', 'Colesterolo non HDL'],
  ['VLDL Cholesterol', 'Colesterol VLDL', 'Colesterol VLDL', 'Cholestérol VLDL', 'VLDL-Cholesterin', 'Colesterolo VLDL'],
  ['Triglycerides', 'Triglicéridos', 'Triglicerídeos', 'Triglycérides', 'Triglyzeride', 'Trigliceridi'],
  ['TSH', 'TSH', 'TSH', 'TSH', 'TSH', 'TSH'],
  ['T4 free', 'T4 libre', 'T4 livre', 'T4 libre', 'Freies T4', 'FT4'],
  ['Free T4', 'T4 libre', 'T4 livre', 'T4 libre', 'Freies T4', 'FT4'],
  ['Free T3', 'T3 libre', 'T3 livre', 'T3 libre', 'Freies T3', 'FT3'],
  ['Testosterone, Total', 'Testosterona total', 'Testosterona total', 'Testostérone totale', 'Testosteron gesamt', 'Testosterone totale'],
  ['Testosterone, Free', 'Testosterona libre', 'Testosterona livre', 'Testostérone libre', 'Freies Testosteron', 'Testosterone libero'],
  ['Estradiol', 'Estradiol', 'Estradiol', 'Œstradiol', 'Östradiol', 'Estradiolo'],
  ['SHBG', 'SHBG', 'SHBG', 'SHBG', 'SHBG', 'SHBG'],
  ['LH', 'LH', 'LH', 'LH', 'LH', 'LH'],
  ['FSH', 'FSH', 'FSH', 'FSH', 'FSH', 'FSH'],
  ['Prolactin', 'Prolactina', 'Prolactina', 'Prolactine', 'Prolaktin', 'Prolattina'],
  ['Progesterone', 'Progesterona', 'Progesterona', 'Progestérone', 'Progesteron', 'Progesterone'],
  ['DHEA-S', 'DHEA-S', 'DHEA-S', 'DHEA-S', 'DHEA-S', 'DHEA-S'],
  ['Cortisol', 'Cortisol', 'Cortisol', 'Cortisol', 'Cortisol', 'Cortisolo'],
  ['IGF-1', 'IGF-1', 'IGF-1', 'IGF-1', 'IGF-1', 'IGF-1'],
  ['PSA total', 'PSA total', 'PSA total', 'PSA total', 'PSA gesamt', 'PSA totale'],
  ['Ferritin', 'Ferritina', 'Ferritina', 'Ferritine', 'Ferritin', 'Ferritina'],
  ['Iron', 'Hierro', 'Ferro', 'Fer', 'Eisen', 'Ferro'],
  ['Transferrin Saturation', 'Saturación de transferrina', 'Saturação de transferrina', 'Coefficient de saturation de la transferrine', 'Transferrinsättigung', 'Saturazione della transferrina'],
  ['Vitamin D (25-hydroxy)', 'Vitamina D (25-hidroxi)', 'Vitamina D (25-hidroxi)', 'Vitamine D (25-hydroxy)', 'Vitamin D (25-Hydroxy)', 'Vitamina D (25-idrossi)'],
  ['Vitamin D, 25-Hydroxy', 'Vitamina D (25-hidroxi)', 'Vitamina D (25-hidroxi)', 'Vitamine D (25-hydroxy)', 'Vitamin D (25-Hydroxy)', 'Vitamina D (25-idrossi)'],
  ['Vitamin B12', 'Vitamina B12', 'Vitamina B12', 'Vitamine B12', 'Vitamin B12', 'Vitamina B12'],
  ['Folate', 'Ácido fólico', 'Ácido fólico', 'Folates', 'Folsäure', 'Acido folico'],
  ['Creatinine', 'Creatinina', 'Creatinina', 'Créatinine', 'Kreatinin', 'Creatinina'],
  ['Urea', 'Urea', 'Ureia', 'Urée', 'Harnstoff', 'Urea'],
  ['Blood Urea Nitrogen', 'Nitrógeno ureico', 'Nitrogênio ureico', 'Azote uréique', 'Harnstoff-Stickstoff', 'Azoto ureico'],
  ['eGFR', 'TFGe', 'TFG estimada', 'DFG estimé', 'eGFR', 'eGFR'],
  ['Uric Acid', 'Ácido úrico', 'Ácido úrico', 'Acide urique', 'Harnsäure', 'Acido urico'],
  ['Sodium', 'Sodio', 'Sódio', 'Sodium', 'Natrium', 'Sodio'],
  ['Potassium', 'Potasio', 'Potássio', 'Potassium', 'Kalium', 'Potassio'],
  ['Calcium', 'Calcio', 'Cálcio', 'Calcium', 'Kalzium', 'Calcio'],
  ['Magnesium', 'Magnesio', 'Magnésio', 'Magnésium', 'Magnesium', 'Magnesio'],
  ['ALT', 'ALT (GPT)', 'ALT (TGP)', 'ALAT', 'GPT (ALT)', 'ALT'],
  ['AST', 'AST (GOT)', 'AST (TGO)', 'ASAT', 'GOT (AST)', 'AST'],
  ['GGT', 'GGT', 'GGT', 'Gamma-GT', 'Gamma-GT', 'GGT'],
  ['Alkaline Phosphatase', 'Fosfatasa alcalina', 'Fosfatase alcalina', 'Phosphatases alcalines', 'Alkalische Phosphatase', 'Fosfatasi alcalina'],
  ['Total Bilirubin', 'Bilirrubina total', 'Bilirrubina total', 'Bilirubine totale', 'Gesamtbilirubin', 'Bilirubina totale'],
  ['Albumin', 'Albúmina', 'Albumina', 'Albumine', 'Albumin', 'Albumina'],
  ['Total Protein', 'Proteínas totales', 'Proteínas totais', 'Protéines totales', 'Gesamteiweiß', 'Proteine totali'],
  ['C-Reactive Protein', 'Proteína C reactiva', 'Proteína C reativa', 'Protéine C réactive', 'C-reaktives Protein', 'Proteina C reattiva'],
  ['hs-CRP', 'PCR ultrasensible', 'PCR ultrassensível', 'CRP ultrasensible', 'hs-CRP', 'PCR ad alta sensibilità'],
  ['Homocysteine', 'Homocisteína', 'Homocisteína', 'Homocystéine', 'Homocystein', 'Omocisteina'],
  // English synonyms the scan writes (production table, recording 2026-11-26): same names as above.
  ['Vitamin D (25-OH)', 'Vitamina D (25-OH)', 'Vitamina D (25-OH)', 'Vitamine D (25-OH)', 'Vitamin D (25-OH)', 'Vitamina D (25-OH)'],
  ['25-Hydroxyvitamin D', 'Vitamina D (25-hidroxi)', 'Vitamina D (25-hidroxi)', 'Vitamine D (25-hydroxy)', 'Vitamin D (25-Hydroxy)', 'Vitamina D (25-idrossi)'],
  ['Vitamin B-12', 'Vitamina B12', 'Vitamina B12', 'Vitamine B12', 'Vitamin B12', 'Vitamina B12'],
  ['HbA1c', 'Hemoglobina glicosilada (HbA1c)', 'Hemoglobina glicada (HbA1c)', 'Hémoglobine glyquée (HbA1c)', 'HbA1c', 'Emoglobina glicata (HbA1c)'],
  ['BUN', 'Nitrógeno ureico (BUN)', 'Nitrogênio ureico (BUN)', 'Azote uréique (BUN)', 'Harnstoff-Stickstoff (BUN)', 'Azoto ureico (BUN)'],
  ['Thyroid Stimulating Hormone', 'TSH', 'TSH', 'TSH', 'TSH', 'TSH'],
  ['Free Thyroxine', 'T4 libre', 'T4 livre', 'T4 libre', 'Freies T4', 'FT4'],
  ['Mean Corpuscular Volume', 'VCM', 'VCM', 'VGM', 'MCV', 'MCV'],
  ['Mean Corpuscular Hemoglobin', 'HCM', 'HCM', 'TCMH', 'MCH', 'MCH'],
  ['Mean Corpuscular Hemoglobin Concentration', 'CHCM', 'CHCM', 'CCMH', 'MCHC', 'MCHC'],
  ['Red Cell Distribution Width', 'ADE', 'RDW', 'IDR', 'RDW', 'RDW'],
  ['Platelet Count', 'Plaquetas', 'Plaquetas', 'Plaquettes', 'Thrombozyten', 'Piastrine'],
  ['Mean Platelet Volume', 'Volumen plaquetario medio', 'Volume plaquetário médio', 'Volume plaquettaire moyen', 'Mittleres Thrombozytenvolumen', 'Volume piastrinico medio'],
  ['MPV', 'Volumen plaquetario medio', 'Volume plaquetário médio', 'Volume plaquettaire moyen', 'Mittleres Thrombozytenvolumen', 'Volume piastrinico medio'],
  ['Prostate Specific Antigen', 'Antígeno prostático específico (PSA)', 'Antígeno prostático específico (PSA)', 'Antigène prostatique spécifique (PSA)', 'Prostataspezifisches Antigen (PSA)', 'Antigene prostatico specifico (PSA)'],
  ['Alanine Aminotransferase', 'ALT (GPT)', 'ALT (TGP)', 'ALAT', 'GPT (ALT)', 'ALT'],
  ['Aspartate Aminotransferase', 'AST (GOT)', 'AST (TGO)', 'ASAT', 'GOT (AST)', 'AST'],
  ['Gamma-Glutamyl Transferase', 'GGT', 'GGT', 'Gamma-GT', 'Gamma-GT', 'GGT'],
  ['Gamma-GT', 'GGT', 'GGT', 'Gamma-GT', 'Gamma-GT', 'GGT'],
  ['Bilirubin', 'Bilirrubina', 'Bilirrubina', 'Bilirubine', 'Bilirubin', 'Bilirubina'],
  ['Direct Bilirubin', 'Bilirrubina directa', 'Bilirrubina direta', 'Bilirubine directe', 'Direktes Bilirubin', 'Bilirubina diretta'],
  ['Indirect Bilirubin', 'Bilirrubina indirecta', 'Bilirrubina indireta', 'Bilirubine indirecte', 'Indirektes Bilirubin', 'Bilirubina indiretta'],
  ['Ionized Calcium', 'Calcio iónico', 'Cálcio iônico', 'Calcium ionisé', 'Ionisiertes Kalzium', 'Calcio ionizzato'],
  ['Lactate Dehydrogenase', 'Lactato deshidrogenasa (LDH)', 'Desidrogenase láctica (LDH)', 'Lactate déshydrogénase (LDH)', 'Laktatdehydrogenase (LDH)', 'Lattato deidrogenasi (LDH)'],
  ['Estimated Mean Glucose', 'Glucosa media estimada', 'Glicose média estimada', 'Glycémie moyenne estimée', 'Geschätzte mittlere Glukose', 'Glicemia media stimata'],
  ['Neutrophils, absolute', 'Neutrófilos (absolutos)', 'Neutrófilos (absolutos)', 'Neutrophiles (absolus)', 'Neutrophile (absolut)', 'Neutrofili (assoluti)'],
  ['Lymphocytes, absolute', 'Linfocitos (absolutos)', 'Linfócitos (absolutos)', 'Lymphocytes (absolus)', 'Lymphozyten (absolut)', 'Linfociti (assoluti)'],
  ['Monocytes, absolute', 'Monocitos (absolutos)', 'Monócitos (absolutos)', 'Monocytes (absolus)', 'Monozyten (absolut)', 'Monociti (assoluti)'],
  ['Eosinophils, absolute', 'Eosinófilos (absolutos)', 'Eosinófilos (absolutos)', 'Éosinophiles (absolus)', 'Eosinophile (absolut)', 'Eosinofili (assoluti)'],
  ['Basophils, absolute', 'Basófilos (absolutos)', 'Basófilos (absolutos)', 'Basophiles (absolus)', 'Basophile (absolut)', 'Basofili (assoluti)'],
];
const LANGS = ['es', 'pt', 'fr', 'de', 'it'];

const BY_KEY = {};
for (const row of NAMES) BY_KEY[canonicalMarker(row[0])] = row;

// The name to show for a stored marker in the app's language.
function markerLabel(name, language) {
  const stored = String(name == null ? '' : name);
  const i = LANGS.indexOf(String(language || '').slice(0, 2));
  if (i < 0) return stored;
  const row = BY_KEY[canonicalMarker(stored)];
  return row ? row[i + 1] : stored;
}

// The name to save from the Edit value window: a name left as shown keeps the stored one (so the
// test stays in its chart); a name the person typed is saved as typed.
function markerToSave(typed, stored, language) {
  const t = String(typed || '').trim();
  if (stored && t === markerLabel(stored, language)) return stored;
  return t;
}

module.exports = { markerLabel, markerToSave, MARKER_NAMES: NAMES };
