'use strict';
// The entry offer shown right after account creation (screens/EntryOfferScreen; picture
// docs/design/onboarding-offer.html, PT version 3 + the founder's changes of 2026-11-20).
// Pure functions, run under node --test (__tests__/entryOffer.test.js).
//
// Every price comes from the store (RevenueCat offerings): the paid introductory price is the
// "offer" (lib/paywallPlans introOf), the regular price is the product price. Nothing here
// invents a number — except the __DEV__-only sample preview, which needs an explicit dev flag
// (=== true), is labelled on screen and can never be bought (pkg: null).
//
// A free trial never appears on this screen (founder 2026-11-20 02:03: the 7-day trial leaves
// both stores). A plan the store would give this person with a free trial, or an intro the copy
// cannot state truthfully (several billing cycles, not cheaper, another currency), is left off
// the screen — "Ver todos os planos" still leads to the paywall, which explains trials.

const { pickPackages, trialOf, introOf, storeName, langTag, FREE_SCANS_PER_MONTH } = require('./paywallPlans');
const { formatDate } = require('./localeFormat');
const { FREE_DAYS } = require('./foodThread');

// The free plan's protocol count shown in "Grátis e Premium" is the account's own (lib/freePlan,
// OB-28: 1 for a new account, 3 for one made before the rule — the 15-day builder's accounts, OB-26).
const { shownLimit, FREE_PROTOCOLS_NEW_ACCOUNT } = require('./freePlan');

// The billing period of each RevenueCat package type, in months.
const PERIOD_MONTHS = { MONTHLY: 1, TWO_MONTH: 2, THREE_MONTH: 3, SIX_MONTH: 6, ANNUAL: 12 };

// The approved R$ values of the picture (2026-11-20), for the __DEV__ preview only.
const SAMPLE = {
  currency: 'BRL',
  threeMonth: { regular: 39.9, intro: 19.9 },
  annual: { regular: 149.9, intro: 119.9 },
};

function money(amount, currency, language) {
  if (!(Number(amount) >= 0) || !currency) return null;
  try { return new Intl.NumberFormat(langTag(language), { style: 'currency', currency }).format(amount); } catch { return null; }
}

// today + n months, clamped to the last day of the target month (Nov 30 + 3 → Feb 28), as the
// stores bill. Local calendar; the time of day is kept.
function addMonths(date, n) {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const following = d.getMonth() + 1;
  const last = new Date(d.getFullYear(), following, 0).getDate(); // day 0 of the next month = the last day
  d.setDate(Math.min(day, last));
  return d;
}

// One word set per number of months: 1, 12, or n.
function byMonths(t, m, one, year, many) {
  if (m === 12) return t(year);
  if (m === 1) return t(one);
  return t(many).replace('{n}', String(m));
}
const first = (t, m) => byMonths(t, m, 'eo_first_month', 'eo_first_year', 'eo_first_months');
const inFirst = (t, m) => byMonths(t, m, 'eo_in_first_month', 'eo_in_first_year', 'eo_in_first_months');
const forFirst = (t, m) => byMonths(t, m, 'eo_for_first_month', 'eo_for_first_year', 'eo_for_first_months');
const heroTitle = (t, m) => byMonths(t, m, 'eo_hero_month', 'eo_hero_year', 'eo_hero_months');
const per = (t, p) => byMonths(t, p, 'eo_per_month', 'eo_per_year', 'eo_per_months');
const every = (t, p) => byMonths(t, p, 'eo_every_month', 'eo_every_year', 'eo_every_months');
const slash = (t, p) => byMonths(t, p, 'eo_slash_month', 'eo_slash_year', 'eo_slash_months');

// Packages in the store's own shapes with the sample prices, so the sample goes through the
// same readers as the real thing.
function samplePackages(platform, language) {
  const c = SAMPLE.currency;
  const mk = (type, id, months, v) => {
    const product = { identifier: id, price: v.regular, priceString: money(v.regular, c, language), currencyCode: c };
    if (platform === 'android') {
      const unit = months === 12 ? 'YEAR' : 'MONTH';
      const value = months === 12 ? 1 : months;
      product.defaultOption = { freePhase: null, introPhase: { price: { formatted: money(v.intro, c, language), amountMicros: Math.round(v.intro * 1e6), currencyCode: c }, billingPeriod: { unit, value }, billingCycleCount: 1 } };
    } else {
      product.introPrice = { price: v.intro, priceString: money(v.intro, c, language), cycles: 1, periodUnit: months === 12 ? 'YEAR' : 'MONTH', periodNumberOfUnits: months === 12 ? 1 : months };
    }
    return { packageType: type, identifier: id, product };
  };
  return {
    pkgs: [mk('THREE_MONTH', 'sample_three_month', 3, SAMPLE.threeMonth), mk('ANNUAL', 'sample_annual', 12, SAMPLE.annual)],
    eligibility: { sample_three_month: true, sample_annual: true },
  };
}

