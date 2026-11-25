'use strict';
// S25 2026-11-25 (package 0d621d38): "Voltar" (and Reduce Motion, which always shows each scene complete)
// opened "Dose no corpo" without the line across the column tops and "Seus exames" without the three lines.
// A scene shown complete mounts with the clock already on its hold frame and never moving, and on Android
// react-native-svg applies useAnimatedProps only when the shared value changes after mount — so the SVG kept
// its static start props (the line undrawn). OB-29: Voltar shows the previous scene COMPLETE. Every SVG element
// driven by the clock must also get, as its static props, the value for the clock at render.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'components/OnboardingIntro.js'), 'utf8');
const fnBody = (name) => { const i = src.indexOf(`function ${name}(`); return src.slice(i, src.indexOf('\n}\n', i)); };

test('DrawLine: the static dash offset is the one for the clock at render (a complete scene shows the line)', () => {
  const b = fnBody('DrawLine');
  assert.match(b, /const dash = \(v\) =>/);
  assert.match(b, /useAnimatedProps\(\(\) => \(\{ strokeDashoffset: dash\(clock\.get\(\)\) \}\)\)/);
  assert.match(b, /strokeDashoffset=\{dash\(clock\.get\(\)\)\}/);
  assert.doesNotMatch(b, /strokeDashoffset=\{length\}/);
});

test('TopLine: the static ends and opacity are the ones for the clock at render', () => {
  const b = fnBody('TopLine');
  assert.match(b, /const ends = \(v\) =>/);
  assert.match(b, /useAnimatedProps\(\(\) => ends\(clock\.get\(\)\)\)/);
  assert.match(b, /const e0 = ends\(clock\.get\(\)\)/);
  assert.match(b, /x1=\{e0\.x1\} y1=\{e0\.y1\} x2=\{e0\.x2\} y2=\{e0\.y2\}/);
  assert.match(b, /strokeOpacity=\{e0\.strokeOpacity\}/);
});

test('the syringe keeps the real SyringeScale overlay for its complete frame (an Animated.View style, applied at mount)', () => {
  const b = fnBody('IntroSyringe');
  assert.match(b, /<SyringeScale /);
  assert.match(b, /useAnimatedStyle\(\(\) => \(\{ opacity: clamp01\(\(clock\.get\(\) - \(at \+ dur\)\) \/ 150\) \}\)\)/);
});
