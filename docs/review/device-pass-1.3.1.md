# Device pass for Gate S, 1.3.1 (older specs only)

Written 2026-10-20 from `node scripts/spec-audit.cjs`. Every row listed here is still
`partial` in its spec. Each step names the screen, what to do, what must happen, and the
theme. Run it in one session on the founder's Galaxy Z Fold7 (and the iPhone where it
says so), with the build that will ship. Use the test account, never the main account.

**Not in this file:** the 1.3.1 / 1.3.2 specs (still-going-end-date, one-active-device,
update-notice, curve-logged-doses, server-reminders) and release-1.2.5 RL-1.

**Already proven on a device.** These rows were moved to `built` on 2026-10-20, with the
device evidence written in their Evidence cell:
- BK-1, BK-2, BK-9 (Fold7 build 49, guided session 2026-10-16/17).
- CS-2, CS-5, CS-8, CS-11, CS-15 (Fold7 builds 51/53, "Device evidence 2026-10-17" in the clock-skew plan).
- FE-1, FE-2 (Fold7 builds 49/51, iPhone simulator 2026-10-16).
- MB2-2: its test citation was fixed.

Captures cited in the Evidence cells live in the chair's scratchpad:
`/private/tmp/claude-501/-Users-evandrosantos-Desktop-dosetrace/471f2548-5ba0-4cd3-9104-9a98d6108669/scratchpad/fold/`.
They are temporary. Copy the ones you want to keep before that folder is cleared.

**How to record a result.** Write the result in the row's Evidence cell, for example
`device YYYY-MM-DD (Fold7, build N, light + dark): what was seen`, then set the row to
`built`. If a step fails, it becomes a registry bug (test first). A row the founder
accepts as unproven needs `approved YYYY-MM-DD` in its Deviation cell, written from his
own words.

Count: 40 rows still unproven (39 device + 1 founder wording approval).

---

## 0. Setup
- [ ] Fold7 has the build that will ship. Test account Test03 / evandro1985@gmail.com, with
      at least one injectable with a vial, one lyophilized protocol with **no** mixed vial
      (MOTS-c), one oral protocol with no bottle size, one twice-daily protocol, and one
      vaccine. Use a throwaway +qa account for onboarding / free-plan steps.
- [ ] adb is connected. Supabase auth_logs are open for the refresh counts.
- [ ] Do each "unfolded" step in **LIGHT first, then DARK** (Settings › Aparência).

## 1. App opening (cold start)
- [ ] **SK-12** · Today, Fold folded **and** unfolded · Signed in, swipe the app away, open
      it · The left page (or the phone column) shows the skeleton in Today's column. The
      right-page Dose log loads on its plain page ground, with no spinner. Nothing jumps
      when the data arrives · light + dark.

## 2. Today, unfolded (book)
- [ ] **BK-3 / BK-16** · Today left card of an **injectable** · Tap Concluir · The site
      question comes first. After answering there is exactly one Taken row · light + dark.
- [ ] **BK-16** · Today left card · Tap Concluir, then Desfazer on the toast · The dose
      goes back to open, and the ring and the count follow (this failed on build 49,
      A-136 (8)). Then Pular a dose, then Concluir on it · one Taken row, no second row ·
      both themes.
- [ ] **BK-16** · Twice-daily protocol · Log the 08:00 and the 20:00 slot, and log a
      pending-from-yesterday row · Each write lands on its own slot / day (check the Dose log).
- [ ] **BK-19** · Today with nothing tapped (Dose log on the right) · Concluir / Pular /
      Desfazer on the left · The Dose log on the right updates at once.
- [ ] **BK-20** · Today · With the site question open, finish a vial (last dose) · The
      vial prompt waits until the site question closes. Never two popups.
- [ ] **FR-3 / FR-6** · Today, MOTS-c (lyophilized, no mixed vial) · Tap its dose card ·
      The right page shows "No mixed vial right now" / "Nenhum frasco misturado…", the why
      and "+ Add vial", with no syringe and no vial block. "+ Add vial" opens the vial
      prompt · light + dark.
- [ ] **FR-6** · Today · Tap a pending (yesterday) row, then an upcoming row under Amanhã ·
      The right page shows that protocol's page each time · light.
- [ ] **FR-6** · Today · Tap a dose with a vial (TB-500) · The protocol page with the
      standard syringe · **light** (dark already seen).
