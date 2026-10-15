# One active device per account — A-119

- source: founder 2026-10-15 — question 1 (b) answered "Execute a D" = option D (a) (grok/293). His proposal: let the person sign in on the new phone and tell them the account was active on the other device, with that device's last server update date and time, and that later changes there may be missing ("isso também não vai ser um grande problema"). Ledger: docs/decisions.md 2026-10-15 (AD-77).
- supersedes: the multi-device sync hardening of OPEN-16 (b) (tombstones per table, counters as events, per-table pull cursor) for DV-182, DV-183, DV-209, DV-222; decisions.md:309 "Sign out anyway" for the intentional sign-out (now blocked while unsent changes exist).
- exception recorded: unsent records on a replaced phone are discarded with a count — the founder's explicit exception to "never lose user-entered data" for this case only.
- picture: owed before any code (new-phone notice, replaced-phone notice, blocked sign-out; light and dark; pt + en).
- code (expected): lib/ (active-device state + server check), App.js / auth flow (sign-in takeover, replaced handling — onAuthStateChange stays synchronous), lib/sync.js / lib/syncCore.js (refused-write handling), screens/SettingsScreen.js (sign-out), i18n ×6, a Supabase migration (active device + last send per device + write guard on every synced table).
- checklist-signed:
- committed-to: 1.3.0 (approved → next build)

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| OD-1 | Signing in on a phone (email, Google, Apple; iPhone and Android) never blocks because another device is active. | missing | | |
| OD-2 | If another device was active, the new phone shows one notice after sign-in naming that device (model as the system reports it, e.g. "iPhone", "Galaxy Z Fold7") and the local date and time it last sent data successfully, and saying that anything recorded there after that time without internet may not be here. Shown once per takeover; never shown when the same device signs in again. | missing | | |
| OD-3 | The phone that signs in becomes the account's only active device; the server stores the active device and each device's last successful send time. | missing | | |
| OD-4 | The replaced phone, the next time it reaches the server, shows that the account was opened on another device (with date and time), then signs out and wipes its local data and onboarding state exactly like an intentional sign-out. | missing | | |
| OD-5 | The replaced phone wipes ONLY on the server's confirmed "replaced" answer — never on a network error, timeout, token refresh, session hiccup during an update, or re-auth of the same user on the same device (CLAUDE.md "never destroy on a maybe"). | missing | | |
| OD-6 | If the replaced phone had unsent records, its notice says how many ("N records from this phone had not been sent and are not in the account") before discarding them (founder exception, 2026-10-15). | missing | | |
| OD-7 | The server refuses every write (insert, update, delete) to every synced table from a device that is not the active one; a refused write is never retried in a loop and never surfaces as a generic error. | missing | | |
| OD-8 | With one active device, the four sync defects cannot occur: a dose deleted on A never comes back after B signs in (DV-182); counters never lose a dose across a device switch (DV-183); no row is skipped by the pull watermark (DV-209, DV-222). Each proven by a two-device harness test that fails on today's code. | missing | | |
| OD-9 | Intentional sign-out is blocked while this phone has unsent changes: the sheet says how many, why, and asks to connect to the internet; with no unsent changes sign-out proceeds as today (push first). | missing | | |
| OD-10 | Account deletion, reinstall on the same phone, and an app update over an older version keep working; a phone updated from a version without this feature becomes the active device without losing data or showing a false "replaced" notice. | missing | | |
| OD-11 | The Apple review demo account and the test account keep working on one device at a time (documented for review and for Claude's simulator QA). | missing | | |
| OD-12 | All new texts in the 6 languages, written natively (CLAUDE.md), approved by the founder; dates and times in the phone's locale; both themes checked on every new sheet. | missing | | |
| OD-13 | onAuthStateChange stays synchronous; ship-check Gate B + a code-review pass over the diff; founder device test on two phones (incl. update-over-old-version) before any upload. | missing | | |
