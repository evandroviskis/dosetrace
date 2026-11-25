#!/usr/bin/env node
'use strict';
// Conversation archive (founder 2026-11-24: "preciso que seja seguro trocar de computador e manter
// o contexto todo. Desde o início de tudo.").
//
// Copies every DoseTrace Claude Code transcript from ~/.claude/projects/<folder with "dosetrace">
// into ~/Desktop/Second Brain/dosetrace/conversas-claude/<folder>/..., with every secret replaced
// by [OCULTO] and big base64 images/blobs replaced by [IMAGEM REMOVIDA] / [BINARIO REMOVIDO].
// The originals in ~/.claude/projects are only read, never changed.
//
//   node scripts/arquivar-conversas.cjs                 all DoseTrace folders (incremental)
//   node scripts/arquivar-conversas.cjs --transcript F  one transcript + its subagents/tool results
//   node scripts/arquivar-conversas.cjs --hook          same, transcript_path read from the hook JSON on stdin
//   node scripts/arquivar-conversas.cjs --verificar     scan the archive for leftover secrets (prints counts only)
//   --src DIR --dest DIR --limit N --only NAME          overrides / test runs
//
// Incremental: .jsonl files are append-only, so the manifest keeps how many bytes of each source
// were archived (plus a hash of the start of the file). A grown file only has its new complete
// lines masked and appended; an unchanged file (same size) is skipped; a rewritten one is redone.

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const OCULTO = '[OCULTO]';
const IMAGEM = '[IMAGEM REMOVIDA]';
const BINARIO = '[BINARIO REMOVIDO]';
const BLOB_MIN = 2048;
// Raise when the masking rules change: every file is then redone from the start on the next run.
const RULES_VERSION = 2;
const DEFAULT_SRC = path.join(os.homedir(), '.claude', 'projects');
const DEFAULT_DEST = path.join(os.homedir(), 'Desktop', 'Second Brain', 'dosetrace', 'conversas-claude');
const PROJECT_MATCH = /dosetrace/i;
const TEXT_EXT = new Set(['.json', '.txt', '.md']);

// ---------------------------------------------------------------- helpers
function bump(counts, name, n = 1) { if (counts && n) counts[name] = (counts[name] || 0) + n; }

function looksRandom(v) {
  if (!v || v.length < 16) return false;
  if (/^[a-f0-9]{32,}$/i.test(v)) return true;
  if (!/^[A-Za-z0-9+/=_\-.~]+$/.test(v)) return false;
  const d = (v.match(/[0-9]/g) || []).length;
  const u = (v.match(/[A-Z]/g) || []).length;
  const l = (v.match(/[a-z]/g) || []).length;
  return d >= 2 && u + l >= 6 && ((u >= 1 && l >= 1) || d >= 8);
}

