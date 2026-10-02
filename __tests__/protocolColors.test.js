'use strict';
// Protocol colour palette "B" (founder 2026-10-02): the same 20 names and hues, each
// moved into the luminance band readable (>= 3:1 non-text contrast) on the card in
// BOTH themes, one hex per colour for both themes. Stored protocol colours are never
// rewritten in bulk: every place that draws a protocol colour maps a legacy stored
// hex to its new hex through displayColor().
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const {
  PALETTE, COLOR_NAMES, DEFAULT_PROTOCOL_COLOR, displayColor, sameColor, colorNameKey, paletteHex,
} = require('../lib/protocolColors');

// Approved values, in picker order: [key, new hex, legacy hex].
const APPROVED = [
  ['ocean', '#387BC4', '#185FA5'], ['forest', '#098964', '#1D9E75'], ['coral', '#CE5025', '#D85A30'],
  ['lavender', '#756CD1', '#7F77DD'], ['amber', '#AC6900', '#BA7517'], ['rose', '#CB4B76', '#D4537E'],
  ['mint', '#018968', '#5DCAA5'], ['sky', '#267BCD', '#378ADD'], ['olive', '#528602', '#639922'],
  ['stone', '#7A7972', '#888780'], ['red', '#D94242', '#E24B4A'], ['charcoal', '#797976', '#2C2C2A'],
  ['teal', '#098787', '#0E8C8C'], ['grape', '#8961DA', '#6A3FB5'], ['magenta', '#C942A5', '#C13A9E'],
  ['bronze', '#A06E40', '#8A5A2B'], ['slate', '#597C9E', '#4C6E8F'], ['gold', '#9B7204', '#E0A500'],
  ['turquoise', '#0B868C', '#17B0B8'], ['wine', '#C94D70', '#A82E55'],
];
const LEGACY = APPROVED.map(r => r[2]);

// WCAG 2.x relative luminance + contrast ratio.
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255]
    .map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test('palette: the 20 approved colours, exact values, in picker order', () => {
  assert.deepEqual(PALETTE.map(p => [p.key, p.hex, p.legacy]), APPROVED);
  assert.equal(DEFAULT_PROTOCOL_COLOR, '#387BC4', 'a new protocol starts on the new Ocean');
  assert.equal(paletteHex('ocean'), '#387BC4');
  assert.equal(paletteHex('teal'), '#098787');
});

test('palette: every colour reads >= 3:1 on the card in BOTH themes (light raised #FFFFFF, dark raised #282B30)', () => {
  const theme = read('lib/theme.js');
  // The card tokens these ratios are measured against must still be the theme's raised surfaces.
  assert.match(theme, /raised: '#FFFFFF'/);
  assert.match(theme, /raised: '#282B30'/);
  for (const p of PALETTE) {
    const light = contrast(p.hex, '#FFFFFF');
    const dark = contrast(p.hex, '#282B30');
    assert.ok(light >= 3, `${p.key} ${p.hex} on light card: ${light.toFixed(2)}:1`);
    assert.ok(dark >= 3, `${p.key} ${p.hex} on dark card: ${dark.toFixed(2)}:1`);
  }
});

test('displayColor: every legacy hex maps to its new hex (any case); new hexes and unknown values pass through; null-safe', () => {
  for (const [, hex, legacy] of APPROVED) {
    assert.equal(displayColor(legacy), hex, legacy);
    assert.equal(displayColor(legacy.toLowerCase()), hex, legacy.toLowerCase());
    assert.equal(displayColor(hex), hex, `${hex} passes through`);
  }
  assert.equal(displayColor('#123456'), '#123456', 'a custom colour is left as stored');
  assert.equal(displayColor('teal'), 'teal');
  assert.equal(displayColor(null), null, 'null lets the caller apply its own default');
  assert.equal(displayColor(undefined), null);
  assert.equal(displayColor(''), null);
  assert.equal(displayColor(null) || '#2350D8', '#2350D8');
});

test('COLOR_NAMES: legacy and new hex resolve to the same name key', () => {
  for (const [key, hex, legacy] of APPROVED) {
    assert.equal(COLOR_NAMES[hex], `color_${key}`);
    assert.equal(COLOR_NAMES[legacy], `color_${key}`);
    assert.equal(colorNameKey(legacy.toLowerCase()), `color_${key}`);
    assert.equal(colorNameKey(hex), `color_${key}`);
  }
  assert.equal(colorNameKey('#123456'), null);
  assert.equal(colorNameKey(null), null);
});

