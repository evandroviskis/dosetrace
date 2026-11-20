/* Creator pages — invite/sign-up (body[data-page=invite]) and portal (body[data-page=portal]).
   Spec docs/specs/creators.md §4, §5, §7.3, §7.4; pictures docs/design/adm-criadores.html (approved 2026-11-20).
   The link token lives after "#" and is sent only in the body of POST /api/creator. The draft of the form stays in
   this tab only (sessionStorage), never in localStorage. No emoji. */
(function () {
  'use strict';
  var T = window.CR_T, LANGS = [['en', 'English'], ['es', 'Español'], ['pt', 'Português'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano']];
  var LANG = (function () { try { var s = sessionStorage.getItem('cr_lang'); if (s && T[s]) return s; } catch (e) {} var n = (navigator.language || 'en').slice(0, 2).toLowerCase(); return T[n] ? n : 'en'; })();
  function t(k, v) { var s = (T[LANG] && T[LANG][k] != null) ? T[LANG][k] : (T.en[k] != null ? T.en[k] : k); if (v) Object.keys(v).forEach(function (p) { s = String(s).split('{' + p + '}').join(v[p]); }); return s; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var app = document.getElementById('app');
  var PAGE = document.body.getAttribute('data-page');
  var TOKEN = (location.hash || '').replace(/^#/, '');
  // The token stays after "#" (never sent to a server): the creator can reload or bookmark the same link (founder P3).

  function api(body) {
    return fetch('/api/creator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(function (r) { return r.text().then(function (x) { var j = null; try { j = x ? JSON.parse(x) : null; } catch (e) {} return { status: r.status, j: j }; }); }, function () { return { status: 0, j: null }; });
  }
  function langSelect() { return '<select class="lang" id="lang" aria-label="Language">' + LANGS.map(function (l) { return '<option value="' + l[0] + '"' + (l[0] === LANG ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('') + '</select>'; }
  function bindLang(re) { var s = document.getElementById('lang'); if (s) s.onchange = function () { LANG = s.value; try { sessionStorage.setItem('cr_lang', LANG); } catch (e) {} document.documentElement.lang = LANG; re(); }; }
  function top(brandKey) { return '<div class="ptop"><div class="brand"><i></i>' + esc(t(brandKey)) + '</div>' + langSelect() + '</div>'; }
  function money(c) { return (c < 0 ? '−' : '') + 'US$ ' + (Math.abs(c) / 100).toLocaleString(LANG, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function dt(d) { if (!d) return ''; var x = new Date(String(d).length === 10 ? d + 'T12:00:00Z' : d); return x.toLocaleDateString(LANG, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }); }
  function monthName(ym) { var p = ym.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, 15)).toLocaleDateString(LANG, { month: 'short', year: 'numeric', timeZone: 'UTC' }); }
  function copyBtn(text) { return '<button class="btn ghost sm" type="button" data-copy="' + esc(text) + '">' + esc(t('copy')) + '</button>'; }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-copy]'); if (!b) return;
    var v = b.getAttribute('data-copy');
    function ok() { b.textContent = t('copied'); setTimeout(function () { b.textContent = t('copy'); }, 1800); }
    try { navigator.clipboard.writeText(v).then(ok, function () {}); } catch (e) {}
  });

  // ================================================================== invite / sign-up
  var COUNTRIES = 'AR AU AT BE BO CA CL CN CO CR CZ DK DO EC EG SV FI FR DE GR GT HN HK HU IN ID IE IL IT JP KE KR LU MY MX MA NL NZ NI NG NO PA PY PE PH PL PT PR QA RO SA SG ZA ES SE CH TW TH TR AE GB UA UY VE VN'.split(' ');
  var IV = { info: null, step: 1, f: { country: '', other: '', legal_name: '', email: '', phone: '', handles: {}, method: '', pix_type: 'cpf', pix_key: '', doc_type: 'cpf', doc: '', invoice: '', payout_email: '', rules: {} }, err: null, busy: false, sent: false };
  function saveDraft() { try { sessionStorage.setItem('cr_draft', JSON.stringify({ step: IV.step, f: IV.f })); } catch (e) {} }
  function readDraft() { try { var d = JSON.parse(sessionStorage.getItem('cr_draft') || 'null'); if (d && d.f) { IV.f = Object.assign(IV.f, d.f); IV.step = d.step || 1; } } catch (e) {} }
  function cKind() { return IV.f.country === 'BR' ? 'BR' : IV.f.country === 'US' ? 'US' : IV.f.country ? 'OTHER' : ''; }
  function countryName(c) { try { return new Intl.DisplayNames([LANG], { type: 'region' }).of(c); } catch (e) { return c; } }
  function steps(n) { var h = '<div class="stepl">' + esc(t('step', { n: n })) + ' · ' + esc(t('s' + n)) + '</div><div class="steps">'; for (var i = 1; i <= 5; i++) h += '<i' + (i <= n ? ' class="on"' : '') + '></i>'; return h + '</div>'; }
  function fld(id, label, value, opts) { var o = opts || {}; return '<div class="fld"><label for="' + id + '">' + esc(label) + '</label><input id="' + id + '" value="' + esc(value) + '"' + (o.type ? ' type="' + o.type + '"' : '') + (o.mode ? ' inputmode="' + o.mode + '"' : '') + (o.ac ? ' autocomplete="' + o.ac + '"' : '') + '>' + (o.hint ? '<div class="hint">' + esc(o.hint) + '</div>' : '') + (IV.err === o.err ? '<div class="err" role="alert">' + esc(t('e_' + o.err)) + '</div>' : '') + '</div>'; }
  function chips(name, list, cur) { return '<div class="chips" role="group">' + list.map(function (x) { return '<button type="button" data-chip="' + name + '" data-v="' + x[0] + '" class="' + (cur === x[0] ? 'on' : '') + '" aria-pressed="' + (cur === x[0]) + '">' + esc(x[1]) + '</button>'; }).join('') + '</div>'; }
  function radio(name, list, cur) { return '<div class="radio" role="group">' + list.map(function (x) { return '<button type="button" data-chip="' + name + '" data-v="' + x[0] + '" class="' + (cur === x[0] ? 'on' : '') + '" aria-pressed="' + (cur === x[0]) + '"><b>' + esc(x[1]) + '</b><span>' + esc(x[2]) + '</span></button>'; }).join('') + '</div>'; }
  function methodsOf(k) { return k === 'BR' ? ['pix'] : k === 'US' ? ['paypal', 'wise', 'ach'] : ['wise', 'paypal']; }
  function collect() { document.querySelectorAll('#app input[id^="f-"]').forEach(function (el) { var k = el.id.slice(2); if (k.indexOf('h-') === 0) IV.f.handles[k.slice(2)] = el.value; else if (k.indexOf('r-') === 0) IV.f.rules[k.slice(2)] = el.checked; else IV.f[k] = el.value; }); var o = document.getElementById('f-other-sel'); if (o) IV.f.other = o.value; saveDraft(); }

  function invite() {
    var h = top('brand');
    if (!IV.info) { app.innerHTML = '<div class="wrap">' + h + '<p class="center">' + esc(t(IV.err || 'loading')) + '</p></div>'; bindLang(invite); return; }
    var info = IV.info, f = IV.f, k = cKind(), c = '';
    if (info.is_test) h += '<div class="testbar">' + esc(t('test')) + '</div>';
    if (IV.sent) {
      c = '<div class="card"><h1>' + esc(t('sent_h')) + '</h1><p class="sub">' + esc(t('sent_p')) + '</p><h2>' + esc(t('your_codes')) + '</h2>' + codesList(info.codes) + '</div>';
      app.innerHTML = '<div class="wrap">' + h + c + '</div>'; bindLang(invite); return;
    }
    if (info.last && info.last.review === 'changes_requested' && info.last.note) c += '<div class="msg bad" style="margin-bottom:12px">' + esc(t('changes', { note: info.last.note })) + '</div>';
    else if (info.last && info.last.submitted_at) c += '<div class="msg ok" style="margin-bottom:12px">' + esc(t('resent', { d: dt(info.last.submitted_at) })) + '</div>';
    c += '<div class="card">' + steps(IV.step);
    if (IV.step === 1) {
      c += '<h1>' + esc(t('hello', { name: info.name })) + ' ' + esc(t('q_country')) + '</h1><p class="sub">' + esc(t('country_sub')) + '</p>';
      var kind = f.country === 'BR' ? 'BR' : f.country === 'US' ? 'US' : (f.country || f.other) ? 'OTHER' : '';
      c += radio('ckind', [['BR', t('c_br'), t('c_br_sub')], ['US', t('c_us'), t('c_us_sub')], ['OTHER', t('c_other'), t('c_other_sub')]], kind);
      if (kind === 'OTHER') c += '<div class="fld"><label for="f-other-sel">' + esc(t('which_country')) + '</label><select id="f-other-sel"><option value=""></option>' + COUNTRIES.map(function (x) { return { c: x, n: countryName(x) }; }).sort(function (a, b) { return a.n.localeCompare(b.n, LANG); }).map(function (x) { return '<option value="' + x.c + '"' + (f.other === x.c ? ' selected' : '') + '>' + esc(x.n) + '</option>'; }).join('') + '</select></div>';
      if (IV.err === 'country') c += '<div class="err" role="alert">' + esc(t('e_country')) + '</div>';
      c += '<div class="actions"><span></span><button class="btn" type="button" data-go="2">' + esc(t('next')) + '</button></div>';
    } else if (IV.step === 2) {
      c += '<h1>' + esc(t('contact_h')) + '</h1>';
      c += fld('f-legal_name', t('legal'), f.legal_name, { ac: 'name', err: 'legal_name' }) + fld('f-email', t('email'), f.email, { type: 'email', ac: 'email', err: 'email' }) + fld('f-phone', t('phone'), f.phone, { type: 'tel', ac: 'tel', hint: t('phone_hint'), err: 'phone' });
      (info.platforms || []).forEach(function (p) { c += fld('f-h-' + p, t('handle', { p: t('pl_' + p) }), f.handles[p] || '', {}); });
      c += '<div class="actions"><button class="btn ghost" type="button" data-go="1">' + esc(t('back')) + '</button><button class="btn" type="button" data-go="3">' + esc(t('next')) + '</button></div>';
    } else if (IV.step === 3) {
      c += '<h1>' + esc(t('pay_h')) + '</h1>';
      var ms = methodsOf(k); if (ms.indexOf(f.method) < 0) f.method = ms[0];
      c += '<div class="fld"><div class="lbl">' + esc(t('method')) + '</div>' + radio('method', ms.map(function (m) { return [m, t('m_' + m), t('m_' + m + '_sub')]; }), f.method) + '</div>';
      if (f.method === 'pix') {
        c += '<div class="fld"><div class="lbl">' + esc(t('pix_type')) + '</div>' + chips('pix_type', [['cpf', t('pt_cpf')], ['cnpj', t('pt_cnpj')], ['email', t('pt_email')], ['phone', t('pt_phone')], ['random', t('pt_random')]], f.pix_type) + '</div>';
        c += fld('f-pix_key', t('pix_key'), f.pix_key, { hint: t('holder_hint'), err: 'pix_key', mode: f.pix_type === 'cpf' || f.pix_type === 'cnpj' ? 'numeric' : '' });
        c += '<div class="fld"><div class="lbl">' + esc(t('doc')) + '</div>' + chips('doc_type', [['cpf', 'CPF'], ['cnpj', 'CNPJ']], f.doc_type) + '</div>' + fld('f-doc', f.doc_type === 'cnpj' ? 'CNPJ' : 'CPF', f.doc, { mode: 'numeric', err: 'doc' });
        c += '<div class="fld"><div class="lbl">' + esc(t('invoice')) + '</div>' + chips('invoice', [['mei', t('inv_mei')], ['company', t('inv_company')], ['none', t('inv_none')]], f.invoice) + '</div>';
        c += '<div class="secure">' + esc(t('secure_br')) + '</div>';
      } else if (f.method === 'paypal' || f.method === 'wise') {
        c += fld('f-payout_email', t('pe_' + f.method), f.payout_email, { type: 'email', err: 'payout_email' });
      } else c += '<p class="sub">' + esc(t('ach_note')) + '</p>';
      if (k === 'US') c += '<p class="sub">' + esc(t('w9')) + '</p>'; else if (k === 'OTHER') c += '<p class="sub">' + esc(t('w8')) + '</p>';
      if (f.method !== 'pix') c += '<div class="secure">' + esc(t('secure_other')) + '</div>';
      c += '<div class="actions"><button class="btn ghost" type="button" data-go="2">' + esc(t('back')) + '</button><button class="btn" type="button" data-go="4">' + esc(t('next')) + '</button></div>';
    } else if (IV.step === 4) {
      c += '<div class="draft">' + esc(t('draft')) + '</div><h1>' + esc(t('rules_h')) + '</h1><div class="chk">';
      ['r1', 'r2', 'r3', 'r4', 'r5'].forEach(function (r) { c += '<label><input type="checkbox" id="f-r-' + r + '"' + (f.rules[r] ? ' checked' : '') + '>' + esc(t(r)) + '</label>'; });
      c += '</div>' + (IV.err === 'rules' ? '<div class="err" role="alert">' + esc(t('rules_need')) + '</div>' : '');
      c += '<div class="actions"><button class="btn ghost" type="button" data-go="3">' + esc(t('back')) + '</button><button class="btn" type="button" data-go="5">' + esc(t('next')) + '</button></div>';
    } else {
      c += '<h1>' + esc(t('review_h')) + '</h1><dl class="kv">';
      c += '<dt>' + esc(t('rv_country')) + '</dt><dd>' + esc(countryName(f.country)) + '</dd>';
      c += '<dt>' + esc(t('rv_contact')) + '</dt><dd>' + esc(f.legal_name) + '<br>' + esc(f.email) + '<br>' + esc(f.phone) + '</dd>';
      c += '<dt>' + esc(t('rv_pay')) + '</dt><dd>' + esc(t('m_' + f.method)) + (f.method === 'pix' ? ' · ' + esc(t('pt_' + f.pix_type)) + ' ' + esc(f.pix_key) : f.payout_email ? ' · ' + esc(f.payout_email) : '') + '</dd></dl>';
      if (IV.err && IV.err.indexOf('srv:') === 0) c += '<div class="err" role="alert">' + esc(T[LANG]['e_' + IV.err.slice(4)] ? t('e_' + IV.err.slice(4)) : t('e_generic', { f: IV.err.slice(4) })) + '</div>';
      if (IV.err === 'conn') c += '<div class="err" role="alert">' + esc(t('err_conn')) + '</div>';
      c += '<div class="actions"><button class="btn ghost" type="button" data-go="4">' + esc(t('back')) + '</button><button class="btn" type="button" id="send"' + (IV.busy ? ' disabled' : '') + '>' + esc(t('send')) + '</button></div>';
    }
    c += '</div>';
    app.innerHTML = '<div class="wrap">' + h + c + '</div>';
    bindLang(invite);
    app.querySelectorAll('[data-chip]').forEach(function (b) { b.onclick = function () { collect(); var n = b.getAttribute('data-chip'), v = b.getAttribute('data-v'); if (n === 'ckind') { IV.f.country = v === 'OTHER' ? (IV.f.other || '') : v; if (v === 'OTHER' && !IV.f.other) IV.f.country = ''; IV._other = v === 'OTHER'; } else IV.f[n] = v; IV.err = null; saveDraft(); invite(); }; });
    var os = document.getElementById('f-other-sel'); if (os) os.onchange = function () { IV.f.other = os.value; IV.f.country = os.value; saveDraft(); };
    app.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { collect(); var to = +b.getAttribute('data-go'); if (to > IV.step) { var e = check(IV.step); if (e) { IV.err = e; invite(); return; } } IV.err = null; IV.step = to; saveDraft(); invite(); window.scrollTo(0, 0); }; });
    var s = document.getElementById('send'); if (s) s.onclick = submit;
  }
  // Light checks in the page; the server validates everything again (api/_creators.js validateProfile).
  function check(step) {
    var f = IV.f;
    if (step === 1 && !/^[A-Z]{2}$/.test(f.country || '')) return 'country';
    if (step === 2) { if (String(f.legal_name).trim().length < 2) return 'legal_name'; if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(f.email).trim())) return 'email'; if (String(f.phone).replace(/\D/g, '').length < 8 || String(f.phone).trim()[0] !== '+') return 'phone'; }
    if (step === 3) { if (f.method === 'pix' && !String(f.pix_key).trim()) return 'pix_key'; if (f.method === 'pix' && !String(f.doc).trim()) return 'doc'; if ((f.method === 'paypal' || f.method === 'wise') && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(f.payout_email).trim())) return 'payout_email'; }
    if (step === 4 && !['r1', 'r2', 'r3', 'r4', 'r5'].every(function (r) { return IV.f.rules[r]; })) return 'rules';
    return null;
  }
  function submit() {
    var f = IV.f; IV.busy = true; IV.err = null; invite();
    var profile = { country: f.country, legal_name: f.legal_name, email: f.email, phone: f.phone, handles: f.handles, method: f.method, rules_accepted: true, rules_version: IV.info.rules_version };
    if (f.method === 'pix') { profile.pix_type = f.pix_type; profile.pix_key = f.pix_key; profile.doc_type = f.doc_type; profile.doc = f.doc; profile.invoice = f.invoice || 'none'; }
    if (f.method === 'paypal' || f.method === 'wise') profile.payout_email = f.payout_email;
    api({ op: 'invite_submit', token: TOKEN, profile: profile }).then(function (x) {
      IV.busy = false;
      if (x.status === 200) { IV.sent = true; try { sessionStorage.removeItem('cr_draft'); } catch (e) {} invite(); return; }
      if (x.status === 400 && x.j && x.j.field) { var back = { country: 1, legal_name: 2, email: 2, phone: 2, handles: 2, method: 3, pix_type: 3, pix_key: 3, doc_type: 3, doc: 3, invoice: 3, payout_email: 3, rules: 4 }[x.j.field]; if (back && back < 5) { IV.step = back; IV.err = x.j.field; } else IV.err = 'srv:' + x.j.field; invite(); return; }
      if (x.status === 401) { IV.info = null; IV.err = 'err_link'; invite(); return; }
      IV.err = 'conn'; invite();
    });
  }
  function codesList(codes) { return (codes || []).map(function (c) { return '<div class="lrow"><div><b>' + esc(t('pl_' + c.platform)) + ' · ' + esc(c.code) + '</b><code>' + esc(c.link.replace('https://', '')) + '</code></div>' + copyBtn(c.link) + '</div>'; }).join(''); }

  // ================================================================== portal
  var PV = { d: null, err: null, m: null };
  function statusText(r, min) {
    if (r.status === 'zero') return '<span class="st">—</span>';
    if (r.status === 'paid') return '<span class="st paid">' + esc(t('s_paid', { d: dt(r.paid_on) })) + '</span>';
    if (r.status === 'due') return '<span class="st due">' + esc(t('s_due')) + '</span>';
    if (r.status === 'below_min') return '<span class="st">' + esc(t('s_below', { m: money(min) })) + '</span>';
    if (r.status === 'no_terms') return '<span class="st">' + esc(t('s_none')) + '</span>';
    if (r.status === 'holdback') return '<span class="st">' + esc(t('s_holdback', { d: dt(r.release_on) })) + '</span>';
    return '<span class="st">' + esc(t('s_open', { d: dt(r.release_on) })) + '</span>';
  }
  function termsText(tm) {
    if (!tm) return t('no_terms');
    var s = Number(tm.pct) > 0 ? t('terms_pct', { p: Number(tm.pct).toLocaleString(LANG) }) + (tm.duration === 'months' ? t('d_months', { n: tm.duration_months }) : tm.duration === 'lifetime' ? t('d_life') : t('d_while')) + (tm.basis === 'first_only' ? t('b_first') : '') : '';
    if (tm.fixed_month_cents > 0) s += t('f_month', { v: money(tm.fixed_month_cents) });
    if (tm.fixed_post_cents > 0) s += t('f_post', { v: money(tm.fixed_post_cents) });
    return s.replace(/^ \+ /, '');
  }
  function portal() {
    var h = top('p_brand');
    if (!PV.d) { app.innerHTML = '<div class="wrap wide">' + h + '<p class="center">' + esc(t(PV.err || 'loading')) + '</p></div>'; bindLang(portal); return; }
    var d = PV.d, m = PV.m || d.months_list[d.months_list.length - 1], M = d.months[m] || { clicks: 0, accounts: 0, trials: 0, paid_users: 0, by_platform: {} };
    var row = (d.statement || []).filter(function (r) { return r.month === m; })[0] || { commission_cents: 0, status: 'open' };
    var c = '';
    if (d.is_test) c += '<div class="testbar">' + esc(t('test')) + '</div>';
    c += '<div class="ptop" style="margin-bottom:6px"><div><h1>' + esc(d.name) + '</h1><div class="sub" style="margin:0">' + esc(t('code_lbl', { c: d.code })) + ' · ' + esc(t('updated', { d: new Date(d.generated_at).toLocaleString(LANG) })) + '</div></div></div>';
    c += '<div class="win" role="group">' + d.months_list.slice(-4).map(function (x) { return '<button type="button" data-m="' + x + '" class="' + (x === m ? 'on' : '') + '" aria-pressed="' + (x === m) + '">' + esc(monthName(x)) + '</button>'; }).join('') + '</div>';
    var open = row.status === 'open';
    c += '<div class="kpis">'
      + '<div class="kpi"><div class="h">' + esc(t('k_clicks')) + '</div><div class="v">' + esc(Number(M.clicks).toLocaleString(LANG)) + '</div><div class="s">' + esc(t('k_clicks_s')) + '</div></div>'
      + '<div class="kpi"><div class="h">' + esc(t('k_accounts')) + '</div><div class="v">' + esc(M.accounts) + '</div><div class="s">' + esc(t('k_accounts_s', { n: M.trials })) + '</div></div>'
      + '<div class="kpi"><div class="h">' + esc(t('k_paid')) + '</div><div class="v">' + esc(M.paid_users) + '</div><div class="s">' + esc(t('k_paid_s')) + '</div></div>'
      + '<div class="kpi"><div class="h">' + esc(t('k_com')) + '</div><div class="v">' + esc(d.terms || row.status !== 'no_terms' ? money(row.commission_cents) : '—') + '</div><div class="s">' + esc(row.status === 'no_terms' ? t('s_none') : open ? t('k_com_open') : t('k_com_done')) + '</div></div></div>';
    var plats = (d.platforms || []).slice(); if (M.by_platform.none) plats.push('none');
    c += '<div class="grid"><div><div class="card"><h2>' + esc(t('by_plat')) + '</h2><div class="tw tbl"><table><tr><th>' + esc(t('col_platform')) + '</th><th class="r">' + esc(t('col_clicks')) + ' <span class="tag">' + esc(t('measured')) + '</span></th><th class="r">' + esc(t('col_accounts')) + '</th><th class="r">' + esc(t('col_paid')) + '</th><th class="r">' + esc(t('col_rev')) + '</th></tr>';
    plats.forEach(function (p) { var x = M.by_platform[p] || { clicks: 0, accounts: 0, paid_users: 0, revenue_cents: 0 }; c += '<tr><td>' + esc(t('pl_' + p)) + '</td><td class="r">' + esc(p === 'none' ? '—' : Number(x.clicks).toLocaleString(LANG)) + '</td><td class="r">' + esc(x.accounts) + '</td><td class="r">' + esc(x.paid_users) + '</td><td class="r">' + esc(money(x.revenue_cents)) + '</td></tr>'; });
    c += '</table></div><div class="mlist">' + plats.map(function (p) { var x = M.by_platform[p] || { clicks: 0, accounts: 0, paid_users: 0, revenue_cents: 0 }; return '<div class="lrow"><div><b>' + esc(t('pl_' + p)) + '</b><span class="note" style="margin:0">' + esc((p === 'none' ? '' : t('col_clicks') + ' ' + Number(x.clicks).toLocaleString(LANG) + ' · ') + t('col_accounts') + ' ' + x.accounts + ' · ' + t('col_paid') + ' ' + x.paid_users) + '</span></div><b>' + esc(money(x.revenue_cents)) + '</b></div>'; }).join('') + '</div><div class="note">' + esc(t('ios_note', { codes: (d.codes || []).map(function (x) { return x.code; }).join(', ') })) + ' ' + esc(t('rev_note')) + '</div></div>';
    c += '<div class="card"><h2>' + esc(t('months_h')) + '</h2><div class="tw tbl"><table><tr><th>' + esc(t('col_month')) + '</th><th class="r">' + esc(t('col_rev')) + '</th><th class="r">' + esc(t('col_com')) + '</th><th>' + esc(t('col_status')) + '</th></tr>';
    var srows = (d.statement || []).slice().reverse().filter(function (r) { return r.revenue_cents || r.commission_cents || r.status === 'paid' || r.month >= d.months_list[d.months_list.length - 3]; });
    srows.forEach(function (r) { c += '<tr><td>' + esc(monthName(r.month)) + '</td><td class="r">' + esc(money(r.revenue_cents)) + '</td><td class="r">' + esc(r.status === 'no_terms' ? '—' : money(r.status === 'paid' ? r.payable_cents : r.commission_cents)) + '</td><td>' + statusText(r, d.min_payout_cents) + '</td></tr>'; });
    c += '</table></div><div class="mlist">' + srows.map(function (r) { return '<div class="lrow"><div><b>' + esc(monthName(r.month)) + '</b><span class="note" style="margin:0 0 4px;display:block">' + esc(t('col_rev') + ' ' + money(r.revenue_cents)) + '</span>' + statusText(r, d.min_payout_cents) + '</div><b>' + esc(r.status === 'no_terms' ? '—' : money(r.status === 'paid' ? r.payable_cents : r.commission_cents)) + '</b></div>'; }).join('') + '</div></div></div><div>';
    c += '<div class="card"><h2>' + esc(t('links_h')) + '</h2>' + codesList(d.codes) + '</div>';
    c += '<div class="card"><h2>' + esc(t('pay_box')) + '</h2><dl class="kv">' + (d.payout ? '<dt>' + esc(t('pay_method')) + '</dt><dd>' + esc(t('m_' + d.payout.method)) + (d.payout.masked && d.payout.masked.pix_key ? ' · ' + esc(d.payout.masked.pix_key) : d.payout.masked && d.payout.masked.payout_email ? ' · ' + esc(d.payout.masked.payout_email) : '') + '</dd>' : '') + '<dt>' + esc(t('pay_terms')) + '</dt><dd>' + esc(termsText(d.terms)) + '</dd></dl><div class="note">' + esc(t('change')) + '</div></div>';
    c += '<div class="card"><h2>' + esc(t('rules_box')) + '</h2><div class="note" style="margin-top:0">' + esc(t('rules_p')) + '</div></div></div></div>';
    app.innerHTML = '<div class="wrap wide">' + h + c + '</div>';
    bindLang(portal);
    app.querySelectorAll('[data-m]').forEach(function (b) { b.onclick = function () { PV.m = b.getAttribute('data-m'); portal(); }; });
  }

  document.documentElement.lang = LANG;
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(TOKEN)) { if (PAGE === 'invite') { IV.err = 'err_link'; invite(); } else { PV.err = 'err_link'; portal(); } return; }
  if (PAGE === 'invite') {
    readDraft(); invite();
    api({ op: 'invite_get', token: TOKEN }).then(function (x) { if (x.status === 200 && x.j) { IV.info = x.j; if (!IV.f.country && x.j.country) IV.f.country = x.j.country; IV.err = null; } else IV.err = x.status === 0 ? 'err_conn' : 'err_link'; invite(); });
  } else {
    portal();
    api({ op: 'portal', token: TOKEN }).then(function (x) { if (x.status === 200 && x.j) { PV.d = x.j; PV.err = null; } else PV.err = x.status === 0 ? 'err_conn' : 'err_link'; portal(); });
  }
})();
