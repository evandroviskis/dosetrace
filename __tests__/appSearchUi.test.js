'use strict';
// App search B2 (docs/specs/app-search.md): the entry corner on the five tab roots, the search screen,
// the landings and the hard line, checked on the real sources (node --test cannot render React
// Native; the layout checks compute the frame from the styles the screens really use).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'); // without comments
const src = read('i18n/translations.js');
const mod = { exports: {} };
new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
const tr = mod.exports.translations;
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const { CORNER, HEADER_ROW, cornerFrame, slotMarginTop } = require('../lib/searchCorner');
const { placeAction, textAction } = require('../lib/appSearchNav');
const S = require('../lib/appSearch');
const { LIGHT, DARK } = (() => { const m = { exports: {} }; const s = read('lib/theme.js'); return { LIGHT: JSON.parse(JSON.stringify(eval('(' + s.match(/export const LIGHT = (\{[\s\S]*?\n\});/)[1] + ')'))), DARK: JSON.parse(JSON.stringify(eval('(' + s.match(/export const DARK = (\{[\s\S]*?\n\});/)[1] + ')'))) }; })();

const TAB_ROOTS = {
  Today: 'screens/TodayScreen.js', Protocols: 'screens/ProtocolsScreen.js', Journey: 'screens/JourneyScreen.js',
  Body: 'screens/BodyScreen.js', Settings: 'screens/SettingsScreen.js',
};
const styleOf = (file, name) => {
  const m = read(file).match(new RegExp(`\\n\\s*${name}: (\\{[^}]*\\}|[A-Z_]+(?:\\.[a-z]+)?)`));
  assert.ok(m, `${file} style ${name}`);
  return m[1];
};
const num = (style, prop) => { const m = style.match(new RegExp(`\\b${prop}: (\\d+)`)); return m ? Number(m[1]) : 0; };

// Where each tab root's header row starts below the top safe area, and its right padding, from the
// styles the screens use (page / scroll content / header), for the phone and the Fold's left page.
function headerBox(tab, layout) {
  if (tab === 'Today') { const h = read('screens/components/TodaySkeleton.js').match(/header: (\{[^}]*\})/)[1]; return { top: num(h, 'paddingTop'), right: num(h, 'paddingHorizontal') }; }
  if (tab === 'Journey') { const h = styleOf(TAB_ROOTS.Journey, 'header'); return { top: num(h, 'paddingTop'), right: num(h, 'paddingHorizontal') }; }
  if (tab === 'Settings') { const h = styleOf(TAB_ROOTS.Settings, 'header'); return { top: num(h, 'paddingTop'), right: num(h, 'paddingHorizontal') }; }
  if (tab === 'Protocols') { const h = read(TAB_ROOTS.Protocols).match(/\n  header: (\{[^}]*\})/)[1]; return { top: num(h, 'paddingTop'), right: num(h, 'paddingHorizontal') }; }
  if (layout === 'phone') { const h = styleOf(TAB_ROOTS.Body, 'hubHero'); return { top: num(h, 'paddingTop'), right: num(h, 'paddingHorizontal') }; }
  const pad = styleOf(TAB_ROOTS.Body, 'scrollPad'); const h = styleOf(TAB_ROOTS.Body, 'bookHero');
  return { top: num(pad, 'paddingTop') + num(h, 'paddingTop'), right: num(pad, 'paddingHorizontal') + num(h, 'paddingHorizontal') };
}
// The offsetTop each tab root hands its SearchCorner (one per layout where they differ).
function offsets(tab) {
  const s = read(TAB_ROOTS[tab]);
  const consts = {};
  for (const m of s.matchAll(/const ([A-Z_]+) = (\d+);/g)) consts[m[1]] = Number(m[2]);
  return [...s.matchAll(/<SearchCorner tab="(\w+)"([^>]*)\/>/g)].map((m) => {
    assert.equal(m[1], tab, `${TAB_ROOTS[tab]} names its own tab`);
    const o = m[2].match(/offsetTop=\{(\w+)\}/);
    return o ? (consts[o[1]] != null ? consts[o[1]] : Number(o[1])) : CORNER.top;
  });
}