- [ ] **BK-10** · Today with a protocol page open on the right · Fold the phone · It shows
      as a pushed screen with "‹ back". On build 49, capture b4_note_closed showed Today's
      list instead, so check this. Unfold with a pushed item · it moves to the right page.
- [ ] **BK-10** · Any sheet with a typed value (e.g. weigh-in) · Fold and unfold with it
      open · The sheet stays open with the typed value.
- [ ] **BK-8** · Open an item in Protocols, go to Today, come back · The same item is
      still on the right. The selected outline is visible in light.
- [ ] **BK-22** · Today right-page Dose log · Use every back / close control in it · The
      left page never navigates back and is never replaced.

## 3. My Protocols, unfolded
- [ ] **BK-4 / BK-12** · My Protocols · View in **LIGHT**: list left (sort, + Adicionar),
      first protocol on the right with the outline · readable, nothing white-on-white.
- [ ] **BK-4** · My Protocols · Tap + Adicionar, then Novo frasco on a protocol page · They
      open as on the phone (full-screen editor / vial sheet) · light + dark.

## 4. Evolução (Journey), unfolded
- [ ] **BK-5 / BK-12 / FE-6** · Evolução · View in **LIGHT**: dashboard left, Progresso
      right by default. The food card's blue border and "Registrar comida" are readable.
- [ ] **BK-5 / BK-17** · Evolução · Tap the food card · The AI food chat opens on the
      right page. After logging there is no Done and no auto-close. It stays until another
      item is tapped · light + dark.
- [ ] **BK-5** · Evolução · Tap the Dose accumulation tile: the Curve on the right
      (Premium). On the +qa free account: the Paywall · light + dark.
- [ ] **BK-14** · Evolução › Progresso on the right · Type a reality-check weigh-in, an
      intake, a target and a past weigh-in without saving. Tap another item, then fold /
      unfold · Each draft is still there. Then type an answer in the food chat, tap away
      and come back · the answer is kept.
- [ ] **BK-19** · Evolução with Progresso on the right · Log a weigh-in · The left Progress
      tile updates at once.
- [ ] **BK-22** · Right-page Progress, Curve, food chat · Use each back / close control ·
      The left page stays as it is.

## 5. My Body, unfolded
- [ ] **BK-6 / MB2-1 / BK-12** · My Body · View in **LIGHT**: two tiles side by side,
      Dose accumulation full width below, the footnote; the lab journal on the right.
- [ ] **BK-6 / MB2-4** · My Body · Tap a lab test, then "‹ back"; tap the Vaccines tile
      (the outline moves to it); tap Dose accumulation · The detail, the vaccine journal and
      the Curve (Premium) open on the right · light + dark.
- [ ] **MB2-4** · My Body with a journal open on the right · Fold · It stays open as a
      pushed screen. On the folded phone, a tile opens its journal screen.
- [ ] **BK-18** · My Body › vaccine journal › tap the vaccine · The read page shows name,
      date given, next due, dose number, batch/lot, provider, manufacturer, where given,
      notes and the disclaimer. Edit opens the edit sheet · light + dark.

## 6. Settings, unfolded
- [ ] **BK-7 / BK-12** · Settings · View in **LIGHT**: profile card, the four groups with
      their summaries, the Sair / Excluir conta card, Preferências on the right. Tap
      Notificações, Dados e privacidade and Suporte · each body shows on the right.

## 7. Fold behaviour
- [ ] **BK-13** · Any tab, unfolded · Turn the Fold on its side (hinge horizontal) · One
      column on every tab. Upright again · two pages.
- [ ] **BK-15** · Unfolded, each tab · Android back · It leaves the screen / tab / app as
      on the phone. With only the default open, folding pushes nothing.
- [ ] **BK-21** · TalkBack on, unfolded · Tap a left item · Focus moves to the right page,
      the item reads as selected, and the reading order is left then right.

## 8. Full-screen flows, unfolded (+qa throwaway account)
- [ ] **BK-11** · Paywall, sign-in, onboarding, reset password, unfolded · Each one is a
      single centred column · light + dark.
