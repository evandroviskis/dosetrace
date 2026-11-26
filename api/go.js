'use strict';
/**
 * Creator links: GET /go/<creator>/<platform> (rewritten to /api/go?c=&p=) and /c/<CODE> (?k=, no count).
 * Spec docs/specs/creators.md §3 (founder 2026-11-20):
 *   - Android → 302 to Google Play with referrer utm_content=<CODE-SUF>: the app reads it (Install Referrer).
 *   - iPhone/iPad → a short page with the code, "Copy code" and "Open the App Store" (the App Store does not
 *     hand the code to the app, so the person must see it before installing: founder P4).
 *   - Computer → the same page with both store buttons. Link-preview robots get the page and never count.
 *   - Counting: creator_go() adds 1 to (creator, platform, UTC day, device). No IP, user agent, cookie or referer
 *     is stored. Paused/ended → the store without the creator; unknown → the home page.
 *   - Supabase down → the visitor still reaches the store (a creator's link never breaks).
 */
const C = require('./_creators.js');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const TX = {
  en: { title: 'Your referral code', lead: 'When you open DoseTrace, enter the code {code}. It credits {name} for sending you.', benefit: 'With the code: {b}.', copy: 'Copy code', copied: 'Code copied', ios: 'Open the App Store', android: 'Get it on Google Play', where: 'Enter it in the app under Settings › Referral code, or on the subscription screen.', home: 'DoseTrace — dose and lab journal' },
  es: { title: 'Tu código de referido', lead: 'Cuando abras DoseTrace, escribe el código {code}. Así {name} recibe el crédito por recomendarte.', benefit: 'Con el código: {b}.', copy: 'Copiar código', copied: 'Código copiado', ios: 'Abrir la App Store', android: 'Disponible en Google Play', where: 'Escríbelo en la app en Ajustes › Código de referido, o en la pantalla de suscripción.', home: 'DoseTrace — diario de dosis y exámenes' },
  pt: { title: 'Seu código de indicação', lead: 'Ao abrir o DoseTrace, informe o código {code}. Assim {name} recebe o crédito por ter indicado você.', benefit: 'Com o código: {b}.', copy: 'Copiar código', copied: 'Código copiado', ios: 'Abrir a App Store', android: 'Baixar no Google Play', where: 'Informe-o no app em Ajustes › Código de indicação, ou na tela de assinatura.', home: 'DoseTrace — diário de doses e exames' },
  fr: { title: 'Votre code de parrainage', lead: 'En ouvrant DoseTrace, saisissez le code {code}. {name} sera crédité de vous avoir recommandé l’app.', benefit: 'Avec le code : {b}.', copy: 'Copier le code', copied: 'Code copié', ios: 'Ouvrir l’App Store', android: 'Disponible sur Google Play', where: 'Saisissez-le dans l’app sous Réglages › Code de parrainage, ou sur l’écran d’abonnement.', home: 'DoseTrace — journal des doses et analyses' },
  de: { title: 'Ihr Empfehlungscode', lead: 'Geben Sie beim Öffnen von DoseTrace den Code {code} ein. So wird {name} die Empfehlung gutgeschrieben.', benefit: 'Mit dem Code: {b}.', copy: 'Code kopieren', copied: 'Code kopiert', ios: 'App Store öffnen', android: 'Bei Google Play laden', where: 'Geben Sie ihn in der App unter Einstellungen › Empfehlungscode oder auf dem Abo-Bildschirm ein.', home: 'DoseTrace — Dosis- und Laborjournal' },
  it: { title: 'Il tuo codice di invito', lead: 'Quando apri DoseTrace, inserisci il codice {code}. Così {name} riceve il merito di averti consigliato l’app.', benefit: 'Con il codice: {b}.', copy: 'Copia codice', copied: 'Codice copiato', ios: 'Apri l’App Store', android: 'Disponibile su Google Play', where: 'Inseriscilo nell’app in Impostazioni › Codice di invito, oppure nella schermata dell’abbonamento.', home: 'DoseTrace — diario di dosi ed esami' },
};

function langOf(h) {
  const parts = String(h || '').toLowerCase().split(',').map((x) => x.trim().slice(0, 2));
  return parts.find((l) => LANGS.indexOf(l) >= 0) || 'en';
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v[k] == null ? '' : v[k]));

function header(req, name) { const v = (req.headers || {})[name]; return Array.isArray(v) ? v[0] : (v == null ? '' : String(v)); }
function query(req) { try { return new URL(req.url || '/', 'http://x').searchParams; } catch (e) { return new URLSearchParams(); } }

function sbConf() { const url = (process.env.SUPABASE_URL || '').replace(/\/$/, ''); const key = process.env.SUPABASE_SERVICE_ROLE_KEY; return url && key ? { url, key } : null; }
async function goRpc(slug, platform, device) {
  const sb = sbConf();
  if (!sb) return null;
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(`${sb.url}/rest/v1/rpc/creator_go`, { method: 'POST', signal: ctrl.signal, headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_slug: slug, p_platform: platform, p_device: device }) });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; } finally { clearTimeout(tm); }
}

