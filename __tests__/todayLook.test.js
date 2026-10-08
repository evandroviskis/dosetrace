'use strict';
// Today redesign, the look (founder 2026-10-02: "A, dias coloridos, confirmo os ícones"; the
// page proto/today/hoje.html, column "Proposta"; values from docs/design/prototype.html).
// Kept founder decisions: Q9 = B days-left coloured by deadline, Q15 snooze + sparkle keep the
// FeatureIcon drawings, V6 "Draw to" small and black, A-78/A-79/A-80, Skipped ink2 / Missed
// risk, V13 tab bar, V15 check thickness. Theme tokens only (both themes).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const exists = (...p) => fs.existsSync(path.join(ROOT, ...p));
const TODAY = read('screens', 'TodayScreen.js');
const TRACK = read('screens', 'components', 'TodayTracker.js');
const FOOD = read('screens', 'components', 'FoodLogHero.js');
const style = (src, name) => {
  const m = src.match(new RegExp(`\\n  ${name}: \\{[^\\n]*\\}`, 'g'));
  assert.ok(m && m.length, `style ${name} not found`);
  return m[m.length - 1]; // the last definition wins (todayV21Styles spreads over legacy)
};
const noRawColour = (src, name) => {
  assert.doesNotMatch(src, /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/, `${name}: raw hex`);
  assert.doesNotMatch(src, /'(white|black)'/, `${name}: named colour`);
};

test('the changed files parse', () => {
  for (const src of [TODAY, TRACK, FOOD]) assert.doesNotThrow(() => parse(src, { sourceType: 'module', plugins: ['jsx'] }));
});

