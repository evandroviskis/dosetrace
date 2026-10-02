# Book layout on foldables (two pages when the screen is wide)

- source-spec: mock https://claude.ai/artifact/SryKMs53j6PwNstCPjGXJA (version 1); founder 2026-10-01: "pares aprovados, pode entrar no próximo build"; grok/155, grok/156
- registry: S-26 (docs/review/features.md), ships in the next build (1.3.0)
- purpose: on an unfolded foldable the app opens like a book. The list is on the left page and the item you tap opens on the right page. On a phone, or folded, nothing changes.
- devices:
  - Galaxy Z Fold (open ≈ 830 × 750 pt) gets it in 1.3.0.
  - The iPhone Duo gets it only in the first build made with the iOS 27.1 SDK (Xcode 27.1). Until then iOS shows the app letterboxed at phone size, so there is nothing to build for it now (grok/154).
- checklist-signed: 2026-10-01 by the founder ("checklist assinado, pode começar"); BK-13…BK-22 added 2026-10-01 from the journey review (grok/160): the 6 decisions approved by the founder ("aprovo as 6 recomendações, pode seguir"), BK-19…BK-22 are the review's confirmed gaps, built under the same go
- evidence plan:
  - logic as pure-function tests in lib/bookLayout.js;
  - the look on the founder's Z Fold 7 with an internal Android build. The iOS simulator cannot show a wide window: iPhone landscape is 956 × 440, below the height rule, and supportsTablet is false.

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| BK-1 | The two pages show only when the window is at least 700 pt wide AND at least 560 pt tall (Z Fold open, either orientation). A phone in portrait or landscape, and a folded Fold, keep one column. | missing |  |  |
| BK-2 | One column = exactly today's app: same screens, a tap pushes a screen with "‹ back". | missing |  |  |
| BK-3 | Today: left page = alerts, tracker, food log and the doses, as today. Right page = Dose log by default. Tapping a dose shows that dose on the right (name, due time, dose) with the drawn syringe: the same SyringeScale as the Today card and the protocol screen (the protocol's syringe size, the draw-to fill, a number every 10). Then Mark taken and Skip. Those go through the same actions as the Today card, with the site question first for injectables (S-25). | missing |  |  |
| BK-4 | My Protocols: left = the Protocols list (sort, + Add). Right = the protocol screen of the tapped protocol; by default the first in the list, or the one opened from Today or a notification. Edit, + Add and New vial open as today. | missing |  |  |
| BK-5 | Journey: left = the dashboard. Right = Your progress by default. The food log card opens the AI food log chat on the right page. The Dose accumulation tile opens the Curve on the right for Premium, and the Paywall as today for free users. | missing |  |  |
| BK-6 | My Body: left = the lab tests (by date, + Upload, Export, search) and the vaccines. Right = the tapped test's detail, or the tapped vaccine; by default the newest test. Dose accumulation stays reachable from the left page (opens the Curve on the right). | missing |  |  |
| BK-7 | Settings: left = profile card and the group list (Notifications, Data & privacy, Support, Recently deleted protocols, Account & preferences). Right = the chosen group's content; Notifications by default. | missing |  |  |
| BK-8 | The selected item has an ink outline on the left page. The tab bar spans the full width. Each tab keeps its right-page item while the app is open. | missing |  |  |
| BK-9 | Nothing sits on the fold: a 22 pt gutter between the pages, centred on the screen, holds no text or control. | missing |  |  |
| BK-10 | Folding and unfolding never loses the user's place or anything typed. Folding with an item open on the right shows it as a pushed screen with "‹ back". Unfolding with a pushed item shows it on the right page. Sheets and pickers stay open with their typed values. | missing |  |  |
| BK-11 | Full-screen flows keep one centred column as today: Paywall, sign-in, onboarding, reset password, the add/edit protocol steps and every sheet or popup. | missing |  |  |
| BK-12 | Both themes, theme tokens only, no emoji, no new strings. Any new string needs approval in 6 languages first. | missing |  |  |
| BK-13 | Rotation (founder decision 1): on Android the two pages show only when the window is at least as tall as it is wide (the Fold held normally, hinge vertical). The Fold turned on its side stays one column, so the fold never crosses a page. iPhone Duo is decided with the first iOS 27.1 SDK build. | missing |  |  |
| BK-14 | Drafts (founder decision 2): text typed and not yet saved on a page is kept per item until saved or the app closes — tapping another item, folding, unfolding or leaving the screen and coming back shows it again. Covers the protocol note, the Progress forms (reality-check weigh-in and intake, target, past weigh-in) and the food chat answer field. Also closes A-77. | missing |  |  |
| BK-15 | Android back (founder decision 3): the same as today (leaves the screen, tab or app). The right page has no back control of its own. A default nobody chose is not pushed on fold. | missing |  |  |
| BK-16 | Doses on Today's right page (founder decision 4): today's due doses and yesterday's pending ones open on the right; upcoming doses show their info only, with no Mark taken. A Taken or Skipped dose shows its state and Undo, never a second Mark taken. Each dose carries its own day and slot, so a twice-daily protocol writes the right slot and yesterday's pending dose is written to yesterday (test with doses_per_day = 2). The site question comes first for injectables (S-25). | missing |  |  |
| BK-17 | Food chat on the right page (founder decision 5): no Done and no auto-close; it stays until the user picks another item. | missing |  |  |
| BK-18 | Vaccine on the right page (founder decision 6): a read page with the vaccine name, date given, next due, dose number, batch/lot, provider and notes, using existing labels, with an Edit button that opens today's edit sheet. | missing |  |  |
| BK-19 | The two pages update each other: a dose taken, skipped or undone on one page shows on the other right away (Today ↔ Dose log), and a weigh-in on Progress updates the Journey tiles, without switching tabs. | missing |  |  |
| BK-20 | One popup at a time across both pages: a site question, vial prompt or site editor waits while another is open. | missing |  |  |
| BK-21 | Accessibility: after a selection, screen-reader focus moves to the right page; the selected item reports itself as selected; reading order is the left page, then the right page. | missing |  |  |
| BK-22 | A screen shown on a right page never navigates back or replaces the screen under it (no GO_BACK or REPLACE from an embedded Log, Progress, Curve or food chat). | missing |  |  |
