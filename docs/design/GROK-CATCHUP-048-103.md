# Grok catch-up: notes 048–103 (DoseTrace "Graduated" redesign, 2026-09-29 → 30)

## 1. Where things stand
- **The whole design pass is finished and approved by the founder, screen by screen.** It lives in a
  clickable prototype (`docs/design/prototype.html` on branch `design/hybrid`) and in written build
  specs (`today-build-handoff.md`, items 1–29).
- **None of it is in the app code yet.** Next it gets built on the Mac: `docs/design/MAC-HANDOFF.md`
  (commit 483bf29).

## 2. Approved screens (in order)
- **Today v2.1:**
  - Alerts on top.
  - Tracker: one large ring plus two small ones (day / 7 days / 30 days).
  - Ring rule: doses taken ÷ doses due, never above 100%, and a dose counts once.
  - Tracker block: dark grey `#383C41` in light theme, inverted light block in dark theme.
  - The food card shows only during a reality check.
- **My Protocols:**
  - The list, then a protocol screen that opens on the calculator.
  - Add/edit steps with a live syringe numbered every 10 units from 0.
  - All popups: one design, titles that say what happened.
- **Dose log:** plain counts.
- **Journey, 5 parts:**
  - Dashboard.
  - Progress, reordered from "needed every visit" to "rarely needed".
  - AI food log, with the never-drop rule: every food typed becomes its own line.
  - "Dose accumulation" (renamed from Accumulation Curve).
  - Popups.
- **My Body, 3 parts:** Lab test journal, Vaccine journal, popups.
- **Settings, 3 parts:**
  - Groups in this order: Preferences, Notifications, Data & privacy, Support. Each shows a short
    summary of what's inside.
  - Sign out and Delete account at the bottom.
  - A warning if you sign out offline with unsynced changes.
- **Sign-in:** Apple first, then Google, with the official logos.
- **Onboarding:**
  - 8 steps; the duplicate "You're all set" step is gone.
  - Main's curve animation is restored.
  - The AI consent line now covers the food log.
- **Paywall:** see §3.
- **Injection-site picker:** see §4.
- **Free-feature explainer animations:** see §5.

## 3. Paywall decisions
- **Naming:** "Premium" is the only name. The store subscriptions get renamed from "DoseTrace Pro".
- **Plans:** Annual, Monthly and Lifetime.
- **Required links:** Terms of Use (EULA) and Privacy Policy, required by App Store rule 3.1.2 and
  missing on main.
- **Previews:** every Premium feature gets an animated preview.
- **Cloud sync stays free.** It is removed from the Premium lists; it was never gated in code.
- **AI food log:** 3 days free.
- **Scans:** Premium gets 20 a month, shared by lab reports, vaccine cards and vial labels; free
  stays at 3. Never "unlimited".
- **Copy:**
  - Lab and vaccine preview texts rewritten to stay on the AI line (no "out of range", no
    "due / up to date" verdicts).
  - "Unlock with Premium" instead of "Pro".
  - "PRO" badges become "Premium".

## 4. Injection-site picker
- **Images:** the founder's own mannequins (made with ChatGPT), male or female following the
  profile's sex.
  - Subcutaneous uses Front / Back.
  - Intramuscular uses Right side / Left side. The female left side is her right side mirrored.
- **Points:** every one sits where the site really is.
  - Front views follow the medical-chart convention: your right on the viewer's left.
- **List:** one row per body area, with Left / Right buttons.
- **"Longest unused in your log":**
  - counts across all compounds;
  - shows only once a site has been logged;
  - counts the arm as one spot.
- **After logging:**
  - "Not now" keeps Add site and Undo available.
  - "Undo dose" is inside the sheet.
  - "Somewhere else" takes typed text.
  - The dose log shows each dose's site.
- **Deferred by the founder:** recording sites for injections from before the app was installed.

## 5. Explainer animations (free features)
- **The eight:**
  1. reconstitution calculator
  2. vial tracker
  3. reminders
  4. site rotation
  5. dose log and streak
  6. energy & protein calculator
  7. lab journal typed by hand (no chart; charts are Premium)
  8. dose notes
- **Rules:**
  - play on the first visit to an unused feature, never on launch;
  - "Not now" / "Try it";
  - at most one a day;
  - never on the dose-logging path;
  - stop once the feature is used (stored in synced storage);
  - example data only, no promised health outcomes.
- **Success metric:** feature adoption and days active, with time per visit judged together with
  features used per visit.

## 6. Problems found on main (must be fixed in the app)
- **Data loss:** the site picker erases an older typed-in injection site when saved empty. Goes in
  the next main build.
- **Lost Undo:** the site picker hides Undo, and its "Cancel" reads like cancelling the dose.
- **False claim, scans:** "Unlimited scans" isn't true. The server caps everyone at 3 a month and
  doesn't know who is Premium.
- **False claim, sync:** cloud sync is sold as Premium but is free.
- **False claim, tags:** "Check-in follow-ups & searchable tags" is sold as Premium, and tag search
  doesn't exist.
- **Paywall and store:** the paywall has no Terms or Privacy links, and the store products are
  named "Pro".
- **Wrong copy:**
  - Onboarding says "AI only for document scans", which the food log makes untrue.
  - A "pay per upload" message exists, but there is no per-upload charge.
- **Popups:** vial-photo errors reuse lab-report wording, and several popups are titled just "Error".
- **Privacy policy:** its AI section doesn't mention the AI food log.

## 7. What's next
1. **Next main build, not waiting for the redesign:**
   - App Store links and the rename to Premium;
   - 20 Premium scans, which needs the RevenueCat secret key from the founder;
   - the site data-loss fix;
   - the "Premium" wording fixes.
2. **Then the redesign build,** screen by screen in approval order. The founder checks each one in
   the simulator.

## 8. Please double-check (Grok)
- **Today:** no ring, percentage or "n of m" can go above 100% or show n > m, including when a dose
  is logged twice or late.
- **Dose accumulation:** always says it follows the planned schedule, never "your level will be".
  Estimates are clearly marked, and it never suggests a dose or timing change.
- **Labs and vaccines:**
  - never show ranges, colours, arrows or verdicts;
  - next-due dates are only what the user typed;
  - the disclaimers stay on screen.
- **AI consent:** the consent covers every path that sends data to AI: vial scan, lab and vaccine
  scans, and the AI food log.
- **Notifications:** when "Show names in notifications" is off, the lock screen never shows a
  compound's name.
- **Sign-in buttons:** Apple and Google follow each company's current button rules, in both themes.
- **Tracker contrast:** the tracker's text and labels meet the 4.5:1 contrast minimum in both
  themes.
- **Settings in 6 languages:** group order and one-line summaries fit in all 6, especially German
  and Portuguese.
- **Premium copy:** everything Premium promises exists today, and nothing free is sold as Premium.
- **Explainer animations:** example numbers only, never a promised health result.