// ── part 2: alerts ────────────────────────────────────────────────
test('part 2: one alert box with 1 pt dividers, 22 pt icons, snooze opens Tomorrow / In 3 days only', () => {
  assert.match(style(TODAY, 'aitemSep'), /borderTopWidth: 1\b/);
  assert.match(TODAY, /<FeatureIcon name=\{a\.iconName\} size=\{22\} color=\{colors\.ink2\} \/>/);
  assert.match(TODAY, /<FeatureIcon name="snooze" size=\{20\}/, 'Q15: the current snooze drawing, prototype size 20');
  assert.match(style(TODAY, 'snz'), /paddingLeft: 34/);
  assert.match(style(TODAY, 'atitleRow'), /gap: 7/);
  assert.match(TODAY, /SNOOZE_KINDS\.map\(/);
  // gone: Later today, Remove, the X, and the reality-check remove confirm
  assert.doesNotMatch(TODAY, /alert_snooze_later/);
  assert.doesNotMatch(TODAY, /today_alert_remove/);
  assert.doesNotMatch(TODAY, /CrossMark/);
  assert.doesNotMatch(TODAY, /dismissRealityCheckAlert/);
  assert.doesNotMatch(TODAY, /ALERT_SNOOZE_MS/);
});

// ── part 3: tracker slab ──────────────────────────────────────────
test('part 3: the slab uses its own measured palette (prototype .inv), never the opposite page palette', () => {
  const theme = read('lib', 'theme.js');
  assert.match(theme, /slabInv: \{ ink: '#F2F3EF', ink2: '#C4C8C3', ink3: '#A9AEA9', tick: '#8A9095', line: '#4B5056', data: '#8AA8FF', onData: '#0F1114', attention: '#E3A54E', ok: '#62C597' \}/);
  assert.match(theme, /slabInv: \{ ink: '#111315', ink2: '#454A4F', ink3: '#5D6267', tick: '#A5AAA3', line: '#D6D9D2', data: '#2350D8', onData: '#FFFFFF', attention: '#7E4A00', ok: '#17623F' \}/);
  assert.match(TRACK, /const inv = colors\.slabInv;/);
  assert.doesNotMatch(TRACK, /isDark \? LIGHT : DARK/);
  noRawColour(TRACK, 'TodayTracker');
});

test('part 3: the gauges are the prototype gauge(): 20 soft ticks, thinner rings, butt cap at 100%', () => {
  assert.match(TRACK, /viewBox="0 0 100 100"/);
  assert.match(TRACK, /const r = big \? 38 : 40, sw = big \? 9 : 10;/);
  assert.match(TRACK, /for \(let k = 0; k < 20; k\+\+\)/);
  assert.match(TRACK, /const maj = k % 5 === 0, r0 = maj \? 45 : 46\.5;/);
  assert.match(TRACK, /strokeWidth=\{maj \? 1\.6 : 1\}/);
  assert.match(TRACK, /strokeLinecap=\{pct >= 100 \? 'butt' : 'round'\}/);
  assert.doesNotMatch(TRACK, /i < 48/);
});

test('part 3: % 32 pt (A-79), caption on two lines at 12, drawn arrow on View history, 1 pt divider, week gap 4', () => {
  assert.match(style(TRACK, 'bigNum'), /fontSize: 32/);
  assert.match(style(TRACK, 'bigCap'), /fontSize: 12, fontWeight: '600'/);
  assert.match(style(TRACK, 'bigCapDay'), /fontSize: 12, fontWeight: '600'/);
  assert.ok(!TRACK.includes('›'), 'the › glyph is gone');
  assert.match(TRACK, /<RowChevron color=\{inv\.tick\} \/>/);
  assert.match(style(TRACK, 'streak'), /borderTopWidth: 1\b/);
  assert.doesNotMatch(style(TRACK, 'streak'), /minHeight/);
  assert.match(style(TRACK, 'week'), /gap: 4/);
  assert.match(style(TRACK, 'history'), /gap: 6/);
});

// ── part 4: AI food card ──────────────────────────────────────────
test('part 4: food card — drawn chevron, ink2 icon at 22 (current sparkle, Q15), 19 pt Geist title', () => {
  assert.ok(!FOOD.includes('›'));
  assert.match(FOOD, /<RowChevron color=\{colors\.tick\} \/>/);
  assert.match(FOOD, /<FeatureIcon name="ai_spark" size=\{22\} color=\{colors\.ink2\} \/>/);
  // founder 2026-10-02 "follow the prototype in everything": food() r-title at 19 is Geist 600 on Today too
  assert.match(style(FOOD, 'line'), /fontSize: 19, fontFamily: fontFamilyFor\('600'\)/);
  assert.match(style(FOOD, 'card'), /paddingTop: 16/);
  assert.match(style(FOOD, 'card'), /gap: 8/);
  assert.match(style(FOOD, 'head'), /gap: 10/);
  noRawColour(FOOD, 'FoodLogHero');
});

// ── part 5: Doses header + card top ───────────────────────────────
test('part 5: "4 of 5 taken", mono amount + ink2 frequency, drawn arrow after the time, reminder / Due tag', () => {
  assert.match(TODAY, /dosesTakenLabel\(doneDoses, totalDoses, t\)/);
  assert.match(style(TODAY, 'damt'), /fontFamily: MONO\['500'\], fontSize: 16/);
  assert.match(style(TODAY, 'dfreq'), /fontSize: 15, color: c\.ink2/);
  assert.match(style(TODAY, 'dtimeRow'), /gap: 8/);
  assert.match(TODAY, /<Text style=\{s\.dtime\}>[\s\S]{0,200}<\/Text>\s*\) : null\}\s*<RowChevron color=\{colors\.tick\} \/>/);
  assert.match(TODAY, /t\('today_reminder_tag'\)/);
  assert.match(style(TODAY, 'tagLater'), /borderColor: c\.line/);
  assert.match(style(TODAY, 'tagLaterText'), /color: c\.ink3, fontWeight: '500'/);
  assert.match(style(TODAY, 'ddot'), /width: 10, height: 10/);
});

// ── part 7 / 8: meta + vial lines ─────────────────────────────────
test('part 7: Day X of Y, last site and streak on one wrapping meta line; flame 14', () => {
  assert.match(TODAY, /<FeatureIcon name="flame" size=\{14\} color=\{colors\.attention\} \/>/);
  assert.match(style(TODAY, 'dmetaText'), /fontVariant: \['tabular-nums'\]/);
  assert.match(style(TODAY, 'dmeta'), /flexWrap: 'wrap'/);
});

test('part 8: vial cells, singular/plural, days coloured by deadline (Q9 = B)', () => {
  assert.match(TODAY, /<VialCells total=\{capacity\} left=\{remaining\} \/>/);
  assert.match(read('screens', 'components', 'ProtocolParts.js'), /const v = vialCells\(total, left\);/, 'one cells geometry for Protocols and Today');
  assert.match(TODAY, /vialRemainingLabel\(remaining, t\)/);
  assert.match(TODAY, /daysLeft <= 3 \? colors\.risk : daysLeft <= 7 \? colors\.attention : colors\.ok/);
  assert.match(style(TODAY, 'vialRow'), /borderTopWidth: 1\b/);
  assert.match(style(TODAY, 'vialRow'), /flexWrap: 'wrap'/);
  assert.match(style(TODAY, 'addVialText'), /fontSize: 17[^}]*textDecorationColor: c\.tick/);
});

