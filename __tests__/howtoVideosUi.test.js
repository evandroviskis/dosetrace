'use strict';
// How-to videos in the FAQ (docs/specs/howto-videos.md HV-1..HV-12; picture docs/design/videos-perguntas.html):
// the screen, the player, the strings, the glyph, the theme tokens and the wiring, as source tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { translations: tr } = require('../i18n/translations.js');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const KEYS = ['howto_watch', 'howto_a11y', 'howto_secs', 'howto_secs_one', 'howto_mins', 'howto_mins_one', 'howto_time_join', 'howto_offline', 'howto_example', 'howto_close', 'howto_play', 'howto_pause'];
const faq = () => read('screens/FAQScreen.js');
const player = () => read('components/HowtoPlayer.js');
const runtime = () => read('lib/howtoRuntime.js');

test('strings: every how-to string in the 6 languages, the approved Portuguese word for word', () => {
  for (const l of LANGS) for (const k of KEYS) assert.ok(typeof tr[l][k] === 'string' && tr[l][k].trim(), `${l}.${k}`);
  assert.equal(tr.pt.howto_watch, 'Ver o vídeo');
  assert.equal(tr.pt.howto_offline, 'Para ver o vídeo, conecte-se à internet. A resposta está acima.');
  assert.equal(tr.pt.howto_example, 'Valores de exemplo, não é uma dose. Use os números da sua prescrição ou do rótulo.');
  assert.equal(tr.pt.howto_a11y, 'Vídeo, {time}: {q}');
  for (const l of LANGS) {
    assert.match(tr[l].howto_a11y, /\{time\}/);
    assert.match(tr[l].howto_a11y, /\{q\}/);
    assert.match(tr[l].howto_time_join, /\{min\}[\s\S]*\{sec\}/);
    for (const k of ['howto_secs', 'howto_secs_one', 'howto_mins', 'howto_mins_one']) assert.match(tr[l][k], /\{n\}/, `${l}.${k}`);
  }
  // not word for word: each language its own words
  const watch = new Set(LANGS.map((l) => tr[l].howto_watch));
  assert.ok(watch.size >= 5);
});

test('HV-12: no how-to string says or implies a dose, a result or advice; the example line says it is not a dose', () => {
  const advice = /\b(should|must|recommend|take|inject|deber[ií]as|recomend|tome|injete|aplique|devriez|recommand|solltest|empfehl|dovresti|raccomand)\b/i;
  for (const l of LANGS) {
    for (const k of KEYS) assert.doesNotMatch(tr[l][k], advice, `${l}.${k}`);
    assert.doesNotMatch(tr[l].howto_example, /\d/, `${l}: no number in the example line`);
  }
  assert.match(tr.en.howto_example, /not a dose/i);
  assert.match(tr.es.howto_example, /no es una dosis/i);
  assert.match(tr.fr.howto_example, /pas une dose/i);
  assert.match(tr.de.howto_example, /keine Dosis/i);
  assert.match(tr.it.howto_example, /non è una dose/i);
});

test('strings: formal Portuguese, French vous, German du, Italian and Spanish tu (no regionalisms)', () => {
  assert.doesNotMatch(tr.pt.howto_offline, /\b(você|a gente|dá para|tá)\b/i);
  assert.match(tr.fr.howto_offline, /connectez-vous/);
  assert.match(tr.de.howto_offline, /\bdich\b/);
  assert.match(tr.es.howto_offline, /conéctate/);
  assert.match(tr.it.howto_offline, /connettiti/);
});