const SKIP_VALUE = /^(?:\[OCULTO\]|\$|\{|<|process\.env|import\.meta|os\.environ|env\.|null$|undefined$|true$|false$|string$|String$|number$|required$|optional$|\*+$|\.\.\.$|…$)/;
function passwordValueOk(v) { return v && v.length > 0 && !SKIP_VALUE.test(v); }

// a value that a human would call a password in a sentence ("a senha é Abc123!")
function looksPassword(v) {
  const t = v.replace(/[.,;:!?)"'”]+$/, (m) => (m.length < v.length ? '' : m));
  return t.length >= 6 && (/[0-9]/.test(t) || /[^A-Za-z0-9\u00C0-\u024F]/.test(t));
}

// ---------------------------------------------------------------- known secrets
// A high-entropy value hidden once by a context rule (ADMIN_TOKEN=…, ?t=…, "token is …") is
// remembered by a short hash, so the same value is hidden wherever else it shows up bare (grep
// output, a pasted link). Only the first 16 hex chars of its SHA-256 are kept (in manifest.json),
// never the value; only random-looking values of 16+ chars are learned, so the hash cannot be guessed.
const KNOWN = new Set();
const hashOf = (v) => crypto.createHash('sha256').update(v).digest('hex').slice(0, 16);
function learn(v) {
  if (typeof v === 'string' && /^[A-Za-z0-9+/=_-]{16,}$/.test(v) && looksRandom(v)) KNOWN.add(hashOf(v));
  return v;
}
function resetKnown() { KNOWN.clear(); }
const TOKEN_RES = [/[A-Za-z0-9+/=_-]{16,}/g, /[A-Za-z0-9_-]{16,}/g];
function isKnown(t) { return looksRandom(t) && KNOWN.has(hashOf(t)); }
function maskKnown(s, counts) {
  if (!KNOWN.size || typeof s !== 'string' || s.length < 16) return s;
  let out = s;
  for (const re of TOKEN_RES) {
    re.lastIndex = 0;
    out = out.replace(re, (t) => {
      if (isKnown(t)) { bump(counts, 'conhecido'); return OCULTO; }
      return t;
    });
  }
  return out;
}
// raw JSON text: a token right after an escape ("\nTOKEN") reads as "nTOKEN", so try both
function rawHasKnown(text) {
  if (!KNOWN.size) return false;
  const re = /[A-Za-z0-9+/=_-]{16,}/g;
  let m;
  while ((m = re.exec(text))) {
    const t = m[0];
    if (isKnown(t) || isKnown(t.slice(1))) return true;
    for (const p of t.split(/[+/=]/)) if (p.length >= 16 && (isKnown(p) || isKnown(p.slice(1)))) return true;
  }
  return false;
}

// ---------------------------------------------------------------- patterns
// Each pattern: name (used in counts / report), hint (cheap substring test), re, and an optional
// replace function. Order matters: whole blocks first, then fixed prefixes, then context rules.
const PW_NAME = String.raw`(?<![A-Za-z0-9_.-])[A-Za-z0-9_.-]*(?:password|passwd|passphrase|passwort|senha|contrase(?:n|ñ)a|mot_de_passe)[A-Za-z0-9_]*`;
const SEC_NAME = String.raw`(?<![A-Za-z0-9_.-])[A-Za-z0-9_.-]*(?:secret|token|api_?key|apikey|access_?key|private_?key|_key|Key|KEY)[A-Za-z0-9_]*`;
const PW_HINT = /passw|passphrase|senha|contrase|mot_de_passe|mot de passe/i;
const SEC_HINT = /secret|token|key/i;
const SEP = String.raw`\\*["']?\s*(?:=>|[:=])\s*`;

const PATTERNS = [
  { name: 'imagem', hint: ';base64,', re: /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{200,}/gi, rep: () => IMAGEM },
  { name: 'binario', hint: ';base64,', re: /data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{200,}/gi, rep: () => BINARIO },
  { name: 'private-key', hint: 'PRIVATE KEY', re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g },
  { name: 'binario', hint: null, minLen: 2048, re: /[A-Za-z0-9+/]{2048,}={0,2}/g, rep: () => BINARIO },
  { name: 'private-key', hint: 'MI', re: /(?<![A-Za-z0-9+/])MI[GIJ][A-Za-z0-9+/]{60,}={0,2}/g },
  { name: 'jwt', hint: 'eyJ', re: /eyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{4,}){0,2}/g },
  { name: 'anthropic', hint: 'sk-ant-', re: /sk-ant-[A-Za-z0-9_-]{8,}/g },
  { name: 'openai', hint: 'sk-', re: /(?<![A-Za-z0-9_-])sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g },
  { name: 'stripe', hint: '_', re: /(?<![A-Za-z0-9])(?:sk|pk|rk|whsec)_(?:live|test)_[A-Za-z0-9]{8,}/g },
  { name: 'stripe', hint: 'whsec_', re: /whsec_[A-Za-z0-9]{16,}/g },
  { name: 'revenuecat', hint: '_', re: /(?<![A-Za-z0-9])(?:sk|rk|pk|appl|goog|amzn|strp|atlas)_[A-Za-z0-9]{20,}/g },
  { name: 'supabase', hint: 'sb', re: /(?<![A-Za-z0-9])(?:sbp_[A-Za-z0-9]{20,}|sb_(?:secret|publishable)_[A-Za-z0-9_-]{10,})/g },
  { name: 'aws', hint: /AKIA|ASIA/, re: /(?<![A-Z0-9])(?:AKIA|ASIA)[0-9A-Z]{16}(?![A-Z0-9])/g },
  { name: 'google', hint: /AIza|GOCSPX|ya29|1\/\/0/, re: /AIza[0-9A-Za-z_-]{30,}|GOCSPX-[A-Za-z0-9_-]{10,}|ya29\.[A-Za-z0-9_.-]{20,}|(?<![A-Za-z0-9])1\/\/0[A-Za-z0-9_-]{30,}/g },
  { name: 'github', hint: /gh[pousr]_|github_pat_|glpat-/, re: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}/g },
  { name: 'slack', hint: 'xox', re: /xox[abprs]-[A-Za-z0-9-]{10,}/g },
  { name: 'meta', hint: 'EAA', re: /(?<![A-Za-z0-9])EAA[A-Za-z0-9]{40,}/g },
  { name: 'expo', hint: 'ExponentPushToken', re: /ExponentPushToken\[[^\]]{6,}\]/g },
  { name: 'outros-tokens', hint: /npm_|hf_|sntry|vc[pkia]_|re_|:AA/, re: /(?<![A-Za-z0-9])(?:npm_[A-Za-z0-9]{30,}|hf_[A-Za-z0-9]{30,}|sntry[su]_[A-Za-z0-9+/=_-]{20,}|vc[pkia]_[A-Za-z0-9]{20,}|re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}|\d{8,10}:AA[A-Za-z0-9_-]{30,})/g },
  { name: 'connection-string', hint: '://', re: /([a-z][a-z0-9+.-]*:\/\/[^\s:/@"'\\]+:)([^\s@/"'\\]+)(@)/gi, rep: (m, a, v, b) => (v === OCULTO ? m : (learn(v), a + OCULTO + b)) },
  { name: 'bearer', hint: /Bearer|Basic/, re: /(\b(?:Bearer|Basic)\s+)([A-Za-z0-9._~+/=-]{12,})/g, rep: (m, a, v) => (/[0-9=]/.test(v) || v.length >= 20 ? (learn(v), a + OCULTO) : m) },
  { name: 'header', hint: /authorization|api-?key|x-auth|x-access|x-supabase|x-goog/i, re: /(\b(?:authorization|x-api-key|apikey|api-key|x-auth-token|x-access-token|x-supabase-key|x-goog-api-key)\\*["']?\s*[:=]\s*\\*["']?)([^\s"'\\,;]{12,})/gi, rep: (m, a, v) => (looksRandom(v) ? (learn(v), a + OCULTO) : m) },
  { name: 'cookie', hint: 'ookie', re: /(\b(?:Set-Cookie|Cookie)\s*:\s*)([^\r\n"\\]{8,})/gi, rep: (m, a) => a + OCULTO },
  { name: 'url-param', hint: '=', re: /([?&#](?:access_token|refresh_token|id_token|token|apikey|api_key|key|secret|client_secret|code|signature|sig|X-Amz-Signature|X-Amz-Credential|X-Amz-Security-Token|password|senha)=)([^&\s"'#\\]{8,})/gi, rep: (m, a, v) => (v.startsWith('[OCULTO') ? m : (learn(v), a + OCULTO)) },
  { name: 'url-param', hint: /#|location\.hash/, re: /((?:https?:\/\/[^\s"'#\\]+#|location\.hash\s*=\s*\\*["']#?))([A-Za-z0-9_-]{24,})/g, rep: (m, a, v) => (looksRandom(v) ? (learn(v), a + OCULTO) : m) },
  { name: 'url-param', hint: /[?&#](?:t|tk|auth|magic|invite)=/, re: /([?&#](?:t|tk|auth|magic|invite)=)([A-Za-z0-9_\-.~%]{16,})/g, rep: (m, a, v) => (looksRandom(v) ? (learn(v), a + OCULTO) : m) },
  { name: 'frase-token', hint: /token|key|secret|chave|segredo/i, re: /(\b(?:token|key|secret|chave|segredo)\b[^\n\x60'"]{0,25}?\b(?:is|é|was|era|fica|:)\s*[\x60'"“]?)([A-Za-z0-9+/=_\-.~]{16,})/gi, rep: (m, a, v) => (looksRandom(v) ? (learn(v), a + OCULTO) : m) },
  { name: 'assignment', hint: '|', re: new RegExp(String.raw`(${SEC_NAME}\x60?\s*\|\s*\x60?)([A-Za-z0-9+/=_\-.~]{16,})`, 'gi'), rep: (m, a, v) => (looksRandom(v) ? (learn(v), a + OCULTO) : m) },
  { name: 'password', hint: '--', re: new RegExp(String.raw`(--(?:password|passwd|pass|senha|token|api-key|apikey|secret|key-password|keystore-password|store-password)(?:=|\s+))(["']?)([^\s"']+)\2`, 'gi'), rep: (m, a, q, v) => (passwordValueOk(v) && !v.startsWith('-') ? a + q + OCULTO + q : m) },
  { name: 'password', hint: PW_HINT, re: new RegExp(String.raw`(${PW_NAME}${SEP})(\\*)(["'\x60])(.*?)\2\3`, 'gi'), rep: (m, a, bs, q, v) => (v && v !== OCULTO ? (learn(v), a + bs + q + OCULTO + bs + q) : m) },
  { name: 'password', hint: PW_HINT, re: new RegExp(String.raw`(${PW_NAME}${SEP})(?!\\*["'\x60])([^\s"'\x60\\,;&)}\]]+)`, 'gi'), rep: (m, a, v) => (passwordValueOk(v) ? (learn(v), a + OCULTO) : m) },
  { name: 'password', hint: PW_HINT, re: /(\b(?:password|senha|contraseña|mot de passe|passwort)\s+(?:is|é|e|era|was|fica|:)\s+["'“]?)(\S{4,})/gi, rep: (m, a, v) => (looksPassword(v) && !v.startsWith('[OCULTO') ? a + OCULTO : m) },
  { name: 'assignment', hint: SEC_HINT, re: new RegExp(String.raw`(${SEC_NAME}${SEP})(\\*)(["'\x60])([^"'\x60\\\s]{16,})\2\3`, 'gi'), rep: (m, a, bs, q, v) => (looksRandom(v) ? (learn(v), a + bs + q + OCULTO + bs + q) : m) },
  { name: 'assignment', hint: SEC_HINT, re: new RegExp(String.raw`(${SEC_NAME}${SEP})(?!\\*["'\x60])([A-Za-z0-9+/=_\-.~]{16,})`, 'gi'), rep: (m, a, v) => (looksRandom(v) ? (learn(v), a + OCULTO) : m) },
];

function maskString(s, counts) {
  if (typeof s !== 'string' || s.length < 8) return s;
  let out = s;
  for (const p of PATTERNS) {
    if (p.minLen && out.length < p.minLen) continue;
    if (p.hint && (typeof p.hint === 'string' ? !out.includes(p.hint) : !p.hint.test(out))) continue;
    p.re.lastIndex = 0;
    if (!p.re.test(out)) continue;
    p.re.lastIndex = 0;
    let n = 0;
    out = out.replace(p.re, (...args) => {
      const r = p.rep ? p.rep(...args) : OCULTO;
      if (r !== args[0]) n++;
      return r;
    });
    bump(counts, p.name, n);
  }
  return maskKnown(out, counts);
}

// ---------------------------------------------------------------- JSON walk
const SECRET_KEY = /^(?:password|passwd|pass|senha|secret|client_secret|api_?key|apikey|access_?token|refresh_?token|id_token|auth_?token|token|private_?key|private_key_id|service_role_key|anon_key|authorization|cookie)$/i;
const PW_KEY = /^(?:password|passwd|pass|senha)$/i;
const B64_ONLY = /^[A-Za-z0-9+/=_-]+$/;

function maskValue(v, counts, key, parent) {
  if (typeof v === 'string') {
    if (parent && v.length > 100 && ((key === 'signature' && parent.type === 'thinking') || (key === 'data' && parent.type === 'redacted_thinking'))) {
      bump(counts, 'binario');
      return BINARIO;
    }
    if (v.length > BLOB_MIN && B64_ONLY.test(v)) {
      const isImg = key === 'base64'
        || (parent && typeof parent.media_type === 'string' && parent.media_type.startsWith('image/'))
        || (parent && typeof parent.type === 'string' && parent.type.startsWith('image/'));
      bump(counts, isImg ? 'imagem' : 'binario');
      return isImg ? IMAGEM : BINARIO;
    }
    if (key && SECRET_KEY.test(key) && v && v !== OCULTO && (PW_KEY.test(key) ? passwordValueOk(v) : v.length >= 8 && !SKIP_VALUE.test(v))) {
      bump(counts, 'json-key');
      learn(v);
      return OCULTO;
    }
    return maskString(v, counts);
  }
  if (Array.isArray(v)) return v.map((x) => maskValue(x, counts, key, parent));
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = maskValue(v[k], counts, k, v);
    return o;
  }
  return v;
}

function maskLine(line, counts) {
  let j;
  try { j = JSON.parse(line); } catch { bump(counts, 'linha-texto'); return maskString(line, counts); }
  return JSON.stringify(maskValue(j, counts, null, null));
}

function maskTextFile(text, ext, counts) {
  if (ext === '.json') {
    try { return JSON.stringify(maskValue(JSON.parse(text), counts, null, null), null, 1); } catch { /* fall through */ }
  }
  return maskString(text, counts);
}

// ---------------------------------------------------------------- files
async function headHash(file, len) {
  const fh = await fsp.open(file, 'r');
  try {
    const buf = Buffer.alloc(len);
    const { bytesRead } = await fh.read(buf, 0, len, 0);
    return crypto.createHash('sha1').update(buf.subarray(0, bytesRead)).digest('hex');
  } finally { await fh.close(); }
}

function writeAll(ws, s) {
  return ws.write(s) ? Promise.resolve() : new Promise((res) => ws.once('drain', res));
}

// Masks src (.jsonl) from byte `start` into dest (appending when start > 0). Only complete lines
// are taken; a trailing piece without "\n" is taken only if it is already valid JSON.
async function maskJsonl(src, dest, start, srcSize, counts) {
  const ws = fs.createWriteStream(dest, { flags: start > 0 ? 'a' : 'w' });
  const rs = fs.createReadStream(src, { start, end: srcSize - 1, highWaterMark: 1 << 20 });
  let pending = [];
  let pendingLen = 0;
  let consumed = start;
  let lines = 0;
  for await (const chunk of rs) {
    let from = 0;
    let nl;
    while ((nl = chunk.indexOf(10, from)) !== -1) {
      const part = chunk.subarray(from, nl);
      const buf = pendingLen ? Buffer.concat([...pending, part]) : part;
      pending = []; pendingLen = 0;
      consumed += buf.length + 1;
      const line = buf.toString('utf8');
      if (line.trim()) { await writeAll(ws, maskLine(line, counts) + '\n'); lines++; }
      from = nl + 1;
    }
    if (from < chunk.length) { const rest = chunk.subarray(from); pending.push(Buffer.from(rest)); pendingLen += rest.length; }
  }
  if (pendingLen) {
    const buf = Buffer.concat(pending);
    const line = buf.toString('utf8');
    let complete = false;
    try { JSON.parse(line); complete = true; } catch { /* still being written */ }
    if (complete) { await writeAll(ws, maskLine(line, counts) + '\n'); lines++; consumed += buf.length; }
  }
  await new Promise((res, rej) => { ws.end(); ws.on('finish', res); ws.on('error', rej); });
  return { consumed, lines };
}

function addCounts(into, from) { for (const [k, n] of Object.entries(from)) into[k] = (into[k] || 0) + n; }

async function archiveFile(src, dest, entry) {
  if (entry && entry.rules !== RULES_VERSION) entry = null;
  const st = await fsp.stat(src);
  const ext = path.extname(src).toLowerCase();
  let outSt = null;
  try { outSt = await fsp.stat(dest); } catch { /* none yet */ }
  await fsp.mkdir(path.dirname(dest), { recursive: true });

  if (ext !== '.jsonl') {
    if (entry && outSt && entry.srcSize === st.size && entry.srcMtimeMs === st.mtimeMs && outSt.size === entry.outSize) return null;
    const counts = {};
    const out = maskTextFile(await fsp.readFile(src, 'utf8'), ext, counts);
    const tmp = dest + '.parcial';
    await fsp.writeFile(tmp, out);
    await fsp.rename(tmp, dest);
    return { rules: RULES_VERSION, srcSize: st.size, srcMtimeMs: st.mtimeMs, outSize: Buffer.byteLength(out), counts, updatedAt: new Date().toISOString() };
  }

  const headLen = Math.min(65536, st.size);
  let start = 0;
  let base = { counts: {}, lines: 0 };
  if (entry && outSt && outSt.size === entry.outSize && st.size >= entry.offset && entry.headLen <= st.size
      && (await headHash(src, entry.headLen)) === entry.headHash) {
    if (st.size === entry.offset) return null; // same size as last time: nothing new
    start = entry.offset;
    base = entry;
  }
  const counts = {};
  let res;
  if (start === 0) {
    const tmp = dest + '.parcial';
    res = await maskJsonl(src, tmp, 0, st.size, counts);
    await fsp.rename(tmp, dest);
  } else {
    res = await maskJsonl(src, dest, start, st.size, counts);
  }
  if (res.consumed === start && start > 0) return null; // only a half-written line arrived
  const total = { ...base.counts };
  addCounts(total, counts);
  const outSize = (await fsp.stat(dest)).size;
  const hLen = start === 0 ? headLen : entry.headLen;
  return {
    rules: RULES_VERSION, srcSize: st.size, srcMtimeMs: st.mtimeMs, offset: res.consumed, headLen: hLen,
    headHash: start === 0 ? await headHash(src, headLen) : entry.headHash,
    outSize, lines: (start === 0 ? 0 : base.lines || 0) + res.lines, counts: total,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------- discovery
function destFolderName(folder) { return folder.replace(/^-+/, ''); }

async function walkFiles(dir) {
  const out = [];
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkFiles(p)));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

const isArchivable = (f) => f.endsWith('.jsonl') || TEXT_EXT.has(path.extname(f).toLowerCase());

async function collectSources(srcRoot, { transcript, only, limit } = {}) {
  if (transcript) {
    const abs = path.resolve(transcript);
    const rel = path.relative(srcRoot, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return { files: [], skipped: 0 };
    const folder = rel.split(path.sep)[0];
    if (!PROJECT_MATCH.test(folder) || !fs.existsSync(abs)) return { files: [], skipped: 0 };
    const sessDir = abs.replace(/\.jsonl$/, '');
    const extra = (await walkFiles(sessDir)).filter(isArchivable);
    return { files: [{ folder, src: abs }, ...extra.map((src) => ({ folder, src }))], skipped: 0 };
  }
  const folders = (await fsp.readdir(srcRoot, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && PROJECT_MATCH.test(e.name) && (!only || e.name === only))
    .map((e) => e.name).sort();
  const files = [];
  let skipped = 0;
  for (const folder of folders) {
    const all = await walkFiles(path.join(srcRoot, folder));
    for (const src of all) {
      if (isArchivable(src)) files.push({ folder, src });
      else skipped++;
    }
  }
  if (limit) {
    const smallest = [];
    for (const f of files.filter((x) => x.src.endsWith('.jsonl'))) smallest.push({ ...f, size: fs.statSync(f.src).size });
    smallest.sort((a, b) => a.size - b.size);
    return { files: smallest.slice(0, limit), skipped: 0 };
  }
  return { files, skipped };
}

// ---------------------------------------------------------------- manifest, lock, report
function readManifest(destRoot) {
  try { return JSON.parse(fs.readFileSync(path.join(destRoot, 'manifest.json'), 'utf8')); } catch { return { files: {} }; }
}
function writeManifest(destRoot, m) {
  m.totals = {};
  for (const e of Object.values(m.files)) addCounts(m.totals, e.counts || {});
  const p = path.join(destRoot, 'manifest.json');
  fs.writeFileSync(p + '.parcial', JSON.stringify(m, null, 1));
  fs.renameSync(p + '.parcial', p);
}

function takeLock(destRoot) {
  const lock = path.join(destRoot, '.arquivar.lock');
  for (let i = 0; i < 2; i++) {
    try { fs.writeFileSync(lock, String(process.pid), { flag: 'wx' }); return () => { try { fs.unlinkSync(lock); } catch { /* gone */ } }; } catch {
      let pid = 0;
      try { pid = Number(fs.readFileSync(lock, 'utf8')); } catch { /* raced */ }
      let alive = false;
      try { if (pid) { process.kill(pid, 0); alive = true; } } catch { alive = false; }
      if (alive && pid !== process.pid) return null;
      try { fs.unlinkSync(lock); } catch { /* raced */ }
    }
  }
  return null;
}

const LABELS = {
  jwt: 'JWT (eyJ…, inclui chaves anon/service do Supabase)', anthropic: 'Anthropic (sk-ant-…)', openai: 'OpenAI e semelhantes (sk-…)',
  stripe: 'Stripe e semelhantes (sk_/pk_/rk_ live/test, whsec_)', revenuecat: 'RevenueCat (sk_/rk_/appl_/goog_ …)', supabase: 'Supabase (sbp_, sb_secret_)',
  aws: 'AWS (AKIA/ASIA…)', google: 'Google (AIza…, GOCSPX-, ya29., refresh 1//0)', github: 'GitHub/GitLab (ghp_/gho_/github_pat_/glpat-)',
  slack: 'Slack (xox…)', meta: 'Meta/Facebook (EAA…)', expo: 'Expo push token', 'outros-tokens': 'Outros tokens (npm_, hf_, Sentry, Vercel, Resend, Telegram)',
  'private-key': 'Chaves privadas (BEGIN … PRIVATE KEY, conteúdo .p8)', password: 'Senhas (password/senha/--password/frases)',
  bearer: 'Authorization: Bearer/Basic', header: 'Cabeçalhos de chave (apikey, x-api-key …)', cookie: 'Cookies', 'url-param': 'Tokens em endereços (?token=, ?key= …)',
  'connection-string': 'Senha em endereço de banco (postgres://usuario:senha@…)', assignment: 'Valores aleatórios em nomes *_KEY/*_SECRET/*_TOKEN',
  'json-key': 'Valores em campos JSON de segredo (password, token …)', imagem: 'Imagens base64 removidas', binario: 'Blocos binários/base64 removidos (assinaturas, PDFs)',
  conhecido: 'Segredo já identificado, repetido em outro ponto (inclusive sem contexto)', 'frase-token': 'Token citado em frase ("the token is …")',
  'linha-texto': 'Linhas que não eram JSON válido (mascaradas como texto)',
};

function fmtBytes(n) { return n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : (n / 1e6).toFixed(1) + ' MB'; }

function writeReport(destRoot, m, extra = {}) {
  const files = Object.values(m.files);
  const src = files.reduce((a, e) => a + (e.srcSize || 0), 0);
  const out = files.reduce((a, e) => a + (e.outSize || 0), 0);
  const keys = Object.keys(m.totals || {}).sort((a, b) => (m.totals[b] - m.totals[a]));
  const rows = keys.map((k) => `| ${LABELS[k] || k} | \`${k}\` | ${m.totals[k]} |`).join('\n');
  const v = m.verificacao;
  const txt = `# Relatório de segredos ocultados

Gerado por \`codigo/scripts/arquivar-conversas.cjs\` em ${new Date().toISOString()}.
Este relatório contém apenas contagens. Nenhum valor de segredo é gravado aqui.

- Arquivos arquivados: ${files.length}
- Tamanho dos originais lidos: ${fmtBytes(src)}
- Tamanho do arquivo mascarado: ${fmtBytes(out)}
${extra.skipped != null ? `- Arquivos não copiados nesta execução (imagens/PDF soltos de resultados de ferramentas): ${extra.skipped}\n` : ''}
## Substituições por tipo

| Tipo | Código | Quantidade |
|---|---|---|
${rows || '| (nenhuma) | | 0 |'}

## Última verificação

${v ? `${v.at}: ${Object.keys(v.hits).length === 0 ? 'nenhum padrão de segredo encontrado no arquivo (0 ocorrências).' : 'OCORRÊNCIAS ENCONTRADAS: ' + Object.entries(v.hits).map(([k, n]) => k + '=' + n).join(', ')}` : 'ainda não executada (node scripts/arquivar-conversas.cjs --verificar).'}
`;
  fs.writeFileSync(path.join(destRoot, 'SECRETS-REPORT.md'), txt);
}

// ---------------------------------------------------------------- verify
// High-precision patterns only: a hit here means a real secret survived.
const VERIFY = [
  ['jwt', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{4,}/],
  ['anthropic', /sk-ant-[A-Za-z0-9_-]{8,}/],
  ['openai', /(?<![A-Za-z0-9_-])sk-(?:proj-)?[A-Za-z0-9_-]{30,}/],
  ['stripe', /(?<![A-Za-z0-9])(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/],
  ['revenuecat', /(?<![A-Za-z0-9])(?:sk|rk|appl|goog)_[A-Za-z0-9]{20,}/],
  ['supabase', /(?<![A-Za-z0-9])(?:sbp_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_-]{10,})/],
  ['aws', /(?<![A-Z0-9])(?:AKIA|ASIA)[0-9A-Z]{16}(?![A-Z0-9])/],
  ['google', /AIza[0-9A-Za-z_-]{30,}|GOCSPX-[A-Za-z0-9_-]{10,}|ya29\.[A-Za-z0-9_.-]{20,}/],
  ['github', /(?:ghp|gho|ghu|ghs)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/],
  ['slack', /xox[abprs]-[A-Za-z0-9-]{10,}/],
  ['meta', /(?<![A-Za-z0-9])EAA[A-Za-z0-9]{40,}/],
  ['private-key', /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----(?!\[)/],
  ['bearer', /\bBearer\s+(?!\[OCULTO\])[A-Za-z0-9._~+/=-]*[0-9][A-Za-z0-9._~+/=-]{11,}/],
  ['password', /\\*"(?:password|senha)\\*"\s*:\s*\\*"(?!\[OCULTO\])[^"\\]{4,}/i],
];

async function verifyArchive(destRoot) {
  const hits = {};
  for (const h of readManifest(destRoot).conhecidos || []) KNOWN.add(h);
  const knownHits = (text) => { if (!KNOWN.size || !rawHasKnown(text)) return; for (const l of text.split('\n')) if (rawHasKnown(l)) hits.conhecido = (hits.conhecido || 0) + 1; };
  const files = (await walkFiles(destRoot)).filter((f) => isArchivable(f) && !/SECRETS-REPORT\.md$|LEIA-ME\.md$|manifest\.json$/.test(f));
  for (const f of files) {
    const rs = fs.createReadStream(f, { encoding: 'utf8', highWaterMark: 1 << 20 });
    let tail = '';
    for await (const chunk of rs) {
      const text = tail + chunk;
      const cut = text.lastIndexOf('\n');
      const body = cut === -1 ? text : text.slice(0, cut);
      tail = cut === -1 ? '' : text.slice(cut + 1);
      if (cut === -1 && text.length < 4 << 20) { tail = text; continue; }
      knownHits(body);
      for (const [name, re] of VERIFY) {
        const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
        const n = (body.match(g) || []).length;
        if (n) hits[name] = (hits[name] || 0) + n;
      }
    }
    if (tail) knownHits(tail);
    if (tail) for (const [name, re] of VERIFY) {
      const g = new RegExp(re.source, re.flags + 'g');
      const n = (tail.match(g) || []).length;
      if (n) hits[name] = (hits[name] || 0) + n;
    }
  }
  return { files: files.length, hits };
}

// ---------------------------------------------------------------- known-secret pass over the archive
// After a run that learned new secrets, files archived earlier may still hold them bare: rewrite
// only the lines that contain one (parsed and re-masked, so the JSON stays valid).
function maskKnownValue(v, counts) {
  if (typeof v === 'string') return maskKnown(v, counts);
  if (Array.isArray(v)) return v.map((x) => maskKnownValue(x, counts));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = maskKnownValue(v[k], counts); return o; }
  return v;
}

async function rewriteKnown(destRoot, m, log) {
  let changedFiles = 0;
  for (const [key, e] of Object.entries(m.files)) {
    const file = path.join(destRoot, key);
    if (!fs.existsSync(file)) continue;
    const counts = {};
    if (!key.endsWith('.jsonl')) {
      const text = await fsp.readFile(file, 'utf8');
      if (!rawHasKnown(text)) continue;
      let out;
      try { out = JSON.stringify(maskKnownValue(JSON.parse(text), counts), null, 1); } catch { out = maskKnown(text, counts); }
      await fsp.writeFile(file + '.parcial', out);
      await fsp.rename(file + '.parcial', file);
    } else {
      const tmp = file + '.parcial';
      const ws = fs.createWriteStream(tmp);
      const rl = require('node:readline').createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
      for await (const line of rl) {
        let out = line;
        if (rawHasKnown(line)) {
          try { out = JSON.stringify(maskKnownValue(JSON.parse(line), counts)); } catch { out = maskKnown(line, counts); }
        }
        await writeAll(ws, out + '\n');
      }
      await new Promise((res, rej) => { ws.end(); ws.on('finish', res); ws.on('error', rej); });
      if (!counts.conhecido) { await fsp.unlink(tmp); continue; }
      await fsp.rename(tmp, file);
    }
    if (!counts.conhecido) continue;
    e.counts = e.counts || {};
    addCounts(e.counts, counts);
    e.outSize = (await fsp.stat(file)).size;
    changedFiles++;
  }
  if (changedFiles) log(`segredos conhecidos: ${changedFiles} arquivo(s) antigos regravados`);
  return changedFiles;
}

// ---------------------------------------------------------------- run
async function runArchive(opts = {}) {
  const srcRoot = opts.srcRoot || DEFAULT_SRC;
  const destRoot = opts.destRoot || DEFAULT_DEST;
  const log = opts.quiet ? () => {} : (...a) => console.log(...a);
  await fsp.mkdir(destRoot, { recursive: true });
  const release = takeLock(destRoot);
  if (!release) { log('outra execução do arquivo está em andamento; nada feito'); return { processed: 0, locked: true }; }
  try {
    const m = readManifest(destRoot);
    for (const h of m.conhecidos || []) KNOWN.add(h);
    const knownBefore = new Set(KNOWN);
    const { files, skipped } = await collectSources(srcRoot, opts);
    let processed = 0;
    let i = 0;
    for (const { folder, src } of files) {
      i++;
      const rel = path.join(destFolderName(folder), path.relative(path.join(srcRoot, folder), src));
      const key = rel.split(path.sep).join('/');
      const dest = path.join(destRoot, rel);
      const t0 = Date.now();
      let e;
      try { e = await archiveFile(src, dest, m.files[key]); } catch (err) { log(`ERRO ${key}: ${err.message}`); continue; }
      if (!e) continue;
      m.files[key] = e;
      processed++;
      if (e.srcSize > 5e7 || processed % 100 === 0) log(`[${i}/${files.length}] ${key} ${fmtBytes(e.srcSize)} -> ${fmtBytes(e.outSize)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      if (processed % 50 === 0 || e.srcSize > 5e7) writeManifest(destRoot, m);
    }
    if ([...KNOWN].some((h) => !knownBefore.has(h))) await rewriteKnown(destRoot, m, log);
    m.conhecidos = [...KNOWN].sort();
    writeManifest(destRoot, m);
    writeReport(destRoot, m, { skipped: opts.transcript ? null : skipped });
    log(`arquivo: ${processed} arquivo(s) atualizados de ${files.length}`);
    return { processed, total: files.length, skipped };
  } finally { release(); }
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (n) => { const i = argv.indexOf(n); return i === -1 ? undefined : argv[i + 1]; };
  const opts = { srcRoot: arg('--src'), destRoot: arg('--dest'), only: arg('--only'), limit: arg('--limit') ? Number(arg('--limit')) : undefined, transcript: arg('--transcript') };
  if (argv.includes('--hook')) {
    let input = '';
    for await (const c of process.stdin) input += c;
    try { opts.transcript = JSON.parse(input).transcript_path; } catch { return; }
    if (!opts.transcript) return;
    opts.quiet = true;
  }
  if (argv.includes('--verificar')) {
    const destRoot = opts.destRoot || DEFAULT_DEST;
    const v = await verifyArchive(destRoot);
    const m = readManifest(destRoot);
    m.verificacao = { at: new Date().toISOString(), hits: v.hits };
    writeManifest(destRoot, m);
    writeReport(destRoot, m);
    console.log(`verificação: ${v.files} arquivo(s); ocorrências: ${JSON.stringify(v.hits)}`);
    process.exitCode = Object.keys(v.hits).length ? 1 : 0;
    return;
  }
  await runArchive(opts);
}

module.exports = { resetKnown, maskString, maskLine, maskValue, looksRandom, runArchive, verifyArchive, archiveFile, PATTERNS, VERIFY };

if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
