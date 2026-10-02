// The user's own protocol palette (DESIGN.md §2.4): a deliberately fixed set, shown
// only as a dot, a swatch or a curve line, never as a surface. The single source —
// no other file keeps a copy.
//
// Palette "B" (founder 2026-10-02): the same 20 names and hues, each moved into the
// luminance band that reads >= 3:1 (non-text contrast) on the card in BOTH themes —
// light raised #FFFFFF and dark raised #282B30 — with ONE hex per colour for both
// themes. `legacy` is the hex protocols saved before 2026-10-02 still hold.
//
// Stored data is never rewritten in bulk: a protocol keeps its stored hex until the
// user saves it again. Everything that DRAWS a protocol colour goes through
// displayColor(), which maps a legacy hex to its new hex. CommonJS so it's
// unit-testable under Node.

const PALETTE = [
  { key: 'ocean',     hex: '#387BC4', legacy: '#185FA5' },
  { key: 'forest',    hex: '#098964', legacy: '#1D9E75' },
  { key: 'coral',     hex: '#CE5025', legacy: '#D85A30' },
  { key: 'lavender',  hex: '#756CD1', legacy: '#7F77DD' },
  { key: 'amber',     hex: '#AC6900', legacy: '#BA7517' },
  { key: 'rose',      hex: '#CB4B76', legacy: '#D4537E' },
  { key: 'mint',      hex: '#018968', legacy: '#5DCAA5' },
  { key: 'sky',       hex: '#267BCD', legacy: '#378ADD' },
  { key: 'olive',     hex: '#528602', legacy: '#639922' },
  { key: 'stone',     hex: '#7A7972', legacy: '#888780' },
  { key: 'red',       hex: '#D94242', legacy: '#E24B4A' },
  { key: 'charcoal',  hex: '#797976', legacy: '#2C2C2A' },
  { key: 'teal',      hex: '#098787', legacy: '#0E8C8C' },
  { key: 'grape',     hex: '#8961DA', legacy: '#6A3FB5' },
  { key: 'magenta',   hex: '#C942A5', legacy: '#C13A9E' },
  { key: 'bronze',    hex: '#A06E40', legacy: '#8A5A2B' },
  { key: 'slate',     hex: '#597C9E', legacy: '#4C6E8F' },
  { key: 'gold',      hex: '#9B7204', legacy: '#E0A500' },
  { key: 'turquoise', hex: '#0B868C', legacy: '#17B0B8' },
  { key: 'wine',      hex: '#C94D70', legacy: '#A82E55' },
];

// A new protocol starts on Ocean.
const DEFAULT_PROTOCOL_COLOR = PALETTE[0].hex;

// hex (new AND legacy, upper case) → i18n name key, so a name resolves either way.
const COLOR_NAMES = {};
// any palette hex (upper case) → its new hex.
const TO_NEW = {};
for (const p of PALETTE) {
  COLOR_NAMES[p.hex] = `color_${p.key}`;
  COLOR_NAMES[p.legacy] = `color_${p.key}`;
  TO_NEW[p.hex] = p.hex;
  TO_NEW[p.legacy] = p.hex;
}

// The colour to draw for a stored protocol colour: a legacy palette hex (any case)
// → its new hex; a new hex → itself; anything else (a custom value) → unchanged;
// empty → null so the caller applies its own default (`displayColor(x) || c.data`).
function displayColor(stored) {
  if (!stored) return null;
  return TO_NEW[String(stored).toUpperCase()] || stored;
}

// Same palette colour? (a legacy stored hex selects its new swatch in the picker)
function sameColor(a, b) {
  const x = displayColor(a), y = displayColor(b);
  return !!x && !!y && String(x).toUpperCase() === String(y).toUpperCase();
}

// i18n name key of a stored colour (legacy or new, any case), or null.
function colorNameKey(stored) {
  if (!stored) return null;
  return COLOR_NAMES[String(stored).toUpperCase()] || null;
}

// The new hex of a palette colour by key ('ocean' → '#387BC4').
function paletteHex(key) {
  const p = PALETTE.find(x => x.key === key);
  return p ? p.hex : null;
}

module.exports = { PALETTE, COLOR_NAMES, DEFAULT_PROTOCOL_COLOR, displayColor, sameColor, colorNameKey, paletteHex };
