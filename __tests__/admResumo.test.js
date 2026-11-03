// "Resumo por perguntas" (Admin Council round 2; founder approved the picture 2026-11-02 23:30 EST,
// docs/design/adm-resumo-perguntas.html). Part A: API. Dummy data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('./helpers/admAuthFake');
const ROOT = path.join(__dirname, '..');
process.env.ADMIN_TOKEN = 'x';
const adm = require('../api/adm.js');
const NOW = Date.parse('2026-11-04T15:00:00Z'); // a Wednesday; ISO week starts Monday 2026-11-02
const day = (b) => new Date(NOW - b * 864e5).toISOString().slice(0, 10);
const ANN = F.SB + '/rest/v1/admin_annotations';

test('RW1: weeklyNew counts real accounts per ISO week (Monday UTC) for the last N weeks, current week included, with platforms and the delta to the previous week', () => {
  const accounts = [
    { c: '2026-11-02', t: false, apple: true },   // this week (Mon)
    { c: '2026-11-04', t: false, pu: ['android'] }, // this week (today)
    { c: '2026-11-03', t: true },                  // test: out
    { c: '2026-10-27', t: false },                 // previous week (Tue)
    { c: '2026-10-26', t: false },                 // previous week (Mon)
    { c: '2026-10-25', t: false },                 // two weeks ago (Sun)
    { c: '2026-08-10', t: false },                 // 12 weeks ago: inside a 12-week window
    { c: '2026-08-09', t: false },                 // 13 weeks ago: out
  ];
  const g = adm.weeklyNew(accounts, NOW, 12);
  assert.equal(g.weeks.length, 12);
  assert.equal(g.weeks[11].w, '2026-11-02', 'last entry = current week');
  assert.equal(g.weeks[0].w, '2026-08-17', 'first entry = 11 weeks before');
  assert.deepEqual(g.weeks[11], { w: '2026-11-02', n: 2, ios: 1, android: 1, unknown: 0 });
  assert.deepEqual(g.weeks[10], { w: '2026-10-26', n: 2, ios: 0, android: 0, unknown: 2 });
  assert.equal(g.weeks[9].n, 1, 'Sunday 25 Oct belongs to the week of 19 Oct');
  assert.equal(g.this_week, 2); assert.equal(g.prev_week, 2); assert.equal(g.delta, 0);
  assert.equal(g.weeks.reduce((s, w) => s + w.n, 0), 5, '12-week window: 2 + 2 + 1 (the 10 Aug account is in the week of 10 Aug, outside 11 weeks back)');
});

test('RW2: buildManagement carries g4 (weekly new) next to g1', () => {
  const m = adm.buildManagement({ accounts: [{ c: day(1), t: false }], protocols_live: 0 }, { status: 'not_configured' }, NOW, {});
  assert.ok(m.g4 && Array.isArray(m.g4.weeks) && m.g4.weeks.length === 12);
  assert.equal(m.g4.this_week, 1);
});

test('RW3: fetchAnnotations reads admin_annotations with the service key; a missing table is not_configured, a failure is error, success is ok with rows ordered by day', async () => {
  F.envOn();
  try {
    let f = F.installFetch({ data: (u) => u.startsWith(ANN) ? F.json([{ id: 'a1', day: '2026-11-03', label: 'carrossel D', channel: 'instagram' }]) : F.json({}) });
    let r = await adm.fetchAnnotations();
    assert.equal(r.status, 'ok'); assert.deepEqual(r.rows, [{ id: 'a1', day: '2026-11-03', label: 'carrossel D', channel: 'instagram' }]);
    assert.ok(f.calls[0].url.includes('select=id,day,label,channel') && f.calls[0].url.includes('order=day'));
    assert.equal(f.calls[0].headers.apikey, 'dummy-service-key');
    f.restore();
    f = F.installFetch({ data: (u) => u.startsWith(ANN) ? new Response(JSON.stringify({ code: 'PGRST205', message: 'Could not find the table' }), { status: 404 }) : F.json({}) });
    r = await adm.fetchAnnotations(); assert.equal(r.status, 'not_configured'); f.restore();
    f = F.installFetch({ data: (u) => u.startsWith(ANN) ? new Response('boom', { status: 500 }) : F.json({}) });
    r = await adm.fetchAnnotations(); assert.equal(r.status, 'error'); f.restore();
  } finally { F.envOff(); }
});

