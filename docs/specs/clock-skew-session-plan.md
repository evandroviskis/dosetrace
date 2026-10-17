# A-137 device clock ahead: token-refresh storm and sign-out — plan (2026-10-17)

- source: guided device session 2026-10-17 on the founder's Galaxy Z Fold7 (Android, 1.3.0 build 49, TEST account). The device clock was set about 19 h AHEAD of real time (auto time off, `cmd alarm set-time`). On opening the app, Supabase auth_logs show 2026-10-17T04:38:11Z to 04:38:18Z: dozens of `POST /token?grant_type=refresh_token` per second, alternating "Login login_method=token" and "token_revoked", then "429: Request rate limit reached (over_request_rate_limit)". The app ended on the sign-in screen. Local data was kept (spurious SIGNED_OUT path, App.js:670-679). The same user signed in again and the queued dose synced.
- status: READ-ONLY PLAN. Nothing is built. Auth/session is Gate B territory: ship-check Gate B, a code review of the diff, and the founder's device test before any upload. `onAuthStateChange` stays synchronous.
- checklist-signed: pending
- committed-to: founder to decide (pre-existing in store 1.2.4, see section 3)

## 1. Root cause (file:line, auth-js 2.101.1 as installed)

1. **The server's clock sets the expiry, the device's clock reads it.** GoTrue's token response carries `expires_at` in SERVER epoch seconds. auth-js keeps it as is and only computes its own when the field is missing: `node_modules/@supabase/auth-js/src/lib/fetch.ts:209-217` (`if (!data.expires_at) session.expires_at = expiresAt(data.expires_in)`). Every expiry check compares it with the DEVICE clock:
   - `GoTrueClient.ts:2784-2785` (`__loadSession`, behind every `getSession()`): `expires_at * 1000 - Date.now() < EXPIRY_MARGIN_MS` (90 s, `lib/constants.ts`).
   - `GoTrueClient.ts:4928-4939` (auto-refresh tick, every 30 s): refresh when 3 or fewer ticks remain.
   - `GoTrueClient.ts:4521-4522` (`_recoverAndRefresh`, only with autoRefreshToken on: main/1.2.4).
   With the device 19 h ahead, a token the server just issued (valid 1 h by server time) is already about 18 h expired by device time. **Every new session looks expired the moment it is saved.** Threshold: with the default 1 h JWT, the device must be more than about 58.5 min ahead (3600 s - 90 s margin). Between 0 and about 58 min ahead the token just refreshes early, without a storm.
2. **Each `getSession()` then does its own network refresh, one after another.** `getSession()` (`GoTrueClient.ts:2604-2614`) runs under the client's in-process lock. React Native has no `navigator.locks`, so `lockNoOp` is used (`GoTrueClient.ts:181, 330-342`), and the `lockAcquired`/`pendingInLock` queue (`GoTrueClient.ts:2619-2680`) SERIALISES the calls. The single-flight in `_callRefreshToken` (`refreshingDeferred`, `GoTrueClient.ts:4585-4633`) only merges refreshes that OVERLAP. Serialised calls never overlap: call N+1 reads the session call N just saved, finds it "expired" again, and POSTs again. Each successful refresh rotates the token, which is the "Login token" + "token_revoked" pair in the logs.
3. **Our app calls `getSession()` dozens of times at start-up, which turns the bug into a storm.**
   - Every PostgREST / Functions request: `supabase-js/src/lib/fetch.ts` `fetchWithAuth` → `SupabaseClient.ts:533-541` `_getAccessToken` → `auth.getSession()`. One sync pass (`lib/sync.js:87-98`) touches 11 tables (`lib/syncCore.js:25`): pull pages (`lib/sync.js:141-158`), pushes (`lib/sync.js:121-139`), and the self-heal id lists, which call `getSession` twice more each (`lib/sync.js:160-197`).
   - `getCachedUser()` (`lib/supabase.js:40-44`) calls `getSession()`. It has 70+ callers, for example `lib/notifications.js` (198, 207, 443, 482, 573, 682, 738, 756, 852, 998, 1044, 1161), `screens/TodayScreen.js` (350, 485, 547, 615, 642, 652, 676, 696, 767, 798, 1051, 1290), `lib/sync.js:238-259` and `lib/realityCheck.js`.
   - The cold start alone: `App.js:612` getSession → `fullImportFromCloud`/`requestSync` (`App.js:640-645`) → `syncAllNotifications` (`App.js:653-656`). Plus `startAutoRefresh()` at `App.js:564`, whose first tick runs at once and then every 30 s.
   Reproduced with the real GoTrueClient 2.101.1 (scratch script, not in the repo): device +19 h, 30 concurrent `getSession()` → **30 refresh POSTs in 0.65 s and 30 TOKEN_REFRESHED events**. The ~10 per second rate is simply one refresh per round trip, back to back.