test('HV-1 / glyph: a monoline play glyph in the house set (source SVG + data, stroke 54 drawn 72)', () => {
  const svg = read('assets/feature-icons/play.svg');
  assert.match(svg, /viewBox="0 0 1024 1024"/);
  assert.match(svg, /stroke-width="54"/);
  assert.doesNotMatch(svg, /fill="#/, 'monoline: no filled shape');
  const { FEATURE_ICON_XML } = require('../components/featureIconsData.js');
  assert.ok(FEATURE_ICON_XML.play, 'play glyph in the data');
  assert.match(FEATURE_ICON_XML.play, /stroke="__C__"/);
  assert.match(FEATURE_ICON_XML.play, /fill="none"/);
  assert.doesNotMatch(FEATURE_ICON_XML.play, /#[0-9A-Fa-f]{3,6}/);
});

test('HV-1: the open answer shows the quiet row (play glyph, "Ver o vídeo", the real duration) only when the manifest has the video', () => {
  const s = faq();
  assert.match(s, /pickVideo\(/);
  assert.match(s, /rowState\(/);
  assert.match(s, /<FeatureIcon name="play" size=\{16\} color=\{colors\.ink\} \/>/);
  assert.match(s, /t\('howto_watch'\)/);
  assert.match(s, /formatDuration\(video\.dur\)/);
  assert.match(s, /vidDur: \{[^}]*fontVariant: \['tabular-nums'\]/);
  assert.match(s, /lang: language/, 'the app language (HV-7)');
  assert.match(s, /id: item\.id/, 'by the question id');
});

test('HV-2: the row is a sibling of the answer, outside the question tap target, with the screen-reader label', () => {
  const s = faq();
  const i = s.indexOf('onPress={() => toggle(key)}');
  const close = s.indexOf('</TouchableOpacity>', i);
  const row = s.indexOf("t('howto_watch')");
  assert.ok(i > 0 && close > i && row > close, 'the video row comes after the question\'s TouchableOpacity closes');
  assert.match(s, /accessibilityLabel=\{rowA11yLabel\(video, item\.q, t, language\)\}/);
  assert.match(s, /accessibilityRole="button"/);
});

test('HV-3: a full-screen player inside the app: dark surface, ×, play/pause, progress with times, title, example line', () => {
  const p = player();
  assert.match(p, /require\('expo-video'\)/);
  assert.match(p, /<Modal[\s\S]*?presentationStyle="fullScreen"/);
  assert.match(p, /nativeControls=\{false\}/);
  assert.match(p, /colors\.player/);
  assert.match(p, /t\('howto_close'\)/);
  assert.match(p, /<FeatureIcon name="close"/);
  assert.match(p, /t\(playing \? 'howto_pause' : 'howto_play'\)/);
  assert.match(p, /formatDuration\(time\)/);
  assert.match(p, /formatDuration\(total\)/);
  assert.match(p, /\{title\}/);
  assert.match(p, /t\('howto_example'\)/);
  assert.doesNotMatch(p, /Linking|openURL|WebBrowser/, 'never the browser');
  assert.doesNotMatch(p, /#[0-9A-Fa-f]{3,8}\b|'white'|'black'/, 'no raw colour in the player: the fixed dark surface is a theme token');
});

test('HV-4: the end closes the player; Android back (onRequestClose) and the swipe close it the same way', () => {
  const p = player();
  assert.match(p, /addListener\('playToEnd'/);
  assert.match(p, /onRequestClose=\{onClose\}/);
  assert.match(p, /PanResponder\.create/);
  assert.match(p, /g\.dy > SWIPE_CLOSE \|\| g\.dx > SWIPE_CLOSE/);
  const s = faq();
  // Closing never touches the open question nor the scroll: only the player state is cleared.
  assert.match(s, /onClose=\{\(\) => setPlaying\(null\)\}/);
  assert.match(s, /onFinished=\{/);
  assert.doesNotMatch(s.slice(s.indexOf('<HowtoPlayer')), /setOpenItem|scrollTo/);
});

test('HV-5: offline the row is the line; a tap checks the connection first and never opens an empty player', () => {
  const s = faq();
  assert.match(s, /row === 'offline'/);
  assert.match(s, /t\('howto_offline'\)/);
  assert.match(s, /if \(!\(await videoOnlineNow\(\)\)\) \{ markOffline\(\); return; \}/);
  // a player that cannot load closes and the row becomes the offline line
  assert.match(player(), /status === 'error'/);
  assert.match(s, /onFailed=\{\(\) => \{ setPlaying\(null\); markOffline\(\); \}\}/);
  // the text answer is always rendered for an open question
  assert.match(s, /\{isOpen && !\(mark && key === hitKey\) && \(/);
});

test('HV-6: the runtime fetches the manifest with the 3 s store and keeps it as config (AsyncStorage), never the videos', () => {
  const r = runtime();
  assert.match(r, /createManifestStore\(/);
  assert.match(r, /MANIFEST_URL/);
  assert.match(r, /AsyncStorage/);
  assert.doesNotMatch(r, /FileSystem|downloadAsync|expo-file-system/, 'videos are never saved on the phone');
  assert.match(r, /appVersion\(\)/);
  assert.match(r, /require\('expo-video'\)/, 'without the native module the row never shows (fail closed)');
});

test('HV-8: the variant reads the book layout and the profile sex at every focus', () => {
  const s = faq();
  assert.match(s, /useBook\(\)/);
  assert.match(s, /useProfileSex\(\)/);
  assert.match(runtime(), /useFocusEffect/);
  assert.match(runtime(), /user_metadata/);
  assert.match(runtime(), /figureSex\(/); // the sex of the body the app draws (Ads 2026-11-26)
});

test('HV-9: two anonymous events through lib/analytics (the switch respected), no third-party SDK', () => {
  const a = read('lib/analytics.js');
  assert.match(a, /howtoVideoOpened: \(props\) => logEvent\('howto_video_opened', props\)/);
  assert.match(a, /howtoVideoFinished: \(props\) => logEvent\('howto_video_finished', props\)/);
  const s = faq();
  assert.match(s, /Analytics\.howtoVideoOpened\(eventProps\(/);
  assert.match(s, /Analytics\.howtoVideoFinished\(eventProps\(/);
  const pkg = JSON.parse(read('package.json'));
  for (const d of Object.keys(pkg.dependencies)) assert.doesNotMatch(d, /firebase|segment|mixpanel|amplitude|posthog/i);
});

test('HV-10: the app search still opens the FAQ at the question by id (the row is there)', () => {
  const s = faq();
  assert.match(s, /route\.params\.openQuestion \? faqTarget\(faqData, route\.params\.openQuestion\)/);
  assert.match(s, /useState\(hitKey\)/);
});

test('HV-11: the player surface is a theme token, the same fixed dark values in both palettes', () => {
  const th = read('lib/theme.js');
  const blocks = th.match(/player: \{[^}]*\}/g) || [];
  assert.equal(blocks.length, 2, 'player tokens in LIGHT and DARK');
  assert.equal(blocks[0], blocks[1], 'the player is dark in both themes');
  assert.match(blocks[0], /surface: '#0B0C0D'/);
  const s = faq();
  assert.doesNotMatch(s.slice(s.indexOf('const makeStyles')), /#[0-9A-Fa-f]{3,8}\b|'white'|'black'/);
});

test('native: expo-video is a dependency with its config plugin', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.dependencies['expo-video']);
  const app = JSON.parse(read('app.json'));
  assert.ok(app.expo.plugins.some((p) => p === 'expo-video' || (Array.isArray(p) && p[0] === 'expo-video')));
});