test('RW4: the GET payload carries annotations; POST annotation_add validates (day, label ≤ 80, channel optional) and inserts with the service key; annotation_delete removes by id; a viewer cannot write', async () => {
  F.envOn();
  try {
    const g = await F.call(adm, { headers: F.bearer('admin') }, { data: (u) => u.startsWith(ANN) ? F.json([]) : F.json({ accounts: [], protocols_live: 0 }) });
    assert.equal(g.code, 200); assert.equal(g.json.annotations.status, 'ok'); assert.deepEqual(g.json.annotations.rows, []);
    let inserted = null;
    const p = await F.call(adm, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, F.bearer('admin'), F.ORIGIN), body: { action: 'annotation_add', day: '2026-11-03', label: 'carrossel D', channel: 'instagram' } }, { data: (u, body, init) => { if (u.startsWith(ANN) && init.method === 'POST') { inserted = body; return new Response(JSON.stringify([{ id: 'n1', day: '2026-11-03', label: 'carrossel D', channel: 'instagram' }]), { status: 201 }); } return F.json({}); } });
    assert.equal(p.code, 200, JSON.stringify(p.json));
    assert.deepEqual(inserted, { day: '2026-11-03', label: 'carrossel D', channel: 'instagram' });
    assert.equal(p.json.row.id, 'n1');
    const bad = await F.call(adm, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, F.bearer('admin'), F.ORIGIN), body: { action: 'annotation_add', day: 'nope', label: '' } });
    assert.equal(bad.code, 400);
    const long = await F.call(adm, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, F.bearer('admin'), F.ORIGIN), body: { action: 'annotation_add', day: '2026-11-03', label: 'x'.repeat(81) } });
    assert.equal(long.code, 400);
    let deleted = null;
    const d = await F.call(adm, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, F.bearer('admin'), F.ORIGIN), body: { action: 'annotation_delete', id: '11111111-1111-4111-8111-111111111111' } }, { data: (u, body, init) => { if (u.startsWith(ANN) && init.method === 'DELETE') { deleted = u; return new Response(null, { status: 204 }); } return F.json({}); } });
    assert.equal(d.code, 200); assert.ok(deleted && deleted.includes('id=eq.11111111-1111-4111-8111-111111111111'));
    const v = await F.call(adm, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, F.bearer('viewer'), F.ORIGIN), body: { action: 'annotation_add', day: '2026-11-03', label: 'x' } });
    assert.equal(v.code, 403);
  } finally { F.envOff(); }
});

test('RW5: the admin_annotations migration exists with RLS, revokes and service_role select/insert/delete only', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261103000000_admin_annotations.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.admin_annotations \(\s*id uuid primary key default gen_random_uuid\(\),\s*day date not null,\s*label text not null check \(char_length\(label\) between 1 and 80\),\s*channel text,/);
  assert.match(sql, /alter table public\.admin_annotations enable row level security/);
  assert.match(sql, /revoke all on table public\.admin_annotations from public, anon, authenticated/);
  assert.match(sql, /grant select, insert, delete on table public\.admin_annotations to service_role/);
  assert.ok(!/create policy/i.test(sql));
});


// ---------------- Part B: the page ----------------
const HTML = fs.readFileSync(path.join(ROOT, 'web', 'adm.html'), 'utf8');
const PURE = (() => {
  const m = HTML.match(/\/\/ \[resumo-pure-start\]([\s\S]*?)\/\/ \[resumo-pure-end\]/);
  return (0, eval)('(function(){' + m[1] + '\nreturn {funnelSteps:funnelSteps,needsYou:needsYou,weekLabel:weekLabel};})()');
})();

test('RB1: funnelSteps gives each step its % against the PREVIOUS step (never the base), and needsYou lists real accounts stuck (unconfirmed ≥ 1 day, confirmed + onboarded + no protocol ≥ 2 days) within 14 days, newest first, max 10', () => {
  const f = PURE.funnelSteps([{ id: 'W1', total: 12 }, { id: 'W2', total: 12 }, { id: 'W3', total: 12 }, { id: 'W4', total: 7 }, { id: 'W5', total: 5 }]);
  assert.deepEqual(f.map((s) => [s.id, s.total, s.pctPrev]), [['W1', 12, null], ['W2', 12, 100], ['W3', 12, 100], ['W4', 7, 58], ['W5', 5, 71]]);
  assert.deepEqual(PURE.funnelSteps([{ id: 'W1', total: 0 }, { id: 'W2', total: 0 }]).map((s) => s.pctPrev), [null, null], 'no division by zero');
  const rows = [
    { id: 'a', email: 'a@x.y', created: day(2), confirmed: false, onboarded: false, has_active_protocol: false },   // unconfirmed 2 d → resend
    { id: 'b', email: 'b@x.y', created: day(0), confirmed: false, onboarded: false, has_active_protocol: false },   // today: too young
    { id: 'c', email: 'c@x.y', created: day(3), confirmed: true, onboarded: true, has_active_protocol: false },     // no protocol 3 d → message
    { id: 'd', email: 'd@x.y', created: day(1), confirmed: true, onboarded: true, has_active_protocol: false },     // 1 d: not yet
    { id: 'e', email: 'e@x.y', created: day(5), confirmed: true, onboarded: true, has_active_protocol: true },      // fine
    { id: 'f', email: 'f@x.y', created: day(20), confirmed: false, onboarded: false, has_active_protocol: false },  // older than 14 d: out
    { id: 'g', email: 'g@x.y', created: day(4), confirmed: true, onboarded: false, has_active_protocol: false },    // onboarding not done: not this list (yet)
  ];
  const ny = PURE.needsYou(rows, NOW);
  assert.deepEqual(ny.map((x) => [x.id, x.why, x.days, x.action]), [['a', 'unconfirmed', 2, 'resend'], ['c', 'no_protocol', 3, 'message']]);
  assert.equal(PURE.needsYou(null, NOW).length, 0);
  const many = []; for (let i = 0; i < 15; i++) many.push({ id: 'm' + i, email: 'm' + i + '@x.y', created: day(2 + (i % 5)), confirmed: false });
  assert.equal(PURE.needsYou(many, NOW).length, 10);
  assert.equal(PURE.weekLabel('2026-11-02', 'en'), '2 Nov');
});

