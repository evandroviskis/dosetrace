# Book layout on foldables (two pages when the screen is wide)

- source-spec: mock https://claude.ai/artifact/SryKMs53j6PwNstCPjGXJA (version 1); founder 2026-10-01: "pares aprovados, pode entrar no próximo build"; grok/155, grok/156
- registry: S-26 (docs/review/features.md), ships in the next build (1.3.0)
- purpose: on an unfolded foldable the app opens like a book. The list is on the left page and the item you tap opens on the right page. On a phone, or folded, nothing changes.
- devices:
  - Galaxy Z Fold (open ≈ 830 × 750 pt) gets it in 1.3.0.
  - The iPhone Duo gets it only in the first build made with the iOS 27.1 SDK (Xcode 27.1). Until then iOS shows the app letterboxed at phone size, so there is nothing to build for it now (grok/154).
- checklist-signed: (pending, founder)
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