// ── part 10: Taken ────────────────────────────────────────────────
test('part 10: Taken — a visible ok check, ink title, fold arrow; opened: dot + name + "time · site"', () => {
  assert.match(TODAY, /<CheckMark size=\{20\} color=\{colors\.ok\} \/>/);
  assert.match(style(TODAY, 'takenTitle'), /color: c\.ink\b/);
  assert.match(TODAY, /<FoldChevron open=\{takenOpen\} color=\{colors\.ink3\} \/>/);
  assert.match(style(TODAY, 'takenList'), /backgroundColor: c\.raised, borderRadius: 22, paddingHorizontal: 16/);
  assert.match(style(TODAY, 'takenRow'), /minHeight: 44[^}]*borderTopWidth: 1\b/);
  assert.match(TODAY, /describeStored\(l\.injection_site, t\)/);
  assert.doesNotMatch(TODAY, /takenCheck/);
  assert.ok(exists('components', 'FoldChevron.js'));
  const fc = read('components', 'FoldChevron.js');
  assert.match(fc, /width=\{15\} height=\{9\} viewBox="0 0 16 10"/);
  assert.match(fc, /M2 2l6 6 6-6/);
  assert.match(fc, /M2 8l6-6 6 6/);
});

// ── part 11: skipped / missed ─────────────────────────────────────
// A-115: the dose page is gone (the right page shows the protocol page), so part 11 is the card's line.
test('part 11: Skipped neutral (ink2) on the Today card', () => {
  assert.match(style(TODAY, 'skipLineText'), /fontSize: 15, color: c\.ink2/);
});

// ── part 12: folds ────────────────────────────────────────────────
test('part 12: Tomorrow / Next 5 days — drawn 15 x 9 arrows, "1 dose", prototype rows, later row inside, disclaimer left', () => {
  assert.ok(!/'⌃'|'⌄'/.test(TODAY), 'the ⌄ / ⌃ glyphs are gone');
  assert.match(TODAY, /<FoldChevron open=\{open\} color=\{colors\.ink3\} \/>/);
  assert.match(TODAY, /doseCountLabel\(items\.length, t\)/);
  assert.match(style(TODAY, 'upRow'), /borderTopWidth: 1\b/);
  assert.match(style(TODAY, 'upName'), /fontSize: 17, color: c\.ink/);
  assert.doesNotMatch(style(TODAY, 'upName'), /fontWeight/);
  assert.match(style(TODAY, 'upAmtVal'), /fontFamily: MONO\['500'\]/);
  assert.match(style(TODAY, 'laterRow'), /minHeight: 44[^}]*borderTopWidth: 1\b/);
  assert.match(style(TODAY, 'laterHint'), /fontSize: 15, color: c\.ink3/);
  assert.match(style(TODAY, 'disclaimer'), /textAlign: 'left'/);
  assert.match(style(TODAY, 'foldSep'), /borderTopWidth: 1, borderTopColor: c\.line/);
});

// ── part 13: caught up ────────────────────────────────────────────
test('part 13: "You’re all caught up" card has the ok check', () => {
  assert.match(TODAY, /<CheckMark size=\{22\} color=\{colors\.ok\} \/>\s*<Text style=\{s\.doneText\}>/);
  assert.match(style(TODAY, 'doneText'), /fontWeight: '600'/);
  assert.match(style(TODAY, 'doneCard'), /flexDirection: 'row'/);
});

// ── part 15: toast ────────────────────────────────────────────────
test('part 15: toast 17 pt with bold underlined Undo, 4 s, "Site saved · {site}" after a saved site', () => {
  assert.match(style(TODAY, 'undoBarText'), /fontSize: 17, color: c\.toastText, fontWeight: '400'/);
  assert.match(style(TODAY, 'undoBarAction'), /fontSize: 17, color: c\.toastText, fontWeight: '700', textDecorationLine: 'underline'/);
  assert.match(style(TODAY, 'takeNoticeText'), /fontSize: 17/);
  assert.match(TODAY, /const TOAST_MS = 4000;/);
  assert.doesNotMatch(TODAY, /setUndoData\(null\), 5000\)/);
  assert.match(TODAY, /t\('today_site_saved'\)\.replace\('\{site\}'/);
  assert.match(TODAY, /\{undoData\.text \|\| t\('today_dose_logged'\)\}/);
});

test('Today, the tracker and the food card use theme tokens only', () => {
  noRawColour(TODAY, 'TodayScreen');
});
