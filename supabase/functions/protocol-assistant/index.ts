import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SYSTEM, userMessage } from './prompt.ts';
import { validateUnderstanding, OUTPUT_SCHEMA, STEPS, MAX_TEXT } from './schema.ts';
import { startConversation, turnAllowed, isUuid, WINDOW_MS } from './budget.ts';

// DoseTrace — AI protocol assistant (docs/specs/ai-protocol-assistant.md, signed 2026-10-02).
//
// Two actions, both for a signed-in user only:
//   start      { conversation_id, door }  → counts one use (10 per rolling 7 days, AP-18)
//   understand { conversation_id, step, text, lang, today, weekday }
//              → the user's ONE typed answer as structured values for that question
//
// Regulatory contract (Apple 1.4.1 / SaMD, the founder's AI hard line):
//   • The model returns JSON data only (structured outputs + the strict schema in schema.ts,
//     applied again on the phone). It never writes a sentence for the screen (AP-14).
//   • Every quantity is the user's own number token copied from their text (AP-2); the app
//     does the arithmetic. The compound is the user's own words (AP-6).
//   • Advice-seeking answers come back as intent "advice"; the app shows its fixed
//     deflection (AP-3). Nothing else from the model is shown.
//   • The user's text is never logged. The key lives only in Supabase secrets.

const MODEL = 'claude-haiku-4-5';
const MODEL_TIMEOUT_MS = 15000;
const DOORS = new Set(['build', 'finish', 'dose', 'fit']);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed', code: 'bad_request' }, 405);
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header', code: 'unauthorized' }, 401);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Invalid session', code: 'unauthorized' }, 401);

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body', code: 'bad_request' }, 400); }
    const action = body?.action;
    const conversationId = body?.conversation_id;
    if (!isUuid(conversationId)) return json({ error: 'Missing conversation', code: 'bad_request' }, 400);

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const admin = serviceKey ? createClient(supabaseUrl, serviceKey) : null;
    const nowMs = Date.now();

    // ── start: one use of the weekly limit ──────────────────────────────────
    if (action === 'start') {
      const door = typeof body.door === 'string' && DOORS.has(body.door) ? body.door : 'build';
      if (!admin) return json({ ok: true, remaining: null }, 200); // fail open (counter unavailable)
      // A retried start for the same conversation never counts twice.
      const { data: existing, error: exErr } = await admin.from('ai_assistant_usage').select('id')
        .eq('user_id', user.id).eq('conversation_id', conversationId).eq('kind', 'start').limit(1);
      if (!exErr && existing && existing.length) return json({ ok: true, remaining: null }, 200);
      const outcome = await startConversation({
        async startsSince(sinceIso) {
          const { data, error } = await admin.from('ai_assistant_usage').select('id, created_at')
            .eq('user_id', user.id).eq('kind', 'start').gte('created_at', sinceIso)
            .order('created_at', { ascending: true }).order('id', { ascending: true });
          if (error) { console.error('[protocol-assistant] count failed:', error.code); return null; }
          return data || [];
        },
        async reserveStart() {
          const { data, error } = await admin.from('ai_assistant_usage')
            .insert({ user_id: user.id, conversation_id: conversationId, kind: 'start', door }).select('id').single();
          if (error) { console.error('[protocol-assistant] reserve failed:', error.code); return null; }
          return data?.id ?? null;
        },
        async release(id) { await admin.from('ai_assistant_usage').delete().eq('id', id); },
      }, nowMs);
      if (outcome.status === 'refused') {
        return json({ error: 'Weekly limit reached', code: 'quota_exceeded', limit: outcome.limit, resets_at: outcome.resetsAt }, 429);
      }
      return json({ ok: true, remaining: outcome.remaining }, 200);
    }

    // ── understand: one typed answer → structured values ────────────────────
    if (action !== 'understand') return json({ error: 'Unknown action', code: 'bad_request' }, 400);
    const step = typeof body.step === 'string' && STEPS.includes(body.step) ? body.step : null;
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!step || !text) return json({ error: 'Missing step or text', code: 'bad_request' }, 400);
    if (text.length > MAX_TEXT) return json({ error: 'Text too long', code: 'text_too_long' }, 413);
    const lang = typeof body.lang === 'string' ? body.lang.slice(0, 2).toLowerCase() : 'en';
    const today = typeof body.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : null;
    const weekday = typeof body.weekday === 'string' && /^[A-Za-z]{3,9}$/.test(body.weekday) ? body.weekday : null;

    if (admin) {
      const daySince = new Date(nowMs - 24 * 3600 * 1000).toISOString();
      const [startRes, turnsRes, dayRes] = await Promise.all([
        admin.from('ai_assistant_usage').select('created_at').eq('user_id', user.id).eq('conversation_id', conversationId).eq('kind', 'start')
          .gte('created_at', new Date(nowMs - WINDOW_MS).toISOString()).limit(1),
        admin.from('ai_assistant_usage').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('conversation_id', conversationId).eq('kind', 'turn'),
        admin.from('ai_assistant_usage').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('kind', 'turn').gte('created_at', daySince),
      ]);
      const verdict = turnAllowed({
        started: startRes.error ? undefined : (startRes.data && startRes.data[0] ? startRes.data[0].created_at : null),
        turns: turnsRes.error ? undefined : (turnsRes.count ?? undefined),
        turnsDay: dayRes.error ? undefined : (dayRes.count ?? undefined),
      }, nowMs);
      if (startRes.error || turnsRes.error || dayRes.error) console.error('[protocol-assistant] turn count failed');
      if (!verdict.ok) return json({ error: 'Conversation not available', code: verdict.code }, verdict.code === 'turn_limit' ? 429 : 403);
      const { error: insErr } = await admin.from('ai_assistant_usage').insert({ user_id: user.id, conversation_id: conversationId, kind: 'turn' });
      if (insErr) console.error('[protocol-assistant] turn insert failed:', insErr.code);
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'Service not configured', code: 'not_configured' }, 500);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), MODEL_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 400,
          system: SYSTEM + `\n\nThe person writes in language code "${lang}".`,
          messages: [{ role: 'user', content: userMessage(step, text, today, weekday) }],
          output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
        }),
      });
    } catch {
      console.error('[protocol-assistant] provider_unreachable');
      return json({ error: 'AI service unreachable', code: 'provider_error' }, 502);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      console.error('[protocol-assistant] provider_error', res.status); // status only, never the body
      return json({ error: 'AI service error', code: 'provider_error', provider_status: res.status }, 502);
    }
    const data = await res.json();
    if (data?.stop_reason === 'refusal') return json({ result: { intent: 'unclear' } }, 200);
    const block = Array.isArray(data?.content) ? data.content.find((b: { type?: string }) => b?.type === 'text') : null;
    let raw: unknown = null;
    try { raw = JSON.parse(String(block?.text ?? '').replace(/```json|```/g, '').trim()); }
    catch { console.error('[protocol-assistant] non_json_output'); return json({ result: { intent: 'unclear' } }, 200); }
    // Only the validated, closed shape leaves the server (the app validates it again).
    return json({ result: validateUnderstanding(step, raw, text) }, 200);
  } catch (err) {
    console.error('[protocol-assistant] internal_error', (err as Error)?.message);
    return json({ error: 'Internal error', code: 'internal_error' }, 500);
  }
});

