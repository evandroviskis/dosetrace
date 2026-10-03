'use strict';
// Today redesign, the popups (founder 2026-10-02: "A, dias coloridos, confirmo os ícones"):
// part 14 "Skip dose?" is the DoseTrace sheet (prototype confirm: Geist 22/700 title, 17 ink2
//         body, Cancel well capsule + Skip in ink, never the red iOS alert) — the existing
//         Graduated DTSheet (screens/components/ProtocolParts.js) is reused;
// part 16 the site sheet: "Injection site" with the name and the time under it, no drag
//         handle, Cancel / Save with Save dimmed until a spot or text is chosen, the black
//         underlined Skip link (S-25, Q17 = B); no "dose logged" / "Undo dose" header;
// part 17 the vial-finished pop-up on Graduated tokens (text and buttons unchanged).
// Behaviour is untouched: the Skip still writes the slot's Skipped row (A-78).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const TODAY = read('screens', 'TodayScreen.js');
const MAP = read('screens', 'components', 'BodyMapModal.js');
const fnBody = (src, name) => {
  const a = src.indexOf(`function ${name}(`);
  assert.ok(a >= 0, `function ${name}`);
  let depth = 0, i = src.indexOf('{', a);
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(a, i + 1);
};
const style = (src, name) => {
  const m = src.match(new RegExp(`\\n  ${name}: \\{[^\\n]*\\}`, 'g'));
  assert.ok(m && m.length, `style ${name}`);
  return m[m.length - 1];
};

test('part 14: Skip dose? is the DoseTrace sheet, not the iOS alert; Skip in ink (primary), Cancel secondary', () => {
  const sk = fnBody(TODAY, 'skipDose');
  assert.doesNotMatch(sk, /Alert\.alert\(\s*t\('today_skip_title'\)/, 'the iOS alert is gone');
  assert.match(sk, /setSkipAsk\(/);
  assert.match(sk, /const res = recordSkipToday\(protocol\.id, \{ slotMs: slot \? slot\.slotMs : null \}\);/, 'the A-78 write is unchanged');
  assert.match(TODAY, /import \{ DTSheet, VialCells \} from '\.\/components\/ProtocolParts';/);
  assert.match(TODAY, /<DTSheet config=\{skipSheet\} onClose=\{closeSkipAsk\} \/>/);
  assert.match(TODAY, /title: t\('today_skip_title'\)/);
  assert.match(TODAY, /\{ label: t\('cancel'\), kind: 'secondary' \}/);
  assert.match(TODAY, /\{ label: t\('today_skip'\), kind: 'primary', onPress: skipAsk\.onSkip \}/);
  // one popup at a time: a site question waits while the sheet is up
  assert.match(fnBody(TODAY, 'todayPopupBusy'), /skipSheetOpenRef\.current/);
  assert.match(fnBody(TODAY, 'openNextQuestion'), /skipSheetOpenRef\.current/);
  // The DTSheet itself is the prototype .sheet: 22/700 title, 17 ink2 body, capsule buttons.
  const parts = read('screens', 'components', 'ProtocolParts.js');
  assert.match(parts, /title: \{ fontSize: 22, fontWeight: '700', color: c\.ink, lineHeight: 28 \}/);
  assert.match(parts, /body: \{ fontSize: 17, lineHeight: 22, color: c\.ink2 \}/);
  assert.match(parts, /btn_primary: \{ backgroundColor: c\.act \}/);
});

test('part 16: site sheet — Injection site, name · time, no handle, Save dimmed until a choice, black Skip link', () => {
  assert.doesNotMatch(MAP, /s\.handle/, 'the drag handle is gone');
  assert.doesNotMatch(MAP, /\n  handle: \{/);
  assert.match(MAP, /\{protocolName\}\{whenLabel \? ` · \$\{whenLabel\}` : ''\}/);
  assert.doesNotMatch(MAP, /\{protocolName\} · \{type === 'subq'/, 'the route is no longer the subtitle');
  assert.match(style(MAP, 'title'), /fontWeight: '700'/);
  assert.match(MAP, /const canSave = selected\.length > 0 \|\| \(other != null && other\.trim\(\)\.length > 0\) \|\| !!freeText;/);
  assert.match(MAP, /disabled=\{!canSave\}/);
  assert.match(MAP, /!canSave && s\.btnDim/);
  assert.match(style(MAP, 'btnDim'), /opacity: 0\.35/);
  assert.match(style(MAP, 'btnSkipText'), /color: c\.ink, textDecorationLine: 'underline'/);
  assert.match(TODAY, /whenLabel=\{siteWhen\}/);
  assert.doesNotMatch(MAP, /Undo dose|dose logged/i);
});

test('part 17: the vial-finished pop-up is drawn with Graduated tokens (prototype .scrim / .sheet), same words', () => {
  for (const k of ['promptOverlay', 'promptCard', 'promptTitle', 'promptProtocolName', 'promptSub', 'promptLabel', 'promptMonthPill', 'promptMonthPillOn', 'promptMonthText', 'promptMonthTextOn', 'promptDayInput', 'promptBtnSecondary', 'promptBtnSecondaryText', 'promptBtnPrimary', 'promptBtnPrimaryText', 'yesterdayPill', 'yesterdayPillText']) {
    assert.doesNotMatch(style(TODAY, k), /c\.(accent|accentText|accentSoft|card2|card|border|textMuted|text|textFaint)\b/, `${k} still on a legacy token`);
  }
  assert.match(style(TODAY, 'promptOverlay'), /backgroundColor: c\.overlay[^}]*padding: 16/);
  assert.match(style(TODAY, 'promptCard'), /backgroundColor: c\.raised, borderRadius: 26, padding: 20, gap: 14/);
  assert.match(style(TODAY, 'promptTitle'), /fontSize: 22, fontWeight: '700'/);
  assert.match(style(TODAY, 'promptProtocolName'), /fontSize: 17, fontWeight: '600', color: c\.ink/);
  assert.match(style(TODAY, 'promptSub'), /fontSize: 17[^}]*color: c\.ink2/);
  assert.match(style(TODAY, 'promptBtnPrimary'), /backgroundColor: c\.act/);
  assert.match(style(TODAY, 'promptBtnSecondary'), /backgroundColor: c\.well/);
  assert.match(style(TODAY, 'promptMonthPillOn'), /backgroundColor: c\.raised, borderWidth: 1\.5, borderColor: c\.ink/);
  assert.match(style(TODAY, 'promptDayInput'), /backgroundColor: c\.raised[^}]*borderRadius: 14[^}]*minHeight: 50/);
  // same words as before
  for (const k of ['today_vial_done_title', 'today_vial_done_sub', 'today_vial_mix_date', 'today_vial_finished', 'today_vial_add']) assert.match(TODAY, new RegExp(`t\\('${k}'\\)`));
  // The capacity line picks its singular or plural form (pluralCounts.test.js).
  assert.match(TODAY, /t\(pluralKey\('today_vial_new_capacity'/);
});
