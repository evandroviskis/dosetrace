# Alarms & reminders (Android exact alarms) — A-106

- source: founder 2026-10-07 ("A-106 entra na 1.3.0"; picture docs/design/a106-exact-alarms.html "Aprovado, pode fazer").
- purpose: on Android 14+ "Alarms & reminders" is off by default for apps; expo-notifications then schedules inexact alarms and every reminder can arrive up to 1 hour late (adb on the founder's Fold, build 47: all 248 alarms with window +1h). The user never knows. The app reads the permission, says so on Today and in the Reminder check, and opens the system screen.
- what changes from reminder-check.md: the "Alarms & reminders" row (RC-3) becomes readable on Android 12+ (a small native check, modules/dt-exact-alarm), so it gets real states instead of "open only".
- code: modules/dt-exact-alarm (Kotlin: AlarmManager.canScheduleExactAlarms), lib/notifications.js (readReminderHealth.exactAlarms, resync when it turns on), lib/reminderHealth.js (rules), screens/ReminderCheckScreen.js, screens/TodayScreen.js (alert), i18n.
- checklist-signed: 2026-10-07 by the founder ("assino as duas"; picture approved the same day)
- committed-to: 1.3.0 (approved → next build)

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| EA-1 | On Android 12 or newer the app reads whether "Alarms & reminders" is allowed. Android 11 or older counts as allowed (exact alarms need no permission there); iPhone has no such row. If the check cannot run (module missing), the row falls back to today's "open only" text. | built | __tests__/exactAlarms.test.js: "EA-1/EA-2"; __tests__/exactAlarms.test.js: "EA-1: readReminderHealth reads the native check" (Kotlin module modules/dt-exact-alarm; compiles in the next EAS build) |  |
| EA-2 | Reminder check row "Alarms & reminders": off → "Off: reminders can arrive up to 1 hour late" in the attention color with a "Turn on" button that opens Android's Alarms & reminders screen for DoseTrace; on → "On: reminders arrive on time" with OK. Never the red "blocked" state. | built | __tests__/exactAlarms.test.js: "EA-1/EA-2"; __tests__/exactAlarms.test.js: "EA-2: the Reminder check row"; picture approved 2026-10-07 (docs/design/a106-exact-alarms.html) |  |
| EA-3 | Today shows the alert "Reminders may be late · Turn on "Alarms & reminders" so they arrive on time." only on Android, only when the permission is off, dose reminders are on in Settings and an active protocol has a reminder time. Same row look, dot and snooze as the other alerts; tapping opens Android's Alarms & reminders screen directly. | built | __tests__/exactAlarms.test.js: "EA-3: Today warns"; __tests__/exactAlarms.test.js: "EA-3: Today adds the" |  |
| EA-4 | When the user comes back to the app with the permission now on, every reminder is rescheduled (so the ones already scheduled become exact) and the alert disappears without reopening the app. | built | __tests__/council3Reminders.test.js: "EA-4: turning Alarms & reminders on resyncs once"; __tests__/council3Reminders.test.js: "EA-4: re-arming cancels and reschedules every snoozed copy" |  |
| EA-5 | The "Your reminders are blocked" alert (RC-6) is unchanged: exact alarms off never counts as blocked, and the Settings row line keeps counting only blocks. | built | __tests__/exactAlarms.test.js: "EA-5"; __tests__/reminderHealth.test.js (RC-6 unchanged) |  |
| EA-6 | All new text in 6 languages, with the name Android uses in each language for the setting; theme tokens only (light and dark); no emoji. | built | __tests__/exactAlarms.test.js: "EA-6"; i18n parity tests; tokens only (no new colors: attention/ok/act from the theme) |  |
| EA-7 | Device proof on the founder's Fold: with the permission off the row and alert show; after turning it on, adb shows the dose alarms scheduled as exact (no +1h window). | missing |  |  |
