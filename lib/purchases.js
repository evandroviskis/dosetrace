import Purchases from 'react-native-purchases';
import { Platform } from 'react-native';

// RevenueCat API keys (public SDK keys — safe to ship in the client).
// android: production Google Play key from RevenueCat "DoseTrace (Play Store)".
const API_KEYS = {
  ios: 'appl_wEqFhReGUXDBQjgnBvegmxOHSxo',
  android: 'goog_YMaiOmLnpkDyUWlIgRMzOdmhCWx',
};

// Product identifiers — must match App Store Connect / Google Play Console
export const PRODUCT_IDS = {
  MONTHLY: 'monthly',
  ANNUAL: 'yearly',
  LIFETIME: 'lifetime',
};

// Entitlement identifier — matches RevenueCat dashboard
const ENTITLEMENT_ID = 'DoseTrace Pro';

// Developer accounts — these emails always get premium access.
// appreview@dosetrace.io is the App Store / Play Store review account so
// reviewers can test paid features without needing sandbox purchases.
const DEVELOPER_EMAILS = [
  'jootaerre@gmail.com',
  'hello@dosetrace.io',
  'appreview@dosetrace.io',
  'victor.s.engenharia@gmail.com',
  'jootaerre@yahoo.com.br',
  'jeovane_m@live.com',
];

let _currentUserEmail = null;

function isDevAccount() {
  try {
    const normalized = (_currentUserEmail || '').trim().toLowerCase();
    const isDev = !!(normalized && DEVELOPER_EMAILS.includes(normalized));
    if (__DEV__) {
      console.log('[purchases] isDevAccount check', {
        rawEmail: _currentUserEmail,
        normalized,
        whitelist: DEVELOPER_EMAILS,
        isDev,
      });
    }
    return isDev;
  } catch {
    return false;
  }
}

/**
 * Initialize RevenueCat — called from App.js on startup and on SIGNED_IN
 */
// The RevenueCat app user id (= the Supabase user id) the SDK is configured with —
// lib/entitlement.js keys its offline cache on it (never on a network session call).
let _currentUserId = null;
export function currentPurchasesUserId() { return _currentUserId; }

export async function initPurchases(userId, email) {
  _currentUserEmail = email || null;
  _currentUserId = userId || null;
  if (__DEV__) {
    console.log('[purchases] initPurchases called', { userId, email, _currentUserEmail });
  }
  const key = Platform.OS === 'ios' ? API_KEYS.ios : API_KEYS.android;
  await Purchases.configure({ apiKey: key, appUserID: userId });
}

/**
 * The store's LIVE answer — only lib/entitlement.js calls this; every Premium gate asks
 * that helper (S-06 / FX-16). { reachable, premium, expiresAt (ISO, null = lifetime),
 * endedOn (local day Premium ended, if it did) }. reachable:false when the SDK isn't
 * configured or the call failed. Never throws.
 */
export async function readLiveEntitlement() {
  try {
    if (isDevAccount()) return { reachable: true, premium: true, expiresAt: null, endedOn: null };
    const configured = await Purchases.isConfigured();
    if (!configured) return { reachable: false };
    const customerInfo = await Purchases.getCustomerInfo();
    const active = customerInfo.entitlements.active[ENTITLEMENT_ID];
    if (active !== undefined) return { reachable: true, premium: true, expiresAt: active.expirationDate || null, endedOn: null };
    const exp = customerInfo.entitlements.all?.[ENTITLEMENT_ID]?.expirationDate;
    const d = exp ? new Date(exp) : null;
    if (!d || isNaN(d.getTime())) return { reachable: true, premium: false, expiresAt: null, endedOn: null };
    const p2 = (n) => (n < 10 ? '0' + n : '' + n);
    return { reachable: true, premium: false, expiresAt: exp, endedOn: d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) };
  } catch {
    return { reachable: false };
  }
}

/**
 * Reset RevenueCat identity on sign-out. Never throws — Purchases.logOut()
 * rejects when the current user is anonymous or the SDK isn't configured.
 */
export async function logOutPurchases() {
  _currentUserEmail = null;
  _currentUserId = null;
  try {
    const configured = await Purchases.isConfigured();
    if (!configured) return;
    await Purchases.logOut();
  } catch {
    // ignore — nothing to log out of
  }
}

/**
 * Check trial/introductory-price eligibility for the given product ids.
 * iOS-only API: returns { [productId]: boolean } on iOS, or null on
 * Android / error / unconfigured SDK (treat null as "unknown").
 */
export async function checkTrialEligibility(productIds) {
  if (Platform.OS !== 'ios') return null;
  try {
    const configured = await Purchases.isConfigured();
    if (!configured) return null;
    const result = await Purchases.checkTrialOrIntroductoryPriceEligibility(productIds);
    const ELIGIBLE = Purchases.INTRO_ELIGIBILITY_STATUS?.INTRO_ELIGIBILITY_STATUS_ELIGIBLE ?? 2;
    const eligibility = {};
    for (const id of productIds) {
      eligibility[id] = result?.[id]?.status === ELIGIBLE;
    }
    return eligibility;
  } catch {
    return null;
  }
}

/**
 * Get available packages (monthly, annual, single bloodwork)
 */
export async function getOfferings() {
  try {
    const offerings = await Purchases.getOfferings();
    if (offerings.current) {
      return offerings.current.availablePackages;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Purchase a package (subscription or consumable)
 */
export async function purchasePackage(pkg) {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const premium = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    // Auto-renewing subscriptions still running (a Lifetime bought on top keeps billing
    // until the user cancels it in the store — the paywall says so, PA-74).
    // Only the ones that will renew: a subscription already cancelled but not yet expired is
    // still "active" in RevenueCat, and needs no cancelling (Gate B re-review).
    const activeSubscriptions = (Array.isArray(customerInfo.activeSubscriptions) ? customerInfo.activeSubscriptions : [])
      .filter((id) => customerInfo.subscriptionsByProductIdentifier?.[id]?.willRenew !== false);
    return { success: true, premium, activeSubscriptions };
  } catch (err) {
    if (err.userCancelled) {
      return { success: false, cancelled: true };
    }
    // Ask to Buy / a deferred payment: the store holds the purchase for approval. It is
    // not a failure — saying "Purchase failed" invites a second purchase (journey review
    // 2026-10-03). RevenueCat PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR = "20".
    if (isPendingError(err)) return { success: false, pending: true };
    return { success: false, error: err.message };
  }
}

export function isPendingError(err) {
  const pendingCode = Purchases.PURCHASES_ERROR_CODE?.PAYMENT_PENDING_ERROR ?? '20';
  return !!err && (String(err.code) === String(pendingCode) || err.readableErrorCode === 'PAYMENT_PENDING_ERROR' || err.userInfo?.readableErrorCode === 'PAYMENT_PENDING_ERROR');
}

/**
 * Restore previous purchases (required by Apple)
 */
export async function restorePurchases() {
  try {
    const customerInfo = await Purchases.restorePurchases();
    const premium = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    return { success: true, premium };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