// One plan as the screen can state it, or null (left off the screen).
function planOf(key, pkg, eligibility, platform) {
  const p = pkg && pkg.product;
  const periodMonths = pkg && PERIOD_MONTHS[pkg.packageType];
  if (!p || !periodMonths) return null;
  const amount = Number(p.price);
  if (!(amount > 0) || !p.priceString) return null;
  if (trialOf(pkg, eligibility, platform)) return null; // never a free trial on this screen
  const intro = introOf(pkg, eligibility, platform);
  if (intro) {
    if (intro.cycles !== 1) return null; // "R$ 19,90 nos 3 primeiros meses" must be one payment
    if (!(intro.amount < amount)) return null;
    if (intro.currencyCode && p.currencyCode && intro.currencyCode !== p.currencyCode) return null;
  }
  return { key, pkg, periodMonths, amount, priceString: p.priceString, currencyCode: p.currencyCode || null, intro };
}

// Founder 2026-11-20: does the store still give this person an intro price on a plan this screen can
// sell? (The limit sheets open the offer then, else the paywall.) Same readers as the screen.
function offerAvailable({ pkgs, eligibility, platform }) {
  const { threeMonth, annual, monthly } = pickPackages(Array.isArray(pkgs) ? pkgs : []);
  return [threeMonth || monthly, annual].some((pk) => { const pl = pk ? planOf('x', pk, eligibility, platform) : null; return !!(pl && pl.intro); });
}

/**
 * Everything the entry offer shows, for the selected plan.
 * { sample, sampleLabel, plans: [card], selected, pkg, hero, timeline: [{ when, text }], renewal, cta }
 * plans is empty (and pkg null) when the store has nothing this screen can sell.
 * dev: only `true` (the screen passes __DEV__) turns on the sample preview, and only when the
 * store has no 3-month package.
 */
function offerModel({ pkgs, eligibility, platform, language, t, now = new Date(), dev = false, selected = null }) {
  let list = pkgs;
  let elig = eligibility;
  let sample = false;
  if (dev === true && !pickPackages(pkgs).threeMonth) {
    const s = samplePackages(platform, language);
    list = s.pkgs;
    elig = s.eligibility;
    sample = true;
  }
  const { threeMonth, annual, monthly } = pickPackages(list);
  const short = threeMonth ? ['threeMonth', threeMonth] : ['monthly', monthly];
  const plans0 = [short, ['annual', annual]].map(([k, pk]) => planOf(k, pk, elig, platform)).filter(Boolean);
  const base = { sample, sampleLabel: sample ? t('eo_sample_label') : null };
  if (!plans0.length) return { ...base, plans: [], selected: null, pkg: null, hero: null, timeline: [], renewal: null, cta: null };

  const plans = plans0.map((pl) => {
    const offer = !!pl.intro;
    let equiv = null;
    if (pl.key === 'annual') {
      const other = plans0.find((o) => o !== pl);
      const div = other ? other.periodMonths : 1;
      const charged = offer ? pl.intro.amount : pl.amount;
      const cur = (offer && pl.intro.currencyCode) || pl.currencyCode;
      const str = money(Math.ceil((charged / (12 / div)) * 100 - 1e-6) / 100, cur, language); // rounded up: never cheaper than real
      equiv = str ? t('eo_equiv').replace('{price}', str).replace('{per}', per(t, div)) : null;
    }
    return {
      key: pl.key,
      pkg: sample ? null : pl.pkg,
      offer,
      badge: offer ? t('eo_plan_offer') : null,
      name: pl.key === 'annual' ? t('paywall_annual') : pl.key === 'monthly' ? t('paywall_monthly') : t('eo_plan_months').replace('{n}', String(pl.periodMonths)),
      price: offer ? pl.intro.priceString : pl.priceString,
      struck: offer && pl.key === 'annual' ? pl.priceString : null,
      line1: offer ? inFirst(t, pl.intro.months) : per(t, pl.periodMonths),
      line2: offer ? t('eo_then').replace('{price}', pl.priceString).replace('{per}', per(t, pl.periodMonths)) : null,
      equiv,
    };
  });

  const sel = plans0.find((p) => p.key === selected) || plans0.find((p) => p.intro) || plans0[0];
  const offer = !!sel.intro;
  const store = storeName(platform, t);
  const renewAt = formatDate(addMonths(now, offer ? sel.intro.months : sel.periodMonths), language, 'dayMonthAuto', now);
  const renewRow = { when: renewAt, text: t('eo_tl_renew').replace('{price}', sel.priceString).replace('{every}', every(t, sel.periodMonths)) };
  const hero = offer
    ? {
      offer: true,
      badge: t('eo_badge'),
      title: heroTitle(t, sel.intro.months),
      price: sel.intro.priceString,
      struck: sel.priceString,
      per: null,
      normal: t('eo_normal_price').replace('{price}', sel.priceString).replace('{per}', per(t, sel.periodMonths)),
      ticks: 12,
      filled: Math.min(12, sel.intro.months),
      ticksLine: t('eo_ticks_line').replace('{first}', first(t, sel.intro.months)).replace('{every}', every(t, sel.periodMonths)),
    }
    : { offer: false, badge: null, title: t('paywall_premium'), price: sel.priceString, struck: null, per: slash(t, sel.periodMonths), normal: null, ticks: 0, filled: 0, ticksLine: null };
  const timeline = offer
    ? [{ when: t('eo_today'), text: t('eo_tl_today_pay').replace('{price}', sel.intro.priceString) }, renewRow]
    : [{ when: t('eo_today'), text: t('eo_tl_today_start') }, renewRow];
  const renewal = (offer
    ? t('eo_renewal_offer').replace('{intro}', sel.intro.priceString).replace('{forFirst}', forFirst(t, sel.intro.months))
    : t('eo_renewal_regular'))
    .replace('{price}', sel.priceString).replace('{every}', every(t, sel.periodMonths)).replace(/\{store\}/g, store);
  const cta = t(offer ? 'eo_cta_offer' : 'eo_cta_regular').replace('{price}', offer ? sel.intro.priceString : sel.priceString);
  return { ...base, plans, selected: sel.key, pkg: sample ? null : sel.pkg, hero, timeline, renewal, cta };
}

