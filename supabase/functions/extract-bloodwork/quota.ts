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

// RevenueCat is only asked when the answer changes the outcome: under the free limit
// everyone is allowed, at the Premium limit everyone is refused.
export function needsEntitlementLookup({ count, email }: { count: number; email?: string | null }): boolean {
  if (isPremiumEmail(email)) return false;
  return count >= FREE_SCAN_LIMIT && count < PREMIUM_SCAN_LIMIT;
}

// The decision. `limit` is what the caller reports on a refusal.
//  - unreachable (timeout / 5xx): a paying user must not lose a paid feature over a
//    hiccup → allowed, still capped at the Premium limit;
//  - misconfigured (secret missing / rejected): the free limit for everyone — never
//    the Premium budget for all accounts because of a bad key.
export function decideQuota({ count, email, lookup }: { count: number; email?: string | null; lookup: Lookup }): { allowed: boolean; limit: number } {
  if (count >= PREMIUM_SCAN_LIMIT) return { allowed: false, limit: PREMIUM_SCAN_LIMIT };
  if (isPremiumEmail(email) || lookup === 'active' || lookup === 'unreachable') return { allowed: true, limit: PREMIUM_SCAN_LIMIT };
  return { allowed: count < FREE_SCAN_LIMIT, limit: FREE_SCAN_LIMIT };
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
