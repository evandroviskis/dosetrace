'use strict';
// A-124 — the AI food log stands out on Today and Evolução while a reality check runs
// (docs/specs/food-log-emphasis.md FE-1..FE-6; founder pick A1 2026-10-15, picture
// docs/design/a124-food-log-emphasis.html: sparkle in a round well, full-width "Registrar
// comida" button and a 2 pt border, both in the emphasis colour; no shadow).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');
const { todayFoodHeroPolicy } = require('../lib/foodThread');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const HERO = read('screens', 'components', 'FoodLogHero.js');
const THEME = read('lib', 'theme.js');
const JOURNEY = read('screens', 'JourneyScreen.js');
const TODAY = read('screens', 'TodayScreen.js');

function palettes() {
  const grab = (name) => {
    const i = THEME.indexOf(`export const ${name} = {`);
    const body = THEME.slice(i, THEME.indexOf('\n};', i));
    const o = {};
    for (const m of body.matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)) if (!(m[1] in o)) o[m[1]] = m[2];
    return o;
  };
  return { LIGHT: grab('LIGHT'), DARK: grab('DARK') };
}
const lum = (hex) => {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const style = (src, name) => {
  const m = src.match(new RegExp(`\\n  ${name}: \\{[^\\n]*\\}`));
  assert.ok(m, `style ${name} not found`);
  return m[0];
};
// The JSX the card renders while emphasised: everything between "{emph" and its closing.
const body = HERO.slice(HERO.indexOf('return ('));

// ── FE-5: tokens in both palettes, the Cobalt values ──
test('FE-5: emph / onEmph exist in BOTH palettes with the approved Cobalt values (= data / onData)', () => {
  const { LIGHT, DARK } = palettes();
  assert.equal(LIGHT.emph, '#2350D8');
  assert.equal(LIGHT.onEmph, '#FFFFFF');
  assert.equal(DARK.emph, '#8AA8FF');
  assert.equal(DARK.onEmph, '#0F1114');
  // the same values as the data colour (reused, never a new blue)
  assert.equal(LIGHT.emph, LIGHT.data);
  assert.equal(LIGHT.onEmph, LIGHT.onData);
  assert.equal(DARK.emph, DARK.data);
  assert.equal(DARK.onEmph, DARK.onData);
});

test('FE-6 (static half): the button text and the border read in both themes', () => {
  const { LIGHT, DARK } = palettes();
  for (const [name, p] of [['light', LIGHT], ['dark', DARK]]) {
    assert.ok(ratio(p.onEmph, p.emph) >= 4.5, `${name}: button text on the button ${ratio(p.onEmph, p.emph).toFixed(2)}`);
    assert.ok(ratio(p.emph, p.raised) >= 3, `${name}: border on the card ${ratio(p.emph, p.raised).toFixed(2)}`);
    assert.ok(ratio(p.emph, p.well) >= 3, `${name}: sparkle on its well ${ratio(p.emph, p.well).toFixed(2)}`);
  }
});

test('FE-5: the card takes its colours from tokens only — no raw hex, named colour, rgba or shadow', () => {
  assert.doesNotThrow(() => parse(HERO, { sourceType: 'module', plugins: ['jsx'] }));
  assert.doesNotMatch(HERO, /#[0-9a-fA-F]{3,8}\b/, 'raw hex');
  assert.doesNotMatch(HERO, /'(white|black)'/, 'named colour');
  assert.doesNotMatch(HERO, /rgba?\(/, 'literal rgba');
  const code = HERO.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /shadow|elevation/i, 'no shadow (A1 is the border only)');
  assert.match(style(HERO, 'emphRing'), /borderColor: c\.emph/);
  assert.match(style(HERO, 'emphCta'), /backgroundColor: c\.emph/);
  assert.match(style(HERO, 'emphCtaText'), /color: c\.onEmph/);
});

// ── FE-1 / FE-4: emphasised only while the food log is active ──
test('FE-1/FE-4: "active" is the condition Today already uses to show the card (a reality check running)', () => {
  // The same policy that hides the card on Today when no check runs.
  assert.match(HERO, /if \(variant === 'today' && !policy\.show\) return null;/);
  assert.match(HERO, /const emph = policy\.show && !locked;/);
  assert.equal(todayFoodHeroPolicy({ rcStart: null, todayISO: '2026-10-15', access: {} }).show, false, 'no check → not active');
  assert.equal(todayFoodHeroPolicy({ rcStart: { date: '2026-09-29' }, todayISO: '2026-10-15', access: {} }).show, true, 'check running → active');
});

test('FE-1: while active the card draws the 2 pt emph border, the sparkle in a round well and the full-width button', () => {
  assert.match(style(HERO, 'emphRing'), /borderWidth: 2, borderColor: c\.emph, borderRadius: 24/);
  // the ring is drawn inside the card (inset, as the picture's inset 2 pt line), not around it
  assert.match(body, /\{emph \? <View pointerEvents="none" style=\{\[StyleSheet\.absoluteFill, s\.emphRing\]\} \/> : null\}/);
  assert.match(body, /\{emph \? \(\s*<View style=\{s\.well\}>\s*<FeatureIcon name="ai_spark" size=\{22\} color=\{colors\.emph\} \/>\s*<\/View>\s*\) : \(\s*<FeatureIcon name="ai_spark" size=\{22\} color=\{colors\.ink2\} \/>\s*\)\}/);
  assert.match(style(HERO, 'well'), /width: 40, height: 40, borderRadius: 20, backgroundColor: c\.well/);
  assert.match(body, /<View style=\{\[s\.head, emph && s\.headEmph\]\}>/);
  assert.match(style(HERO, 'headEmph'), /gap: 12/);
  // full width (stretches across the card), 48 pt tall, 17 pt bold label = the existing key
  assert.match(style(HERO, 'emphCta'), /alignSelf: 'stretch'/);
  assert.match(style(HERO, 'emphCta'), /minHeight: 48, borderRadius: 24/);
  assert.match(style(HERO, 'emphCtaText'), /fontSize: 17, fontWeight: '700'/);
  assert.match(body, /\{emph && \(\s*<TouchableOpacity style=\{s\.emphCta\}[^>]*>\s*<Text style=\{s\.emphCtaText\}>\{t\('nutri_hero_cta'\)\}<\/Text>/);
});

test('FE-1: "Registrar comida" is the existing nutri_hero_cta, in all 6 languages', () => {
  const tr = read('i18n', 'translations.js');
  assert.equal((tr.match(/\n {4}nutri_hero_cta: '/g) || []).length, 6);
  assert.match(tr, /nutri_hero_cta: 'Registrar comida'/);
});

test('FE-4: when not active nothing changes — no ring, no blue button, the plain ink2 sparkle, the locked CTA as before', () => {
  // every emphasis piece is behind the emph flag
  for (const piece of ['s.emphRing', 's.emphCta', 's.well', 's.headEmph']) {
    const at = body.indexOf(piece);
    assert.ok(at > 0, `${piece} used`);
    assert.match(body.slice(Math.max(0, at - 120), at), /emph/, `${piece} only when emph`);
  }
  assert.match(body, /\{locked && <View style=\{s\.cta\}><Text style=\{s\.ctaText\}>\{t\('nutri_locked_cta'\)\}<\/Text><\/View>\}/);
  assert.match(style(HERO, 'card'), /backgroundColor: c\.raised, borderRadius: 24, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16, gap: 8 \}/, 'card itself unchanged (no border on it)');
});

// ── FE-3: the button opens the same chat as the card ──
test('FE-3: the button and the card call the same open handler (FoodChat, or the Paywall when locked)', () => {
  assert.match(HERO, /const openFood = \(\) => navigation\.navigate\(locked \? 'Paywall' : 'FoodChat', locked \? \{ source: 'food_hero' \} : undefined\);/);
  const presses = [...body.matchAll(/onPress=\{([^}]*)\}/g)].map((m) => m[1]);
  assert.deepEqual(presses, ['openFood', 'openFood'], 'card + button, one handler, no new flow');
});

// ── FE-2: Evolução uses the same component and props ──
test('FE-2: Evolução renders the same card (same component, same props; the treatment comes from inside it)', () => {
  const uses = JOURNEY.match(/<FoodLogHero[^>]*\/>/g) || [];
  assert.equal(uses.length, 2, 'phone + book');
  for (const u of uses) assert.equal(u, '<FoodLogHero variant="journey" />');
  // the emphasis does not depend on the variant
  assert.doesNotMatch(HERO, /emph[^\n]*variant|variant[^\n]*emph/);
  // and Today keeps the card in its place, under the tracker
  assert.match(TODAY, /<TodayTracker[\s\S]{0,300}\{\/\* AI food log while a reality check runs \(FL-33\)[^\n]*\*\/\}\s*<FoodLogHero variant="today" onReady=\{heroReadyRef\.current\.resolve\} \/>/);
});