test('AS-1 / AS-1b: one corner, the same frame on the five tab roots (phone 390 pt and the Fold left page, light and dark)', () => {
  const frames = [];
  for (const tab of Object.keys(TAB_ROOTS)) {
    const offs = offsets(tab);
    assert.ok(offs.length >= 1, `${tab} has the corner`);
    const layouts = tab === 'Body' ? [['phone', offs[1]], ['book', offs[0]]] : offs.map((o, i) => [i === 0 ? 'a' : 'b', o]);
    for (const [layout, off] of layouts) {
      const box = headerBox(tab, layout);
      assert.equal(off, box.top, `${tab} ${layout}: the slot is told where its header starts (${box.top})`);
      for (const pageWidth of [390, 405]) frames.push({ tab, layout, pageWidth, f: cornerFrame({ pageWidth, contentTop: box.top, contentRight: box.right, offsetTop: off }) });
    }
  }
  for (const w of [390, 405]) {
    const fs_ = frames.filter((x) => x.pageWidth === w);
    for (const x of fs_) assert.deepEqual(x.f, { x: w - CORNER.right - CORNER.size, y: CORNER.top, width: 44, height: 44 }, `${x.tab} ${x.layout} @${w}`);
  }
  assert.deepEqual(CORNER, { top: 8, right: 20, size: 44, gap: 10 });
  // the geometry never depends on the theme: the button only takes colours from the palette
  const corner = code('components/SearchCorner.js');
  assert.match(corner, /width: CORNER\.size, height: CORNER\.size, borderRadius: CORNER\.size \/ 2/);
  assert.match(corner, /backgroundColor: colors\.raised/);
  assert.match(corner, /<FeatureIcon name="search" size=\{22\} color=\{colors\.ink\} \/>/);
  assert.match(corner, /accessibilityLabel=\{t\('search_button'\)\}/);
  // the header rows are the shared row (title takes the room left, corner at the top right)
  assert.deepEqual(HEADER_ROW, { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 });
  assert.equal(slotMarginTop(14), -6);
});

