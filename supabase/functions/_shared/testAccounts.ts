// Our own test accounts (founder 2026-11-26: "Nenhuma das contas de teste deveriam ter essas
// limitações"). A test account is never refused by an AI usage cap and its use does not consume a
// budget: the monthly scan budget (extract-bloodwork), the food log daily caps and 24 h ceiling
// (parse-food), and the protocol assistant's weekly uses and turn caps (protocol-assistant).
// Auth, validation, the AI hard line and everyone else's limits are unchanged.
//
// ONE definition, used by every capped function. A test account is the signed-in user whose email
// (trimmed, lowercased) is in TEST_ACCOUNT_EMAILS or is a Gmail plus-alias of our own inbox
// (dosetrace.io+anything@gmail.com, evandro1985+anything@gmail.com) — and ONLY when that email is confirmed (email_confirmed_at
// set): the confirmation goes to our inbox, so nobody else can claim one.
// evandro1985@gmail.com is deliberately NOT here: it is the account that tests the free limits.
// This is not the Premium list (extract-bloodwork/quota.ts PREMIUM_EMAILS ↔ lib/purchases.js).
// Pure — no imports — so it runs under Deno and under node --test (__tests__/testAccountsNoAiLimit.test.js).

export const TEST_ACCOUNT_EMAILS = ['dosetrace.io@gmail.com', 'appreview@dosetrace.io'];

// Plus-aliases of our own inboxes: dosetrace.io+x@gmail.com and the founder's test inbox evandro1985+x@gmail.com
// (+qa, +qa2, +qa3, +qa4 in use, 2026-11-26). The bare evandro1985@gmail.com is NOT one (it tests the free limits).
const INBOX_ALIAS = /^(dosetrace\.io|evandro1985)\+[a-z0-9._-]+@gmail\.com$/;

export function isTestAccount(user: { email?: unknown; email_confirmed_at?: unknown } | null | undefined): boolean {
  if (!user || typeof user.email !== 'string') return false;
  if (typeof user.email_confirmed_at !== 'string' || user.email_confirmed_at === '') return false;
  const email = user.email.trim().toLowerCase();
  return TEST_ACCOUNT_EMAILS.includes(email) || INBOX_ALIAS.test(email);
}