4. **The 429 is what signs the user out.** 429 is not in `NETWORK_ERROR_CODES` (`lib/fetch.ts:38`, only 502/503/504), so it becomes a non-retryable `AuthApiError`. `_callRefreshToken` then runs `_removeSession()` (`GoTrueClient.ts:4618-4622`), which deletes the stored session and emits SIGNED_OUT (`GoTrueClient.ts:4717-4731`). Reproduced: with 429 from the 11th call, 11 POSTs, then SIGNED_OUT, 20 of 30 callers got a null session, and the stored session was gone. App.js:670-679 treats this as a spurious sign-out and keeps local data (correct, which is why nothing was lost), but the navigator drops to Auth (`App.js:299`).
5. **Rate limit is per IP.** The storm can use up the token-refresh budget of every user behind the same NAT (carrier CGNAT, office Wi-Fi).

No `.channel(` (Realtime) is used, so Realtime adds no traffic. `onAuthStateChange` (`App.js:667`) only calls `setSession` on TOKEN_REFRESHED, which re-renders the root. It is not the multiplier; the multiplier is the number of `getSession()` callers.

## 2. Who is affected

- A user whose phone clock is set by hand more than about 1 h ahead: auto time off, or the wrong time zone with the local time typed to "look right", which moves the epoch.
- **Our own guided device tests.** The test method moves the clock forward by days (memory guided-device-test, decisions 2026-09-30 "clock-faked tests"). Every such session floods Auth and signs out. The test account must expect this until A-137 is fixed.
- Clock BEHIND: no storm. The device keeps using a token the server already rejects ("JWT expired" 401s) until device time catches up, so sync silently fails for up to the skew.

## 3. Pre-existing? YES, store 1.2.4 has the same behaviour (worse at start)

- `git show main:package-lock.json`: `@supabase/auth-js` 2.101.1, the same version as this branch (`package-lock.json:3480-3482`; `package.json` `^2.101.1` on both).
- `git show main:lib/supabase.js`: `autoRefreshToken: true` (this branch turned it off in council 3, 2026-10-07). So 1.2.4 also refreshes inside `initialize()` → `_recoverAndRefresh`, including headless starts.
- `git show main:lib/sync.js`: the same `supabase.from(...)` per-request pattern and `getCachedUser` → `getSession` (lines 116-190).
- `git show main:App.js:519-529`: the same spurious-SIGNED_OUT keep-data path.
Conclusion: not introduced by 1.3.0. It is the library's expiry rule combined with how many times every DoseTrace version asks for the session.

## 4. What supabase-js offers for clock skew

- Installed 2.101.1: nothing. The only skew mention is a debug warning for sessions read from a URL (`GoTrueClient.ts:3621`). There is no Date-header offset, no expiry computed from `expires_in` when the server sends `expires_at`, and no cap on refreshes. No CHANGELOG ships in node_modules.
- Newer releases (npm: latest `@supabase/auth-js` 2.118.0, 2026-10-15; read from the GitHub master source, not installed, version-to-feature mapping not verified): still `if (!data.expires_at)` in `_sessionResponse` and still `expires_at * 1000 - Date.now()` in `__loadSession`. They add (a) a cooldown that caches a FAILED refresh for callers sending the same refresh token, and (b) keeping the session on a non-retryable failure when the stored access token is still valid locally. With the device ahead, the token is never "still valid locally" and the storm is made of SUCCESSFUL refreshes, so neither fixes this case. **An upgrade alone does not fix A-137.** It is not proposed (no upgrade in this item).

## 5. Proposed fix: one fetch wrapper, no auth-js patch, no UI

Pass `global: { fetch: authSafeFetch }` to `createClient` in `lib/supabase.js`. supabase-js gives that same fetch to the auth client (`SupabaseClient.ts:307-312, 557-576`) and wraps it for PostgREST/Functions (`SupabaseClient.ts:327`), so one wrapper sees all traffic. The wrapper lives in a new pure module `lib/authFetch.js` (time, storage reader and base fetch injected, so it can be tested in Node).

