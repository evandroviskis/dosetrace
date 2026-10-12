# Diagram check — every mermaid block in docs/product parsed with mermaid 10.9.1 (2026-10-12)

105 diagrams, 91 parse, **14 fail** (they would show as an error box on GitHub / in a viewer):

| File #block | Error | Likely cause |
|---|---|---|
| TRD.md #0 | line 20 "listener (fg resync, 60 s throttle)  A" | sequence/flow syntax: parenthesis + text where an arrow is expected |
| flows/04-vial-and-supply.md #3 | "In 3 days (until 09:00)" | colon inside a transition label (09:00) |
| flows/07-food-log-day.md #1 | "20:00 Nothing else tod…" | colon in label (20:00) |
| flows/07-food-log-day.md #4 | "20:00 ahead" | colon in label |
| flows/08-reality-check.md #3 | "day-21 10:00 + 20:00" | colons in label |
| flows/10-curve-and-journey.md #2 | "Restore --> Default" | `Default` is a reserved word in stateDiagram |
| flows/12-account-signout-delete.md #2 | "marker deleted:id" | colon in label |
| research/02-doses-today.md #1 | "(decisions.md:191)" | colon in label |
| research/02-doses-today.md #5 | "(until 09:00 that day)" | colon in label |
| research/03-reminders.md #8 | "20:00 still ahead" | colon in label |
| research/05-curve-journey.md #0 | "(stack: replace, embedded:" | colons in label |
| research/05-curve-journey.md #1 | "Restore --> Default" | reserved word |
| research/07-onboarding-account-premium.md #0 | "marker wipe:<owner>" | colon + angle brackets in label |
| research/07-onboarding-account-premium.md #2 | "(iOS: OS prompt)" | colon in label |

Fix: write times as "09h00"/"20h" or quote the label, rename the state `Default` (e.g. `DefaultView`), drop `<...>`.
The Portuguese picture (docs/design/fluxos-dosetrace.html) was checked separately: 15/15 render.
