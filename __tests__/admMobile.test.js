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