- **(A) Expiry on the device's own clock.** For any successful JSON response from `/auth/v1/` that has `access_token` and a numeric `expires_in`, rewrite `expires_at = round(Date.now()/1000) + expires_in` before auth-js reads it. This is the same value auth-js computes itself when the server leaves the field out (`fetch.ts:214-215`, `helpers.ts:7-10`), and what it already does after MFA verify (`GoTrueClient.ts:5220-5221`). The server still checks the JWT `exp` against its own clock, so the token's real 1 h life is unchanged. The device just measures that hour on its own clock. Any skew, ahead or behind, then costs at most ONE refresh. Prototype against the real GoTrueClient: +19 h → 1 POST, +2 h → 1 POST, -2 h → 0, no skew → 0, 0 null sessions in 60 calls.
- **(B) Storm breaker (defence in depth).** At most 3 real refresh POSTs per 60 s. Past that, and for 60 s after any 429 on `/token?grant_type=refresh_token`, the wrapper does not go to the network. If the request's `refresh_token` equals the one in storage (`SecureStoreAdapter.getItem(supabase.auth.storageKey)`), it answers 200 with that stored session and `expires_in: 120`. auth-js saves the same tokens back: no rotation, no SIGNED_OUT, and `getSession()` returns a session at once instead of stalling. If the tokens do not match, the response passes through unchanged. Prototype without (A): the storm drops from 30+ to 3 POSTs. Prototype with a 429 from the first call: 1 POST, session kept, 0 null sessions.
  Why not just map 429 to 503: auth-js retries retryable errors with backoff for up to 30 s (`GoTrueClient.ts:4386-4410`). Behind the serialised lock, every `getSession` would stall about 25 s in turn, which freezes the app (seen in the prototype).
- **(C) Clock moved back after a session was saved (incl. "return to auto time").** A device-relative `expires_at` saved under a +19 h clock looks valid for 19 h after the clock returns. If a PostgREST response is 401 with `PGRST301` / "JWT expired", ask for ONE `supabase.auth.refreshSession()`. It runs deferred (`setTimeout`, never inside the auth lock or `onAuthStateChange`), only while `AppState` is active (council 3 rule: no headless refresh, `storedSessionOnly()` false), at most once per 60 s, and through the breaker.
- **(D) What does NOT change.** A 400 `invalid_grant` / "Refresh Token Not Found / Already Used" still passes through, so a token revoked on the server (account deleted, signed out everywhere, A-119 later) still signs out exactly as today. Intentional sign-out, the wipe rules (`lib/signedOut.js`) and `onAuthStateChange` are untouched. No new text, no "your clock is wrong" banner. The Date-header offset is not needed for (A)-(C). It was considered and rejected as the main mechanism (1 s resolution, can be cached by proxies, and auth-js has no hook to use it). At most it would go into a debug log.
- **(E) Same wrapper on the temporary client** in `lib/recoveryLink.js:30` (reset-link account check), so it follows the same expiry rule.

### Risks

1. The wrapper relies on auth-js details: the session JSON shape, `refresh_token` in the request body, and the stored session at `storageKey`. `package.json` has `^2.101.1`, so a fresh `npm install` can pull a newer minor version. The test suite runs the real GoTrueClient, so a library change that breaks the wrapper fails CI. Pinning the exact version is an open question for the founder.
2. (B) hands auth-js a stored access token the server may consider expired. Data calls then get 401s and sync retries later. Local writes stay queued in SQLite. This is acceptable for at most 60 s, and better than a sign-out.
3. (A) moves the token's local lifetime by the request's round trip (under 1 s), which is harmless.
4. Clock moved while the app is killed: (A) costs 1 refresh on the next foreground open. Moving backward relies on (C), so the first sync after "return to auto" may fail once and then succeed.
5. Offline with an expired token is NOT changed by this item. `getSession` returns a null session after its retries, so the cold start can show Auth (`App.js:612-620`). This is pre-existing, not part of A-137, and listed as an open question.
6. Gate B: it touches the auth transport for every request. It needs a code review of the diff, the full suite, `npx expo export --platform ios`, and the device test below before any upload.

## 6. Tests (write red first, keep permanently)

