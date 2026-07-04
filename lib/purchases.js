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

// Developer accounts — these emails always get premium access
const DEVELOPER_EMAILS = [
  'jootaerre@gmail.com',
];

let _currentUserEmail = null;

function isDevAccount() {
  try {
    return !!(_currentUserEmail && DEVELOPER_EMAILS.includes(_currentUserEmail.toLowerCase()));
  } catch {
    return false;
  }
}

/**
 * Initialize RevenueCat — called from App.js on startup and on SIGNED_IN
 */
export async function initPurchases(userId, email) {
  _currentUserEmail = email || null;
  const key = Platform.OS === 'ios' ? API_KEYS.ios : API_KEYS.android;
  await Purchases.configure({ apiKey: key, appUserID: userId });
}

/**
 * Check if user has active premium access.
 * Never throws — returns false on any error or when the SDK isn't configured.
 */
export async function isPremium() {
  try {
    if (isDevAccount()) return true;
    const configured = await Purchases.isConfigured();
    if (!configured) return false;
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}

/**
 * Reset RevenueCat identity on sign-out. Never throws — Purchases.logOut()
 * rejects when the current user is anonymous or the SDK isn't configured.
 */
export async function logOutPurchases() {
  _currentUserEmail = null;
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
    return { success: true, premium };
  } catch (err) {
    if (err.userCancelled) {
      return { success: false, cancelled: true };
    }
    return { success: false, error: err.message };
  }
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
