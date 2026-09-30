'use strict';
// A-60: the "monthly scan limit reached" message shows the limit the SERVER reports
// (3 free / 20 Premium — supabase/functions/extract-bloodwork/quota.ts), never a
// number fixed in the text. Pure — runs under plain node --test.
const FALLBACK_LIMIT = 3; // an older server answer without `limit`

function quotaLimitFrom(body) {
  const n = body && typeof body.limit === 'number' ? body.limit : NaN;
  return Number.isFinite(n) && n > 0 ? n : FALLBACK_LIMIT;
}

function fillQuotaMessage(template, limit) {
  return String(template).replace('{n}', String(limit));
}

module.exports = { quotaLimitFrom, fillQuotaMessage };
