'use strict';
// The free plan's protocol count (docs/specs/onboarding-protocol.md OB-28). Founder 2026-11-19 19:45
// (02-decisoes; 65-oferta-entrada-e-indicacao.md): the free plan of NEW accounts includes 1 active
// protocol; every account that already existed keeps its 3 and everything it has (rule "never lose
// user-entered data": nothing is locked or hidden). Premium is unlimited, unchanged. Founder
// 2026-11-20: the onboarding builds only the first protocol, which is what the free plan includes;
// the offer after the account then shows Premium for the others.
//
// The ONE place that knows the count. Every gate (new protocol, the assistant's save, Restart,
// Restore, the onboarding draft and the 15-day builder) and every text that states the number
// (the limit sheet, the paywall, its preview, the entry offer, the FAQ, the app search) reads it
// from here. Pure CommonJS, run under node --test (__tests__/freePlan.test.js).
//
// "New account" = the Supabase auth user's created_at (set by the server when the account is made,
// on the session user, never typed or written by the app) on or after NEW_FREE_PLAN_FROM. An account
// whose creation time is missing or unreadable is treated as existing (3): never restrict on a maybe.
//
// NEW_FREE_PLAN_FROM must be the moment the version with this rule is PUBLISHED (the EAS Update of
// the new onboarding, "dia da atualização da oferta"), so every account that exists before it ships
// keeps 3. Until that day is known it sits a little after the earliest possible publication: if it
// is late, a few new accounts get 3 (harmless); if it were early, an account made on the old app
// before the publication would get 1 — never. On the publication day, set it to that moment.
const { pluralKey } = require('./plural'); // plural.js is ESM

const FREE_PROTOCOLS_EXISTING_ACCOUNT = 3;
const FREE_PROTOCOLS_NEW_ACCOUNT = 1;
const NEW_FREE_PLAN_FROM = '2026-12-01T05:00:00.000Z'; // 2026-12-01 00:00 New York (EST)
const CUTOFF_MS = Date.parse(NEW_FREE_PLAN_FROM);

function isNewFreePlanAccount(user) {
  const created = Date.parse(user && user.created_at);
  return Number.isFinite(created) && created >= CUTOFF_MS;
}

// The active protocols the free plan allows for this account (1 new, 3 existing).
function freeProtocolLimit(user) {
  return isNewFreePlanAccount(user) ? FREE_PROTOCOLS_NEW_ACCOUNT : FREE_PROTOCOLS_EXISTING_ACCOUNT;
}

// True when one more ACTIVE protocol needs Premium. Protocols already active above the limit
// (Premium that lapsed, Q7 / OPEN-05) stay active: only adding, restarting or restoring is stopped.
function atFreeProtocolLimit({ activeCount, limit, premium }) {
  return !premium && Number(activeCount || 0) >= Number(limit);
}

// A number the texts can show: the account's limit, or the existing accounts' 3 while the
// account is not known yet (the same answer the gates give an unknown account).
function shownLimit(n) {
  const v = Number(n);
  return Number.isFinite(v) && v >= 1 ? v : FREE_PROTOCOLS_EXISTING_ACCOUNT;
}

// "up to 3 active protocols" / "1 active protocol" — used inside sentences ({free_protocols}).
function freeProtocolsPhrase(t, n, language) {
  const v = shownLimit(n);
  return String(t(pluralKey('free_protocols_phrase', v, language))).replace('{n}', String(v));
}

// The paywall row label: "Up to 3 protocols" / "1 protocol".
function freeProtocolsLabel(t, n, language) {
  const v = shownLimit(n);
  return String(t(pluralKey('paywall_free_feat_3', v, language))).replace('{n}', String(v));
}

// A text with the {free_protocols} token (limit sheet, preview, FAQ) filled with the phrase.
function fillFreeProtocols(text, t, n, language) {
  if (typeof text !== 'string' || !text.includes('{free_protocols}')) return text;
  return text.split('{free_protocols}').join(freeProtocolsPhrase(t, n, language));
}

module.exports = {
  FREE_PROTOCOLS_EXISTING_ACCOUNT, FREE_PROTOCOLS_NEW_ACCOUNT, NEW_FREE_PLAN_FROM,
  isNewFreePlanAccount, freeProtocolLimit, atFreeProtocolLimit, shownLimit,
  freeProtocolsPhrase, freeProtocolsLabel, fillFreeProtocols,
};
