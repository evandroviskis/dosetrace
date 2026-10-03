'use strict';
// My Protocols redesign, the look (founder 2026-10-02, the page protocols/protocolos.html;
// values from docs/design/prototype.html .pscr / .navrow / .hero / .pcard / .hobj / .rows /
// .swatches / .stepper / .wheel and the style audit). Per-part choices: parts 1, 3-5, 8, 9,
// 11-13, 15-17, 19 the Proposta column; parts 2 and 7 the prototype; part 6 the prototype
// with the decimal kept ("100.0"); part 14 the Proposta except the three type tiles (kept as
// they are); part 16 without touching the "Desired dose" words or the over-capacity message.
// Kept decisions: Q9 = B (Low amber, days coloured), Q15 = B (FeatureIcon drawings), V23
// (Edit stays a capsule), palette B, one SegmentedBar. Theme tokens only, both themes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const SCREEN = read('screens', 'ProtocolsScreen.js');
const PARTS = read('screens', 'components', 'ProtocolParts.js');
const THEME = read('lib', 'theme.js');
const style = (src, name) => {
  const m = src.match(new RegExp(`\\n  ${name}: \\{[^\\n]*\\}`, 'g'));
  assert.ok(m && m.length, `style ${name} not found`);
  return m[m.length - 1];
};
function loadTranslations() {
  const src = read('i18n', 'translations.js');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const TR = loadTranslations();

test('the changed files parse and draw no raw colour', () => {
  for (const src of [SCREEN, PARTS]) {
    assert.doesNotThrow(() => parse(src, { sourceType: 'module', plugins: ['jsx'] }));
    assert.doesNotMatch(src, /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/, 'raw hex');
    assert.doesNotMatch(src, /'(white|black)'/, 'named colour');
  }
  assert.doesNotMatch(SCREEN, /›<\/Text>|‹ \{t\(/, 'no text arrows left on My Protocols');
});

test('part 1: heroes — drawn arrows, ink2 icons, 14 under the title, Last line', () => {
  assert.match(SCREEN, /<FeatureIcon name="type_vial" size=\{22\} color=\{colors\.ink2\} \/>\s*<Text style=\{s\.heroTitle\}>\{t\('today_protocols'\)\}<\/Text>\s*<RowChevron color=\{colors\.tick\} \/>/);
  assert.match(SCREEN, /<FeatureIcon name="journal" size=\{22\} color=\{colors\.ink2\} \/>\s*<Text style=\{s\.heroTitle\}>\{t\('log_title'\)\}<\/Text>\s*<RowChevron color=\{colors\.tick\} \/>/);
  assert.match(style(SCREEN, 'header'), /paddingTop: 14, paddingBottom: 14/);
  assert.match(style(SCREEN, 'scroll'), /paddingHorizontal: 16 \}/, 'no extra 16 on top of the 14');
  assert.match(style(SCREEN, 'heroes'), /gap: 14/);
  assert.match(style(SCREEN, 'heroTitle'), /letterSpacing: -0\.22/);
  assert.match(style(SCREEN, 'heroLowRow'), /gap: 8/);
  assert.match(style(SCREEN, 'heroLow'), /color: c\.ink,/);
  assert.match(style(SCREEN, 'trioLabelRow'), /gap: 6/);
  assert.match(SCREEN, /\{lastLine \? <Text style=\{s\.heroLast\}>\{lastLine\}<\/Text> : null\}/);
  assert.match(style(SCREEN, 'heroLast'), /fontSize: 15, lineHeight: 20, color: c\.ink2/);
  assert.equal(TR.en.protocols_log_last, 'Last: {name} · {when}');
  assert.equal(TR.en.log_taken, 'Complete');
});

test('part 1: the Last line is the newest completed dose, weekday and time', () => {
  const { lastCompleteLog, lastLogWhen } = require('../lib/protocolsHero');
  const logs = [
    { outcome: 'Missed', logged_at: '2026-10-02T12:00:00.000Z', protocol_id: 1 },
    { outcome: 'Taken', logged_at: '2026-09-28T23:42:00.000Z', protocol_id: 2 },
    { outcome: 'Taken', logged_at: '2026-09-27T10:00:00.000Z', protocol_id: 1 },
    { outcome: 'Skipped', logged_at: '2026-10-01T10:00:00.000Z', protocol_id: 1 },
  ];
  assert.equal(lastCompleteLog(logs).protocol_id, 2);
  assert.equal(lastCompleteLog([{ outcome: 'Missed', logged_at: '2026-10-02T12:00:00Z' }]), null);
  const now = new Date(2026, 9, 2, 15, 0);
  const d = new Date(2026, 8, 28, 19, 42); // Mon Sep 28, 7:42 PM local
  assert.equal(lastLogWhen(d.toISOString(), now, 'en-US', (hm) => (hm === '19:42' ? '7:42 PM' : hm)), 'Mon 7:42 PM');
  const old = new Date(2026, 8, 20, 8, 5);
  assert.equal(lastLogWhen(old.toISOString(), now, 'en-US', (hm) => hm), 'Sep 20 08:05');
});

test('parts 2 and 5: back rows with the drawn arrow, 44 high, centred, 14 above the title', () => {
  assert.match(style(SCREEN, 'navrow'), /alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: 18, paddingTop: 6, marginBottom: 14/);
  assert.match(style(SCREEN, 'backBtn'), /flexDirection: 'row', alignItems: 'center', gap: 6/);
  assert.match(style(SCREEN, 'backChev'), /scaleX: -1/);
  assert.match(SCREEN, /<View style=\{view === 'heroes' \? s\.header : s\.navrow\}>/);
  // V23: Edit stays the capsule
  assert.match(SCREEN, /<TouchableOpacity style=\{s\.addBtn\} onPress=\{\(\) => openEdit\(openProtocol\)\}/);
  assert.match(style(SCREEN, 'sortScroll'), /marginBottom: 14/);
  assert.match(SCREEN, /sortRow: \{[^}]*\}/);
  assert.match(SCREEN, /<Pill key=\{o\.key\} s=\{s\} label=\{t\(o\.label\)\} on=\{sortBy === o\.key\} onPress=\{\(\) => changeSort\(o\.key\)\} short \/>/, 'sort pills 34 high');
  assert.match(style(SCREEN, 'pillShort'), /minHeight: 34/);
});

test('part 3: card — 10 pt dot, drawn arrow; Low stays amber, days coloured (Q9 = B)', () => {
  assert.match(style(SCREEN, 'pdot'), /width: 10, height: 10, borderRadius: 5, marginTop: 7/);
  assert.match(SCREEN, /<View style=\{s\.pchev\}><RowChevron color=\{c\.tick\} \/><\/View>/);
  assert.match(style(SCREEN, 'pchev'), /marginTop: 5/);
  assert.match(style(SCREEN, 'otagAttn'), /borderColor: c\.attention/);
  assert.match(SCREEN, /color: daysTone\(vialDaysLeft, c\)/);
});

test('part 4: Recently deleted — 1 pt lines, 10 pt dots', () => {
  assert.match(style(SCREEN, 'delRowLine'), /borderTopWidth: 1,/);
  assert.match(style(SCREEN, 'delDot'), /width: 10, height: 10/);
});

test('part 5 / 11 / 12: the protocol screen rhythm (14 between, 26 block after block), 1 pt lines, 17 pt values', () => {
  assert.match(style(SCREEN, 'detail'), /gap: 14/);
  assert.match(style(SCREEN, 'blkD'), /gap: 10 \}/);
  assert.match(style(SCREEN, 'blkNext'), /marginTop: 12/);
  assert.match(SCREEN, /<RowsBlock s=\{s\} title=\{t\('protocols_step_schedule'\)\} rows=\{scheduleRows\} style=\{vialShown \? \[s\.blkD, s\.blkNext\] : s\.blkD\} \/>/);
  assert.match(SCREEN, /<RowsBlock s=\{s\} title=\{t\('protocols_step_dose'\)\} rows=\{doseRows\} style=\{s\.blkD\} \/>/);
  assert.match(SCREEN, /<View style=\{\[s\.blkD, s\.blkNext\]\}>\s*<Text style=\{s\.secth\}>\{t\('protocols_notes'\)\}/);
  assert.match(style(SCREEN, 'rwSep'), /borderTopWidth: 1,/);
  assert.match(style(SCREEN, 'rwValMono'), /fontSize: 17/);
  assert.match(style(SCREEN, 'btnSmText'), /fontSize: 15/);
  assert.match(style(SCREEN, 'bottomPad'), /height: 24/);
});

