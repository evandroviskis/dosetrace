# In-app update notice — A-127

- source: founder 2026-10-15 — "só avisar que tem um update e convidar a pessoa… não precisa ser obrigatório… a não ser que a gente mude os termos de serviço ou privacy policy"; "o aplicativo também pode enviar uma notificação… a pessoa pode dismiss". Picture docs/design/a127-update-notice.html — "aprovo os três". Ledger: docs/decisions.md 2026-10-15 (A-127).
- merges: A-119's "update required" text (DL-105 minimum version).
- code (expected): a pure lib for the version rule, the sheet / full screen, Settings › Notificações switch, push registration (app version on the device row), a server field (latest / minimum version, release notes per language) and a sender, Android Play in-app update native module (next native build), i18n ×6.
- checklist-signed: founder 2026-10-16 ("4 assino")
- committed-to: 1.3.2 (founder 2026-10-20 "B, pode seguir": 1.3.1 = option B, docs/decisions.md; first deferred 2026-10-15)

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| UN-1 | The server holds, per platform, the latest version, the minimum version and the release lines ("O que há de novo") in the 6 languages; the founder changes them without a new build. | missing | | |
| UN-2 | Below the latest version, at app open, the invitation shows ("Nova versão do DoseTrace", the release lines, "Atualizar" / "Agora não") once per new version; after "Agora não" once more 7 days later, then not until the next version; never more than once a day; never over another sheet or before the first screen. | missing | | |
| UN-3 | "Atualizar": on iPhone opens the DoseTrace App Store page; on Android starts Google Play's in-app (flexible) update, then our bar "A nova versão foi baixada · Reiniciar". | missing | | |
| UN-4 | Below the minimum version, a full screen that cannot be closed ("Atualize o DoseTrace para continuar", the founder's reason line, "Seus dados continuam guardados — nada é apagado ao atualizar.", "Atualizar"); Android uses Play's immediate update. Nothing on the phone is deleted. | missing | | |
| UN-5 | The first invitation asks once "Avisar quando houver versão nova?" (switch starts off); the answer is stored and later lives only in Settings › Notificações › "Novidades do DoseTrace" (off unless the person said yes). | missing | | |
| UN-6 | Opted-in people get one push per new version (title "Nova versão do DoseTrace", body = the first release line), daytime only, never in Silent mode; tapping opens the invitation; nobody who did not opt in ever gets it (store rule 4.5.4). | missing | | |
| UN-7 | Texts ×6 natively written and approved; both themes on every new screen; iPhone and Android checked. | missing | | |
