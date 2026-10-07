# Reminders guaranteed on Android — A-110

- source: founder 2026-10-07 — "Eu preciso evitar que o Android nos boicote. Preciso de uma prevenção para isso"; the principle "o app avisa até a pessoa entrar no aplicativo e deletar esse protocolo" (docs/decisions.md 2026-10-07); picture docs/design/a110-reminders-guaranteed.html approved 2026-10-07 ("aprovado").
- purpose: Android can stop a reminder app in five ways (exact alarms off, battery optimization, "Pause app activity if unused" after ~3 months without opening — which drops the app's alarms, Samsung deep sleep, the background refresh never running). A user still taking something must not lose reminders to any of them without being told exactly what to change.
- builds on: docs/specs/exact-alarms.md (A-106), docs/specs/background-refresh.md (A-107), docs/specs/reminder-check.md.
- code: modules/dt-exact-alarm (adds the hibernation read), lib/reminderHealth.js, lib/notifications.js (readReminderHealth), lib/backgroundTasks.js (last run), screens/ReminderCheckScreen.js (setup mode), screens/TodayScreen.js (alerts), the protocol save path (first protocol → setup step), supabase/functions/send-reminders (wake-up), lib/notificationActions.js (wake-up handler).
- checklist-signed: pending (picture approved 2026-10-07)
- committed-to: 1.3.0 (approved → next build)

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| RG-1 | Android only: right after the user saves their FIRST protocol with a reminder time, the step "Make sure your reminders arrive" opens once (never again automatically; always reachable from Settings → Check reminders). | missing |  |  |
| RG-2 | The step shows, each with its real state and a button that opens the exact Android screen: Notifications, Alarms & reminders, Battery, Pause app activity if unused, and on Samsung "Deep sleeping apps" (cannot be read: open only). A bar counts the readable items that are fine ("N of 4 ready"); coming back from Android's screen updates the rows and the bar. Buttons: "Continue later" until all 4 are ready, then "Done". | missing |  |  |
| RG-3 | The app reads "Pause app activity if unused" on Android 11+ (exempt = OK; not exempt = attention "On: after months without opening the app, Android can stop the reminders" + Turn off); Android 10 or older has no such setting (OK). | missing |  |  |
| RG-4 | Check reminders shows "Automatic refresh": the last run time and until when reminders are scheduled (OK); attention with "Adjust" when it has not run for more than 2 days while a protocol needs reminders. | missing |  |  |
| RG-5 | Today alerts (Android, a protocol with a reminder time, reminders on, Silent mode off): "Your reminders may stop" when Pause app activity is on; "Reminders not refreshed for N days" when the refresh is more than 2 days late. Same look, dot and snooze as the other alerts; tapping opens the step at the item that is missing. | missing |  |  |
| RG-6 | A daily silent wake-up from the server (no visible notification) makes an Android phone run the reminder refresh; the reminders' text and buttons still come from the phone. A failed or missing wake-up changes nothing. | missing |  |  |
| RG-7 | All new text in 6 languages with Android's own names for its settings (checked on the founder's Samsung Fold); theme tokens only, light and dark; no emoji (the close button is an icon). | missing |  |  |
| RG-8 | Device proof on the Fold: the step after a first protocol, each button opens the right Android screen, rows turn OK on return; adb shows the refresh task and a wake-up run. | missing |  |  |
