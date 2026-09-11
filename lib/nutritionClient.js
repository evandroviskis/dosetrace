// Thin client for the parse-food edge function. Keeps the network shape in one
// place; the component handles offline-first persistence around it. The model
// only ever returns structured data (items/totals/clarify/refusal) — never prose
// — so this helper has nothing free-text to render. See parse-food/index.ts and
// docs/nutrition-logger-conversation-spec.md.

import { supabase } from './supabase';

// Returns a normalized result:
//   { ok:true, refusal, items, totals, clarify }        on 200
//   { ok:false, code, status }                          on any error (offline,
//                                                        quota, provider, auth…)
// The caller saves the raw entry locally regardless (offline-first), then calls
// this; on { ok:false } it leaves parse_status 'pending' to retry later.
export async function parseFood(text, lang, entryDate) {
  try {
    const { data, error } = await supabase.functions.invoke('parse-food', {
      body: { text, lang, entry_date: entryDate },
    });
    if (error) {
      const status = error.context?.status;
      let code = null;
      try { code = (await error.context?.clone?.().json())?.code; } catch { /* body unavailable */ }
      return { ok: false, code, status };
    }
    return {
      ok: true,
      refusal: !!data?.refusal,
      items: Array.isArray(data?.items) ? data.items : [],
      totals: data?.totals || null,
      clarify: typeof data?.clarify === 'string' ? data.clarify : null,
    };
  } catch (e) {
    return { ok: false, code: 'network', status: null };
  }
}