const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
function send(res, status, headers, body) {
  res.statusCode = status; if (typeof res.status === 'function') res.status(status);
  const h = Object.assign({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex', 'X-Content-Type-Options': 'nosniff' }, headers);
  for (const k of Object.keys(h)) res.setHeader(k, h[k]);
  res.end(body || '');
}
const redirect = (res, url) => send(res, 302, { Location: url }, '');

// The page shown on iPhone, computer and to preview robots.
function page(o) {
  const t = TX[o.lang] || TX.en;
  const lead = fill(t.lead, { code: '<b>' + esc(o.code) + '</b>', name: esc(o.name) });
  const btn = (href, label, primary) => '<a class="b' + (primary ? ' p' : '') + '" href="' + esc(href) + '" rel="noreferrer">' + esc(label) + '</a>';
  return '<!doctype html><html lang="' + esc(o.lang) + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
    + '<title>' + esc(t.home) + '</title><meta property="og:title" content="DoseTrace"><meta property="og:description" content="' + esc(t.home) + '">'
    + '<style>:root{--bg:#EEF3F9;--card:#fff;--ink:#0C2340;--muted:#5A7085;--line:#D6E0EC;--accent:#2A78C2;--on:#fff}'
    + '@media (prefers-color-scheme:dark){:root{--bg:#0C1B2E;--card:#12263C;--ink:#EAF2FB;--muted:#8FA6BD;--line:#22405f;--accent:#4FA3E8;--on:#04121f;color-scheme:dark}}'
    + 'body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;padding:24px max(16px,env(safe-area-inset-right)) 32px max(16px,env(safe-area-inset-left))}'
    + 'main{max-width:440px;margin:0 auto;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px 20px}'
    + '.brand{font-weight:700;display:flex;gap:8px;align-items:center;margin-bottom:14px}.brand i{width:10px;height:10px;border-radius:50%;background:var(--accent)}'
    + 'h1{font-size:21px;margin:0 0 8px}p{margin:0 0 12px;color:var(--muted)}p b{color:var(--ink)}'
    + '.code{font:700 30px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em;text-align:center;border:2px dashed var(--accent);border-radius:14px;padding:14px;margin:14px 0 10px;user-select:all}'
    + '.b{display:block;text-align:center;text-decoration:none;border-radius:999px;padding:12px 16px;margin:10px 0 0;font-weight:600;border:1px solid var(--line);color:var(--accent);background:transparent;font-size:16px;width:100%;box-sizing:border-box;cursor:pointer}'
    + '.b.p{background:var(--accent);color:var(--on);border-color:var(--accent)}.b:focus-visible{outline:3px solid var(--accent);outline-offset:2px}.s{font-size:13px;margin-top:14px}</style></head><body><main>'
    + '<div class="brand"><i></i>DoseTrace</div><h1>' + esc(t.title) + '</h1><p>' + lead + '</p>'
    + (o.benefit ? '<p>' + esc(fill(t.benefit, { b: o.benefit })) + '</p>' : '')
    + '<div class="code" id="code">' + esc(o.code) + '</div>'
    + '<button class="b" id="copy" type="button" data-done="' + esc(t.copied) + '">' + esc(t.copy) + '</button>'
    + (o.device !== 'android' ? btn(o.apple, t.ios, true) : '')
    + (o.device !== 'ios' ? btn(o.play, t.android, o.device === 'android') : '')
    + '<p class="s">' + esc(t.where) + '</p></main>'
    + '<script>document.getElementById("copy").onclick=function(){var b=this,c=document.getElementById("code").textContent;function ok(){b.textContent=b.getAttribute("data-done");}'
    + 'try{navigator.clipboard.writeText(c).then(ok,function(){sel();});}catch(e){sel();}function sel(){var r=document.createRange();r.selectNodeContents(document.getElementById("code"));var s=window.getSelection();s.removeAllRanges();s.addRange(r);}};</script>'
    + '</body></html>';
}

async function handler(req, res) {
  if (String(req.method || 'GET').toUpperCase() !== 'GET' && String(req.method).toUpperCase() !== 'HEAD') return send(res, 405, { Allow: 'GET' }, '');
  const q = query(req);
  const device = C.deviceOf(header(req, 'user-agent'));
  const lang = langOf(header(req, 'accept-language'));
  const genericApple = C.appleUrl(null, null, null), genericPlay = C.playUrl(null, null);
  const generic = () => (device === 'ios' ? redirect(res, genericApple) : device === 'android' ? redirect(res, genericPlay) : redirect(res, C.SITE + '/'));

  // /c/<CODE>: the code page, never counted (the app's universal link opens the app before this when installed).
  if (q.has('k')) {
    const pc = C.parseCode(q.get('k'));
    if (!pc) return redirect(res, C.SITE + '/');
    const platform = pc.platform || 'outro';
    const r = await goRpc(C.slugOf(pc.base), '-', 'bot');
    if (!r || !r.found || !r.live) return generic();
    const code = pc.platform ? pc.code : r.code;
    return send(res, 200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP }, page({ lang, device, code, name: r.name, benefit: r.benefit, apple: C.appleUrl(r.pt, r.code, platform), play: C.playUrl(r.code, platform) }));
  }

  const slug = String(q.get('c') || '').toLowerCase(), platform = String(q.get('p') || '').toLowerCase();
  if (!/^[a-z0-9]{3,12}$/.test(slug) || !C.PLATFORMS[platform]) return redirect(res, C.SITE + '/');
  const r = await goRpc(slug, platform, device);
  if (!r) return generic(); // Supabase down or not configured: still reach the store
  if (!r.found) return redirect(res, C.SITE + '/');
  if (!r.live || (Array.isArray(r.platforms) && r.platforms.indexOf(platform) < 0)) return generic();
  const code = C.platformCode(r.code, platform);
  if (device === 'android') return redirect(res, C.playUrl(r.code, platform));
  return send(res, 200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP }, page({ lang, device, code, name: r.name, benefit: r.benefit, apple: C.appleUrl(r.pt, r.code, platform), play: C.playUrl(r.code, platform) }));
}

module.exports = handler;
module.exports.page = page;
module.exports.langOf = langOf;
module.exports.TX = TX;
