// A-206 native half (founder 2026-10-31, docs/specs/a206-glass-tab-bar.md GB-7 and the Android blur,
// option A): the iPhone uses Apple's own tab bar (react-native-bottom-tabs: iOS 26 Liquid Glass — the
// floating capsule, the bubble that morphs between tabs, the bar that shrinks on scroll down; active =
// ink) and Android's glass capsule gets a real blur (expo-blur). Both are native views that today's
// installed binaries do not carry (the iPhone simulator app and the Fold's dev client get JS swapped in),
// so the JS falls back to today's bars when the native view is missing — never a crash.
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
  'react-native': { Platform: { OS: 'ios' }, UIManager: {} },
  './nativeModule': { hasNativeModule: () => false },
});

test('fallback: the iPhone uses Apple\'s bar only when its native view (RNCTabView) is in the binary; any error means no', () => {
  const N = nativeViews();
  assert.equal(N.hasNativeTabs({ os: 'ios', ui: { hasViewManagerConfig: (n) => n === 'RNCTabView' } }), true);
  assert.equal(N.hasNativeTabs({ os: 'ios', ui: { hasViewManagerConfig: () => false } }), false, 'today\'s simulator app: no native module');
  assert.equal(N.hasNativeTabs({ os: 'ios', ui: { hasViewManagerConfig: () => { throw new Error('Global function is not registered'); } } }), false, 'never a crash');
  assert.equal(N.hasNativeTabs({ os: 'ios', ui: { getViewManagerConfig: (n) => (n === 'RNCTabView' ? {} : null) } }), true, 'older UIManager: getViewManagerConfig');
  assert.equal(N.hasNativeTabs({ os: 'ios', ui: {} }), false);
  assert.equal(N.hasNativeTabs({ os: 'ios', ui: null }), false);
  assert.equal(N.hasNativeTabs({ os: 'android', ui: { hasViewManagerConfig: () => true } }), false, 'Android keeps the JS glass bar, never the native bottom tabs');
});

test('fallback: Android blurs only when expo-blur\'s native view (ExpoBlurView) is in the binary; any error means no', () => {
  const N = nativeViews();
  assert.equal(N.hasNativeBlur({ os: 'android', hasModule: (n) => n === 'ExpoBlurView' }), true);
  assert.equal(N.hasNativeBlur({ os: 'android', hasModule: () => false }), false, 'today\'s dev client: no native module');
  assert.equal(N.hasNativeBlur({ os: 'android', hasModule: () => { throw new Error('boom'); } }), false, 'never a crash');
  assert.equal(N.hasNativeBlur({ os: 'ios', hasModule: () => true }), false, 'the iPhone has Apple\'s glass; the JS glass bar is Android-only');
  // The packages are required only after the check, so a binary without them never loads their views.
  const src = read('lib/nativeViews.js');
  assert.match(src, /if \(!hasNativeTabs\(\)\) return null;[\s\S]*?require\('@bottom-tabs\/react-navigation'\)/);
  assert.match(src, /if \(!hasNativeBlur\(\)\) return null;[\s\S]*?require\('expo-blur'\)/);
  assert.doesNotMatch(src, /^import .*(expo-blur|react-native-bottom-tabs|@bottom-tabs)/m, 'no top-level import of a native view package');
});

