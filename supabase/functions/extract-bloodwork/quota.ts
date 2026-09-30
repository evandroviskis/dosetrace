// Monthly AI-scan budget (S-23 / FX-19). Lab reports, vaccine cards and vial labels
// share ONE budget per user per calendar month (UTC): 3 for free accounts, 20 for
// Premium. Pure — no Deno imports — so it also runs under plain node --test
// (__tests__/scanQuota.test.js). The caller (index.ts) counts the rows and applies this.
//
// Who is Premium is decided HERE, on the server, by asking RevenueCat with a secret
// key that lives only in Supabase Edge Function secrets (REVENUECAT_SECRET_KEY).
// The client's own idea of Premium is never trusted for a paid call.

export const FREE_SCAN_LIMIT = 3;
export const PREMIUM_SCAN_LIMIT = 20;

// RevenueCat entitlement identifier (unchanged by the Pro → Premium rename).
export const ENTITLEMENT_ID = 'DoseTrace Pro';

// Accounts the app itself treats as Premium without a purchase — the same list as
// lib/purchases.js DEVELOPER_EMAILS (a test keeps the two identical). Includes the
// App Store / Play review demo account, so reviewers get the Premium budget.
export const PREMIUM_EMAILS = [
  'jootaerre@gmail.com',
  'hello@dosetrace.io',
  'appreview@dosetrace.io',
  'victor.s.engenharia@gmail.com',
  'jootaerre@yahoo.com.br',
  'jeovane_m@live.com',
];

export type Lookup = 'active' | 'inactive' | 'unreachable' | 'misconfigured' | 'skipped';

function isPremiumEmail(email: string | null | undefined): boolean {
  return !!email && PREMIUM_EMAILS.includes(String(email).trim().toLowerCase());
}

// RevenueCat REST v1 GET /subscribers/{id} → body.subscriber.entitlements[id].
// Active = no expiry (lifetime) or an expiry / billing-grace date still in the future.
export function entitlementActive(body: any, nowMs: number): boolean {
  const ent = body && body.subscriber && body.subscriber.entitlements && body.subscriber.entitlements[ENTITLEMENT_ID];
  if (!ent || typeof ent !== 'object') return false;
  if (ent.expires_date == null) return true;
  const ends = [ent.expires_date, ent.grace_period_expires_date]
    .map((d: unknown) => (typeof d === 'string' ? Date.parse(d) : NaN))
    .filter((t: number) => Number.isFinite(t));
  return ends.some((t: number) => t > nowMs);
}

// RevenueCat is only asked when the answer matters: under the free limit everyone is
// allowed. From there on the tier decides both the outcome and the limit the user is told.
export function needsEntitlementLookup({ count, email }: { count: number; email?: string | null }): boolean {
  if (isPremiumEmail(email)) return false;
  return count >= FREE_SCAN_LIMIT;
}

// The decision. `limit` is what the caller reports on a refusal.
//  - unreachable (timeout / 5xx): a paying user must not lose a paid feature over a
//    hiccup → allowed, still capped at the Premium limit;
//  - misconfigured (secret missing / rejected): the free limit for everyone — never
//    the Premium budget for all accounts because of a bad key.
export function decideQuota({ count, email, lookup }: { count: number; email?: string | null; lookup: Lookup }): { allowed: boolean; limit: number } {
  const premium = isPremiumEmail(email) || lookup === 'active' || lookup === 'unreachable';
  const limit = premium ? PREMIUM_SCAN_LIMIT : FREE_SCAN_LIMIT;
  return { allowed: count < limit, limit };
}

// Ask RevenueCat whether this user (RevenueCat app user id = the Supabase user id,
// lib/purchases.js initPurchases) has the entitlement. Never throws.
export async function lookupEntitlement({ fetchFn, secret, userId, nowMs, timeoutMs = 4000 }: {
  fetchFn: (url: string, init: any) => Promise<any>; secret: string | null | undefined; userId: string; nowMs: number; timeoutMs?: number;
}): Promise<Lookup> {
  if (!secret) return 'misconfigured';
  let timer: any = null;
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (ctrl) timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetchFn(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!res) return 'unreachable';
    if (res.status === 401 || res.status === 403) return 'misconfigured';
    // Rate-limited: not a free pass (flooding the endpoint could induce it) — treated as
    // not Premium for this request; a paying user simply retries.
    if (res.status === 429) return 'inactive';
    if (!res.ok) return 'unreachable';
    const body = await res.json();
    return entitlementActive(body, nowMs) ? 'active' : 'inactive';
  } catch {
    return 'unreachable';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── Reserving the budget (A-59) ─────────────────────────────────────────────
// The usage row is written BEFORE the AI call and each request then checks its own
// position among this month's rows, so requests fired together cannot all pass on
// the same stale count: exactly `limit` of them win. A failed extraction releases
// its row (a bad photo never costs a scan).
//
// `store` is the month's usage for ONE user (index.ts backs it with ai_scan_usage
// through the service role):
//   count()      → rows this month, or null on an infrastructure error
//   reserve()    → id of the new row, or null when the insert failed
//   list(n)      → ids of the first n rows this month, oldest first, or null on error
//   release(id)  → delete that row
// Infrastructure errors keep the old rule: a real, authenticated user is never
// blocked by a failing count / insert (the scan runs uncounted and is logged).
export interface ScanStore {
  count(): Promise<number | null>;
  reserve(): Promise<string | number | null>;
  list(limit: number): Promise<Array<string | number> | null>;
  release(id: string | number): Promise<void>;
}

export type BudgetOutcome<T> =
  | { status: 'refused'; limit: number }
  | { status: 'done'; response: T }
  | { status: 'failed'; response: T };

export async function withScanBudget<T>({ store, email, lookup, work }: {
  store: ScanStore;
  email?: string | null;
  lookup: () => Promise<Lookup>; // asks RevenueCat; called at most once, only when it matters
  work: () => Promise<{ ok: boolean; response: T }>;
}): Promise<BudgetOutcome<T>> {
  const finish = (r: { ok: boolean; response: T }): BudgetOutcome<T> =>
    (r.ok ? { status: 'done', response: r.response } : { status: 'failed', response: r.response });

  let known: Lookup = 'skipped';
  const decideAt = async (count: number) => {
    if (known === 'skipped' && needsEntitlementLookup({ count, email })) known = await lookup();
    return decideQuota({ count, email, lookup: known });
  };

  // 1. Cheap early refusal on the current count.
  const count = await store.count();
  if (count == null) return finish(await work()); // count failed → old rule (uncounted)
  const first = await decideAt(count);
  if (!first.allowed) return { status: 'refused', limit: first.limit };

  // 2. Reserve, then decide again on how many rows are AHEAD of this one.
  const id = await store.reserve();
  if (id == null) return finish(await work()); // insert failed → old rule (uncounted)
  let outcome: BudgetOutcome<T>;
  try {
    const ids = await store.list(PREMIUM_SCAN_LIMIT);
    if (ids) {
      const idx = ids.findIndex((x) => String(x) === String(id));
      const ahead = idx >= 0 ? idx : PREMIUM_SCAN_LIMIT; // not among the first 20 → over every limit (the tier still sets the limit reported)
      const second = await decideAt(ahead);
      if (!second.allowed) {
        await store.release(id);
        return { status: 'refused', limit: second.limit };
      }
    }
    // 3. The paid work. Anything but success gives the reservation back.
    outcome = finish(await work());
  } catch (err) {
    await store.release(id).catch(() => {});
    throw err;
  }
  if (outcome.status === 'failed') await store.release(id).catch(() => {});
  return outcome;
}
