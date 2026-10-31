# The floating glass tab bar — A-206 (iPhone and Android)

- source: founder 2026-10-31, after the iPhone simulator preview (the native iOS 26 Liquid Glass bar over the real DoseTrace screens): "Pode deixar o efeito do Liquid Glass do jeito que estava antes… Vamos usar isso aí no design tanto para o iPhone quanto para o Android." The variant with a glass lens kept on the selected tab was rejected ("ficou ruim", "não dá pra ler o ícone"). Android prototype on the Fold approved: "Aprovo o Android, pode seguir" (2026-10-31).
- picture: the iPhone preview video (scratchpad glass/liquid-glass-dosetrace.mp4) and the Android prototype video on the Fold (glass/android-glass-fold.mp4), both sent to the founder 2026-10-31.
- replaces: DESIGN.md §5 "flat on the ground, hairline on top" for the tab bar only (decisions.md A-206).
- registry: A-206 (docs/review/features.md).
- code: components/GlassTabBar.js (Android, and the opening skeleton's bar), App.js (MainTabs and BootTabs), lib/tabBarStyle.js (the room the bar takes), lib/theme.js (glass* tokens), components/UpdateNotice.js (sits above the bar); iPhone: Apple's native tab bar (native module → EAS build).
- tests: __tests__/a206GlassTabBar.test.js
- checklist-signed: founder 2026-10-31 15:57 EDT ("Assino o checklist, pode seguir com a opção A")
- blur (founder 2026-10-31 15:57 EDT, option A): Android's real blur of what passes behind (expo-blur, native) goes in the next store build with the iPhone's native bar — no test build just for it.
- committed-to: next build whose scope is open

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| GB-1 | Android: the tab bar is a floating capsule (rounded ends, 12 pt from each side, above the system's bottom bar), a light edge and a soft shadow, on the ground colour; the five tabs keep their glyphs and labels (Hoje, Protocolos, Evolução, Meu corpo, Ajustes). | built | __tests__/a206GlassTabBar.test.js "GB-1 / GB-3"; Fold7 folded and unfolded 2026-10-31 (local debug APK + HEAD JS, +qa4, pt): the capsule 12 pt from each side above the system bar, light edge, sheen on the upper half, soft shadow (docs/evidence/2026-10-31-fold/a206-folded-today-light.jpg; video glass/android-glass-fold-v2.mp4). | |
| GB-2 | Android: the chosen tab sits in a lighter lens that slides to the tapped tab with a spring and a short stretch, like the preview; the chosen glyph and label are ink (bold), the others ink3; never blue. | built | "GB-2"; Fold: the lens slides with a spring and a short stretch; chosen = ink bold, others ink3 (video). | |
| GB-3 | Android: nothing on any tab screen is hidden behind the bar — every screen ends above it (the last card and button reachable), on the phone and on both book pages of the Fold open. | partial | "GB-1 / GB-3" (the bar takes its own room, not over the content); Fold folded: Ajustes and the lab test page end above the bar (a206-folded-settings-end-dark.jpg, a202-folded-button-glassbar-light.jpg). Still owed: every tab on the Fold open and the S25. | |
| GB-4 | Android: the opening skeleton (A-135) draws the same glass bar, so nothing jumps when the app finishes opening. | built | "GB-4"; Fold folded: the opening skeleton shows the same glass bar, no jump when the app finishes opening (a206-folded-opening-same-bar-light.jpg). | |
| GB-5 | Android: a screen that hides the tab bar (Recently deleted selection) still hides it; the update notice (A-127) still sits just above the bar. | partial | "GB-5" (hidden by display none; the update notice above tabBarSpace). Device: Recently deleted selection and the update notice owed. | |
| GB-6 | Light and dark: the capsule, the lens, the labels and the icons are readable in both themes (theme tokens glass* only, both palettes); TalkBack reads each tab as a tab with its name and its selected state. | partial | "GB-6" (glass* tokens in both palettes, no literal colour in the bar, tab role + selected state); Fold folded light and dark readable (video). TalkBack owed. | |
| GB-7 | iPhone: Apple's own tab bar (native, iOS 26 Liquid Glass) with DoseTrace's five glyphs and labels, the bubble that morphs between tabs and the bar that shrinks on scroll, active = ink; the same five tabs, the same order, the same screens. Needs a native build (EAS): proven on the TestFlight build. | | | |
| GB-8 | Fold: the bar spans the full width open (BK-8) and adapts folded; folding and unfolding never loses the chosen tab. | | | |
