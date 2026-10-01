// Thin client for the parse-food edge function. Keeps the network shape in one
// place; the component handles offline-first persistence around it. The model
// only ever returns structured data (items/totals/ask/refusal) — never prose —
// so this helper has nothing free-text to render. See parse-food/index.ts and
// docs/specs/food-log.md.

import { supabase } from './supabase';

// The live food parser (v9). S-11 / RL-1: the test copy parse-food-next is retired.
export const FOOD_FN = 'parse-food';

const ASK_KINDS = ['amount', 'brand', 'size', 'preparation', 'identity'];

// The parser's structured follow-up (FL-10): which item, what kind of detail,
// up to 4 short answer options. The APP writes the question (FL-16).
function cleanAsk(a, itemCount) {
  if (!a || typeof a !== 'object') return null;
  const item = Number.isInteger(a.item) && a.item >= 0 && a.item < itemCount ? a.item : null;
  const kind = ASK_KINDS.includes(a.kind) ? a.kind : null;
  if (item == null || !kind) return null;
  const options = Array.isArray(a.options) ? a.options.filter((o) => typeof o === 'string' && o.trim()).map((o) => o.trim().slice(0, 40)).slice(0, 4) : [];
  return { item, kind, options };
}

async function invoke(body) {
  try {
    const { data, error } = await supabase.functions.invoke(FOOD_FN, { body });
    if (error) {
      const status = error.context?.status;
      let code = null;
      try { code = (await error.context?.clone?.().json())?.code; } catch { /* body unavailable */ }
      return { ok: false, code, status };
    }
    const items = Array.isArray(data?.items) ? data.items : [];
    return {
      ok: true,
      refusal: !!data?.refusal,
      items,
      totals: data?.totals || null,
      ask: cleanAsk(data?.ask, items.length),
      // When the user said they ate it ("3 days ago" → 3); null = the day typed.
      daysAgo: typeof data?.days_ago === 'number' && data.days_ago > 0 ? data.days_ago : null,
    };
  } catch (e) {
    return { ok: false, code: 'network', status: null };
  }
}

// Returns a normalized result:
//   { ok:true, refusal, items, totals, ask, daysAgo }   on 200
//   { ok:false, code, status }                          on any error (offline,
//                                                        quota, provider, auth…)
// The caller saves the raw entry locally regardless (offline-first), then calls
// this; on { ok:false } it leaves parse_status 'pending' to retry later.
// recent: today's earlier items [{food, qty, unit, kcal}] so "another one"
// resolves (FL-14).
export function parseFood(text, lang, entryDate, recent) {
  const body = { text, lang, entry_date: entryDate };
  if (Array.isArray(recent) && recent.length) body.recent = recent.slice(-12);
  return invoke(body);
}

// Follow-up answer (FL-10/21/26): returns exactly one corrected item in `items`.
// Does not count toward the 25/day parse limit (the server has its own cap).
export function parseFollowup(item, kind, answer, lang, entryDate) {
  return invoke({ followup: { item, kind, answer }, entry_date: entryDate, lang });
}
