'use strict';
// How-to videos in the FAQ (docs/specs/howto-videos.md HV-1..HV-12; picture docs/design/videos-perguntas.html,
// founder 2026-11-26). The pure rules, plain CommonJS so node --test runs every one of them:
//   parseManifest(raw)        → the manifest, cleaned, or null (HV-6: fails closed)
//   isHowtoUrl(url)           → true only for a file in our public `howto` bucket (HV-6)
//   phoneVariant({ os, book }) → 'ios' | 'android' | 'fold-open' | 'ios-fold-open' (HV-8)
//   pickVideo(manifest, ctx)  → the one entry for this question, language, phone, sex and version, or null
//   rowState(entry, online)   → 'play' | 'offline' | null (HV-1 / HV-5)
//   formatDuration(sec)       → "0:42" (HV-1, HV-3)
//   swipeCloses({ dx, dy })   → true for a swipe down or to the right past 80 points (HV-4)
//   spokenDuration(sec, t, l) → "42 segundos" (HV-2, screen readers)
//   eventProps(id, entry)     → { question, lang, variant } and nothing else (HV-9)
//   createManifestStore(deps) → the last good copy on the phone + a 3 s fetch (HV-6)
// Videos live on the remote server only, never on the phone (founder 2026-11-26); the manifest kept on
// the phone is configuration, not the person's data.

const { versionBelow } = require('./deviceRules');
const { pluralKey } = require('./plural');

const SUPPORTED_LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const HOWTO_BASE = 'https://mqfvnqfusqyhqhowfweh.supabase.co/storage/v1/object/public/howto/';
const MANIFEST_URL = `${HOWTO_BASE}manifest.json`;
const MANIFEST_KEY = 'dosetrace_howto_manifest';
const HOWTO_TIMEOUT_MS = 3000;
const PHONE_VARIANTS = ['ios', 'android', 'fold-open', 'ios-fold-open'];
const MAX_DUR_SEC = 60 * 60; // a how-to is minutes long; anything beyond an hour is a broken entry
const VERSION_RE = /^\d+(\.\d+){0,3}$/;
// A file in the bucket: plain path characters only, no "..", no query, no second host.
const PATH_RE = /^[A-Za-z0-9_-][A-Za-z0-9._/-]*$/;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

function isHowtoUrl(url) {
  if (typeof url !== 'string' || !url.startsWith(HOWTO_BASE)) return false;
  const rest = url.slice(HOWTO_BASE.length);
  if (!rest || !PATH_RE.test(rest)) return false;
  if (rest.includes('..') || rest.includes('//')) return false;
  return true;
}

// 'ios-f' → { phone: 'ios', sex: 'f' }; 'fold-open' → { phone: 'fold-open', sex: null }; unknown → null.
function splitVariant(variant) {
  if (typeof variant !== 'string') return null;
  const m = variant.match(/^(.+?)(?:-(f|m))?$/);
  if (!m || !PHONE_VARIANTS.includes(m[1])) return null;
  return { phone: m[1], sex: m[2] || null };
}

function cleanEntry(e) {
  if (!isObj(e)) return null;
  if (!SUPPORTED_LANGS.includes(e.lang)) return null;
  const v = splitVariant(e.variant);
  if (!v) return null;
  const bySex = e.bySex === true;
  // A sex suffix only on a video marked bySex, and a bySex video always names its sex (HV-8).
  if (bySex !== !!v.sex) return null;
  if (!isHowtoUrl(e.url)) return null;
  const dur = Number(e.dur);
  if (typeof e.dur !== 'number' || !Number.isFinite(dur) || dur <= 0 || dur > MAX_DUR_SEC) return null;
  const out = { lang: e.lang, variant: e.variant, url: e.url, dur, bySex };
  for (const k of ['minApp', 'maxApp']) {
    if (e[k] == null) continue;
    if (typeof e[k] !== 'string' || !VERSION_RE.test(e[k].trim())) return null;
    out[k] = e[k].trim();
  }
  return out;
}

