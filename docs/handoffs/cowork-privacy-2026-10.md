# Handoff for Cowork: DoseTrace privacy policy, store privacy answers, subscription names (October 2026), URGENT

From: Claude Code (DoseTrace repo). Owner: Evandro (the founder). Updated 2026-10-17.

**Rules for this task:**
- Do not change anything that is not listed here.
- Never link DoseTrace to EvoxBiolabs.
- Ask the founder before any step that asks for a payment, a password or an agreement.

**Why it is urgent:** DoseTrace 1.3.0 is built and tested (Android 52, iOS 71). It goes to App Store and Google Play review as soon as this handoff is done. The release fixes a bug in the store version that counts a dose twice on the day the clocks change. Europe changes on 25/10 and the US on 01/11. The review panel marked the items below as **blocking the store submit**: Apple (5.1.1) and Google (User Data policy) can reject an app whose policy and labels do not match what the app does.

## Why the current policy is wrong

The live page https://dosetrace.io/privacy-policy is still dated September 10, 2026. It says two false things:
- that data is kept "mainly on your device";
- that sync is optional. With an account, data is always synced.

It also does not mention:
- the AI features: AI food log, lab/vaccine/vial-label scan, protocol assistant;
- RevenueCat;
- push delivery through Expo / Google / Apple;
- the silent daily refresh message on Android;
- anonymous usage events;
- the 18+ rule;
- "Recently deleted" (kept until the user chooses "Delete forever"; there is **no** 7-day limit).

The app already shows the new policy, dated October 16, 2026. The website must show the same text and date.

## Task 1: website policy (Vercel). Claude Code prepared it; do not edit it in GoDaddy or by hand

The site dosetrace.io is hosted on **Vercel**, built from the GitHub repo evandroviskis/dosetrace (folder `web/`). It is **not** GoDaddy, and Vercel has no page editor. The new page is already written and pushed to the branch **site/privacy-2026-10** (one file, `web/privacy-policy.html`). It goes live when that branch is merged into `main`.

**The founder decides that merge.** Claude Code does it once the founder says go, or the founder can merge the pull request himself on GitHub.

Your part:
1. After it is live, open https://dosetrace.io/privacy-policy in a **private** window and check:
   - the date is October 16, 2026;
   - section 4 "Reminders and notifications" and section 6 "Purchases" are there;
   - none of the old text remains ("mainly on your device", "if you enable cloud sync");
   - section 8 says protocols stay in "Recently deleted" until "Delete forever" (no number of days).
2. Send the founder screenshots of the top of the page and of sections 4 and 8.

## Task 2: App Store Connect › DoseTrace › App Privacy

**Data used to track you: none.**

Unless an item says otherwise, every item is **linked to the user**, **not used for tracking**, and its purpose is **App Functionality**.

| Category | Data type | Linked to user | Purpose | Note |
|---|---|---|---|---|
| Contact Info | Email Address | yes | App Functionality | |
| Contact Info | Name | yes | App Functionality | |
| Health & Fitness | Health | yes | App Functionality | doses, protocols, labs, vaccines, food log entries |
| Health & Fitness | Fitness | yes | App Functionality | weight and body measurements |
| Identifiers | User ID | yes | App Functionality | |
| Purchases | Purchase History | yes | App Functionality | |
| Photos or Videos | Photos | yes | App Functionality | photos sent to the AI scan are processed for that request and not kept |
| Usage Data | Product Interaction | **no** | **Analytics** | random installation ID |
| Identifiers | Device ID | **no** | **Analytics** | the random installation ID used for analytics |

Save and **publish** the App Privacy answers. They only take effect once published.

## Task 3: Google Play Console › App content › Data safety

- Data is encrypted in transit: **yes**.
- Users can request that data is deleted: **yes** (in-app account deletion, plus hello@dosetrace.io).
- **Collected** (not "shared"):

| Category | Data type | Purpose | Note |
|---|---|---|---|
| Personal info | Email address, Name | App functionality, Account management | |
| Health and fitness | Health info, Fitness info | App functionality | |
| Financial info | Purchase history | App functionality | through Google Play / RevenueCat |
| App activity | App interactions | Analytics | anonymous |
| Device or other IDs | notification token, random installation ID | App functionality, Analytics | |
| Photos | Photos | App functionality | collected for the AI scan; mark **processed ephemerally** |

- **Shared: none.** Anthropic (AI, only when the user opts in), Expo / Google / Apple (notification delivery) and RevenueCat (subscription status) are **service providers**. Google Play does not count data sent to service providers as "sharing". If the form already lists them as shared, remove that.
- Submit the Data safety form.

## Task 4: App Store Connect › subscriptions, "Add for Review" (RL-6)

On 2026-09-30, all customer-facing names were changed from "Pro" to "DoseTrace Premium …". Those changes are waiting as pending versions.

1. Under Monetization › Subscriptions, open each item that shows a pending name change: the subscription group, both subscriptions (monthly, yearly) and the lifetime purchase.
2. Click **Add for Review** on each one. The API cannot do this; only the website can.
3. **Do not submit the app version.** Claude Code submits version 1.3.0 together with these items.

If this is missed, Apple's purchase sheet keeps saying "DoseTrace Pro" while the app says Premium.

## Done when

- The live website shows the new text and the date October 16, 2026 (checked in a private window, screenshots sent).
- App Privacy is published and Data safety is submitted, both matching the tables above item by item (screenshots of the summary pages sent).
- The subscription items are "Ready for Review" / added for review (screenshot sent).

If a console asks a question this file does not answer, stop and ask the founder. Do not guess.

When done, report what was changed, with the date and time, so Claude Code can submit 1.3.0 to both stores.
