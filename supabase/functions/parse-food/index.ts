import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// DoseTrace — AI nutrition parse (build 52). Turns a user's free-text meal
// description into STRUCTURED nutrition estimates. See
// docs/nutrition-logger-conversation-spec.md — this endpoint implements the
// "model output contract" section verbatim.
//
// Regulatory contract (Apple 1.4.1 / SaMD, founder AI hard line):
//   • The model ONLY returns JSON: food items + estimates, a clarify hint, or a
//     refusal. It never returns prose, never advises, never coaches.
//   • Any advice-shaped request -> { refusal: true } and the APP shows a fixed
//     deflection card. The app renders ALL user-facing wording; this endpoint
//     never emits text shown to the user.
//   • raw_text is the user's own meal description — it is NEVER logged
//     server-side (only error codes/counts are).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_TEXT_LENGTH = 2000;      // a day's meals in a sentence or two; not an essay
const DAILY_FOOD_LIMIT = 25;       // abuse ceiling per user per day (premium-gated client-side)

// System rules. The user's meal text arrives as the user message; keeping the
// rules in `system` and the untrusted input in `user` is the injection boundary.
const FOOD_SYSTEM = `You convert a person's description of food and drink THEY have consumed into structured nutrition estimates. You are a parser, not an assistant.

Return ONLY a single JSON object, no prose, no code fences:
{"items":[{"food":string,"qty":number,"unit":string,"kcal":number,"protein_g":number,"carb_g":number,"fat_g":number,"confidence":"low"|"med"|"high"}],"clarify":string|null,"refusal":boolean}

Rules:
- Estimate kcal, protein_g, carb_g, fat_g for each item from typical portions. If a quantity is vague ("some rice"), assume a typical serving and set confidence "low".
- Recognize named brands when given (e.g. Isopure = zero-carb whey isolate).
- "clarify": at most ONE short question about a missing portion/quantity, or null. Never advice.
- Convert comma decimals to points. Numbers only, no ranges inside the JSON.
- You NEVER recommend, suggest, evaluate, praise, or criticize food, diet, calories, or weight. You never mention a goal, target, weight, or health condition. You never use imperative verbs directed at the user. You never connect food to any medication, peptide, hormone, protocol, or supplement's effect.
- If the user asks what/how much to eat, how to lose/gain weight or fat, whether a food is good/bad/healthy, for a meal plan, a target, or any advice or judgment: return {"items":[],"clarify":null,"refusal":true}. Do not answer the question.
- If the message contains no food/drink to log, return {"items":[],"clarify":null,"refusal":false}.`;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const numOrNull = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Missing authorization header', code: 'unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'Invalid session', code: 'unauthorized' }, 401);

    // Per-day quota (abuse ceiling; premium is gated client-side). Fails open.
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    let adminClient: ReturnType<typeof createClient> | null = null;
    if (serviceKey) {
      adminClient = createClient(supabaseUrl, serviceKey);
      const now = new Date();
      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
      const { count, error: countErr } = await adminClient.from('ai_food_usage')
        .select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', dayStart);
      if (countErr) { console.error('[parse-food] quota count failed:', countErr.code, countErr.message); }
      else if (typeof count === 'number' && count >= DAILY_FOOD_LIMIT) {
        return jsonResponse({ error: 'Daily logging limit reached', code: 'quota_exceeded', limit: DAILY_FOOD_LIMIT }, 429);
      }
    }

    let body: { text?: unknown; entry_date?: unknown; lang?: unknown };
    try { body = await req.json(); } catch { return jsonResponse({ error: 'Invalid JSON body', code: 'bad_request' }, 400); }

    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) return jsonResponse({ error: 'Missing text', code: 'bad_request' }, 400);
    if (text.length > MAX_TEXT_LENGTH) return jsonResponse({ error: 'Text too long', code: 'text_too_long' }, 413);
    const entryDate = typeof body?.entry_date === 'string' ? body.entry_date.slice(0, 10) : null;
    const lang = typeof body?.lang === 'string' ? body.lang.slice(0, 2).toLowerCase() : 'en';

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) return jsonResponse({ error: 'Service not configured', code: 'not_configured' }, 500);

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicApiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: FOOD_SYSTEM + `\n\nThe user writes in language code "${lang}"; food names in items may stay in their language.`,
        messages: [{ role: 'user', content: text }],
      }),
    });

    if (!anthropicResponse.ok) {
      // Log status ONLY — never the provider body (it can echo the user's meal text).
      console.error('[parse-food] provider_error', anthropicResponse.status);
      return jsonResponse({ error: 'Parser returned an error', code: 'provider_error', provider_status: anthropicResponse.status }, 502);
    }

    const anthropicData = await anthropicResponse.json();
    const raw = anthropicData?.content?.[0]?.text ?? '';
    const clean = String(raw).replace(/```json|```/g, '').trim();

    let parsed: { items?: unknown; clarify?: unknown; refusal?: unknown };
    try { parsed = JSON.parse(clean); }
    catch { console.error('[parse-food] non_json_output'); return jsonResponse({ error: 'Parser output was not valid JSON', code: 'invalid_parse' }, 502); }

    if (!parsed || typeof parsed !== 'object') return jsonResponse({ error: 'Unexpected shape', code: 'invalid_parse' }, 502);

    // Advice-shaped request -> refusal (the app shows the fixed deflection card).
    if (parsed.refusal === true) {
      return jsonResponse({ refusal: true, items: [], totals: null, clarify: null }, 200);
    }

    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const items = rawItems.map((it: Record<string, unknown>) => ({
      food: typeof it.food === 'string' ? it.food : '',
      qty: numOrNull(it.qty),
      unit: typeof it.unit === 'string' ? it.unit : '',
      kcal: numOrNull(it.kcal),
      protein_g: numOrNull(it.protein_g),
      carb_g: numOrNull(it.carb_g),
      fat_g: numOrNull(it.fat_g),
      confidence: it.confidence === 'high' || it.confidence === 'med' || it.confidence === 'low' ? it.confidence : 'low',
    })).filter((it) => it.food);

    const sum = (k: 'kcal' | 'protein_g' | 'carb_g' | 'fat_g') =>
      items.reduce((a, it) => a + (it[k] ?? 0), 0);
    const totals = items.length
      ? { kcal: Math.round(sum('kcal')), protein_g: Math.round(sum('protein_g')), carb_g: Math.round(sum('carb_g')), fat_g: Math.round(sum('fat_g')) }
      : null;

    const clarify = typeof parsed.clarify === 'string' && parsed.clarify.trim() ? parsed.clarify.trim().slice(0, 200) : null;

    // Record usage for the daily cap (success only).
    if (adminClient) {
      const { error: usageErr } = await adminClient.from('ai_food_usage').insert({ user_id: user.id, entry_date: entryDate });
      if (usageErr) console.error('[parse-food] usage insert failed:', usageErr.code, usageErr.message);
    }

    return jsonResponse({ refusal: false, items, totals, clarify }, 200);
  } catch (err) {
    console.error('[parse-food] internal_error', err?.message);
    return jsonResponse({ error: err.message, code: 'internal_error' }, 500);
  }
});
