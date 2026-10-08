# Handoff for Cowork — DoseTrace privacy policy + store privacy answers (October 2026)

From: Claude Code (DoseTrace repo). Owner: Evandro (founder). Do not change anything not listed here. Do not link DoseTrace to EvoxBiolabs anywhere. Ask the founder before any step that asks for a payment, a password or an agreement.

## Why
DoseTrace 1.3.0 adds things the current policy does not describe: Sign in with Apple/Google, a daily silent wake-up message on Android, push through Expo / Google / Apple, the AI food log, vial-label scan and protocol assistant, RevenueCat for subscriptions, anonymous usage events, 7-day "Recently deleted", and the 18+ confirmation. The current page also says data is kept "mainly on your device" and that sync is optional — both wrong: with an account, data is always synced. App Store and Google Play reject apps whose policy does not match what the app does.

## Task 1 — Replace the website policy (GoDaddy, Classic Builder)
Page: https://dosetrace.io/privacy-policy (this exact URL is the one in App Store Connect and Google Play — do not change the URL).
1. Open the GoDaddy Website Builder for dosetrace.io, page "Privacy Policy".
2. Replace the whole text with the text in the attached file `privacy-policy-2026-10.md` (headings = the `##` lines; keep the order; keep the bold service names). The builder may limit block size: paste one numbered section per text block (14 sections + intro).
3. Set the date line to the day you publish: "Last updated: <Month day, 2026>".
4. Publish. Then open https://dosetrace.io/privacy-policy in a private browser window and check: the date is new, section 4 "Reminders and notifications" and section 6 "Purchases" are there, and no old text remains ("mainly on your device", "if you enable cloud sync").
5. Send the founder a screenshot of the top and of section 4.

## Task 2 — App Store Connect › DoseTrace › App Privacy (only if the founder asks you to do it; otherwise give him this list)
Data used to track you: **none**. All items below: **linked to the user**, **not used for tracking**, purpose **App Functionality** (analytics item: **Analytics**).
- Contact Info: Email Address; Name.
- Health & Fitness: Health; Fitness.
- Identifiers: User ID.
- Purchases: Purchase History.
- Usage Data: Product Interaction — mark **not linked** to the user (random installation ID), purpose Analytics.
- Photos or Videos: Photos — **declare** (founder 2026-10-08): linked to the user, App Functionality (photos sent to the AI scan are processed for that request and not kept).

## Task 3 — Google Play Console › App content › Data safety (same rule: only if asked)
- Collected and shared: data is encrypted in transit: **yes**; users can request deletion: **yes** (in-app account deletion + hello@dosetrace.io).
- Personal info: Email address, Name — collected, App functionality, Account management.
- Health and fitness: Health info, Fitness info — collected, App functionality.
- Financial info: Purchase history — collected (via Google Play / RevenueCat), App functionality.
- App activity: App interactions — collected, Analytics (anonymous).
- Device or other IDs: collected (notification token), App functionality.
- Photos: collected for AI scan, **processed ephemerally**, App functionality.
- Shared with third parties: Anthropic (AI, only when the user opts in), Expo / Google / Apple (notification delivery), RevenueCat (subscription status) — these are service providers.

## Done when
The website shows the new text and date (screenshot sent), and the founder has either done Tasks 2–3 or told you to. Report back what was changed, with the date and time.
