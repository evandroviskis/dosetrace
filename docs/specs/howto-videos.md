# How-to videos in the FAQ ("Como fazer")

- source: founder 2026-11-26 (decision 65; specification 17:20 in the Ads session; at this session): videos on a remote server, never on the phone, playing only with internet (offline the text answer stays), in the 6 app languages and in the language chosen in the app; "se pudesse abrir dentro do aplicativo era melhor"; the video closes any time and, when it ends, the person is back on the questions; "Os vídeos tem que aparecer só lá nas perguntas" (no first-time hint, no "?" on each screen); variants by phone where the screen differs and by sex only where the video differs (the injection-site body); player inside the app even if it delays ("vai atrasar 1 ou 2 dias e tá tudo bem").
- picture: docs/design/videos-perguntas.html (claude.ai/artifact/MScL9Kd6mNgL2pQq74jhCN), approved 2026-11-26 ("Aprovo o desenho, pode construir").
- council: dt-council 2026-11-26, 11 roles, GO-WITH-CHANGES (Second Brain dosetrace/conversas/dt-council-2026-11-26-videos-como-fazer.md).
- hosting: Supabase Storage public bucket `howto` (migration 20261126200000_howto_videos_bucket, applied 2026-11-26).
- checklist-signed: founder 2026-11-26 ("Assino os dois checklists, pode seguir").
- committed-to: next build (native: the player module changes the runtime fingerprint; a store build, not an EAS Update).

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| HV-1 | An open FAQ answer shows one quiet row under the text — a monoline play glyph (FeatureIcon, new `play` glyph in the house style), "Ver o vídeo" and the video's real duration in tabular numerals ("0:42") — only when the remote manifest has a video for that question id in the app language and for this phone's variant; otherwise nothing is shown. | missing | | |
| HV-2 | The row is a sibling of the answer (never inside the question's tap target), so a tap never collapses the question, and screen readers read it as "Vídeo, 42 segundos: <question>" in the 6 languages. | missing | | |
| HV-3 | Tapping the row opens a full-screen player inside the app (not the browser): dark surface in both themes, "×" that closes at any moment, play/pause, progress with elapsed and total time, the question title on top, and the fixed line "Valores de exemplo, não é uma dose. Use os números da sua prescrição ou do rótulo." (6 languages) under the video. | missing | | |
| HV-4 | When the video ends, the player closes by itself and the person is back on the same question, open, at the same scroll position; Android back and the iOS swipe close it the same way. | missing | | |
| HV-5 | Offline (or the manifest cannot be read): the row becomes the line "Para ver o vídeo, conecte-se à internet. A resposta está acima." (6 languages); a tap never opens an empty player; the text answer is always shown. | missing | | |
| HV-6 | The manifest is one JSON file in the `howto` bucket: `{ v: 1, videos: { "<faq question id>": [{ lang, variant, url, dur, minApp?, maxApp? }] } }`. It is fetched with a 3 s timeout, the last good copy is kept on the phone (config cache, not user data), and it fails closed: a malformed file, a URL outside our bucket's host, or an entry outside the app's version range shows no row. | missing | | |
| HV-7 | Language: only the app language (lib/appLanguage) is used; there is never a fallback to another language. | missing | | |
| HV-8 | Variants: `variant` names the phone family where the screen differs — `ios`, `android`, `fold-open` (book layout), `ios-fold-open` — plus, only for videos marked `bySex`, the suffix `-f` / `-m` taken from the profile's sex at birth; changing the sex in the profile switches the variant at the next open; a missing variant falls back to the plain phone variant of the same language, never to another sex's body. | missing | | |
| HV-9 | Measurement: two anonymous events, `howto_video_opened` and `howto_video_finished`, each with only the question id, language and variant, through lib/analyticsEvent (no account id, respects the analytics switch); no third-party SDK, no cookie. | missing | | |
| HV-10 | The app search: a FAQ hit opens the FAQ at that question (existing AS behaviour), where the video row is; nothing else in the search changes. | missing | | |
| HV-11 | Theme tokens only, no emoji, no new hard-coded colour except the player's fixed dark surface (justified like the toast); checked in light and dark on the phone, the Fold folded and open, and the iPhone simulator. | missing | | |
| HV-12 | Honesty line: no string added says or implies a dose, a result or advice; the player's example line is always visible while a video plays. | missing | | |