test('GB-7: the iPhone uses the native navigator with minimize-on-scroll-down and the ink tint; otherwise today\'s JS navigator', () => {
  const app = read('App.js');
  assert.match(app, /const NATIVE_TABS = loadNativeTabs\(\);/);
  assert.match(app, /const Tab = NATIVE_TABS \? NATIVE_TABS\.createNavigator\(\) : createBottomTabNavigator\(\);/);
  const props = app.slice(app.indexOf('function tabNavProps('), app.indexOf('\n}\n', app.indexOf('function tabNavProps(')));
  assert.match(props, /minimizeBehavior: 'onScrollDown'/);
  assert.match(props, /tabBarActiveTintColor: colors\.ink/);
  assert.match(props, /tabBarInactiveTintColor: colors\.ink3/);
  assert.doesNotMatch(props, /accent|data|#[0-9a-fA-F]{3,8}/, 'active = ink, never blue; colours from the theme only');
  // The same five tabs, same order, same labels; native icons are the DoseTrace glyphs as images.
  assert.match(app, /\{ name: 'Today', label: t\('tab_today'\)[\s\S]*?\{ name: 'Protocols', label: t\('tabbar_protocols'\)[\s\S]*?\{ name: 'Journey', label: t\('tab_journey'\)[\s\S]*?\{ name: 'Body', label: t\('tab_body'\)[\s\S]*?\{ name: 'Settings', label: t\('tabbar_settings'\)/);
  const opts = app.slice(app.indexOf('function tabOptions('), app.indexOf('\n}\n', app.indexOf('function tabOptions(')));
  assert.match(opts, /tabBarIcon: \(\{ focused \}\) => TAB_ICONS\[tab\.name\]\[focused \? 'filled' : 'outline'\]/);
  assert.match(opts, /tabBarIcon: \(\{ focused \}\) => <TabIcon Glyph=\{tab\.Glyph\} focused=\{focused\} \/>/);
  // The navigator: the package's own native view (NativeBottomTabView) under React Navigation's tab router.
  const nav = read('components/NativeTabs.js');
  assert.match(nav, /useNavigationBuilder\(TabRouter,/);
  assert.match(nav, /<NativeBottomTabView/);
  assert.match(nav, /createNavigatorFactory\(NativeTabNavigator\)/);
});

test('GB-5 on iPhone: a screen that hides the tab bar (Recently deleted selection) hides Apple\'s bar too', () => {
  const T = load('lib/tabBarStyle.js', { 'react-native': { StyleSheet: { hairlineWidth: 0.5 }, Platform: { OS: 'ios' } } });
  assert.equal(T.isTabBarHidden({ display: 'none' }), true);
  assert.equal(T.isTabBarHidden([{ height: 80 }, { display: 'none' }]), true);
  assert.equal(T.isTabBarHidden([{ display: 'none' }, { display: 'flex' }]), false, 'the last one wins, as StyleSheet.flatten');
  assert.equal(T.isTabBarHidden({ height: 84 }), false);
  assert.equal(T.isTabBarHidden(undefined), false);
  const nav = read('components/NativeTabs.js');
  assert.match(nav, /const hidden = isTabBarHidden\(descriptors\[state\.routes\[state\.index\]\.key\]\?\.options\?\.tabBarStyle\);/);
  assert.match(nav, /tabBarHidden=\{hidden\}/);
  // ProtocolsScreen still asks for it the same way (no screen change needed).
  assert.match(read('screens/ProtocolsScreen.js'), /tabBarStyle: trashSel \? \{ display: 'none' \} : tabBarStyle\(colors, insets\.bottom\)/);
});

test('GB-3 on iPhone: every tab screen ends above Apple\'s bar (its measured height); no room when the bar is hidden', () => {
  const nav = read('components/NativeTabs.js');
  assert.match(nav, /const measured = useContext\(BottomTabBarHeightContext\);/);
  assert.match(nav, /const room = hidden \? 0 : measured > 0 \? measured : tabBarSpace\(colors, insets\.bottom, 'ios'\);/);
  assert.match(nav, /<View style=\{\{ flex: 1, paddingBottom: room \}\}>/);
  assert.match(nav, /const barRoomLayout = \(\{ children, options \}\) => <BarRoom hidden=\{isTabBarHidden\(options\?\.tabBarStyle\)\}>\{children\}<\/BarRoom>;/);
  assert.match(nav, /screenLayout: screenLayout \|\| barRoomLayout/);
});

test('icons: the five DoseTrace glyphs exist as template PNGs, 24 pt at @1x/@2x/@3x, outline and filled', () => {
  const names = ['today', 'protocols', 'journey', 'body', 'settings'];
  for (const n of names) {
    for (const base of [n, `${n}-filled`]) {
      for (const [suffix, px] of [['', 24], ['@2x', 48], ['@3x', 72]]) {
        const f = `assets/tab-icons/${base}${suffix}.png`;
        assert.ok(exists(f), f);
        const png = fs.readFileSync(path.join(ROOT, f));
        assert.equal(png.slice(1, 4).toString(), 'PNG', f);
        assert.equal(png.readUInt32BE(16), px, `${f} width`);
        assert.equal(png.readUInt32BE(20), px, `${f} height`);
        assert.equal(png[25], 6, `${f} is RGBA (transparent background)`);
      }
    }
  }
  // Each tab maps to its pair (Metro picks the scale).
  const icons = read('lib/tabIcons.js');
  for (const [tab, n] of [['Today', 'today'], ['Protocols', 'protocols'], ['Journey', 'journey'], ['Body', 'body'], ['Settings', 'settings']]) {
    assert.match(icons, new RegExp(`${tab}: \\{ outline: require\\('\\.\\./assets/tab-icons/${n}\\.png'\\), filled: require\\('\\.\\./assets/tab-icons/${n}-filled\\.png'\\) \\}`));
  }
  // The generator draws App.js's own glyph paths (they cannot drift apart).
  const app = read('App.js');
  const glyphs = app.slice(app.indexOf('function TodayGlyph('), app.indexOf('function TabIcon('));
  const gen = read('scripts/render-tab-icons.cjs');
  const ds = [...glyphs.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ds.length >= 6);
  for (const d of ds) assert.ok(gen.includes(d), `generator carries ${d.slice(0, 24)}…`);
});

test('GB-4: the opening skeleton (BootTabs) uses the same navigator kind, props and tab options as MainTabs', () => {
  const app = read('App.js');
  const main = app.slice(app.indexOf('function MainTabs('), app.indexOf('\n}\n', app.indexOf('function MainTabs(')));
  const boot = app.slice(app.indexOf('function BootTabs('), app.indexOf('\n}\n', app.indexOf('function BootTabs(')));
  for (const part of [main, boot]) {
    assert.match(part, /<Tab\.Navigator/);
    assert.match(part, /\{\.\.\.tabNavProps\(colors\)\}/);
    assert.match(part, /screenOptions=\{tabScreenOptions\(colors, insets\)\}/);
    assert.match(part, /tabBar=\{GLASS_TAB_BAR\}/);
    assert.match(part, /tabOptions\(tab\)/);
  }
  // The opening never switches tab natively: Apple's bar keeps Today until the app is up.
  assert.match(boot, /options=\{\{ \.\.\.tabOptions\(tab\), preventsDefault: true \}\}/);
  // GLASS_TAB_BAR stays Android-only (a tabBar prop would replace Apple's bar on iPhone).
  assert.match(app, /const GLASS_TAB_BAR = Platform\.OS === 'android' \? \(props\) => <GlassTabBar \{\.\.\.props\} \/> : undefined;/);
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
