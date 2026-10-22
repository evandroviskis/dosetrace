# Messages from the DoseTrace team — A-163

- source: founder 2026-10-22 ("Seria interessante que eu pudesse avisar a pessoa por dentro do painel administrativo. A pessoa recebe uma notificação do celular e fica no painel de notificações ... Se a pessoa não ativou as notificações, está tudo bem. Quando ela abrir o aplicativo, ela vê a mensagem dentro"); picture approved the same day ("Ok, aprovado") with option A (a sheet over Today, once) and a Withdraw button while unread (scratchpad a163/a163-messages.html, both themes, panel + iPhone/Android notification + app).
- purpose: the founder writes an account or support message to ONE person from the admin panel; the phone shows it as a notification that stays in the shade; whether or not it arrived, the app shows it inside on the next open and keeps it to reread. Replaces the 2026-10-21 Q5 rule (the panel sends nothing) for this case; the copyable customer message after a Premium grant stays.
- decided by logic (in the approved picture): fixed title "Mensagem da equipe DoseTrace" in the app's language; up to 200 characters; no automatic translation (the panel shows the account's app language); kept in Settings › Support › Team messages (the row appears after the first message); stored per account on the server (read on one phone = read on the other; deleted with the account); one message per account per minute; the 3.1 step-up; every send logged; tapping the notification opens that message, never over a dose being logged; one screen per app open, a required update first; Silent mode also silences these notifications; several unread show oldest first ("1 de 2").
- guardrails: account and support messages only — never health, dose or treatment guidance (AI/no-advice line); the panel shows that rule in the dialog. No e-mail or health data in the push payload beyond the message itself.
- related: docs/review/features.md A-163; dosetrace-admin docs/specs/admin-panel.md Phase 3 (3.1 login, 3.2 write gate); docs/specs/server-reminders.md (Expo push, push_tokens); docs/specs/update-notice.md (one screen per open); privacy policy section 4.
- code (expected): admin repo api/adm-messages.js + web/adm.html (Mensagem button, dialog, history, Withdraw); one migration (team_messages table + RLS, send log, rate-limit RPC); the app: lib/teamMessages.js (fetch/sync/read), a sheet on Today (option A), Settings › Support › Team messages screen, notification tap routing, i18n in 6 languages; privacy policy sentence (app + dosetrace.io).
- checklist-signed: pending
- committed-to: panel part — admin Phase 3 (after 3.2); app part — 1.3.2 (1.3.1 scope closed; founder may pull it in)

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| TM-1 | Panel: every Contas row and every test account has a "Mensagem" button next to "Premium"; it opens the send dialog for that account (e-mail + short id shown) | missing | | |
| TM-2 | The dialog shows the account's app language, the number of devices with notifications on, the rule "Somente avisos de conta e suporte. Nunca escreva orientação de saúde, dose ou tratamento.", the fixed title, a text box with a 200-character counter and a live preview of the notification | missing | | |
| TM-3 | "Enviar" stays disabled until text is typed; more than 200 characters cannot be sent; a double-click sends once | missing | | |
| TM-4 | Sending goes through the 3.1 write gate: admin role, step-up code after 15 min, Origin check; a viewer or a foreign Origin is refused before anything is stored | missing | | |
| TM-5 | One message per account per minute and 30 writes per hour per admin (shared with Premium); over the limit → its own message, nothing stored or sent | missing | | |
| TM-6 | After sending the panel says "Mensagem enviada para N aparelhos" (N = push tickets Apple/Google accepted) or, with no device, "Mensagem salva. Nenhum aparelho desta conta está com as notificações ativadas: a pessoa verá a mensagem ao abrir o app." | missing | | |
| TM-7 | Every send writes one log row (admin user id, account user id, time, devices, accepted/failed); no e-mail column | missing | | |
| TM-8 | The dialog shows the account's message history (newest first) with Lida / Não lida and the read time | missing | | |
| TM-9 | "Retirar" appears only on an unread message; it removes the message from the app (it no longer opens or lists); the panel says a notification already on the phone cannot be taken back; logged | missing | | |
| TM-10 | Labels in 6 languages (parity test), Portuguese formal, tokens only, both themes, desktop + 420 px without horizontal scroll | missing | | |
| TM-11 | Phone notification: title "Mensagem da equipe DoseTrace" in the app's language, body = the message; it stays in the notification shade; Android and iPhone | missing | | |
| TM-12 | Silent mode on → no notification for these messages (the message still shows in the app) | missing | | |
| TM-13 | Tapping the notification opens the app on that message; if a dose is being logged from a reminder tap, the dose screen comes first | missing | | |
| TM-14 | On app open with an unread message: a sheet over Today, "Mensagem da equipe DoseTrace", date, text, button "Entendi"; shown once; after "Entendi" it is marked read (server) and the panel shows Lida | missing | | |
| TM-15 | Only one screen per open: a required update notice first, then the message sheet; never over another of Today's popups | missing | | |
| TM-16 | Several unread messages show in order, oldest first, "1 de 2" | missing | | |
| TM-17 | Settings › Support shows "Mensagens da equipe" only after the account has received a message; the list shows every non-withdrawn message, newest first, read-only, with a pointer to Fale conosco for replies | missing | | |
| TM-18 | Messages belong to the account, not the phone: they show after sign-in on another phone; read on one phone shows read on the other; another account on the same phone never sees them; deleting the account deletes them | missing | | |
| TM-19 | Notifications off / permission denied → no error anywhere; the message still shows inside the app on the next open | missing | | |
| TM-20 | Offline at open: no error; the message shows on the next open with a connection; a message already seen is never shown again as new | missing | | |
| TM-21 | The table is RLS-protected: a user reads and marks read only their own messages; only the panel's server writes them; anon gets nothing | missing | | |
| TM-22 | App strings in 6 languages, natural (parity test), Portuguese formal, no emoji, theme tokens only; sheet and list checked in light and dark on the iPhone simulator and the Fold | missing | | |
| TM-23 | Privacy policy (app and dosetrace.io) section 4 says the team may send account and support messages, in 6 languages | missing | | |
| TM-24 | Android notification icon: a white droplet on a transparent background (not a plain square), checked on the Fold for these messages and for dose reminders | missing | | |
