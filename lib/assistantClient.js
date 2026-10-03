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

const FN = 'protocol-assistant';
const devFake = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_ASSISTANT_FAKE === '1';

async function call(body) {
  if (isOnlineNow() === false) return { error: { online: false } };
  try {
    const { data, error } = await supabase.functions.invoke(FN, { body });
    if (!error) return { data };
    const status = error.context && error.context.status;
    let payload = null;
    try { payload = await error.context.clone().json(); } catch { /* no body */ }
    return { error: { status: status == null ? null : status, code: payload && payload.code, limit: payload && payload.limit, resetsAt: payload && payload.resets_at } };
  } catch {
    return { error: { status: null, code: null } };
  }
}

export async function startAssistant(conversationId, door) {
  if (devFake) return { data: { ok: true, remaining: 9 } };
  return call({ action: 'start', conversation_id: conversationId, door });
}

export async function understandAnswer(conversationId, step, text, language, now) {
  const d = now || new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
  if (devFake) {
    const { fakeUnderstand } = require('./assistantDevFake');
    await new Promise((r) => setTimeout(r, 400));
    return { data: { result: fakeUnderstand(step, text) } };
  }
  return call({ action: 'understand', conversation_id: conversationId, step, text, lang: language, today, weekday });
}
