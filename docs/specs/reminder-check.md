# Reminder check

- source: founder 2026-10-04 ("Adicione uma verificação no app pois não vejo notificações de lembretes de doses no Android… mais de uma semana… não me avisa de dose alguma"); option B picked 2026-10-05 ("1 B") from the pictures on https://claude.ai/artifact/LdqvnH85t2VgFb4FidmW36 (app today | A | B, light and dark).
- purpose: a reminder that never arrives is invisible — the user only notices a week later. The app reads what the phone allows it, shows it in one place with a way to fix each thing, proves delivery with a test reminder, and says so on Today when something it can read is blocking reminders.
- what the app can read: notification permission (both); each Android notification category; Android battery optimization; the reminders scheduled on this phone (count, next). What it cannot read: Android "Alarms & reminders" (exact alarms) and Samsung's deep-sleeping apps list — those rows only open the right system screen and explain what to check.
- root cause found while diagnosing (founder's Fold, 10 active protocols, persistent reminders on): the dose budget shared iPhone's 64-notification cap on Android too, leaving each protocol 1–2 upcoming reminders, topped up only when the app opens. Android has no such cap.
- code: lib/reminderHealth.js (pure rules), lib/notifications.js (readReminderHealth, sendTestReminder, open*Settings), screens/ReminderCheckScreen.js, Settings row, Today alert.
- checklist-signed: pending (picture approved 2026-10-05: "1 B")
- committed-to: 1.3.0 (approved → next build)

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| RC-1 | Settings > Notifications has a "Check reminders" row on BOTH platforms (replaces the Android-only "Reminders not arriving?" row); its line says how many readable settings block reminders, or that everything readable is fine. | missing | | |
| RC-2 | The row opens the Reminder check screen: title, one line on what it shows, then one row per check with its state and, when it is not fine, a button that opens the exact system screen to fix it. | missing | | |
| RC-3 | Checks on Android: notifications allowed; the "Dose reminders" category on; battery not restricted (optimized = a warning "can delay", not a block); Alarms & reminders (open only, cannot be read); Samsung only: deep-sleeping apps (open only, cannot be read). On iPhone: notifications allowed. | missing | | |
| RC-4 | A "Scheduled on this phone" block shows the next dose reminder (day, time, protocol name, or the private title when names are hidden) and how many dose reminders are scheduled; "None scheduled" when reminders are on and active protocols have a time but nothing is scheduled. | missing | | |
| RC-5 | "Send a test reminder" schedules a dose-style reminder 10 seconds ahead through the same channel/category path as real dose reminders; the screen says it arrives in 10 seconds and the app may be closed. It never logs a dose. | missing | | |
| RC-6 | Today shows an alert "Your reminders are blocked" only when dose reminders are on in Settings, at least one active protocol has a reminder time, and a readable check blocks (permission off, Dose reminders category off, or nothing scheduled). Tapping it opens the Reminder check; it can be snoozed like the other alerts. Never shown for warnings only (battery optimized) or for checks the app cannot read. | missing | | |
| RC-7 | Android dose reminders are no longer cut by iPhone's 64 cap: with 10 active protocols and persistent reminders each protocol keeps several days of reminders ahead. iPhone keeps its budget, and vial-expiry alerts count inside it. | missing | | |
| RC-8 | All new text in 6 languages, translated naturally; theme tokens only (light and dark); no emoji; DoseTrace sheets, no native alerts. | missing | | |
