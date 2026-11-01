// A-206 (founder 2026-10-31, docs/specs/a206-glass-tab-bar.md), changed by the founder 2026-11-01 on
// build 82: the iPhone uses the same glass bar as Android ("Igual ao Android"), and the bar is never
// hidden, on either platform ("não deixa a barra oculta em momento algum, tanto no Android quanto no
// iPhone"). One bar under every screen of the main stack: the tabs and the screens opened from them.
// Android's capsule keeps the real blur when expo-blur's native view is in the binary.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));

// Loads an ES module source under node with its imports replaced by the given fakes.
function load(file, fakes) {
  const { code } = babel.transformSync(read(file), { presets: [], plugins: ['@babel/plugin-transform-modules-commonjs'], babelrc: false, configFile: false });
  const mod = { exports: {} };
  const req = (name) => {
    if (Object.prototype.hasOwnProperty.call(fakes, name)) return fakes[name];
    throw new Error(`unexpected import ${name}`);
  };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, req);
  return mod.exports;
}

const nativeViews = () => load('lib/nativeViews.js', {
  'react-native': { Platform: { OS: 'ios' } },
  './nativeModule': { hasNativeModule: () => false },
});
const TABS = ['Today', 'Protocols', 'Journey', 'Body', 'Settings'];

test('iPhone = the same glass bar as Android: no Apple tab bar, no minimize, no native tab pieces left', () => {
  const app = read('App.js');
  assert.match(app, /const Tab = createBottomTabNavigator\(\);/);
  assert.doesNotMatch(app, /loadNativeTabs|NATIVE_TABS|minimizeBehavior|TAB_ICONS|tabNavProps/);
  assert.match(app, /const GLASS_TAB_BAR = \(props\) => <GlassTabBar \{\.\.\.props\} \/>;/, 'not Android-only any more');
  assert.ok(!exists('components/NativeTabs.js') && !exists('lib/tabIcons.js') && !exists('assets/tab-icons'), 'rebuild = replace');
  assert.doesNotMatch(read('lib/nativeViews.js'), /hasNativeTabs|loadNativeTabs|bottom-tabs/);
  assert.doesNotMatch(read('lib/tabBarStyle.js'), /TAB_SCROLL_PROPS|isTabBarHidden|export function tabBarStyle/);
  for (const f of ['screens/TodayScreen.js', 'screens/ProtocolsScreen.js', 'screens/JourneyScreen.js', 'screens/BodyScreen.js', 'screens/SettingsScreen.js']) {
    assert.doesNotMatch(read(f), /TAB_SCROLL_PROPS/, f);
  }
});

