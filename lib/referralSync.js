// The referral code with the app's own pieces plugged in (lib/referralCode.js holds the rules and is
// tested with mocks): AsyncStorage, lib/purchases setCreatorAttributes (RevenueCat), the signed-in
// user's Supabase access token, and the global fetch (read at call time, so lib/bgSafeFetch's
// install is used). Every function here never throws.
//
// flushPendingAttribution({ getAccessToken?, fetch? }) is for App.js: call it after sign-in (once
// RevenueCat is configured with the user, i.e. after initPurchases) and on every app open. It sends
// a referral code still pending to RevenueCat and to the server; resolves 'none' | 'recorded' |
// 'already' | 'refused' | 'pending'.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setCreatorAttributes } from './purchases';
import { supabase } from './supabase';
import * as R from './referralCode';

const netFetch = (url, opts) => globalThis.fetch(url, opts);

export async function sessionAccessToken() {
  try {
    const { data } = await supabase.auth.getSession();
    return (data && data.session && data.session.access_token) || null;
  } catch {
    return null;
  }
}

export function flushPendingAttribution({ getAccessToken = sessionAccessToken, fetch = netFetch } = {}) {
  return R.flushPendingAttribution({ storage: AsyncStorage, setAttributes: setCreatorAttributes, getAccessToken, fetch }).catch(() => 'pending');
}

export function applyReferralCode(raw) {
  return R.applyReferralCode(raw, { storage: AsyncStorage, setAttributes: setCreatorAttributes, fetch: netFetch }).catch(() => ({ ok: false, reason: 'offline' }));
}

export function removeReferralCode() {
  return R.removeReferralCode({ storage: AsyncStorage, setAttributes: setCreatorAttributes }).catch(() => false);
}

export function loadReferralCode() {
  return R.loadReferralCode(AsyncStorage).catch(() => null);
}

export function syncReferralAttributes() {
  return R.syncReferralAttributes({ storage: AsyncStorage, setAttributes: setCreatorAttributes }).catch(() => false);
}
