'use strict';
// Council fix 4 (founder 2026-10-16, App Store guideline 2.3.10): the iOS app must not name Google
// Play / Android, and the Android app must not send users to Apple. Texts that explain where to
// manage or cancel the subscription carry a token, filled here with the running platform's path:
//   {store_cancel} -> store_cancel_faq_ios | store_cancel_faq_android   (FAQ "Can I cancel anytime?")
//   {store_manage} -> store_manage_terms_ios | store_manage_terms_android (Terms, Premium section)
// Any platform other than Android reads the iOS text. Pure CommonJS, tested in
// __tests__/storeSpecificCancel.test.js.
const TOKENS = [
  ['{store_cancel}', 'store_cancel_faq'],
  ['{store_manage}', 'store_manage_terms'],
];

function storeKey(base, platformOS) {
  return `${base}_${platformOS === 'android' ? 'android' : 'ios'}`;
}

function fillStoreText(text, t, platformOS) {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const [token, base] of TOKENS) {
    if (out.includes(token)) out = out.split(token).join(t(storeKey(base, platformOS)));
  }
  return out;
}

module.exports = { fillStoreText, storeKey };