// The four benefit rows with their value on the right. S-24: the AI reads never say
// "unlimited" and carry no number on the Premium side.
function benefitRows(t) {
  return [
    { icon: 'stack', label: t('eo_ben_protocols'), value: t('eo_ben_protocols_v') },
    { icon: 'curve', label: t('eo_ben_body'), value: t('eo_ben_body_v') },
    { icon: 'download', label: t('eo_ben_pdf'), value: t('eo_ben_pdf_v') },
    { icon: 'scan', label: t('eo_ben_scans'), value: t('eo_ben_scans_v') },
  ];
}

// "Grátis e Premium" (picture A, founder 2026-11-20, docs/design/oferta-gratis-premium.html): the
// four rows both plans have first ("both"), then what changes with Premium ("diff"). true = drawn
// check, false = dash, string = the amount. The free amounts come from the app's own constants;
// freeProtocols = the account's free protocol count (lib/freePlan).
function freePremiumRows(t, { freeProtocols } = {}) {
  return [
    { group: 'both', icon: 'syringe', label: t('eo_cmp_syringe'), free: true, premium: true },
    { group: 'both', icon: 'bell', label: t('eo_cmp_reminders'), free: true, premium: true },
    { group: 'both', icon: 'type_vial', label: t('eo_cmp_vial'), free: true, premium: true },
    { group: 'both', icon: 'clipboard', label: t('eo_cmp_labs'), free: true, premium: true },
    { group: 'diff', icon: 'stack', label: t('eo_cmp_protocols'), free: String(shownLimit(freeProtocols)), premium: t('eo_ben_protocols_v') },
    { group: 'diff', icon: 'scan', label: t('eo_cmp_ai_reads'), free: t('eo_cmp_per_month').replace('{n}', String(FREE_SCANS_PER_MONTH)), premium: t('eo_ben_scans_v') },
    { group: 'diff', icon: 'food', label: t('eo_cmp_ai_food'), free: t('pw_free_days').replace('{n}', String(FREE_DAYS)), premium: t('eo_cmp_every_day') },
    { group: 'diff', icon: 'curve', label: t('eo_cmp_body'), free: false, premium: true },
    { group: 'diff', icon: 'download', label: t('eo_cmp_pdf'), free: false, premium: true },
    { group: 'diff', icon: 'calc_trend', label: t('eo_cmp_reality'), free: false, premium: true },
  ];
}

// iOS asks the store about intro eligibility per product id: every subscription this screen may show.
function offerProductIds(pkgs) {
  return (Array.isArray(pkgs) ? pkgs : [])
    .filter((p) => p && p.product && PERIOD_MONTHS[p.packageType])
    .map((p) => p.product.identifier);
}

module.exports = { offerAvailable, offerModel, benefitRows, freePremiumRows, offerProductIds, addMonths, FREE_PROTOCOLS_NEW_ACCOUNT, PERIOD_MONTHS };