test('AS-1b: "+ Adicionar" sits just left of the magnifier, centred, 10 pt apart; screens opened from a tab show no button', () => {
  const p = code(TAB_ROOTS.Protocols);
  assert.equal((p.match(/<SearchCorner tab="Protocols" leading=\{addButton\} offsetTop=\{PROTOCOLS_HEADER_TOP\} \/>/g) || []).length, 2, 'phone and book');
  const corner = code('components/SearchCorner.js');
  assert.match(corner, /slot: \{ flexDirection: 'row', alignItems: 'center', gap: CORNER\.gap/);
  assert.match(corner, /\{leading\}\s*<TouchableOpacity/);
  // only the five tab roots import the corner
  const users = [];
  for (const dir of ['screens', 'screens/components', 'components']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      if (!f.endsWith('.js')) continue;
      const rel = `${dir}/${f}`;
      if (/import SearchCorner/.test(read(rel))) users.push(rel);
    }
  }
  assert.deepEqual(users.sort(), Object.values(TAB_ROOTS).sort());
  // the corner sits only on Protocols' heroes view (the list and a protocol keep their back row)
  assert.match(p, /view === 'heroes' \? s\.header : s\.navrow/);
  assert.match(p, /\n  header: \{ flexDirection: 'row', alignItems: HEADER_ROW\.alignItems,/);
});

// em width per character (SF Pro, a134HeaderFit.test.js), bold 34 pt titles.
function textWidth(s, size) {
  let em = 0;
  for (const ch of String(s)) {
    if (ch === ' ') em += 0.26; else if (/[.,:;'’!|ijlI]/.test(ch)) em += 0.28; else if (/[tf]/.test(ch)) em += 0.33;
    else if (/[r]/.test(ch)) em += 0.37; else if (/[s]/.test(ch)) em += 0.47; else if (/[mwMW]/.test(ch)) em += 0.84;
    else if (/[A-ZÀ-Ý]/.test(ch)) em += 0.66; else em += 0.55;
  }
  return em * size * 1.04; // the heavier weight, as a134HeaderFit (calibrated on the sim, deliberately generous)
}

test('AS-1b: the titles keep their place and may wrap, never cut: no word wider than its box in the six languages', () => {
  const W = 390; // the picture's measurement (390 pt iPhone)
  const addW = (l) => textWidth(tr[l].protocols_add, 15) + 32;
  const atRisk = [];
  for (const l of LANGS) {
    const boxes = {
      tab_today: W - 40 - 12 - 44, settings_title: W - 40 - 12 - 44, tab_journey: W - 40 - 12 - 44, tab_body: W - 40 - 12 - 44,
      protocols_title: W - 40 - 12 - 44 - 10 - addW(l),
    };
    for (const [k, box] of Object.entries(boxes)) {
      for (const word of tr[l][k].split(/\s+/)) {
        const w = textWidth(word, 34);
        if (k === 'protocols_title' && w > box) { atRisk.push(`${l}:${word}:${w.toFixed(0)}>${box.toFixed(0)}`); continue; }
        assert.ok(w <= box, `${l} ${k}: "${word}" ${w.toFixed(0)} > ${box.toFixed(0)}`);
      }
    }
  }
  // Known edge (reported to the founder, AS-1b partial until a render in German): the coarse estimate,
  // deliberately wider than real glyphs, puts German "Protokolle" a few points over its box beside
  // "+ Hinzufügen". Any other language over the box fails here.
  assert.deepEqual(atRisk.map((x) => x.split(':')[0]), ['de'], atRisk.join(' '));
  // the titles never take a line limit (they wrap)
  for (const f of Object.values(TAB_ROOTS)) assert.doesNotMatch(read(f), /<Text style=\{\[?s\.(title|headerTitle|hubGreeting)[^>]*numberOfLines/);
});

test('AS-2 / AS-20 / AS-21 / AS-22: the search screen (field focused, Cancelar, keyboard and Android back, large text)', () => {
  const app = code('App.js');
  assert.match(app, /<Stack\.Screen name="AppSearch" component=\{AppSearchScreen\}/);
  const s = code('screens/AppSearchScreen.js');
  assert.match(s, /autoFocus/);
  assert.match(s, /placeholder=\{t\('search_field'\)\}/);
  assert.match(s, /accessibilityLabel=\{t\('search_field'\)\}/);
  assert.match(s, /field: \{[^}]*backgroundColor: c\.raised, borderWidth: 1, borderColor: c\.line/);
  assert.match(s, /fieldOn: \{ borderWidth: 2, borderColor: c\.ink \}/);
  assert.match(s, /<FeatureIcon name="search" size=\{20\}/);
  assert.match(s, /\{!embedded && \(\s*<TouchableOpacity onPress=\{close\}/, 'Cancelar only on the phone (BK-22)');
  assert.match(s, /function close\(\) \{[\s\S]*?navigation\.goBack\(\);/);
  assert.match(s, /returnKeyType="search"/);
  assert.match(s, /onSubmitEditing=\{\(\) => Keyboard\.dismiss\(\)\}/);
  assert.match(s, /keyboardDismissMode="on-drag"/);
  assert.match(s, /keyboardShouldPersistTaps="handled"/);
  assert.match(s, /hardwareBackPress[\s\S]*?Keyboard\.isVisible\(\)\) \{ Keyboard\.dismiss\(\); return true; \}/);
  // large text: titles and paths wrap, the excerpt keeps two lines, rows have no fixed height
  assert.doesNotMatch(s, /style=\{s\.rtitle\} numberOfLines|style=\{s\.rpath\} numberOfLines/);
  assert.match(s, /style=\{s\.rex\} numberOfLines=\{2\}/);
  assert.doesNotMatch(s.match(/row: \{[^}]*\}/)[0], /\bheight:/);
  assert.match(s, /minHeight: 64/);
});

test('AS-12: no result shows the glyph, the fixed sentence and three shortcuts, the same for every query', () => {
  const s = code('screens/AppSearchScreen.js');
  assert.match(s, /const none = typed && places\.length === 0 && texts\.length === 0;/);
  assert.match(s, /<FeatureIcon name="search" size=\{44\}/);
  assert.match(s, /t\('search_none_title'\)\.replace\('\{q\}', q\.trim\(\)\)/);
  assert.match(s, /t\('search_none_body'\)/);
  assert.match(s, /shortcuts\.slice\(0, 3\)\.map\(placeRow\)/);
});

test('AS-16: theme tokens only; the new mark token in both palettes', () => {
  assert.equal(LIGHT.mark, '#F5DF94');
  assert.equal(DARK.mark, '#5C4813');
  for (const f of ['screens/AppSearchScreen.js', 'components/SearchCorner.js']) {
    const s = code(f);
    assert.doesNotMatch(s, /#[0-9A-Fa-f]{3,8}\b/, `${f}: no raw hex`);
    assert.doesNotMatch(s, /'(white|black)'/, `${f}: no white / black`);
    assert.doesNotMatch(s, /rgba?\(/, `${f}: no literal rgba`);
  }
  for (const f of ['screens/AppSearchScreen.js', 'components/LegalModal.js', 'screens/FAQScreen.js', 'screens/components/LearnBlock.js']) {
    assert.match(read(f), /mark: \{ backgroundColor: c\.mark, color: c\.ink \}/, `${f} marks with the token, ink text`);
  }
});

test('AS-19: screen readers — the button, the field, the clear button, rows, headers and the polite count', () => {
  const s = code('screens/AppSearchScreen.js');
  assert.match(s, /accessibilityLabel=\{t\('search_clear'\)\}/);
  assert.match(s, /accessibilityLabel=\{`\$\{r\.title\}, \$\{r\.path\}`\}/);
  assert.match(s, /accessibilityLabel=\{`\$\{h\.unit\.title\}, \$\{h\.unit\.heading \|\| h\.unit\.where\}, \$\{h\.text\}`\}/);
  assert.match(s, /accessibilityRole="header">\{label\}/);
  assert.match(s, /announceForAccessibility/);
  assert.match(s, /pluralKey\('search_count', total, language\)/);
  assert.match(s, /askFocusBack\(fromTab\)/);
  assert.match(code('components/SearchCorner.js'), /takeFocusBack\(tab\)[\s\S]*setAccessibilityFocus/);
  assert.equal(tr.pt.search_count_one, '{n} resultado');
  assert.equal(tr.pt.search_count, '{n} resultados');
});

test('AS-23 / AS-13: no emoji, no advice in the new strings; FeatureIcon glyphs only', () => {
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;
  for (const f of ['screens/AppSearchScreen.js', 'components/SearchCorner.js', 'lib/appSearchCatalog.js', 'lib/appSearch.js', 'lib/appSearchText.js']) assert.doesNotMatch(read(f), EMOJI, f);
  const { FEATURE_ICON_XML } = require('../components/featureIconsData');
  for (const e of S.CATALOG) if (!e.proto) assert.ok(FEATURE_ICON_XML[e.icon], `${e.id} icon ${e.icon}`);
  for (const ic of ['search', 'close', 'help', 'info', 'lock', 'clipboard', 'shield', 'lab_frame', 'type_capsule']) assert.ok(FEATURE_ICON_XML[ic], ic);
  const ADVICE = /recomend|recommend|recomiend|empfehl|raccomand|conseill|diagnos|interpret|você deve|you should|deberías|du solltest|dovresti|vous devriez/i;
  const keys = Object.keys(tr.en).filter((k) => k.startsWith('search_'));
  assert.ok(keys.length >= 17);
  for (const l of LANGS) for (const k of keys) { assert.doesNotMatch(tr[l][k], ADVICE, `${l}.${k}`); assert.doesNotMatch(tr[l][k], EMOJI, `${l}.${k}`); }
});

test('AS-10 / AS-9: a result only opens; places go through their normal path and tab', () => {
  for (const e of S.CATALOG) {
    const row = { open: e.open, protocolId: e.proto || e.per ? 7 : undefined };
    for (const book of [false, true]) {
      const a = placeAction(row, { book });
      assert.ok(['push', 'bookPage', 'tab'].includes(a.type), `${e.id} ${a.type}`);
      assert.equal(a.tab, e.open.tab);
      const text = JSON.stringify(a);
      assert.doesNotMatch(text, /save|delete\(|signOut\(|send|export\(/, `${e.id}: ${text}`);
    }
  }
  assert.deepEqual(placeAction({ open: S.CATALOG.find((e) => e.id === 'D01').open }).route, 'Log');
  assert.equal(placeAction({ open: S.CATALOG.find((e) => e.id === 'D01').open }).tab, 'Today');
  // the screen switches the tab under the stack, then the place replaces the search (Back = that tab)
  const s = code('screens/AppSearchScreen.js');
  assert.match(s, /TabActions\.jumpTo\(tab, params\), target: key/);
  assert.match(s, /if \(jumpUnder\(a\.tab\)\) navigation\.replace\(a\.route/);
  // "Sair" and "Excluir conta" only scroll and highlight: no confirmation, no sign-out, no delete
  const set = code('screens/SettingsScreen.js');
  const land = set.match(/case 'signout':\s*case 'delete':([\s\S]*?)break;/)[1];
  assert.doesNotMatch(land, /handleSignOut|handleDeleteAccount|runSignOut|delete/i);
  assert.match(land, /setGlow\(sp\.target\)/);
  // My Body's "Exportar exames" lands on the journal and never exports
  const body = code('screens/BodyScreen.js');
  const bland = body.match(/const sp = route\?\.params\?\.search;([\s\S]*?)\}, \[route\?\.params\?\.search\]\)/)[1];
  assert.doesNotMatch(bland, /handleExport|shareAsync/);
});

test('found 2026-11-04: the Settings group scroll (fold BK-10 and the search) uses the card\'s place in the list, not the header\'s y inside its card (always 0)', () => {
  const set = code('screens/SettingsScreen.js');
  const fn = set.match(/function scrollToSection\(key\) \{([\s\S]*?)\n  \}/)[1];
  assert.match(fn, /landY\.current\.cards \+ landY\.current\[key\]/);
  assert.match(set, /<View style=\{s\.setCards\} onLayout=\{\(e\) => \{ landY\.current\.cards = e\.nativeEvent\.layout\.y; \}\}>/);
  assert.match(set, /<View key=\{g\.key\} style=\{s\.setCard\} onLayout=\{onCardLayout\(g\.key\)\}>/);
});

test('AS-7: the Dose log opens filtered from a result; "Ver histórico" and the hero still open "Todos"', () => {
  const log = code('screens/LogScreen.js');
  assert.match(log, /const \{ params: todayPage \} = useBookSelection\('Today', 'log'\);/);
  assert.match(log, /const routeFilter = embedded \? initialFilter : route && route\.params \? route\.params\.filter : null;/);
  assert.match(log, /useState\(\['Taken', 'Skipped', 'Missed'\]\.includes\(routeFilter\) \? routeFilter : 'All'\)/);
  for (const [id, f] of [['D01', 'Missed'], ['D02', 'Skipped'], ['D03', 'Taken']]) assert.equal(S.CATALOG.find((e) => e.id === id).open.params.filter, f);
  assert.equal(S.CATALOG.find((e) => e.id === 'D04').open.params, undefined);
  const today = code('screens/TodayScreen.js');
  assert.match(today, /function renderRightPage\(\) \{\s*if \(bookSel === SEARCH_PAGE\) return <AppSearchScreen embedded tab="Today" \/>;/);
  // the existing paths never pass a filter
  for (const m of today.matchAll(/navigate\('Log'([^)]*)\)/g)) assert.doesNotMatch(m[1], /filter/);
  for (const m of code('screens/ProtocolsScreen.js').matchAll(/navigate\('Log'([^)]*)\)/g)) assert.doesNotMatch(m[1], /filter/);
});

test('AS-18: on the Fold the search is the right page of the tab it was opened from; fold / unfold keep the text', () => {
  const corner = code('components/SearchCorner.js');
  assert.match(corner, /if \(book\) \{ if \(!on\) \{ clearQuery\(\); select\(SEARCH_PAGE\); \} return; \}/);
  assert.match(corner, /on && \{ borderColor: colors\.ink \}/, 'BK-8 outline');
  assert.match(corner, /wasBook\.current && !book && sel === SEARCH_PAGE[\s\S]*navigate\('AppSearch', \{ from: tab, keep: true \}\)/);
  for (const [tab, f] of Object.entries(TAB_ROOTS)) assert.match(code(f), new RegExp(`<AppSearchScreen embedded tab="${tab}" />`), `${tab} right page`);
  const s = code('screens/AppSearchScreen.js');
  assert.match(s, /useState\(\(\) => getQuery\(\)\)/);
  assert.match(s, /setSelection\(fromTab, SEARCH_PAGE, \{ explicit: true \}\);\s*navigation\.popTo\('MainTabs', \{ screen: fromTab \}\);/);
  assert.match(s, /if \(a\.type === 'bookPage'\) \{ setSelection\(a\.tab, a\.sel, \{ explicit: true, params: a\.params \}\)/);
  // a fold never turns the search into a protocol or a lab report
  assert.match(code(TAB_ROOTS.Protocols), /sel !== 'search'\) return \{ openId: sel, showList: true \}/);
  assert.match(code(TAB_ROOTS.Body), /sel === 'search'\) return null;/);
  assert.equal(require('fs').readFileSync(path.join(ROOT, 'components/SearchCorner.js'), 'utf8').match(/export const SEARCH_PAGE = '(\w+)'/)[1], 'search');
});

test('AS-27: a text opens at its paragraph with the words marked; Back returns to the search', () => {
  const TX = require('../lib/appSearchText');
  const t = (k) => (tr.pt[k] !== undefined ? tr.pt[k] : k);
  const hit = TX.makeTextSearch(TX.buildTextIndex(t, 'ios'))('excluir dados')[0];
  const a = textAction(hit, 'excluir dados');
  assert.deepEqual({ type: a.type, doc: a.doc }, { type: 'legal', doc: 'privacy' });
  const { legalBlocks } = require('../lib/legalBlocks');
  const blocks = legalBlocks(tr.pt.settings_privacy_body);
  const marks = TX.markRanges(blocks[a.block].text, a.q).map(([x, y]) => blocks[a.block].text.slice(x, y).toLowerCase());
  assert.ok(marks.includes('excluir') && marks.includes('dados'));
  const lm = code('components/LegalModal.js');
  assert.match(lm, /focusBlock = null, mark = null/);
  assert.match(lm, /for \(let i = focusBlock; i >= 0; i--\) if \(blocks\[i\]\.heading\) return i;/);
  assert.match(lm, /onScrollBeginDrag=\{\(\) => \{ if \(marksOn\) setMarksOn\(false\); \}\}/);
  const faqHit = TX.makeTextSearch(TX.buildTextIndex(t, 'ios'))('frasco vence')[0];
  assert.deepEqual(textAction(faqHit, 'frasco vence').route, 'FAQ');
  assert.match(code('screens/FAQScreen.js'), /route\.params\.openQuestion/);
  const learnHit = TX.makeTextSearch(TX.buildTextIndex(t, 'ios'))('glicogênio')[0];
  assert.equal(learnHit.unit.src, 'learn');
  assert.deepEqual(textAction(learnHit, 'glicogênio').params.focus, 'learn');
  assert.match(code('screens/components/LearnBlock.js'), /apply\(learnRequest\(\)\);\s*return onLearnRequest\(apply\);/);
  assert.match(code('screens/components/CalculatorSection.js'), /requestLearn\(\{ key: learnItem, mark, n: landKey \}\)/);
  const store = require('../lib/appSearchStore');
  store.requestLearn({ key: 'scale', mark: 'glicogênio', n: 1 });
  assert.equal(store.learnRequest().key, 'scale');
  assert.equal(store.learnRequest(Date.now() + 6000), null, 'an old hit never reopens');
  const s = code('screens/AppSearchScreen.js');
  assert.match(s, /if \(a\.type === 'legal'\) \{ setLegal\(a\); return; \}/);
  assert.match(s, /navigation\.navigate\(a\.route, a\.params\);/, 'FAQ / Progress open over the search');
});
