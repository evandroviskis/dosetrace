# Onboarding that shows the app and builds the first protocol

- source: founder 2026-11-20. He asked for an onboarding that shows what the app does and builds the person's first protocol, so the app opens with it ready. The decisions are recorded in Second Brain/dosetrace/02-decisoes.md on 2026-11-20, from 00:44 to 01:40.
- picture: docs/design/onboarding-protocolo.html (claude.ai/artifact/TaSZB8Ncaz2ErcSaU1to5o).
- council 2026-11-20 (product, UX, engineering, regulatory, journey, growth, copywriter, target user):
  - no AI before the account;
  - Terms come before any health data;
  - the draft protocol is stored on the device until signup;
  - no syringe units before the account;
  - lab example: general markers only, with no ranges, no colours and no improvement trend.
- decided by logic:
  - built with the app's existing native components (AccumulationHero, MarkerChart, SyringeScale, previewFx), never with the HTML of the picture;
  - one term per concept: "diluente";
  - all six languages, natural copy;
  - Portuguese copy is formal.
- open (founder): OP-1 merge "Sobre você" and "Rotina" into one screen; OP-2 an existing account that signs in after building a protocol: ask whether to keep or discard it.
- checklist-signed: founder 2026-11-20 ("Ok, então aqui está aprovado o que a gente estava fazendo aqui agora"). OP-1 and OP-2 follow the recommendations shown to him (merge About you + Routine; ask keep or discard), unless he says otherwise.
- committed-to: next delivery after sign-off. This is JS only, so it ships as an EAS Update. It is checked first on the Fold with a local APK.

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| OB-1 | Order before the account: Splash · 5 feature screens · How DoseTrace can help · Goals · Terms · What you are using · Which compound · How it comes (only when the catalog has both forms) · Vial and dose · Frequency and time · When you start · Protocol ready · About you (+ Routine per OP-1) · Reminders. Then Create account. The old single "Feito para o seu protocolo" screen is removed (rebuild = replace). | missing | | |
| OB-2 | Feature screen 1, syringe: "Quanto puxar na seringa, sem fazer conta". Example card with fields filling in by themselves (Composto 1, Diluente A · 2 mL, 10 mg, 2,5 mg) and the syringe filling to 50 units, using SyringeScale. Labelled "Exemplo". | missing | | |
| OB-3 | Feature screen 2, dose in body, explained: title "Quanto ainda resta no seu corpo?" and the half-life sentence. Animated bars for one dose (100 → 50 → 25 → 12,5 mg, Composto 1, half-life 7 days), then doses adding up on the chart, each dose marked. Footer: "Exemplo simplificado. É uma estimativa calculada, não um exame." | missing | | |
| OB-4 | Feature screen 3, reminders: two notifications arrive; "Tomei" is tapped; "Dose registrada às 08:02". | missing | | |
| OB-5 | Feature screen 4, several protocols: three example cards come in one by one. Sub-text: "Cada protocolo com a sua dose e o seu horário. No Premium, sem limites." | missing | | |
| OB-6 | Feature screen 5, labs: "Envie o seu exame, em PDF ou foto: os valores entram sozinhos e viram gráficos." Glicose, Colesterol LDL and Vitamina D with fictitious values; every point shows its value and its month; one neutral colour; no ranges, colours or trend. Footer: "Exemplo, valores fictícios. O DoseTrace registra seus exames; não interpreta resultados." | missing | | |
| OB-7 | Each feature screen has "Pular" (skips to How DoseTrace can help). Animations respect reduced motion (final frame). | missing | | |
| OB-8 | "Como o DoseTrace pode ajudar você?" with sub-text "Escolha uma ou mais opções.". Options: Calcular quanto puxar na seringa · Receber lembrete na hora de cada dose · Ver uma estimativa de quanto ainda tenho no corpo · Organizar tudo o que eu uso · Guardar meus exames em um só lugar. Multi-select, stored. | missing | | |
| OB-9 | After the account is created, the app opens on the first choice from OB-8: the protocol with its syringe math, the reminder, the dose-in-body chart, Protocols, or the lab journal. | missing | | |
| OB-10 | Goals: 4 categories in alphabetical order (Corpo, Hormônios e energia, Recuperação, Saúde e longevidade) with equal tiles 2 per row, goals in alphabetical order, 12 visible and "Ver todos os objetivos (18)". Same stored keys as today. The false sub-text "Vamos adaptar seu acompanhamento a eles" is removed. | missing | | |
| OB-11 | Goals in Ajustes › Editar perfil use the same component and look (DV-113). | missing | | |
| OB-12 | Terms move before the first health-data question (before "What you are using"). | missing | | |
| OB-13 | "O que você está usando?" as 4 equal icon tiles, in onboarding and in Editar perfil (same component). Same stored keys. | missing | | |
| OB-14 | Which compound: the catalog list filtered by the category picked (and its aliases), plus a typed name kept as written. The app never suggests. | missing | | |
| OB-15 | How it comes: "Frasco com pó, para diluir" or "Caneta ou frasco já pronto". Shown only when the compound exists in both forms; otherwise taken from the catalog. | missing | | |
| OB-16 | Vial and dose on one screen: "Quanto de {compound} vem no frasco?" (mg/mcg), "Quantidade de diluente" (mL) with the hint "A que você usou ou vai usar para diluir.", and "Qual é a dose que você procura?" (mg/mcg). Small vial whose label follows what is typed; the liquid rises when the diluent is filled in. "Ainda não sei esses números" saves the protocol without the vial. No syringe and no units on this screen. Decimal comma read with parseDecimal(text, language). | missing | | |
| OB-17 | Frequency as 6 equal tiles with a sub-line each (Todo dia, Dia sim dia não, 1 vez por semana, 2 vezes por semana, Dias da semana, A cada X dias), a strip of 7 equal weekday buttons, and a large time card. | missing | | |
| OB-18 | "Quando você começa a usar a {compound}?": Começo hoje / Já iniciei o uso / Vou começar em outro dia. Already started: "Quando você iniciou?" plus the app's past-doses question ("Desde {data}, seriam {n} doses. Você aplicou todas?" Sim, todas / Quase todas / Não), with the same records effect as the protocol form. | missing | | |
| OB-19 | "Seu protocolo está pronto": the summary (compound, vial, dose, frequency, since) without units, and a highlighted card "Preparando o cálculo da sua seringa" (empty syringe, animated dots): "A quantidade para puxar na seringa aparece assim que terminarmos a criação da sua conta." | missing | | |
| OB-20 | Every protocol screen has "Montar depois" (the protocol is not built, the onboarding goes on); Back keeps the answers. | missing | | |
| OB-21 | No AI before the account; no network call with the draft before signup. | missing | | |
| OB-22 | The draft is durable on the device: it survives an app kill before signup (for example while confirming the email). After signup it is saved through the same save path as the manual form, with the vial and the past-doses answer. It is never written into the local database before sign-in, so the import of a returning account still runs. The SIGNED_OUT wipe never deletes a draft of a person who has not signed in yet. | missing | | |
| OB-23 | An existing account: per OP-2. Never a silent duplicate, never above the free limit. | missing | | |
| OB-24 | Reminders screen names her dose: "Toda {dia} às {hora}, para a {compound}." The permission is asked only here. | missing | | |
| OB-25 | 6 languages in parity, natural copy; theme tokens only; no emoji; checked on the Fold (local APK) and on the iPhone simulator in light and dark, every screen. | missing | | |
