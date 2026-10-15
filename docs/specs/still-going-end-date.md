# "Still going?" with an end date — A-121

- source: founder 2026-10-15 — "quando o aplicativo pergunta se o protocolo ainda está sendo feito, dá a opção para o usuário… colocar no aplicativo que dia que esse protocolo acaba" (Goli, a daily vitamin he takes for months, was asked again and again); picture docs/design/a121-still-going-end-date.html (captures docs/design/a121-telas/) — "aprovado, A, pode". Ledger: docs/decisions.md 2026-10-15 (A-121).
- related: AD-82 (course-end question, Q5 B), DL-99 (a deliberate end is dated at the tap), A-122 (the check must wait for the startup download).
- code (expected): screens/TodayScreen.js (prompt, end-date step, course-end question), screens/ProtocolsScreen.js (ProtocolDetail row), screens/components/ProtocolParts.js (DTWheel range), lib/ (end-date rule, pure), lib/schema.js + lib/syncCore.js / lib/sync.js (new synced column), a Supabase migration, i18n ×6.
- checklist-signed:
- committed-to: 1.3.0 (approved → next build)

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| SG-1 | "Ainda em andamento?" shows three buttons, top to bottom: "Sim, terminou", "Continua até uma data…", "Continua" (renamed from "Ainda em andamento"), and the added sentence, as in the approved picture, in both themes. | missing | | |
| SG-2 | "Continua até uma data…" opens "Até quando?" in the same box with the app's date wheel; only dates from tomorrow on can be saved; "Salvar data de fim" saves, "Voltar" returns to SG-1 without saving. | missing | | |
| SG-3 | With an end date set, "Still going?" is never shown for that protocol before that date, whatever the dose log says. Without one, today's rule stays (max(7, 3×interval) days without a logged Taken dose, "Continua" asks again after the same span). | missing | | |
| SG-4 | Reminders, Missed rows, the rings, the curve and every count are unchanged by an end date; nothing ends by itself. | missing | | |
| SG-5 | On the end date (local day), Today asks once "Ciclo concluído — encerrar {name}?": "Encerrar" ends the protocol (Ended, dated at the tap, DL-99; doses kept; reminders cancelled); "Continuar" removes the end date and the normal "Still going?" rule applies again. A missed day (app not opened) asks on the next open. | missing | | |
| SG-6 | The protocol page (option A) shows "Termina em" under Schedule & reminders on every active protocol — the date in the app's format, or "Sem data"; tapping opens the wheel with "Salvar data de fim" and a way to clear it ("Sem data de fim"). | missing | | |
| SG-7 | The end date is stored on the protocol, syncs to the other phone and the cloud, survives an app update and re-auth, and is kept by Restart only if the founder's Restart rule says so (default: a restarted run has no end date). | missing | | |
| SG-8 | The date wheel reaches far enough for an end date (at least 5 years ahead); its other uses keep their current range. | missing | | |
| SG-9 | All new texts in the 6 languages, written natively, approved; dates in the phone's locale; both themes checked on every new box and row. | missing | | |
| SG-10 | The "Still going?" check runs only after the session's first completed download from the cloud (A-122), so a dose logged on another phone is never missed. | missing | | |