// HV-6: `{ v: 1, videos: { "<faq question id>": [entry, …] } }`. A file that is not that shape → null
// (no row anywhere); an entry that is not valid is dropped on its own (no row for it).
function parseManifest(raw) {
  let m = raw;
  if (typeof raw === 'string') {
    try { m = JSON.parse(raw); } catch { return null; }
  }
  if (!isObj(m) || m.v !== 1 || !isObj(m.videos)) return null;
  const videos = {};
  for (const [id, list] of Object.entries(m.videos)) {
    if (!id || !Array.isArray(list)) continue;
    const clean = list.map(cleanEntry).filter(Boolean);
    if (clean.length) videos[id] = clean;
  }
  return { v: 1, videos };
}

// HV-8: the phone family where the screen differs. The book layout (two pages: the Fold open) is its own
// family; an iPhone/iPad in the book layout is ios-fold-open.
function phoneVariant({ os, book } = {}) {
  const ios = os === 'ios';
  if (book) return ios ? 'ios-fold-open' : 'fold-open';
  return ios ? 'ios' : 'android';
}

// The profile's sex at birth → the variant suffix; anything else → null.
function sexSuffix(sex) {
  if (sex === 'female' || sex === 'f') return 'f';
  if (sex === 'male' || sex === 'm') return 'm';
  return null;
}

function inVersion(entry, appVersion) {
  if (!entry.minApp && !entry.maxApp) return true;
  if (typeof appVersion !== 'string' || !VERSION_RE.test(appVersion)) return false; // unknown version: fail closed
  if (entry.minApp && versionBelow(appVersion, entry.minApp)) return false;
  if (entry.maxApp && versionBelow(entry.maxApp, appVersion)) return false;
  return true;
}

// The variants to try, in order (HV-8): this phone with the profile's sex (only bySex videos carry
// one), this phone plain, then the plain phone of the same system (fold-open → android,
// ios-fold-open → ios) with the same sex, then plain. Never another sex, never another system.
function variantOrder({ os, book, sex } = {}) {
  const base = phoneVariant({ os, book });
  const plainPhone = phoneVariant({ os, book: false });
  const sx = sexSuffix(sex);
  const order = [];
  for (const p of base === plainPhone ? [base] : [base, plainPhone]) {
    if (sx) order.push(`${p}-${sx}`);
    order.push(p);
  }
  return order;
}

// HV-1 / HV-7 / HV-8 / HV-6: the one video for this question, or null. Only the app language — there
// is never a fallback to another language.
function pickVideo(manifest, { id, lang, os, book, sex, appVersion } = {}) {
  if (!manifest || !isObj(manifest.videos) || !id) return null;
  const list = manifest.videos[id];
  if (!Array.isArray(list) || !SUPPORTED_LANGS.includes(lang)) return null;
  const usable = list.filter((e) => e && e.lang === lang && inVersion(e, appVersion));
  for (const v of variantOrder({ os, book, sex })) {
    const hit = usable.find((e) => e.variant === v);
    if (hit) return hit;
  }
  return null;
}

// HV-1 / HV-5: a video exists → the play row online, the offline line otherwise; no video → nothing.
function rowState(entry, online) {
  if (!entry) return null;
  return online ? 'play' : 'offline';
}