- [ ] **SP-9** · Onboarding on a new +qa account (Android) · After "Ativar notificações"
      the step "Garanta que seus lembretes cheguem" shows the items and the bar. Open an
      Android screen and come back warm: the step is where it was. Do it again after
      swiping the app away (cold): onboarding reopens at "Antes de começar" with the answers
      kept · light + dark. Write down the One UI version.

## 9. Reminders screen (Settings › Notificações) — Fold
- [ ] **SP-9** · Settings row "Garanta que seus lembretes cheguem" · Show its three states:
      block (turn the DoseTrace notifications off: red), "N de M prontos" (attention + dot),
      "Tudo pronto · próximo lembrete …" · light + dark.
- [ ] **SP-9 / RG-8** · The screen · Tap every button · Each opens its Android screen
      (Notificações, Dose Reminders category, Alarmes e lembretes, Bateria, Gerenciar
      aplicativo não usado, Samsung Bateria for deep sleep). On return the row and the bar
      update by themselves.
- [ ] **EA-7** · Android Settings › Apps › DoseTrace › Alarmes e lembretes OFF, back to the
      app · The row reads "Off / Desligado: os lembretes podem chegar até 1 hora atrasados"
      with Ativar, and Today shows "Os lembretes podem atrasar". The tap opens Android's
      screen. Turn it on again · the alert goes away, and adb shows window=0 · light + dark.
- [ ] **RG-7** · The screen and Today's reminder cards in **DARK** · Samsung's names show
      on screen ("Gerenciar aplicativo não usado", "Aplicativos em suspensão profunda") and
      are readable.

## 10. Background refresh — Fold + adb (needs time)
- [ ] **BR-9** · App swiped away · Run the background task (adb `cmd jobscheduler run -f
      io.outcom.dosetrace <job id>`, or wait 6 h), then open the app · Still signed in,
      data intact, and auth_logs show no refresh while the app was closed.
- [ ] **RG-6 / RG-8** · After 08:00 UTC, app not opened · adb shows the data-only wake-up
      received and the refresh run. The "Renovação automática" time on the reminders screen
      moves forward.
- [ ] **BR-10** · Do not open the app for 7+ days · The morning summary arrives every day,
      and adb shows the task ran (start this early; it runs in the background of the other
      steps).

## 11. Clock and session — Fold, auth_logs open
- [ ] **CS-1** · Clock +2 h, app open · Send the app to the background, then bring it back
      (a warm resume) · At most 1 refresh_token POST, still signed in.
- [ ] **CS-6** · Clock +19 h, app swiped away · Tap "Marcar como tomada" on a notification
      · 0 refresh POSTs while the app is closed, 1 on opening, and the dose synced.
- [ ] **CS-12 / CS-7** · Clock ahead, airplane on, app in front · Airplane off · Exactly 1
      refresh, the sync goes. Then airplane on, app in the background, airplane off, open
      the app (step 11) · at most 1 refresh, no sign-out, no new message.
- [ ] **CS-10 / CS-7** · Update over build 49 with its old stored session (needs build 49
      installed first, or the founder accepts this as unproven) · Still signed in, at most
      1 refresh.
- [ ] **CS-1 (step 7), CS-23, CS-27** · 70 min in the foreground and the stalled network
      (and delete account on it) · The founder already accepted these as unproven on
      2026-10-20 (docs/decisions.md: "rare cases … accepted by the founder", "Pule o 3").
      **Chair:** write `approved 2026-10-20` in their Deviation cells if that acceptance
      still holds for 1.3.1. Otherwise run them.

## 12. Not a device step
- [ ] **MB2-6** · Founder approves the es / fr / de / it wording of `body_tile_lab_latest` /
      `body_tile_vax_latest`. The unfolded light look is covered in section 5.

---

## Rows by spec (where to write the results)
- book-layout.md: BK-3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22 (19)
- clock-skew-session-plan.md: CS-1, 6, 7, 10, 12, 23, 27 (7)
- background-refresh.md: BR-9, BR-10 (2)
- exact-alarms.md: EA-7 (1)
- fold-right-page.md: FR-3, FR-6 (2)
- food-log-emphasis.md: FE-6 (1)
- my-body-tiles.md: MB2-1, MB2-4, MB2-6 (3)
- reminder-setup-placement.md: SP-9 (1)
- reminders-guaranteed.md: RG-6, RG-7, RG-8 (3)
- today-skeleton.md: SK-12 (1)
- progress-one-card.md: nothing open (all 26 built).
