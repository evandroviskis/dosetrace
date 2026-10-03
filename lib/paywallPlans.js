'use strict';
// The paywall's rules (docs/specs/premium-and-auth.md PA-5…PA-22). Pure functions, run
// under node --test. Every price, saving and trial the screen shows comes from the store
// (RevenueCat offerings at runtime) — nothing here invents a number:
//  - the plans are matched by RevenueCat packageType (never the product id: on Android the
//    id carries a base-plan suffix such as "monthly:p1m");
//  - "Save N%" is computed from the real annual and monthly prices of the same storefront,
//    rounded DOWN so it never claims more than the real saving, and hidden when there is none;
//  - a free trial is claimed only when the store says this person can have it (iOS: the
//    eligibility check; Android: Google Play only returns a free phase the user is eligible
//    for) AND its length is known — App Store 3.1.2 wants the length on the button.

const FREE_SCANS_PER_MONTH = 3; // the server (extract-bloodwork) is authoritative; this is the table's label

function pickPackages(pkgs) {
  const list = Array.isArray(pkgs) ? pkgs : [];
  const by = (type) => list.find((p) => p && p.packageType === type && p.product) || null;
  return { annual: by('ANNUAL'), monthly: by('MONTHLY'), lifetime: by('LIFETIME') };
}

// The screen's state for the buy section. Already Premium wins over everything: a paying
// user never sees a buy button (PA-16).
function paywallView({ loading, premium, pkgs }) {
  if (premium) return 'premium';
  if (loading) return 'loading';
  const { annual, monthly, lifetime } = pickPackages(pkgs);
  if (!annual && !monthly && !lifetime) return 'unavailable';
  return 'plans';
}

// Annual vs 12 × monthly, in whole percent, rounded down; null when either price is
// missing/invalid, the currencies differ, or the annual plan saves nothing.
function savingsPct(annual, monthly) {
  const a = annual && annual.product;
  const m = monthly && monthly.product;
  if (!a || !m) return null;
  const pa = Number(a.price);
  const pm = Number(m.price);
  if (!(pa > 0) || !(pm > 0)) return null;
  if (a.currencyCode && m.currencyCode && a.currencyCode !== m.currencyCode) return null;
  const pct = Math.floor((1 - pa / (pm * 12)) * 100 + 1e-9);
  return pct > 0 ? pct : null;
}