test('part 6: the unit 3 pt after the number, the decimal kept, 1 pt line over the reads', () => {
  assert.match(style(SCREEN, 'drawBigUnit'), /marginLeft: 3/);
  assert.match(style(SCREEN, 'bigRow'), /flexDirection: 'row', alignItems: 'baseline'/);
  // AP-21 (2026-10-03): read through drawReading — units as computed ("100.0", "100,0" in pt), ml only on a 2 / 3 / 5 ml syringe
  assert.match(SCREEN, /<Text style=\{\[s\.drawBig, over && s\.drawBigRisk\]\}>\{decimalText\(reading\.ml \? trimZeros\(reading\.value\) : reading\.value, language\)\}<\/Text>/, 'drawUnits as computed');
  assert.match(style(SCREEN, 'reads'), /borderTopWidth: 1,/);
  assert.match(style(SCREEN, 'hintRow'), /gap: 6 \}/);
});

test('part 7: the enlarged syringe is the prototype ruler, no scroll bar, lighter dark scrim', () => {
  assert.match(PARTS, /export const RULER = \{ W: 1640, x0: 40 \};/);
  assert.match(PARTS, /width=\{W - 2 \* x0\}/);
  assert.match(PARTS, /width=\{Math\.max\(0, X\(u\) - x0\)\}/);
  assert.match(SCREEN, /showsHorizontalScrollIndicator=\{false\}\s*contentOffset/);
  assert.match(style(SCREEN, 'zoomScrim'), /backgroundColor: c\.scrim/);
  assert.match(style(PARTS, 'scrim'), /backgroundColor: c\.scrim/);
  const scrims = THEME.match(/scrim: 'rgba\(0,0,0,0\.45\)'/g) || [];
  assert.equal(scrims.length, 2, 'the scrim token in both palettes');
});

