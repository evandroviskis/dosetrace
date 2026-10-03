// The protocol assistant's use limit (AP-18, founder 2026-10-02: "limitar ajuda a IA por dez
// vezes por semana"): 10 conversations per user per rolling 7 days, on every plan, enforced
// here on the server, separate from the AI scan pool. A use = one conversation started from
// any of the four ways in (the "start" call); the answers inside it are turns, capped per
// conversation so one start can't be stretched into unlimited calls.
// Pure — no Deno imports — so __tests__/assistantServer.test.js runs it under node --test.

export const WEEKLY_LIMIT = 10;
export const WINDOW_MS = 7 * 24 * 3600 * 1000;
export const TURNS_PER_CONVERSATION = 40;
export const CONVERSATION_TTL_MS = 24 * 3600 * 1000;
export const TURNS_PER_DAY = 200; // a hard abuse ceiling across conversations (rolling 24h)

// `store` = this user's usage rows (index.ts backs it with ai_assistant_usage, service role):
//   startsSince(sinceIso)  → [{ id, created_at }] oldest first, or null on an infrastructure error
//   reserveStart()         → the new row's id, or null when the insert failed
//   release(id)            → delete that row
export interface StartStore {
  startsSince(sinceIso: string): Promise<Array<{ id: string | number; created_at: string }> | null>;
  reserveStart(): Promise<string | number | null>;
  release(id: string | number): Promise<void>;
}

export type StartOutcome =
  | { status: 'ok'; remaining: number | null; resetsAt: string | null; counted: boolean }
  | { status: 'refused'; limit: number; resetsAt: string | null };

// When the oldest counted use leaves the 7-day window, a use is free again.
export function resetsAtFrom(rows: Array<{ created_at: string }>, limit = WEEKLY_LIMIT): string | null {
  if (!rows || rows.length < limit) return null;
  const t = Date.parse(rows[rows.length - limit].created_at);
  return Number.isFinite(t) ? new Date(t + WINDOW_MS).toISOString() : null;
}

// Reserve-then-check (the scan budget's A-59 pattern): the row is written first, then this
// request checks its own place among the window's rows, so starts fired together cannot all
// pass on one stale count — exactly `limit` win. Infrastructure errors fail OPEN (a real,
// signed-in user is never blocked by a broken counter; the manual form works regardless).
export async function startConversation(store: StartStore, nowMs: number, limit = WEEKLY_LIMIT): Promise<StartOutcome> {
  const since = new Date(nowMs - WINDOW_MS).toISOString();
  const before = await store.startsSince(since);
  if (before == null) return { status: 'ok', remaining: null, resetsAt: null, counted: false };
  if (before.length >= limit) return { status: 'refused', limit, resetsAt: resetsAtFrom(before, limit) };
  const id = await store.reserveStart();
  if (id == null) return { status: 'ok', remaining: null, resetsAt: null, counted: false };
  const after = await store.startsSince(since);
  if (after) {
    const idx = after.findIndex((r) => String(r.id) === String(id));
    const place = idx >= 0 ? idx : after.length; // not found → behind everyone
    if (place >= limit) {
      await store.release(id).catch(() => {});
      const kept = after.filter((r) => String(r.id) !== String(id));
      return { status: 'refused', limit, resetsAt: resetsAtFrom(kept, limit) };
    }
    return { status: 'ok', remaining: Math.max(0, limit - (place + 1)), resetsAt: null, counted: true };
  }
  return { status: 'ok', remaining: null, resetsAt: null, counted: true };
}

// A turn inside a conversation: allowed only for a conversation this user started (a start
// row exists), less than a day old, under the per-conversation and per-day caps. `known`:
//   started   → the start row's created_at, or null when there is no such conversation
//   turns     → turns already used in this conversation
//   turnsDay  → this user's turns in the last 24 hours
// Any of them undefined = an infrastructure error → allowed (fail open, logged by the caller).
export function turnAllowed(known: { started?: string | null; turns?: number; turnsDay?: number }, nowMs: number):
  { ok: true } | { ok: false; code: 'no_conversation' | 'conversation_expired' | 'turn_limit' } {
  if (known.started === null) return { ok: false, code: 'no_conversation' };
  if (typeof known.started === 'string') {
    const t = Date.parse(known.started);
    if (Number.isFinite(t) && nowMs - t > CONVERSATION_TTL_MS) return { ok: false, code: 'conversation_expired' };
  }
  if (typeof known.turns === 'number' && known.turns >= TURNS_PER_CONVERSATION) return { ok: false, code: 'turn_limit' };
  if (typeof known.turnsDay === 'number' && known.turnsDay >= TURNS_PER_DAY) return { ok: false, code: 'turn_limit' };
  return { ok: true };
}

// The usage table is missing (the function was deployed before the migration): fail CLOSED
// with "not configured" — never a limit-free assistant (senior review 2026-10-03, MED 5).
export function isMissingTable(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  return code === '42P01' || code === 'PGRST205' || /does not exist|could not find the table/i.test(String(err.message || ''));
}

export const isUuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