`__tests__/clockSkewSession.test.js`, real `GoTrueClient` from `@supabase/auth-js` plus `lib/authFetch.js`, with a fake server whose clock is offset (same style as `__tests__/headlessAuthRefresh.test.js`):
- T1 RED on HEAD: device +19 h, 30 concurrent `getSession()` → expect at most 1 refresh POST (HEAD: 30).
- T2 RED on HEAD: the server answers 429 → expect no SIGNED_OUT event, the stored session kept, and 0 null sessions (HEAD: SIGNED_OUT and the session removed).
- T3: +2 h and -2 h → at most 1 POST each; no skew → 0 POSTs.
- T4: breaker: with (A) disabled, at most 3 POSTs per 60 s; after a 429, 0 network POSTs for 60 s (injected clock).
- T5: a 400 invalid_grant still removes the session and emits SIGNED_OUT (revocation unchanged).
- T6: non-auth responses (rest/v1, functions) pass through byte for byte; an auth error response is never rewritten.
- T7: (C): a 401 PGRST301 asks for one `refreshSession`, deferred; never while backgrounded or `storedSessionOnly()`; at most once per 60 s.
- T8 wiring: `lib/supabase.js` passes `global.fetch` from `lib/authFetch`; `autoRefreshToken: false` is unchanged (headlessAuthRefresh still green); `lib/recoveryLink.js` uses it; `onAuthStateChange` in App.js has no `await`/`supabase.` inline (existing guard).
Then the full `npm test` is green, and `npx expo export --platform ios` passes.

## 7. Device test (founder's Fold, test account, Gate B), auth_logs read after each step

Before each step: app in the foreground, signed in, one dose logged offline as a marker. After each: the app is still signed in, no new text, the marker dose is in Supabase, and auth_logs show at most 1-2 refresh_token POSTs for that step (none in a 429).
1. Update over build 49 (old stored session with server-epoch expiry), clock correct → 0-1 refresh.
2. Clock +2 h, cold start and then a warm resume → 1 refresh.
3. Clock +19 h, cold start; then Mark-as-taken from a notification with the app killed (headless) → 1 refresh in the foreground, none headless.
4. Clock -2 h, cold start → sync works (401 → one refresh at most).
5. Airplane mode at +19 h, log a dose, cold start, then airplane off → no sign-out, the dose syncs, no storm when the network returns.
6. Return to auto time (from +19 h) with the app open, then cold start → sync works within one retry; 1 refresh at most.
7. Leave the app in the foreground 70 min at +19 h → refreshes about once an hour, never in bursts.
8. iOS (simulator or iPhone; the clock can only be changed in Settings on a device): repeat step 3 if possible, else state "iOS unverified".

## 8. Acceptance checklist (unsigned)

Written as a list, not table rows, until the founder signs it and commits it to a build. Table rows marked `missing` would fail `node scripts/spec-audit.cjs` (Gate S) for the current build before he has decided. On signing, they become `| CS-n | ... |` rows.

- CS-1. With the device clock up to 24 h ahead or behind, opening or resuming the app makes at most one token refresh per foreground open (auth_logs and T1/T3).
- CS-2. A 429 (or any rate-limit answer) on token refresh never signs the user out and never empties the session (T2, device step 3/5).
- CS-3. No more than 3 refresh requests per 60 s leave the device for any reason (T4).
- CS-4. A refresh token revoked on the server (400 invalid_grant) still signs out as today, with the same keep-data or wipe rules (T5).
- CS-5. After the clock moves back (incl. return to automatic time), sync works again within one retry, without a sign-out (T7, device steps 4/6).
- CS-6. No refresh is made while the app is headless or in the background (headlessAuthRefresh + T7, device step 3).
- CS-7. The user sees no new message, banner or screen because of the clock. The app just keeps working (device steps 1-8).
- CS-8. Data typed while skewed or offline is kept and syncs once the session is good (device steps 3/5/6; CLAUDE.md never-lose-data).
- CS-9. `onAuthStateChange` stays synchronous; no auth-js upgrade or patch-package in this item (T8, diff review).
- CS-10. Update over build 49 with an old stored session: no sign-out, at most one refresh (device step 1).

## 9. Open questions for the founder (only real preferences)

1. Which build: 1.3.0 (the scope is set, so this needs his explicit add, since it is a fix to a pre-existing bug) or the next one? Recommendation: 1.3.0. The guided device tests move the clock forward, so every test session hits it.
2. Pin `@supabase/supabase-js` / `auth-js` to the exact installed version (2.101.1) so the wrapper is tested against what ships? Recommendation: yes.
3. Separate item or not: offline with an expired token, the cold start can land on Auth with the session still stored (risk 5, pre-existing). Track as its own registry row?