function langTag(language) {
  return { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' }[language] || 'en-US';
}

// "$2.42" for the annual plan per month: the store's own string when it has one, else
// computed from the real annual price in its currency (Intl, the app language's format).
function perMonthString(annual, language) {
  const p = annual && annual.product;
  if (!p) return null;
  if (p.pricePerMonthString) return p.pricePerMonthString;
  const price = Number(p.price);
  if (!(price > 0) || !p.currencyCode) return null;
  try {
    return new Intl.NumberFormat(langTag(language), { style: 'currency', currency: p.currencyCode }).format(Math.floor((price / 12) * 100) / 100);
  } catch { return null; }
}

const UNIT_DAYS = { DAY: 1, WEEK: 7 };
const UNIT_MONTHS = { MONTH: 1, YEAR: 12 };

// The free trial for one package: { days } or { months }, or null (no trial claimed).
// eligibility is the iOS map { productId: true|false } or null (unknown / Android). iOS
// "unknown" counts as not eligible on purpose: never claim a trial the store may refuse.
function trialOf(pkg, eligibility, platform) {
  const p = pkg && pkg.product;
  if (!p) return null;
  let unitName = null;
  let n = 0;
  if (platform === 'ios') {
    if (!eligibility || eligibility[p.identifier] !== true) return null;
    const ip = p.introPrice;
    if (!ip || Number(ip.price) !== 0) return null;
    unitName = String(ip.periodUnit || '').toUpperCase();
    n = Number(ip.periodNumberOfUnits) * (Number(ip.cycles) > 0 ? Number(ip.cycles) : 1);
  } else if (platform === 'android') {
    const fp = p.defaultOption && p.defaultOption.freePhase;
    const bp = fp && fp.billingPeriod;
    if (!bp) return null;
    unitName = String(bp.unit || '').toUpperCase();
    n = Number(bp.value) * (Number(fp.billingCycleCount) > 0 ? Number(fp.billingCycleCount) : 1);
  } else return null;
  if (!(n > 0)) return null;
  if (UNIT_DAYS[unitName]) return { days: UNIT_DAYS[unitName] * n };
  if (UNIT_MONTHS[unitName]) return { months: UNIT_MONTHS[unitName] * n };
  return null;
}

// Back-compatible: the trial length in days, or null (a month-long trial is not in days).
function trialDays(pkg, eligibility, platform) {
  const tr = trialOf(pkg, eligibility, platform);
  return tr && tr.days ? tr.days : null;
}

// The ink button and its line under it (PA-9): "Start 7-day free trial" / "Then $28.99
// per year · Cancel anytime", or "Subscribe" / "$28.99 per year · Cancel anytime".
function ctaModel({ selected, pkgs, eligibility, platform, t }) {
  const { annual, monthly } = pickPackages(pkgs);
  const pkg = selected === 'monthly' ? monthly : annual;
  if (!pkg) return null;
  const tr = trialOf(pkg, eligibility, platform);
  const price = `${pkg.product.priceString} ${t(selected === 'monthly' ? 'paywall_per_month' : 'paywall_per_year')}`;
  const title = !tr ? t('paywall_subscribe_now')
    : tr.days ? t('paywall_start_trial_days').replace('{days}', String(tr.days))
      : t('paywall_start_trial_months').replace('{n}', String(tr.months));
  return {
    pkg,
    trial: tr,
    title,
    sub: t(tr ? 'paywall_then_price' : 'paywall_price_cancel').replace('{price}', price),
    legalKey: tr ? 'paywall_legal' : 'paywall_legal_no_trial',
  };
}

// The plan selected when the screen opens: Annual ("Best value") when the store has it.
function defaultPlan(pkgs) {
  const { annual, monthly } = pickPackages(pkgs);
  return annual ? 'annual' : monthly ? 'monthly' : null;
}

// What a purchase ended in. premiumNow = the entitlement helper's answer right after.
function purchaseOutcome(result, premiumNow) {
  if (!result) return 'failed';
  if (result.success) return (result.premium || premiumNow) ? 'premium' : 'pending';
  if (result.cancelled) return 'cancelled';
  if (result.pending) return 'pending'; // Ask to Buy / deferred: held by the store, not failed
  return 'failed';
}

function restoreOutcome(result, premiumNow) {
  if (!result || !result.success) return 'failed';
  return (result.premium || premiumNow) ? 'restored' : 'none';
}

// Lifetime bought while an auto-renewing subscription is still active: the store keeps
// billing it, and the app cannot cancel it — the user must, in the store (PA-74).
function lifetimeCancelNeeded(plan, result) {
  return plan === 'lifetime' && !!(result && result.success) && Array.isArray(result.activeSubscriptions) && result.activeSubscriptions.length > 0;
}

// The DoseTrace sheet for each outcome (PA-12…PA-15). null = nothing to say (a cancelled
// purchase just stays on the plans; a purchase that made the user Premium goes back).
function outcomeSheet(kind, t, platform) {
  switch (kind) {
    case 'restored': return { icon: 'check', title: t('paywall_restored'), body: t('paywall_restored_msg'), done: true };
    case 'none': return { icon: 'alert', title: t('paywall_no_purchases'), body: t('paywall_no_purchases_msg') };
    case 'restore_failed': return { icon: 'alert', title: t('error'), body: t('paywall_restore_failed') };
    case 'failed': return { icon: 'alert', title: t('error'), body: t('paywall_purchase_failed') };
    case 'pending': return { icon: 'clock', title: t('paywall_pending_title'), body: t('paywall_pending_msg') };
    case 'unavailable': return { icon: 'alert', title: t('error'), body: t('paywall_product_unavailable') };
    case 'lifetime_cancel_sub': return { icon: 'alert', title: t('paywall_cancel_sub_title'), body: t('paywall_cancel_sub_msg').replace(/\{store\}/g, storeName(platform)), done: true };
    case 'premium_already': return { icon: 'check', title: t('paywall_already_title'), body: t('paywall_already_msg'), done: true };
    default: return null;
  }
}

// The Free vs Premium table, prototype order (PA-17). free: true = check, false = dash,
// string = the free amount. Premium is a check on every row.
function comparisonRows(t, { freeFoodDays }) {
  return [
    { label: t('paywall_free_feat_1'), free: true },
    { label: t('paywall_free_feat_3'), free: true },
    { label: t('paywall_free_feat_4'), free: true },
    { label: t('paywall_free_feat_5'), free: true },
    { label: t('pw_free_labvax'), free: true },
    { label: t('pw_free_calc'), free: true },
    { label: t('pw_free_sync'), free: true },
    { label: t('nutri_ai_badge'), free: t('pw_free_days').replace('{n}', String(freeFoodDays)) },
    { label: t('paywall_feat_4'), free: false },
    { label: t('pw_scans_row'), free: t('pw_per_month').replace('{n}', String(FREE_SCANS_PER_MONTH)) },
    { label: t('pw_prem_pdf'), free: false },
    { label: t('pw_prem_reality'), free: false },
    { label: t('body_card_dosing_title'), free: false },
  ];
}

// "What's included with Premium" (PA-18): six lines, no scan number (S-24).
function includedLines(t) {
  return [t('paywall_feat_1'), t('paywall_feat_4'), t('pw_prem_scan_full'), t('pw_prem_pdf'), t('pw_prem_reality'), t('body_card_dosing_title')];
}

function storeName(platform) {
  return platform === 'android' ? 'Google Play' : 'Apple ID';
}

module.exports = {
  FREE_SCANS_PER_MONTH, pickPackages, paywallView, savingsPct, perMonthString, trialDays, trialOf,
  ctaModel, defaultPlan, purchaseOutcome, lifetimeCancelNeeded, restoreOutcome, outcomeSheet, comparisonRows,
  includedLines, storeName,
};