test('never hidden: MainStack draws ONE bar under every screen (tabs and the screens opened from them); the tab navigator draws none', () => {
  const app = read('App.js');
  const main = app.slice(app.indexOf('function MainTabs('), app.indexOf('\n}\n', app.indexOf('function MainTabs(')));
  assert.match(main, /tabBar=\{NO_TAB_BAR\}/);
  const stack = app.slice(app.indexOf('function MainStack('), app.indexOf('\n}\n', app.indexOf('function MainStack(')));
  assert.match(stack, /layout=\{\(props\) => <MainStackLayout \{\.\.\.props\} \/>\}/);
  for (const r of ['Log', 'SerumCurve', 'Progress', 'FAQ', 'TeamMessages', 'ReminderCheck', 'Paywall', 'FoodChat']) {
    assert.match(stack, new RegExp('<Stack.Screen name="' + r + '"'), r + ' opens under the bar');
  }
  const layout = app.slice(app.indexOf('function MainStackLayout('), app.indexOf('\n}\n', app.indexOf('function MainStackLayout(')));
  assert.match(layout, /<View style=\{\{ flex: 1 \}\}>\{children\}<\/View>\s*<MainBar stackState=\{state\} navigation=\{navigation\} \/>/, 'the bar sits outside the cards: it never slides with a screen');
  // Nothing hides it: no display none in the bar, no screen sets it.
  assert.doesNotMatch(read('components/GlassTabBar.js'), /display === 'none'|return null/);
  assert.doesNotMatch(read('screens/ProtocolsScreen.js'), /setOptions\(\{ tabBarStyle|display: 'none' \}/);
});

test('the chosen tab is the tab under the stack; a screen over the tabs is noted', () => {
  const M = load('lib/mainBar.js', {});
  const st = (top, tabIndex, extra) => ({ index: top, routes: [{ name: 'MainTabs', state: tabIndex == null ? undefined : { index: tabIndex, routes: TABS.map((name) => ({ name })) } }, ...(extra || [])] });
  assert.deepEqual(M.mainBarState(st(0, 2), TABS).index, 2);
  assert.equal(M.mainBarState(st(0, 2), TABS).overTabs, false);
  const curve = M.mainBarState(st(1, 2, [{ name: 'SerumCurve' }]), TABS);
  assert.equal(curve.index, 2, 'Dose accumulation opened from Journey: Journey stays chosen');
  assert.equal(curve.overTabs, true);
  assert.equal(M.mainBarState(st(0, null), TABS).index, 0, 'before the tab navigator reports: Today');
  assert.equal(M.mainBarState({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Body' } }] }, TABS).index, 3, 'the tab asked for');
  assert.equal(M.mainBarState(undefined, TABS).index, 0);
  assert.deepEqual(M.mainBarState(st(0, 1), TABS).routes.map((r) => r.name), TABS);
});

test('a tap on any tab closes the screens over the tabs and shows that tab; on the tabs it switches tab', () => {
  const M = load('lib/mainBar.js', {});
  const calls = [];
  const nav = { popTo: (...a) => calls.push(['popTo', ...a]), navigate: (...a) => calls.push(['navigate', ...a]) };
  const routes = TABS.map((name) => ({ key: name, name }));
  M.mainBarPress(nav, { index: 2, routes, overTabs: true }, 'Journey');
  M.mainBarPress(nav, { index: 2, routes, overTabs: true }, 'Today');
  M.mainBarPress(nav, { index: 2, routes, overTabs: false }, 'Body');
  M.mainBarPress(nav, { index: 2, routes, overTabs: false }, 'Journey');
  assert.deepEqual(calls, [
    ['popTo', 'MainTabs', { screen: 'Journey' }],
    ['popTo', 'MainTabs', { screen: 'Today' }],
    ['navigate', 'MainTabs', { screen: 'Body' }],
  ]);
});

test('GB-4: the opening skeleton (BootTabs) draws the same glass bar with the same tab options', () => {
  const app = read('App.js');
  const boot = app.slice(app.indexOf('function BootTabs('), app.indexOf('\n}\n', app.indexOf('function BootTabs(')));
  assert.match(boot, /screenOptions=\{TAB_SCREEN_OPTIONS\} tabBar=\{GLASS_TAB_BAR\}/);
  assert.match(boot, /options=\{\{ \.\.\.tabOptions\(tab\), preventsDefault: true \}\}/);
  const bar = app.slice(app.indexOf('function MainBar('), app.indexOf('\n}\n', app.indexOf('function MainBar(')));
  assert.match(bar, /descriptors\[tab\.name\] = \{ options: tabOptions\(tab\) \}/);
  assert.match(bar, /<GlassTabBar state=\{bar\} descriptors=\{descriptors\} navigation=\{barNav\} insets=\{insets\} \/>/);
});

test('fallback: Android blurs only when expo-blur\'s native view (ExpoBlurView) is in the binary; any error means no', () => {
  const N = nativeViews();
  assert.equal(N.hasNativeBlur({ os: 'android', hasModule: (n) => n === 'ExpoBlurView' }), true);
  assert.equal(N.hasNativeBlur({ os: 'android', hasModule: () => false }), false, 'today\'s dev client: no native module');
  assert.equal(N.hasNativeBlur({ os: 'android', hasModule: () => { throw new Error('boom'); } }), false, 'never a crash');
  assert.equal(N.hasNativeBlur({ os: 'ios', hasModule: () => true }), false, 'the iPhone paints the glass fill, like Android\'s look');
  // The packages are required only after the check, so a binary without them never loads their views.
  const src = read('lib/nativeViews.js');
  assert.match(src, /if \(!hasNativeBlur\(\)\) return null;[\s\S]*?require\('expo-blur'\)/);
  assert.doesNotMatch(src, /^import .*(expo-blur|react-native-bottom-tabs|@bottom-tabs)/m, 'no top-level import of a native view package');
});

test('Android blur (option A): a BlurView behind the capsule with the glass tint on top; without the native view, today\'s bar exactly', () => {
  const bar = read('components/GlassTabBar.js');
  assert.match(bar, /const BlurView = loadBlurView\(\);/);
  assert.match(bar, /experimentalBlurMethod="dimezisBlurView"/);
  assert.match(bar, /intensity=\{isDark \? BLUR\.dark : BLUR\.light\}/);
  assert.match(bar, /tint=\{isDark \? 'dark' : 'light'\}/);
  // The glass* tokens stay the tint layer over the blur.
  assert.match(bar, /<View style=\{\[StyleSheet\.absoluteFill, \{ backgroundColor: c\.glassFill \}\]\} \/>/);
  // Fallback: no BlurView → the capsule paints glassFill itself, as before.
  assert.match(bar, /backgroundColor: BlurView \? c\.ground : c\.glassFill/);
  assert.match(bar, /\{BlurView \? \(/);
  // Still in the layout (GB-3) and colours from the theme only (GB-6).
  assert.match(bar, /glassBarRoom\(insets\.bottom\)/);
  assert.doesNotMatch(bar, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba\(/);
});

test('config: packages pinned; Android never links the native bottom tabs; no plugin needed for either', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies['react-native-bottom-tabs'], '1.4.0');
  assert.equal(pkg.dependencies['@bottom-tabs/react-navigation'], '1.4.0');
  assert.match(pkg.dependencies['expo-blur'], /^~15\.0\./, 'the SDK 54 version');
  // Android keeps the JS glass bar: the native tab view is not linked there, so its config plugin
  // (it only switches Android's AppTheme to Material 3) is not added.
  const rnc = require(path.join(ROOT, 'react-native.config.js'));
  assert.equal(rnc.dependencies['react-native-bottom-tabs'].platforms.android, null);
  const app = JSON.parse(read('app.json'));
  const plugins = app.expo.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
  assert.ok(!plugins.includes('react-native-bottom-tabs'), 'Android AppTheme stays as it is');
  assert.ok(!plugins.includes('expo-blur'), 'expo-blur has no config plugin');
  // The iOS pod (SwiftUIIntrospect, Swift) builds with the static frameworks already in use, iOS 16 ≥ its 14.
  const bp = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-build-properties')[1];
  assert.equal(bp.ios.useFrameworks, 'static');
  assert.ok(parseFloat(bp.ios.deploymentTarget) >= 14);
});
