'use strict';
// One bounded wait for every AI call (S25 2026-11-07, pt: "Montar com IA" stayed on "Lendo sua
// resposta…" over 2 minutes twice and the vial scan on "Lendo o rótulo…" 3 minutes twice; the
// requests never reached Supabase — the phone hung before sending, so the spinner never ended,
// with no error and no way to try again). Every AI invoke of the app goes through invokeAI:
//   lib/assistantClient (protocol-assistant), lib/nutritionClient (parse-food), and the
//   extract-bloodwork scans in ProtocolsScreen (vial label), BodyScreen (lab report) and
//   VaccinesSection (vaccine record).
// The call races a timer, so it ends even when the hang is before the request leaves the phone
// (the session read in front of the fetch) and an abort alone would never fire; the request is
// also aborted, so a fetch that did start is cancelled. A late answer is dropped here: the screen
// has already shown its failure state, and nothing a late reply carries is applied over it.
//
// The limits (each above the longest real answer, so a slow but good answer is not thrown away —
// the server may already have counted it):
//   AI_WAIT_MS 60 s — protocol assistant (the server's own model timeout is 15 s), food parsing
//     (1,024 output tokens) and the vial label (a few fields): a real answer takes seconds, so 60 s
//     only ever ends a hang.
//   AI_DOC_WAIT_MS 120 s — a lab report or a vaccine record (multi-page PDF or photo, up to 8,192
//     output tokens: a long report legitimately takes up to about a minute). It stays under the
//     150 s an edge-function request can last at all, so waiting longer could never bring an answer.
// Pure CommonJS (node --test); `invoke` is injected (supabase.functions.invoke in the app).

const AI_WAIT_MS = 60 * 1000;
const AI_DOC_WAIT_MS = 120 * 1000;
const TIMED_OUT = Symbol('timedOut');

// A failed call → { status, code, body, kind }: kind 'error' (invoke returned an error: the
// server's status and body when there is one, null when the fetch itself failed), 'thrown'
// (invoke threw), 'timeout' (the wait ran out).
async function readError(error) {
  const ctx = error && error.context;
  const status = ctx && typeof ctx.status === 'number' ? ctx.status : null;
  let body = null;
  try { if (ctx && typeof ctx.clone === 'function') body = await ctx.clone().json(); } catch { /* body unavailable */ }
  const code = body && typeof body.code === 'string' ? body.code : null;
  return { status, code, body, kind: 'error' };
}

// invokeAI(invoke, name, body, { ms }) → { data, error: null } | { data: null, error }. Never throws.
// The error body is read inside the same wait (a body that never arrives cannot hang it either).
async function invokeAI(invoke, name, body, opts) {
  const ms = opts && typeof opts.ms === 'number' && opts.ms > 0 ? opts.ms : AI_WAIT_MS;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const work = (async () => {
    const res = await invoke(name, ctrl ? { body, signal: ctrl.signal } : { body });
    if (res && !res.error) return { data: res.data, error: null };
    return { data: null, error: await readError(res && res.error) };
  })().catch(() => ({ data: null, error: { status: null, code: null, body: null, kind: 'thrown' } }));
  let timer = null;
  const wait = new Promise((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), ms); });
  const r = await Promise.race([work, wait]);
  clearTimeout(timer);
  if (r !== TIMED_OUT) return r;
  try { if (ctrl) ctrl.abort(); } catch { /* nothing to cancel */ }
  return { data: null, error: { status: null, code: 'timeout', body: null, kind: 'timeout' } };
}

module.exports = { AI_WAIT_MS, AI_DOC_WAIT_MS, invokeAI };
