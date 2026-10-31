// A-208 (founder 2026-10-31, on the iPhone simulator: "cada vez que tem algo que é premium… esse
// clique não abra o acúmulo de doses… mas que abra uma explicação animada que mostre o que a pessoa
// está perdendo"; "todos os features que são pagos… Tanto na evolução quanto no meu corpo"). A free
// user's tap on a Premium feature opens that feature's animated preview (components/FeaturePreviews)
// first; its "Desbloquear com Premium" opens the Paywall. Never the Paywall straight away, never a
// text-only sheet.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('A-208 Evolução: the Dose accumulation tile opens the animated preview (serum), not the Paywall', () => {
  const src = read('screens/JourneyScreen.js');
  assert.doesNotMatch(src, /navigation\.navigate\('Paywall', \{ source: 'journey_serum' \}\)/);
  assert.match(src, /if \(!premium\) \{ setPreviewKey\('serum'\); return; \}/);
  // S25 + iPhone 2026-10-31: the phone path returned early without the sheet, so nothing opened.
  const sheets = src.match(/\{previewSheet\}/g) || [];
  assert.equal(sheets.length, 2, 'the sheet is mounted on the phone path and on the book');
  assert.match(src, /const previewSheet = \(\s*<FeaturePreviewSheet featureKey=\{previewKey\}/);
});

test('A-208 Evolução › Progresso: the locked estimate opens the reality preview', () => {
  const src = read('screens/components/CalculatorSection.js');
  assert.doesNotMatch(src, /onPress=\{\(\) => navigation\.navigate\('Paywall'\)\}/);
  assert.match(src, /<TouchableOpacity onPress=\{\(\) => setRcExplain\(true\)\} activeOpacity=\{0\.7\} accessibilityRole="button">\s*<Text style=\{s\.linkU\}>\{t\('cal_tgt_locked_eta'\)\}/);
});

test('A-208 Meu corpo: the lab journal Premium card and PDF export open their animated previews', () => {
  const src = read('screens/BodyScreen.js');
  assert.match(src, /onPress=\{\(\) => setPreviewKey\('labs'\)\}>\s*<Text style=\{\[s\.btnPText, s\.btnSmText\]\}>\{t\('blood_upgrade'\)\}/);
  assert.doesNotMatch(src, /showUpgradeModal/, 'the old text-only upgrade sheet is replaced, not kept');
  const exp = src.slice(src.indexOf('async function doExport('), src.indexOf('async function doExport(') + 900);
  assert.match(exp, /if \(kind === 'pdf' && !\(await hasPremium\(\)\)\) \{\s*setExportModalOpen\(false\);\s*\/\/ A-208[^\n]*\n\s*setTimeout\(\(\) => setPreviewKey\('pdf'\), 300\);\s*return;/);
  assert.match(src, /<FeaturePreviewSheet\s*featureKey=\{previewKey\}/);
  assert.match(src, /onUnlock=\{\(\) => \{ const k = previewKey; setPreviewKey\(null\); setTimeout\(\(\) => navigation\.navigate\('Paywall', \{ source: `\$\{k\}_preview_sheet` \}\), 300\); \}\}/);
});

// iPhone 2026-10-31 (pt): the lab previews named the example markers in English ("Total
// Testosterone"). They show in the app's language, as the real lab journal does (A-207).
test('A-208: the lab previews name their example markers in the app language', () => {
  const src = read('components/FeaturePreviews.js');
  assert.match(src, /\{markerLabel\(m\[0\], language\)\}/);
  assert.match(src, /\{markerLabel\('Total Testosterone', language\)\}/);
  assert.doesNotMatch(src, />Total Testosterone</);
});
