'use strict';
// The language choice in the onboarding (founder 2026-11-24, option B of
// docs/design/onboarding-intro-controles.html): on the splash, under the phrase, the six languages as
// chips, each written in its own language (LANGUAGES[].native), the current one marked, one tap
// switches; the small "EN" pill at the top is gone (rebuild = replace). On the intro video, a chip
// at the top left (monoline globe + the language's own name + chevron) opens the app's language
// sheet; changing the language mid-video keeps the scene (the clock is never reset), only the texts
// change.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const code = (f) => read(f).replace(/^\s*\/\/.*$/gm, '');

test('the six languages in their own names, in the app list', () => {
  const s = read('i18n/translations.js');
  const natives = [...s.slice(0, s.indexOf('];')).matchAll(/native: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(natives, ['English', 'Español', 'Português', 'Français', 'Deutsch', 'Italiano']);
});

test('splash: the six language chips under the phrase, current marked, one tap switches; the EN pill is gone', () => {
  const onb = code('screens/OnboardingFlowScreen.js');
  const a = onb.indexOf("{cur === 'splash' && (");
  const splash = onb.slice(a, onb.indexOf("{cur === 'help' && (", a));
  assert.ok(splash.length > 200);
  assert.ok(splash.indexOf("t('ob_phrase')") < splash.indexOf('s.langChips'), 'under the phrase');
  assert.match(splash, /accessibilityRole="radiogroup" accessibilityLabel=\{t\('settings_language'\)\}/);
  assert.match(splash, /\(LANGUAGES \|\| \[\]\)\.map\(\(l\) => \{/);
  assert.match(splash, /onPress=\{\(\) => setLanguage\(l\.code\)\}/, 'one tap switches');
  assert.match(splash, /accessibilityRole="radio"/);
  assert.match(splash, /accessibilityState=\{\{ selected: on \}\}/);
  assert.match(splash, /\{l\.native\}/, 'each in its own language');
  assert.match(splash, /on && s\.langChipOn/, 'the current one marked');
  assert.match(splash, /<FeatureIcon name="globe"/, 'the monoline globe, never an emoji');
  assert.doesNotMatch(onb, /langPill|langRow/, 'the old EN pill is removed');
  assert.doesNotMatch(read('screens/OnboardingFlowScreen.js'), /\u{1F310}/u, 'no globe emoji');
});

test('splash chips use theme tokens in both palettes (no raw colours)', () => {
  const onb = read('screens/OnboardingFlowScreen.js');
  for (const k of ['langChips', 'langChipHead', 'langChipHeadText', 'langChipList', 'langChip', 'langChipOn', 'langChipText', 'langChipTextOn']) {
    const m = onb.match(new RegExp(`\\n    ${k}: \\{([^\\n]*)\\},`));
    assert.ok(m, `style ${k}`);
    assert.doesNotMatch(m[1], /#[0-9a-fA-F]{3,8}|'white'|'black'|rgba?\(/, k);
  }
  assert.match(onb, /langChipOn: \{[^\n]*borderColor: c\.ink[^\n]*backgroundColor: c\.raised/);
});

test('video: the language chip at the top left (globe, own name, chevron) opens the app sheet', () => {
  const s = code('components/OnboardingIntro.js');
  assert.match(s, /export default function OnboardingIntro\(\{ onDone, atEnd, backRef, onLanguage \}\)/);
  assert.match(s, /<FeatureIcon name="globe" size=\{18\} color=\{c\.ink\} \/>/);
  assert.match(s, /LANGUAGES \|\| \[\]\)\.find\(\(l\) => l\.code === language\)/);
  assert.match(s, /onPress=\{onLanguage\}/);
  assert.match(s, /accessibilityLabel=\{`\$\{t\('settings_language'\)\}: \$\{langName\}`\}/);
  assert.match(s, /langChip: \{ position: 'absolute', left: 24, top: y\(72\)/, 'top left, next to Pular');
  assert.doesNotMatch(read('components/OnboardingIntro.js'), /\u{1F310}/u);
  const onb = code('screens/OnboardingFlowScreen.js');
  assert.match(onb, /<OnboardingIntro onDone=\{next\} atEnd=\{introAtEnd\.current\} backRef=\{introBack\} onLanguage=\{\(\) => setShowLang\(true\)\} \/>/, 'the existing language sheet, no key: never remounted');
});

test('changing the language mid-video keeps the scene: nothing resets the clock on a language change', () => {
  const s = code('components/OnboardingIntro.js');
  // the clock starts once from the first plan, and the only effect that moves it runs on [reduced]
  assert.match(s, /const first = useMemo\(\(\) => introStart\(\{ reduced, atEnd \}\), \[\]\);/);
  assert.match(s, /const clock = useSharedValue\(first\.from\);/);
  const effects = [...s.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[([^\]]*)\]\);/g)];
  assert.ok(effects.some((m) => /\bgo\(/.test(m[1])), 'the effect that plays the clock is found');
  for (const m of effects) if (/\bgo\(|clock\.set\(/.test(m[1])) assert.equal(m[2], 'reduced', 'a clock effect never depends on the language');
  assert.doesNotMatch(s, /key=\{language\}/);
  // the flow does not reset the step on a language change
  const onb = code('screens/OnboardingFlowScreen.js');
  assert.doesNotMatch(onb, /\[language\]\);[^\n]*setCur|key=\{language\}/);
});
