// The app side of the protocol-assistant edge function (supabase/functions/protocol-assistant).
// Two calls: start (one use of the weekly limit, AP-18) and understand (one typed answer →
// structured values). Both resolve to { ok } or { error: { status, code, limit, resetsAt,
// online } } — never throw — so the assistant can always fall back to the manual form (AP-16).
//
// Until the function is deployed every call fails and the assistant says it can't connect;
// the manual form works exactly as before. A development-only stand-in (lib/assistantDevFake)
// is used when __DEV__ AND EXPO_PUBLIC_ASSISTANT_FAKE=1 — never in a production build.
import { supabase } from './supabase';
import { isOnlineNow } from './sync';
import { localISO } from './localDate';
import { invokeAI } from './aiWait';

const FN = 'protocol-assistant';
const devFake = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_ASSISTANT_FAKE === '1';

// Every call ends within the shared AI wait (lib/aiWait, 60 s; S25 2026-11-07: "Lendo sua
// resposta…" spun for minutes) and never throws (invokeAI). No answer — the wait ran out, or the
// fetch failed — is { status: null, code: null } → "I can't connect right now" (AP-16); the typed
// text stays in the box for Send again, and a late answer is dropped.
const fnInvoke = (name, opts) => supabase.functions.invoke(name, opts);
async function call(body) {
  if (isOnlineNow() === false) return { error: { online: false } };
  const { data, error } = await invokeAI(fnInvoke, FN, body);
  if (!error) return { data };
  if (error.kind !== 'error') return { error: { status: null, code: null, timedOut: error.kind === 'timeout' } };
  const p = error.body;
  return { error: { status: error.status, code: p && p.code, limit: p && p.limit, resetsAt: p && p.resets_at } };
}

export async function startAssistant(conversationId, door) {
  if (devFake) return { data: { ok: true, remaining: 9 } };
  return call({ action: 'start', conversation_id: conversationId, door });
}

export async function understandAnswer(conversationId, step, text, language, now) {
  const d = now || new Date();
  const today = localISO(d);
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
  if (devFake) {
    const { fakeUnderstand } = require('./assistantDevFake');
    await new Promise((r) => setTimeout(r, 400));
    return { data: { result: fakeUnderstand(step, text) } };
  }
  return call({ action: 'understand', conversation_id: conversationId, step, text, lang: language, today, weekday });
}