test('parts 8 and 9: the Vial title; New vial / New bottle without side padding; serving well 14', () => {
  assert.match(SCREEN, /<Text style=\{s\.secth\}>\{t\('protocols_vial_title'\)\}<\/Text>/);
  assert.equal(TR.en.protocols_vial_title, 'Vial');
  assert.doesNotMatch(style(SCREEN, 'obtn2'), /paddingHorizontal/);
  assert.match(style(SCREEN, 'drawWellServing'), /paddingBottom: 14/);
});

test('part 14: the chosen compound is checked in the list, the list shows in Edit; tiles kept', () => {
  assert.match(SCREEN, /\{compoundId === item\.key \? <CheckMark size=\{18\} color=\{colors\.ink\} \/> : null\}/);
  assert.match(SCREEN, /setShowSuggestions\(true\); \/\/ Edit shows the list/);
  assert.match(style(SCREEN, 'suggSep'), /borderTopWidth: 1,/);
  // founder: the three type tiles keep today's style
  assert.match(style(SCREEN, 'tileLabel'), /fontSize: 15, fontWeight: '600'/);
});

test('part 15: swatches 14 apart with the ring outside, 13 pt used mark', () => {
  assert.match(style(SCREEN, 'swatches'), /rowGap: 14, paddingHorizontal: 8, paddingVertical: 4/);
  assert.match(style(SCREEN, 'swRingOn'), /position: 'absolute', top: -5\.5, left: -5\.5, width: 55, height: 55, borderRadius: 27\.5, borderWidth: 2\.5, borderColor: c\.ink/);
  assert.match(style(SCREEN, 'usedMk'), /width: 13, height: 13/);
  assert.match(style(SCREEN, 'legendRow'), /gap: 8 \}/);
});

test('part 16: drawn − / +, drawn fold arrow; the dose words untouched', () => {
  assert.match(SCREEN, /<StepGlyph color=\{colors\.ink\} \/>/);
  assert.match(SCREEN, /<StepGlyph plus color=\{colors\.ink\} \/>/);
  assert.match(PARTS, /d=\{plus \? 'M12 6v12M6 12h12' : 'M6 12h12'\}/);
  assert.match(SCREEN, /<FoldChevron open=\{iuOpen\} color=\{colors\.ink3\} \/>/);
  // AP-13 (signed 2026-10-02) relabels the powder dose field "Dose per injection" with its hint;
  // "Desired dose" stays on the protocol page's Dose details row.
  assert.match(SCREEN, /<Fld s=\{s\} label=\{doseLabel\} labelExtra=\{doseQ\} hint=\{t\('protocols_dose_hint'\)\}>/);
  assert.match(SCREEN, /const doseLabel = t\('protocols_dose_per_injection'\);/);
  assert.equal(TR.en.protocols_desired_dose, 'Desired dose');
});

test('part 17: the clock and the time together on the left; Every [n] days left-aligned', () => {
  assert.doesNotMatch(style(SCREEN, 'pickTime'), /marginLeft: 'auto'/);
  assert.match(style(SCREEN, 'pickTime'), /fontWeight: '600'/);
  assert.doesNotMatch(style(SCREEN, 'intervalInput'), /textAlign/);
});

test('part 19: Day before the day, full-width fields, plain bold summary with —, Today (+ Add vial)', () => {
  assert.match(SCREEN, /<Text style=\{s\.bodyC2\}>\{t\('protocols_mix_day'\)\}<\/Text>/);
  assert.match(style(SCREEN, 'dayInput'), /flex: 1/);
  assert.doesNotMatch(SCREEN, /validInput/);
  // (second review: the value as read, __tests__/wizardReviewValues.test.js)
  assert.match(SCREEN, /\{ label: t\('protocols_amount_label'\), value: amount \? `\$\{decimalText\(parseDecimal\(amount, language\), language\)\} \$\{unit\}` : '—' \}/);
  assert.doesNotMatch(SCREEN, /protocols_water_label'\), value: [^\n]*mono: true/);
  assert.equal(TR.en.protocols_skipped_msg, 'No problem — you can log your vial mix anytime from Today (+ Add vial).');
  assert.match(SCREEN, /t\('protocols_add_date'\)\.replace\(\/\^←\\s\*\/, ''\)/);
  assert.doesNotMatch(style(SCREEN, 'linkBtn'), /paddingHorizontal/);
});
