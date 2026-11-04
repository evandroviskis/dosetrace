# Manual protocol form: no pre-filled reminder time

- source: founder 2026-11-04 16:41 EST ("1 Sim", docs/decisions.md): a new protocol starts with no time and extra doses get no 14:00 / 21:00; the person picks each time before Save. Then 2026-11-04 17:05 EST ("A, pode publicar"): proposal A of the picture.
- picture (binding): docs/design/manual-form-no-default-time.html, proposal A, light and dark.
- why: the form opened with the clock time (rounded to 5 minutes) and "Duas vezes" / "3 vezes" added 14:00 / 21:00; a reminder in the middle of the working day is ignored and the dose is missed. The person could save without ever choosing a time.
- strings: none new. The empty field, the warning title and the wheel use protocols_time_missing_title ("Escolha o horário"), protocols_time_missing_body, protocols_what_time and done, already in the 6 languages.
- unchanged on purpose: the AI protocol assistant (its own time step, AP-36..AP-41), Today, vials, the reminder plan (an invalid or empty time is already skipped), every other wheel in the app (date wheels, birth year, syringe, vaccines, calculator, curve).
- checklist-signed: 2026-11-04, founder ("A, pode publicar")
- committed-to: the next delivery (JS only: EAS Update on the store channel, founder "pode publicar")

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| MF-1 | A new protocol (the form, and the screen's first state) starts with no reminder time: one empty dose, never the clock time. | built | __tests__/manualFormNoDefaultTime.test.js: "MF-1: a new protocol starts with no reminder time" | |
| MF-2 | Changing the dose count to 2 or 3 adds EMPTY slots (no 14:00 / 21:00); going back to fewer doses drops the extra ones; an interval over 2 days keeps one dose with its time, or empty. | built | __tests__/manualFormNoDefaultTime.test.js: "MF-2: the dose count adds EMPTY slots" | |
| MF-3 | No app-picked time is left in the form code (no clock read, no 14:00 / 21:00, no fixed time in the schedule state). | built | __tests__/manualFormNoDefaultTime.test.js: "MF-3: no app-picked time is left anywhere in the form code" | |
| MF-4 | Editing an old protocol with fewer stored times than doses, or no stored time, shows EMPTY slots for the missing ones, never the clock or 14:00 / 21:00. | built | __tests__/manualFormNoDefaultTime.test.js: "MF-4: editing an old protocol with fewer stored times than doses" | |
| MF-5 | Stored times stay exactly as they are when a protocol is opened for Edit, and an unchanged Save writes no reminder_time. | built | __tests__/manualFormNoDefaultTime.test.js: "MF-5: stored times stay exactly as they are" | |
| MF-6 | Every empty slot shows the clock icon, "—" and the placeholder "Escolha o horário" (protocols_time_missing_title, 6 languages) in the empty-field grey (ink3, the text-field placeholder colour, both themes); a slot with a time shows the time as before. | built | __tests__/manualFormNoDefaultTime.test.js: "MF-6: an empty slot shows" | |
| MF-7 | Save with any slot empty stops on the existing sheet (warning icon, "Escolha o horário", "Escolha o horário de cada dose. O lembrete será enviado nesse horário.", OK) and nothing is written; on lyophilized protocols, where Save is on step 5, the form goes back to step 4 and shows the same sheet. | built | __tests__/manualFormNoDefaultTime.test.js: "MF-7: Save with any slot empty stops on the existing sheet" | |
| MF-8 | The iPhone wheel on an empty slot opens at 12:00, never the clock; turning only the hour keeps :00 (never the clock minutes); a slot with a time opens on that time. The Android time dialog opens at 12:00 on an empty slot too. | built | __tests__/manualFormNoDefaultTime.test.js: "MF-8: the time wheel opens at 12:00 on an empty slot" | |
| MF-9 | On an empty slot "Concluído" is dimmed (opacity .35, the screen's trashBtnOff) and disabled (accessibility state disabled) until the wheel is turned. | built | __tests__/manualFormNoDefaultTime.test.js: "MF-9: \"Concluído\" is dimmed and disabled" | |
| MF-10 | Turning the wheel fills the field at once (as before), and "Concluído" lights up. | built | __tests__/manualFormNoDefaultTime.test.js: "MF-10: turning the wheel fills the field" | |
| MF-11 | A tap outside the wheel closes it without saving anything (an untouched empty slot stays "—"); "Concluído" only closes; the old "Done on an empty slot saves the clock time" is gone. DTPickerSheet has an optional onCancel (outside tap) and doneDisabled. | built | __tests__/manualFormNoDefaultTime.test.js: "MF-11: a tap outside the wheel closes it without saving" | |
| MF-12 | Android: Cancel on the native time dialog saves nothing (event type 'dismissed' is ignored, as the start-date dialog already does); OK saves the time on screen. | built | __tests__/manualFormNoDefaultTime.test.js: "MF-12: Android Cancel on the time dialog saves nothing" | |
| MF-13 | The other wheels in the app keep their behaviour (no onCancel / doneDisabled passed; outside tap = Done as before). | built | __tests__/manualFormNoDefaultTime.test.js: "MF-13: the other wheels keep their behaviour" | |
| MF-14 | Seen on the iPhone 17 Pro simulator in LIGHT and DARK, matching proposal A: one empty slot, two empty slots, Save with Dose 2 empty (the sheet), the wheel at 12:00 with "Concluído" dimmed, after turning (field filled, "Concluído" lit), tap outside leaves "—". | partial | waiting for the simulator (coordinator) | |