test('picker: a protocol stored with a legacy hex shows its colour selected', () => {
  for (const [, hex, legacy] of APPROVED) {
    assert.ok(sameColor(legacy, hex), `${legacy} selects ${hex}`);
    assert.ok(sameColor(legacy.toLowerCase(), hex));
    assert.ok(sameColor(hex, hex));
  }
  assert.equal(sameColor('#185FA5', '#098964'), false, 'legacy Ocean does not select Forest');
  assert.equal(sameColor(null, '#387BC4'), false);
  // The wizard: edit loads the stored colour through displayColor, the swatch test uses
  // sameColor, the in-use marks compare displayed colours, and the default is new Ocean.
  const pro = read('screens/ProtocolsScreen.js');
  // The form mapping lives in lib/protocolForm.js (My Protocols redesign, decision 2).
  const form = read('lib/protocolForm.js');
  assert.match(form, /f\.color = displayColor\(p\.color\) \|\| DEFAULT_PROTOCOL_COLOR;/);
  assert.match(pro, /const on = sameColor\(color, col\)/);
  assert.match(pro, /PALETTE\.map\(\(\{ hex: col \}\)/);
  assert.match(pro, /\.map\(p => displayColor\(p\.color\)\)/);
  assert.match(pro, /useState\(DEFAULT_PROTOCOL_COLOR\)/);
  assert.match(form, /color: DEFAULT_PROTOCOL_COLOR,/);
  assert.match(pro, /applyForm\(newProtocolForm\(new Date\(\)\)\)/);
  assert.doesNotMatch(pro, /#185FA5/i, 'no hardcoded legacy Ocean left in the Protocols screen');
  assert.match(read('lib/database.js'), /data\.color \|\| DEFAULT_PROTOCOL_COLOR/);
});

// Every .js source file the app ships (not tests, not docs, not node_modules).
function appSources() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.(js|cjs|ts|tsx)$/.test(e.name)) out.push(rel);
    }
  };
  ['screens', 'components', 'lib'].forEach(walk);
  out.push('App.js');
  return out;
}

test('single source: no other file defines the palette (legacy or new)', () => {
  const NEW = PALETTE.map(p => p.hex);
  for (const rel of appSources()) {
    if (rel === path.join('lib', 'protocolColors.js')) continue;
    const src = read(rel).toUpperCase();
    const oldHits = LEGACY.filter(h => src.includes(h));
    const newHits = NEW.filter(h => src.includes(h));
    // 5+ palette hexes in one file is a copy of the palette.
    assert.ok(oldHits.length < 5, `${rel} holds a copy of the old palette: ${oldHits.join(' ')}`);
    assert.ok(newHits.length < 5, `${rel} holds a copy of the new palette: ${newHits.join(' ')}`);
  }
  assert.doesNotMatch(read('screens/ProtocolsScreen.js'), /const COLORS = \[|const COLOR_NAMES = \{/);
});

// Every place that draws a protocol's own colour, and the expression that must be there.
const RENDER_SITES = {
  'screens/ProtocolsScreen.js': [
    'backgroundColor: displayColor(p.color) || c.data',           // list card dot
    's.ptitleDot, { backgroundColor: displayColor(p.color) || c.data }', // detail title dot
    'backgroundColor: displayColor(p.color) || colors.ink3',      // recently deleted
    's.heroDot, { backgroundColor: displayColor(p.color) || colors.data }', // hero
  ],
  'screens/TodayScreen.js': [
    'color={displayColor(p.color)}',                               // dose page
    's.ddot, { backgroundColor: displayColor(p.color) || colors.data }',
  ],
  'screens/JourneyScreen.js': ['backgroundColor: displayColor(level.protocol.color) || colors.data'],
  'screens/SerumCurveScreen.js': [
    'color: displayColor(p.color) || colors.data',                 // curve series (line, legend, drops)
    's.dot, { backgroundColor: displayColor(p.color) || colors.data }',
  ],
  'screens/components/DosePage.js': ['backgroundColor: displayColor(color) || colors.data'],
  'lib/serumModel.js': ["paletteHex('lavender'), paletteHex('coral'), paletteHex('teal'), paletteHex('amber')"],
  'components/FeaturePreviews.js': ["['forest', 'coral', 'lavender', 'sky', 'amber', 'rose'].map(paletteHex)"],
};

test('curve blend lines use the new palette hexes (Lavender, Coral, Teal, Amber)', () => {
  assert.deepEqual(require('../lib/serumModel').BLEND_COLORS, ['#756CD1', '#CE5025', '#098787', '#AC6900']);
});

test('every render site of a protocol colour goes through the palette module', () => {
  for (const [rel, snippets] of Object.entries(RENDER_SITES)) {
    const src = read(rel);
    assert.match(src, /(require\(|from )'\.{1,2}\/(\.\.\/)*(lib\/)?protocolColors'/, `${rel} imports the palette module`);
    for (const sn of snippets) assert.ok(src.includes(sn), `${rel}: ${sn}`);
  }
});

test('no raw protocol colour is drawn anywhere in screens/ or components/', () => {
  // A protocol's colour field read outside displayColor()/sameColor() is a raw draw.
  const RAW = /(?<!displayColor\()(?<!sameColor\()(?<![\w.$])(p|protocol|level\.protocol|lp|proto|item|row|log\.protocols\??)\.color\b/g;
  const hits = [];
  for (const rel of appSources().filter(r => /^(screens|components)/.test(r))) {
    const src = read(rel);
    const lines = src.split('\n');
    let m;
    while ((m = RAW.exec(src))) {
      // "&& p.color)" only tests that a colour is set (the picker's in-use filter): not a draw.
      if (src.slice(m.index - 3, m.index) === '&& ' && src[m.index + m[0].length] === ')') continue;
      const line = src.slice(0, m.index).split('\n').length;
      hits.push(`${rel}:${line}: ${lines[line - 1].trim()}`);
    }
  }
  assert.deepEqual(hits, [], `raw protocol colour draws:\n${hits.join('\n')}`);
});