// "0:42", "1:05", "12:00", "1:02:03". Never negative, never NaN.
function formatDuration(sec) {
  const n = Number(sec);
  const s = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

const fill = (str, vars) => String(str).replace(/\{(\w+)\}/g, (all, k) => (k in vars ? String(vars[k]) : all));

// HV-2: the duration as words for a screen reader ("42 segundos", "1 minuto e 5 segundos").
function spokenDuration(sec, t, language) {
  const n = Number(sec);
  const s = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  const m = Math.floor(s / 60);
  const r = s % 60;
  const secs = fill(t(pluralKey('howto_secs', r, language)), { n: r });
  if (!m) return secs;
  const mins = fill(t(pluralKey('howto_mins', m, language)), { n: m });
  return r ? fill(t('howto_time_join'), { min: mins, sec: secs }) : mins;
}

// HV-2: "Vídeo, 42 segundos: <pergunta>".
function rowA11yLabel(entry, question, t, language) {
  return fill(t('howto_a11y'), { time: spokenDuration(entry && entry.dur, t, language), q: question || '' });
}

// HV-9: only the question id, the language and the variant (no account, no health detail).
// HV-9: only the question, the language and the PHONE family — the -f / -m suffix of an injection-site
// video is dropped, so the event never carries the person's sex (council 2026-11-26, privacy).
function eventProps(id, entry) {
  const v = entry && entry.variant ? splitVariant(entry.variant) : null;
  return { question: id || null, lang: (entry && entry.lang) || null, variant: v ? v.phone : (entry && entry.variant) || null };
}

function withTimeout(promise, ms) {
  let timer = null;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('howto_timeout')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// HV-6 / HV-5: the manifest on the phone (last good copy) and the fetch with a 3 s timeout.
// deps.store: AsyncStorage-like; deps.fetchManifest(): Promise<{ status, text }> (throws offline).
//   cached()  → the last good copy, or null
//   refresh() → { manifest, reachable }:
//      2xx + valid  → saved and used, reachable
//      2xx + broken → no manifest (fail closed), the last good copy stays on the phone, reachable
//      4xx          → the file is not there: no manifest, the copy on the phone removed, reachable
//      5xx / offline / timeout → the last good copy, not reachable (the offline line)
function createManifestStore(deps) {
  const store = deps.store;
  const key = deps.key || MANIFEST_KEY;
  const timeoutMs = deps.timeoutMs || HOWTO_TIMEOUT_MS;
  async function cached() {
    try { const raw = await store.getItem(key); return raw ? parseManifest(raw) : null; } catch { return null; }
  }
  async function refresh() {
    let res = null;
    try { res = await withTimeout(Promise.resolve().then(() => deps.fetchManifest()), timeoutMs); } catch { res = null; }
    const status = res && Number(res.status);
    if (!res || !Number.isFinite(status) || status >= 500 || status < 200) return { manifest: await cached(), reachable: false };
    if (status >= 400) {
      try { await store.removeItem(key); } catch { /* config cache only */ }
      return { manifest: null, reachable: true };
    }
    if (status >= 300) return { manifest: await cached(), reachable: false };
    const manifest = parseManifest(res.text);
    if (manifest) {
      try { await store.setItem(key, JSON.stringify(manifest)); } catch { /* config cache only */ }
    }
    return { manifest, reachable: true };
  }
  return { cached, refresh };
}

// HV-4: the player closes like × on a swipe down or to the right (finger lifted more than 80 points from
// where it went down, mostly in that direction). A tap (on × or pause) and a drag up or left never close.
const SWIPE_CLOSE = 80;
function swipeCloses({ dx, dy } = {}) {
  const x = Number(dx);
  const y = Number(dy);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return (y > SWIPE_CLOSE && y >= Math.abs(x) * 0.5) || (x > SWIPE_CLOSE && x >= Math.abs(y) * 0.5);
}

module.exports = {
  swipeCloses,
  SUPPORTED_LANGS,
  HOWTO_BASE,
  MANIFEST_URL,
  MANIFEST_KEY,
  HOWTO_TIMEOUT_MS,
  PHONE_VARIANTS,
  isHowtoUrl,
  splitVariant,
  parseManifest,
  phoneVariant,
  sexSuffix,
  variantOrder,
  pickVideo,
  rowState,
  formatDuration,
  spokenDuration,
  rowA11yLabel,
  eventProps,
  withTimeout,
  createManifestStore,
};
