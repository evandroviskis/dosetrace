# DT Council brief — "the app never explains what its features are for" (2026-11-12)

## The founder's request (Evandro, 12/11, relayed by the Ads session, summarized)
"There needs to be a small button, a question mark somewhere, that explains all this, or takes the person to the FAQ and explains what it is and what it is for... We need a better name for this curve. Explain it, a short summary of what it does. And when the person wants more, tap and get depth: what it is for, who discovered it, etc. And this has to be for ALL the app's features... It looks like we are inventing the term, inventing the calculation. The person has no idea what seeing the compound's half-life is for, or seeing what level it was at on the day of the blood test." He wants the council to say WHAT TO CHANGE in the app.

## Evidence from marketing (Metricool 25/10–12/11)
Reels: 83–100% of viewers skip before 3 s; interactions ~0; organic reach 1–6 people/post without the founder sharing. Diagnosis: the audience does not know the problem exists (peaks/troughs, accumulation, half-life). The founder himself learned it in a course 3 months ago. Same for the reconstitution calculator. Marketing will now teach the concept before showing the app; the app must say the same thing.

## What already exists in the app (redesign/graduated 7aa208e)
- components/FeatureExplainers.js + lib/featureExplainers.js: first-time animated explainers (approved 2026-09-30) for FREE features only: recon calculator, vial, reminders, injection sites, dose log, energy/protein, lab journal, notes. Rules: shown the first time a person reaches an unused feature, never on launch, "Not now"/"Try it", max one a day, never on the dose-logging path. One-line bodies (e.g. "Each dose you log leaves the vial...").
- screens/components/LearnBlock.js: "Entenda os números" + "Fontes e referências" folds (closed) under Journey tiles and at the end of Progress (energy formulas with citations; App Review 1.4.1).
- Curve screen (SerumCurveScreen, Premium): title "Curva de acúmulo"/"Dose accumulation", "Nível est.", peak, projection, "Ir para uma data de coleta", collapsed "Como o modelo calcula" (half-life, Tmax, evidence badge "Meia-vida: dados clínicos", source). NO text explains why the level rises and falls between doses, what accumulation/steady state is, what half-life is, or why a lab result depends on the draw day. Onboarding line: "Veja a quantidade estimada no seu corpo aumentar ao longo do tempo". FAQ (FAQ screen) only lists the curve as a Premium feature. App search (B2) already indexes help/legal texts ("Ajuda e textos legais").
- Pending founder decision (picture sent 11/11, docs/design/curve-dose-in-body.html): the curve will show "dose in the body" (estimate) instead of "share of the dose not yet eliminated"; open picks: name "no corpo" vs "no sangue", range band when studies disagree, show "still at the injection site" for oil depots.

## Marketing's proposal (for the council to judge; the founder decides)
1. A "?" on every feature: 2–3 line summary + "Saiba mais" to the FAQ or a depth page (what for, the science, who discovered it, sources).
2. Curve: first-open explainer, 3 cards: "Peak and trough" (rises after each dose, falls until the next); "Accumulation" (with repeated doses it climbs until it levels off in ~4–5 half-lives); "Your lab result is a snapshot of one day" + button to the draw date.
3. Feature name: "Pico e Vale" (peak and trough, the TRT community's term) with descriptor "how much is still in your blood, day by day (estimate)". Founder decides.
4. History for "Saiba mais", own words, verified sources: Widmark (alcohol, 1919–1930s); Teorell 1937 (first PK model, "father of pharmacokinetics"); Dost 1953 (coined "Pharmakokinetik", book "Der Blutspiegel"); Gibaldi, Levy, Wagner (1960s–70s standardization).
5. Same pattern for every feature: recon calculator, vials, labs, Est. level, Your real numbers, BMR.

## Hard rules (never re-litigate)
- Honest journal + pure math: NEVER interpret, recommend, diagnose; no "safe/right dose"; the "?" explains the concept, never what the person should do (Apple 1.4.1 / SaMD line; AI hard line).
- 6 languages (en, es, pt, fr, de, it), natural, formal pt; no emoji (FeatureIcon set); theme tokens, both themes; show a picture to the founder BEFORE any visual change; the curve is an estimate, not a measurement; precision principle for the curve ("reflect, from the studies, how many mg the person has in the blood").
- Divulgação never names a compound (posts/ads/screenshots/store text) — in-app is fine.
- Secondary sections arrive collapsed (founder rule 2026-10-27).
- Every approved item gets a numbered checklist in docs/specs before building.

## What the council must return (through your lens only; stay short)
- Is the diagnosis right? What exactly to change in the app (concrete placements: which screens, what component, what text pattern), in priority order.
- The curve's name: judge "Pico e Vale", "Curva de acúmulo", and the pending "dose no corpo" framing together — one recommendation, with the reason.
- The "?" pattern: one consistent component or reuse FeatureExplainers/LearnBlock? Where does "Saiba mais" depth live (FAQ vs per-feature page)?
- Risks (regulatory wording, clutter, translation load, App Review), and what NOT to do.
- Max ~250 words.
