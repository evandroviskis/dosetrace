# "Dose no corpo" — the curve shows the amount in the body (model change)

- source: founder 2026-11-11 ("o mais próximo da realidade possível… não brincar com os números… Se a intenção é mostrar aproximadamente a quantidade da dose que ainda está no sangue, que mostre isso") and 2026-11-13 ("é sim nas duas": band when studies disagree; separate layer "ainda no local da aplicação").
- picture: docs/design/curve-dose-in-body.html (approved; its "Hoje" note corrected 2026-11-13).
- model and parameters: docs/review/dose-in-body-params.md (pharmacometrician, 2026-11-13). Precision principle (founder 2026-10-26): every number has a source; a range never becomes one number; nothing invented.
- builds on: docs/specs/curve-explained.md (same delivery; the fixed sentence speaks of circulation and ships only with this).
- checklist-signed: founder 2026-11-13 (picture approved in full).

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| DB-1 | Depot esters with a sourced parent elimination t½ (testosterone cypionate, enanthate, propionate, undecanoate, suspension, Sustanon): the curve and the level show the amount of the PARENT hormone in the body with formula F1 (release convolved with elimination), as a band computed at t½_true lo and hi, mass of the parent (×S from formula masses), unit "mg de testosterona". | missing |  |  |
| DB-2 | The same esters show a separate, labeled layer "Ainda no local da aplicação, não liberado" (U from the params doc) on its own scale; the note says F = 1 is an assumption for IM oil. | missing |  |  |
| DB-3 | Depot esters with NO sourced parent elimination t½ (nandrolone decanoate/phenylpropionate, trenbolone ×3, drostanolone ×2, boldenone, methenolone, stanozolol, estradiol valerate/cypionate, progesterone in oil): only the "ainda não liberado" layer is drawn, with "Parte já no corpo: sem estudo"; where the apparent t½ itself has no source, the existing "sem estudo" style stays and nothing is called sourced. | missing |  |  |
| DB-4 | SC compounds with a human F on the label and no flip-flop (semaglutide 0.89, tirzepatide 0.80, liraglutide 0.55, cetrorelix 0.85, PT-141 ~1, octreotide ~1, FSH band 0.70–0.778): today's curve × F (band where F is a range). | missing |  |  |
| DB-5 | Dulaglutide F per dose (AD-95, never per protocol): 0.75 mg → 0.65; 1.5, 3 and 4.5 mg → 0.47 (3 and 4.5 marked "estimativa da bula"); between 0.75 and 1.5 → band [0.47, 0.65], never interpolated; below 0.75 or above 4.5 → ceiling. | missing |  |  |
| DB-6 | Compounds with no human F (the params doc lists) are drawn at F = 1 and every number reads "no máximo X"; tesamorelin is a dashed ceiling at F = 0.04 ("no máximo"), no fill, no lower edge. HCG and HMG are ceilings (HCG names 0.40 as the one recombinant measurement). | missing |  |  |
| DB-7 | Flip-flop proteins: HGH uses F1 with t½_true 0.4 h and F 0.80; EPO uses F1 with t½_true band [4, 13] h as a ceiling. | missing |  |  |
| DB-8 | Supporting math: limit forms for ke = kd and ke = kr; mass balance (∫release = D·S·F) holds in a test; the steady-state average equals S·F·D·t½_true/(ln2·τ); curve sampling includes ln2/ke so a fast rise is not drawn as chords; "Doses no nível" counts on the release shape (not on ≥1% of the scaled amount). | missing |  |  |
| DB-9 | Every place that shows the level (curve header, Journey tile, My Body tile, "Estimar em uma data", the hours mode) shows the band ("entre X e Y mg de testosterona"), the ceiling ("no máximo X") or "sem estudo" consistently; band edges with 2 significant figures (0.081 never reads "0,1"); body numbers carry "(não é o exame de sangue)" where the level is shown with a draw date. | missing |  |  |
| DB-10 | Each new parameter (S, F, t½_true) in code carries its source and a status (confirmed / label to re-read / unconfirmed); a test fails if a curve compound uses a number without a source. The L/U items of the params doc are listed in the spec's deviation column until re-read. | missing |  |  |
| DB-11 | Worked example test: testosterone cypionate 100 mg weekly at steady state matches the params doc within 2 %: body trough 0.081–0.81 mg, peak 0.11–1.13 mg, average 0.10–1.00 mg; depot 163 just after the injection, 93 just before the next. | missing |  |  |
| DB-12 | Six languages for every new string (natural, formal pt); light and dark checked on the simulator (curve with a testosterone ester, a GLP-1, a peptide ceiling, an ester without source); screenshots in docs/evidence/dose-in-body/. | missing |  |  |
