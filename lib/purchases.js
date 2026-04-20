import Purchases from 'react-native-purchases';
import { Platform } from 'react-native';

// RevenueCat API keys
const API_KEYS = {
  ios: 'appl_wEqFhReGUXDBQjgnBvegmxOHSxo',
  android: 'test_BuoiXWkriOrGoipziAiBnUTAcyC',
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
  return _currentUserEmail && DEVELOPER_EMAILS.includes(_currentUserEmail.toLowerCase());
}

/**
 * Initialize RevenueCat — call once in App.js on startup
 */
export async function initPurchases(userId, email) {
  _currentUserEmail = email || null;
  const key = Platform.OS === 'ios' ? API_KEYS.ios : API_KEYS.android;
  await Purchases.configure({ apiKey: key, appUserID: userId });
}

/**
 * Check if user has active premium subscription
 */
export async function isPremium() {
  if (isDevAccount()) return true;
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
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
