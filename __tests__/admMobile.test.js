'use strict';
// Admin panel — layout for phones (founder 2026-11-02, proposal A approved: "Aprovado, pode construir";
// picture docs/design/adm-mobile-a.html). Below 700 px the page renders one screen: header of one line
// with a menu, alerts only when there is something, the 7/30/90 window, four numbers, collapsed sections
// with a one-line summary, and a bottom bar Resumo · Contas · Mais. Desktop is unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'web', 'adm.html'), 'utf8');
const SCRIPT = HTML.match(/<script>\n([\s\S]*?)<\/script>/)[1];
const T = (0, eval)('(' + SCRIPT.match(/var T=(\{[\s\S]*?\n  \});/)[1] + ')');
function mobPure() {
  const m = HTML.match(/\/\/ \[mob-pure-start\]([\s\S]*?)\/\/ \[mob-pure-end\]/);
  assert.ok(m, 'mob pure block present');
  return (0, eval)('(function(){' + m[1] + '\nreturn {mobKpis:mobKpis,mobStoreSummary:mobStoreSummary,mobChartSummary:mobChartSummary,mobAlerts:mobAlerts,MOB_MAX_W:MOB_MAX_W};})()');
}
const MG = {
  real_all_time: 44, test_count: 122,
  headline: [{ days: 7, count: 6, delta: 2 }, { days: 30, count: 16, delta: 6, platforms: { ios: 10, android: 4, unknown: 2, mixed: 0 } }, { days: 90, count: 37, delta: 31 }],
  activation: { rate: 50, num: 8, den: 16 },
  windows: { 30: { window: { start: '2026-10-03', end: '2026-11-02' }, funnel: [{ id: 'W1', total: 16 }, { id: 'W2', total: 14 }, { id: 'W3', total: 14 }, { id: 'W4', total: 9 }, { id: 'W5', total: 8 }],
    recon: { x2: { all: 61, test: 45, real: 16 }, rc: { status: 'ok', x3: 224, x4: 165, x5: { real: 14, test: 45 }, x6: 0, check_ok: true, diff: 0 } },
    store: { apple: { status: 'error', message: 'timeout after 9s' }, google: { status: 'ok', user_installs: 2, device_installs: 1, days_reported: 27, days_total: 30, latest: '2026-10-29' } } } },
  g1: { days: [{ d: '2026-10-28', ios: 1, android: 0, unknown: 0 }, { d: '2026-10-29', ios: 0, android: 0, unknown: 0 }, { d: '2026-10-30', ios: 3, android: 1, unknown: 0 }, { d: '2026-10-31', ios: 1, android: 0, unknown: 1 }] },
};
const RC = { status: 'ok', data: { metrics: [{ id: 'active_subscriptions', value: 6 }, { id: 'mrr', value: 49, unit: '$' }] } };

test('Mobile: the four numbers of the opening screen come from the management view and RevenueCat (real customers, new in the window with delta and platforms, MRR, activation)', () => {
  const P = mobPure();
  const k = P.mobKpis(MG, RC, 30);
  assert.equal(k.real, 44); assert.equal(k.test, 122);
  assert.equal(k.newN, 16); assert.equal(k.delta, 6); assert.deepEqual(k.plat, { ios: 10, android: 4, unknown: 2, mixed: 0 });
  assert.deepEqual(k.mrr, { value: 49, unit: '$' });
  assert.equal(k.act, 50); assert.equal(k.actNum, 8); assert.equal(k.actDen, 16);
  const none = P.mobKpis(null, { status: 'not_configured' }, 30);
  assert.equal(none.real, null); assert.equal(none.mrr, null); assert.equal(none.newN, null);
});

test('Mobile: the store summary names each store as a number or as "no answer" with the reason; the chart summary gives total and peak day; alerts appear only when a source failed or Play lags', () => {
  const P = mobPure();
  const s = P.mobStoreSummary(MG.windows[30].store);
  assert.deepEqual(s.apple, { ok: false, status: 'error', message: 'timeout after 9s' });
  assert.deepEqual(s.google, { ok: true, n: 2 });
  const c = P.mobChartSummary(MG.g1);
  assert.deepEqual(c, { total: 7, peakDay: '2026-10-30', peakN: 4 });
  const now = Date.parse('2026-11-02T15:00:00Z');
  const a = P.mobAlerts({ apple: { status: 'error', message: 'timeout after 9s' }, google_play: { status: 'ok' }, revenuecat: { status: 'ok' }, supabase: { status: 'ok' } }, MG.windows[30].store, now);
  assert.deepEqual(a, [{ kind: 'source', source: 'apple', message: 'timeout after 9s' }, { kind: 'play_lag', latest: '2026-10-29', days: 4 }]);
  const quiet = P.mobAlerts({ apple: { status: 'ok' }, google_play: { status: 'ok' }, revenuecat: { status: 'ok' }, supabase: { status: 'ok' } }, { apple: { status: 'ok' }, google: { status: 'ok', latest: '2026-11-01' } }, now);
  assert.deepEqual(quiet, []);
  assert.equal(P.MOB_MAX_W, 699);
});

