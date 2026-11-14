# The curve explained ("Dose no corpo", Bateman curve, help mark, cards, Learn more)

- source: founder 2026-11-12 (via the Ads session): "Precisa ter um botãozinho, um question mark… que explica isso tudo, ou que leva a pessoa para o FAQ… A gente precisa definir um nome melhor para essa curva… E isso tem que ser também para todas as funções do aplicativo… A impressão que dá é que a gente está inventando o termo, inventando o cálculo." Then: "Existe algum jeito da gente usar o nome que foi recomendado pelo conselho e deixando claro que isso seria a curva de Bateman? E aí entrar com a explicação técnica de forma simples…"
- council: dt-council 2026-11-12 (7 roles; brief docs/review/council-2026-11-12-help-brief.md): curve first, one shared help mark in the title row, name "Dose no corpo"; texts checked by the pharmacometrician (citations) and regulatory (no advice).
- picture: docs/design/curve-explained.html (approved as is).
- checklist-signed: founder 2026-11-13 ("Aprova o nome, os cartões e as perguntas como estão. Aprova também o 2 e o 3.") — 2 = Learn more lives in the FAQ (stable ids, app search already indexes it); 3 = free users see the three cards on the Premium lock.
- related, separate: the "dose in the body" model change (docs/design/curve-dose-in-body.html; band and depot layer still open). The fixed sentence speaks of "circulação"; it ships together with that model change, never before.
- committed-to: next delivery (EAS Update, JS only).

## Hard rules
- Never recommend, interpret or diagnose. Banned in every language: best time to inject / to draw blood, optimize, ideal, avoid crashes, smoother levels, any line that reads the person's lab result through the curve.
- Texts exactly as approved in pt (picture); en, es, fr, de, it written naturally from them (formal pt; fr vous; es/de/it tu/du).
- Theme tokens only, both themes; no emoji; one help mark component.

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| CE-1 | The curve screen title is "Dose no corpo" (×6) with the line "estimativa por modelo farmacocinético (curva de Bateman)" below it; the same name everywhere the feature is named (Journey tile, My Body tile, onboarding, Premium lock, FAQ, app search, notifications if any). | missing |  |  |
| CE-2 | Under the title, the fixed sentence "Estimativa de quanto de cada dose já chegou à circulação e ainda não foi eliminado, dia a dia, a partir das doses que você registrou." (×6). | missing |  |  |
| CE-3 | The chart card ends with "Estimativa a partir de médias de estudos publicados. Não é medição nem orientação médica." (×6). | missing |  |  |
| CE-4 | One shared help mark component (components/HelpMark) at the end of the title row: the existing help glyph, ink2, 44 pt touch area, accessibility label; the curve screen uses it. The app's other help glyphs (ProtocolsScreen "?" circles, SexAtBirthWhy, Settings) are moved onto it. | missing |  |  |
| CE-5 | First opening of the curve shows the three cards one at a time (Picos e vales; Acúmulo; O exame mede um momento — texts as the picture), "n de 3", dots, Pular/Voltar and Próximo/Entendi, the footer of CE-3 on each, "Saiba mais" on the last; shown once per person and device; the help mark reopens them any time. | missing |  |  |
| CE-6 | "Saiba mais" opens the FAQ at the curve's questions: the 10 questions of the picture (O que é a curva de Bateman? … Fontes) as one FAQ group, each with a stable id; FAQ deep links resolve by id, not by position. | missing |  |  |
| CE-7 | App search finds each of the 10 questions in every language (e.g. "meia-vida", "Bateman", "half-life"). | missing |  |  |
| CE-8 | The Premium lock of the curve shows the same three cards to free users before the paywall button. | missing |  |  |
| CE-9 | The onboarding feature line for the curve no longer says the amount "aumenta"; it names "Dose no corpo" and says what it shows, in the approved wording style (×6). | missing |  |  |
| CE-10 | A guard test fails if any curve/help text in any language contains the banned words (deve/should/recomend/recommend/ideal/otimiz/optimi/melhor hora/best time…). | missing |  |  |
| CE-11 | Six languages in parity; natural translations; formal pt. | missing |  |  |
| CE-12 | Light and dark checked on the simulator: curve screen, help mark, the three cards, the FAQ group, the Premium lock; screenshots in docs/evidence/curve-explained/. | missing |  |  |