test('RB2: the desktop Summary is organised by question (kpis → chegam → funil/precisa → canais/ficam), the reconciliation lives with the sources, the old funnel table and the daily chart live in Details, and "not measured" is grey', () => {
  for (const fn of ['secKpis', 'secChegam', 'secFunnelQ', 'secPrecisa', 'secCanais', 'secFicam', 'marksHtml']) assert.match(HTML, new RegExp('function ' + fn + '\\('), fn);
  assert.match(HTML, /if\(TAB==='mgmt'\)\{\n\s*if\(MG\)\{h\+=secKpis\(\);h\+=secChegam\(\);h\+='<div class="grid two">'\+secFunnelQ\(\)\+secPrecisa\(\)\+'<\/div><div class="grid two">'\+secCanais\(\)\+secFicam\(\)\+'<\/div>';\}/);
  assert.match(HTML, /h\+=secSources\(\);if\(MG\)h\+=secRecon\(\);/, 'reconciliation after the sources');
  assert.match(HTML, /h\+=secOverview\(\);if\(MG\)\{h\+=secFunnel\(\);h\+=secCharts\(\);\}/, 'detailed funnel table + daily chart in Details');
  assert.match(HTML, /\.nm\{color:var\(--muted\);font-weight:700\}/, 'not measured is grey, not a warning');
  assert.match(HTML, /if\(TAB==='mgmt'\)return \[\['kpis','mob_resumo'\],\['chegam','q_chegam'\],\['funil','q_funil'\],\['precisa','q_precisa'\],\['canais','q_canais'\],\['sources','nav_sources'\]\]/);
  assert.match(HTML, /makeChart\('c-wk'/, 'weekly bars chart');
  assert.match(HTML, /window\.nyOpen=function\(id\)/, 'a row of Precisa de você opens the card');
  assert.match(HTML, /window\.markAdd=function\(\)/, 'marks can be added from the chart card');
  assert.match(HTML, /ANN=payload\.annotations\|\|\{status:'not_configured'\}/, 'marks come with the payload');
});

test('RB3: the phone Summary has the same questions as sections (chegam open by default, precisa, funil, canais, ficam, stores) and no reconciliation; Fontes on the phone carries the reconciliation', () => {
  const m = HTML.match(/function mobResumo\(\)\{[\s\S]*?\n  \}\n/)[0];
  for (const id of ["'chegam'", "'precisa'", "'funil'", "'canais'", "'ficam'", "'stores'"]) assert.ok(m.includes('mobSection(' + id), id);
  assert.ok(!m.includes("mobSection('recon'"), 'no reconciliation on the phone Summary');
  assert.ok(!m.includes("mobSection('chart'"), 'the daily chart left the phone Summary');
  assert.match(HTML, /var MOB=\{tab:'resumo',open:\{chegam:true\}/, 'chegam starts open');
  assert.match(HTML, /MOB\.more==='sources'\)\{[^\n]*secSources\(\)\+\(MG\?secRecon\(\):''\)/, 'phone Fontes includes the reconciliation');
});

test('RB4: the new labels exist in the 6 languages, Portuguese is formal and natural', () => {
  const Tn = (0, eval)('(' + HTML.match(/<script>\n([\s\S]*?)<\/script>/)[1].match(/var T=(\{[\s\S]*?\n  \});/)[1] + ')');
  const keys = ['q_chegam', 'q_chegam_sub', 'q_chegam_sent', 'q_funil', 'q_funil_sub', 'q_precisa', 'q_precisa_sub', 'q_precisa_none', 'ny_unconfirmed', 'ny_no_protocol', 'ny_resend', 'ny_message', 'ny_open', 'q_canais', 'q_canais_sub', 'ch_channel', 'ch_visits', 'ch_downloads', 'ch_accounts', 'ch_hours', 'ch_nm_link', 'ch_direct', 'q_ficam', 'q_ficam_sub', 'q_ficam_nm', 'kpi_real', 'kpi_real_delta', 'kpi_paying', 'kpi_paying_sub', 'kpi_of', 'marks_add', 'marks_label_ph', 'marks_none', 'marks_nc', 'marks_del', 'week_this'];
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of keys) assert.ok(Tn[l][k], l + '.' + k);
  assert.equal(Tn.pt.q_chegam, 'Quantas pessoas reais chegam?');
  assert.equal(Tn.pt.q_precisa, 'Precisa de você');
  assert.equal(Tn.pt.ch_nm_link, 'Não medido — links de campanha a partir de 3 nov');
  assert.ok(!/a gente|dá para/.test(JSON.stringify(Tn.pt)));
});