test('Mobile static: render() branches to renderMobile() below 700 px; bottom bar Resumo · Contas · Mais; header menu; sections collapsed by default; tables become lists; the desktop markup is untouched', () => {
  assert.match(SCRIPT, /function isMobile\(\)\{[^}]*MOB_MAX_W/);
  assert.match(SCRIPT, /function render\(\)\{\s*if\(isMobile\(\)\)\{renderMobile\(\);return;\}/);
  for (const fn of ['renderMobile', 'mobHeader', 'mobResumo', 'mobSection', 'mobFunnelList', 'mobReconList', 'mobStoresList', 'mobMais', 'mobTabbar', 'mobMenu']) assert.match(SCRIPT, new RegExp('function ' + fn + '\\('), fn);
  assert.match(SCRIPT, /var MOB=\{tab:'resumo',open:\{\}/, 'every section starts collapsed');
  assert.match(SCRIPT, /window\.setMobTab=/); assert.match(SCRIPT, /window\.mobToggle=/);
  assert.match(HTML, /@media\(max-width:699px\)\{[\s\S]*?\.mobbar\{position:fixed;left:0;right:0;bottom:0/, 'fixed bottom bar');
  assert.match(HTML, /\.mobbar[^}]*background:var\(--surface\)/);
  // DA12: inside the Android app the WebView is drawn under the status and gesture bars; the app sets
  // --sat/--sab (px) and the header and bottom bar grow by them. Browser: both default to 0.
  assert.match(HTML, /\.mobtop\{[^}]*padding:calc\(2px \+ var\(--sat,0px\)\) 0 6px/, 'header pads by the status bar inset');
  assert.match(HTML, /\.mobbar\{[^}]*padding:6px 0 calc\(max\(10px,env\(safe-area-inset-bottom\)\) \+ var\(--sab,0px\)\)/, 'bar pads by the gesture inset');
  assert.match(HTML, /\.mobsheet\{[^}]*calc\(max\(22px,env\(safe-area-inset-bottom\)\) \+ var\(--sab,0px\)\)/, 'sheet pads by the gesture inset');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(HTML.match(/\/\* \[mob-css-start\] \*\/([\s\S]*?)\/\* \[mob-css-end\] \*\//)[1]), 'mobile CSS uses tokens only');
  // the desktop header, tabs and section nav are still there for wide screens
  assert.match(SCRIPT, /h\+=tabsBar\(\);/); assert.match(SCRIPT, /<nav class="sections">/);
});

test('Mobile i18n: every label of the phone layout exists in 6 languages, Portuguese formal', () => {
  const keys = ['mob_resumo', 'mob_mais', 'mob_menu', 'mob_kpi_real', 'mob_kpi_real_sub', 'mob_kpi_new', 'mob_kpi_mrr', 'mob_kpi_act', 'mob_kpi_act_sub', 'mob_funnel_title', 'mob_funnel_line', 'mob_recon_title', 'mob_recon_line', 'mob_stores_title', 'mob_stores_line', 'mob_chart_title', 'mob_chart_line', 'mob_alert_source', 'mob_alert_play', 'mob_more_details', 'mob_more_details_sub', 'mob_more_sources', 'mob_more_sources_sub', 'mob_more_tests', 'mob_more_tests_sub', 'mob_more_lang', 'mob_more_theme', 'mob_theme_sys', 'mob_more_refresh', 'mob_more_refresh_sub', 'mob_more_signout_sub', 'mob_back', 'mob_no_answer', 'mob_kpi_mrr_sub'];
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of keys) assert.ok(T[l][k], l + ' ' + k);
  assert.equal(T.pt.mob_funnel_line, '{a} contas → {b} confirmaram → {c} onboarding → {d} protocolo → {e} dose');
  assert.equal(T.pt.mob_no_answer, 'sem resposta');
  assert.ok(!/dá para|a gente|deu para/i.test(Object.values(T.pt).join(' ')), 'Portuguese stays formal');
});

// Founder 2026-11-02 (S25): "quando eu vou em Accounts e clico no e-mail, não consigo abrir o menu de Opções".
// Cause: the Contas click handler bailed out unless the DESKTOP tab variable was "accounts"; on the phone the
// Accounts tab is MOB.tab === "contas", so a tap on a row did nothing. L5: the handler asks accountsTabOn().
test('L5: on the phone a tap on an account row selects it (the click and key handlers look at the phone tab, not only the desktop tab)', () => {
  assert.match(HTML, /function accountsTabOn\(\)\{return isMobile\(\)\?MOB\.tab==='contas':TAB==='accounts';\}/, 'one helper decides whether the accounts list is on screen');
  assert.match(HTML, /var el=ev\.target;if\(!el\|\|!el\.closest\|\|!accountsTabOn\(\)\)return;/, 'click handler uses it');
  assert.ok(!/TAB!=='accounts'\)return;/.test(HTML), 'no handler bails out on the desktop tab alone');
});

// Founder 2026-11-02 (S25 walk): the account card (a fixed full-screen layer on the phone) sat under the clock, and the
// phone's Back key closed the whole app instead of closing the menu / card / dialog. L6: the card pads by --sat/--sab;
// L7: the page exposes DTAdminBack(), which the app calls on Back and which closes one layer at a time.
test('L6: the full-screen account card pads by the system-bar insets inside the app', () => {
  assert.match(HTML, /\.acc-card\.open\{[^}]*padding:calc\(16px \+ var\(--sat,0px\)\) 16px calc\(16px \+ var\(--sab,0px\)\)\}/);
});
test('L7: DTAdminBack closes one layer per press, in order dialog → glossary → Opções menu → card → phone menu → Mais sub-page → back to Resumo, and returns false when there is nothing left to close', () => {
  const src = HTML.match(/window\.DTAdminBack=function\(\)\{[\s\S]*?\n  \};/);
  assert.ok(src, 'DTAdminBack defined');
  const s = src[0];
  const order = ['PM', 'MS', 'RS', "gloss", 'US&&US.menu', 'if(US)', 'MOB.menu', 'MOB.more', "MOB.tab!=='resumo'", 'return false'];
  let last = -1;
  for (const k of order) { const i = s.indexOf(k); assert.ok(i > last, k + ' comes after the previous layer'); last = i; }
  assert.ok(!/stepup/.test(s), 'Back never dismisses the step-up dialog');
});

// S25 walk 2026-11-02: "Abrir no RevenueCat/Supabase" did nothing inside the app (a WebView without window
// support swallows window.open and refuses foreign hosts). L8: on the device the page hands the URL to the
// app bridge, which opens the phone's browser; in a browser window.open stays. G1: the mark-as-test confirm
// showed both "Cancelar" and the glossary's generic "Fechar" button.
test('L8: external links use DTAdmin.openExternal inside the app and window.open in a browser', () => {
  assert.match(HTML, /function openExternal\(u\)\{if\(DT_BRIDGE&&window\.DTAdmin&&window\.DTAdmin\.openExternal\)\{window\.DTAdmin\.openExternal\(u\);return;\}window\.open\(u,'_blank','noopener,noreferrer'\);\}/);
  assert.ok(!/if\(k==='rc'\)\{[^\n]*window\.open\(/.test(HTML) && !/if\(k==='sb'\)\{[^\n]*window\.open\(/.test(HTML), 'the menu actions go through openExternal');
  assert.match(HTML, /if\(k==='rc'\)\{[^\n]*openExternal\(US\.links\.revenuecat\)/);
  assert.match(HTML, /if\(k==='sb'\)\{[^\n]*openExternal\(US\.links\.supabase\)/);
});
test('G1: the glossary Close button is hidden while a confirm dialog shows its own Confirm / Cancel, and shown again for plain glossary text', () => {
  const mt = HTML.match(/window\.markTests=function\(mark\)\{[\s\S]*?getElementById\('gloss'\)\.style\.display='flex';/)[0];
  assert.match(mt, /getElementById\('gloss-close'\)\.style\.display='none'/);
  const others = HTML.match(/getElementById\('gloss-close'\)\.style\.display=''/g) || [];
  assert.ok(others.length >= 2, 'the two glossary callers restore it');
});

// S25 walk 2026-11-02 (light theme): the Mais › Tema row said "Switch to dark theme" while dark was on (label
// inverted, M1), and the clock stayed white on the light page because the app never learned the page theme.
// L9: the page tells the app its theme (bridge setTheme) on load and on every toggle; the app paints the
// status-bar icons dark on a light page.
test('M1: the phone Theme row names the theme the tap switches TO (dark on → "Switch to light theme")', () => {
  assert.match(HTML, /mob_more_theme'\)\)\+'<\/b><span class="sub">'\+esc\(curTheme\(\)==='dark'\?t\('theme_light'\):t\('theme_dark'\)\)/);
});
test('L9: the page reports its theme to the app on load and on toggle', () => {
  assert.match(HTML, /function tellTheme\(\)\{try\{if\(DT_BRIDGE&&window\.DTAdmin&&window\.DTAdmin\.setTheme\)window\.DTAdmin\.setTheme\(curTheme\(\)\);\}catch\(e\)\{\}\}/);
  const toggle = HTML.match(/getElementById\('theme'\)\.onclick=function\(\)\{[^\n]*\n/)[0];
  assert.match(toggle, /tellTheme\(\);rr\(\);/, 'toggle reports before re-rendering');
  assert.match(HTML, /function startPanel\(\)\{LI\.screen='panel';tellTheme\(\);\n\s*load\(\);\}/, 'reported once at start, before the first load');
});

// S25 walk 2026-11-02: the Message / Premium dialogs opened with their title under the clock inside the app.
test('L10: on the phone every fixed dialog overlay pads its top by the status-bar inset', () => {
  assert.match(HTML, /@media\(max-width:699px\)\{[\s\S]*?#prem,#msg,#rsd,#stepup,#gloss\{padding-top:calc\(24px \+ var\(--sat,0px\)\)\}/);
});
