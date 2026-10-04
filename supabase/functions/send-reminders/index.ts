// send-reminders — scheduled push sender for Android battery-saver reliability.
//
// ⚠️ NOT ACTIVE YET. This function is version-controlled and reviewable but is
// gated behind the client flag `SERVER_PUSH_ACTIVE` in lib/notifications.js (false
// until QA). Deploying it does nothing on its own: the app keeps scheduling LOCAL
// notifications until that flag flips, so there is no double-fire. Before enabling:
//   1. deploy this function + schedule it (pg_cron / Supabase schedule, ~every 15m),
//   2. run journey-review on the flow + a DRY-RUN (DRY_RUN=true → logs, sends nothing),
//   3. confirm on a real battery-optimized Android that a push actually arrives,
//   4. THEN flip SERVER_PUSH_ACTIVE=true in a new app build.
//
// What it does each run: for every registered device (push_tokens), compute the
// user's LOCAL time from the stored IANA timezone and send, as high-priority Expo
// pushes, exactly what the client would have scheduled — (1) dose reminders whose
// slot falls in this run's window (and isn't already logged Taken today), (2) the
// 7am morning summary, and (3) the 8pm "what did you eat today?" nudge while a
// reality-check is open (the reality_check_open table). Idempotent via
// notification_sends (a slot fires at most once). Dose + morning honor the
// dose_reminders preference; the food nudge has its own food_reminders switch and
// follows the app's foodNudgeDays rule (window, same-day skip, backoff). Prunes dead tokens.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  dueDateKeys, reminderSlots, morningSummaryPlan, localParts, foodNudgeDays,
  type Protocol,
} from './plan.ts';

// ── Localized notification copy (subset of i18n/translations.js) ──────────────
const STRINGS: Record<string, Record<string, string>> = {
  en: { notif_dose_body: 'Time for your {dose} {unit} dose', notif_morning_title: 'Good morning', notif_morning_due_body: 'Today: {list}.', notif_morning_next1_body: 'Nothing today. Next dose tomorrow.', notif_morning_next_body: 'Nothing today. Next dose in {days} days.', notif_food_title: 'What did you eat today?', notif_food_body: 'Log it in a sentence — it keeps your reality-check honest.' },
  es: { notif_dose_body: 'Hora de tu dosis de {dose} {unit}', notif_morning_title: 'Buenos días', notif_morning_due_body: 'Hoy: {list}.', notif_morning_next1_body: 'Nada hoy. Próxima dosis mañana.', notif_morning_next_body: 'Nada hoy. Próxima dosis en {days} días.', notif_food_title: '¿Qué comiste hoy?', notif_food_body: 'Regístralo en una frase — mantiene realista tu comprobación de progreso.' },
  pt: { notif_dose_body: 'Hora da sua dose de {dose} {unit}', notif_morning_title: 'Bom dia', notif_morning_due_body: 'Hoje: {list}.', notif_morning_next1_body: 'Nada hoje. Próxima dose amanhã.', notif_morning_next_body: 'Nada hoje. Próxima dose em {days} dias.', notif_food_title: 'O que você comeu hoje?', notif_food_body: 'Registre em uma frase — mantém seu acompanhamento realista.' },
  fr: { notif_dose_body: "C'est l'heure de votre dose de {dose} {unit}", notif_morning_title: 'Bonjour', notif_morning_due_body: "Aujourd'hui : {list}.", notif_morning_next1_body: "Rien aujourd'hui. Prochaine dose demain.", notif_morning_next_body: "Rien aujourd'hui. Prochaine dose dans {days} jours.", notif_food_title: "Qu'avez-vous mangé aujourd'hui ?", notif_food_body: 'Notez-le en une phrase — pour un suivi fiable.' },
  de: { notif_dose_body: 'Zeit für deine Dosis von {dose} {unit}', notif_morning_title: 'Guten Morgen', notif_morning_due_body: 'Heute: {list}.', notif_morning_next1_body: 'Heute nichts. Nächste Dosis morgen.', notif_morning_next_body: 'Heute nichts. Nächste Dosis in {days} Tagen.', notif_food_title: 'Was hast du heute gegessen?', notif_food_body: 'Erfasse es in einem Satz — das hält deinen Check ehrlich.' },
  it: { notif_dose_body: 'È ora della tua dose di {dose} {unit}', notif_morning_title: 'Buongiorno', notif_morning_due_body: 'Oggi: {list}.', notif_morning_next1_body: 'Niente oggi. Prossima dose domani.', notif_morning_next_body: 'Niente oggi. Prossima dose tra {days} giorni.', notif_food_title: 'Cosa hai mangiato oggi?', notif_food_body: 'Registralo in una frase — così il monitoraggio resta realistico.' },
};
function t(lang: string, key: string): string {
  return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
}
function fill(str: string, vars: Record<string, unknown>): string {
  return String(str)
    .replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''))
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function formatList(names: string[]): string {
  const clean = (names || []).filter(Boolean);
  if (clean.length <= 3) return clean.join(', ');
  return clean.slice(0, 3).join(', ') + ' +' + (clean.length - 3);
}

// ── Tunables (mirror lib/notifications.js) ────────────────────────────────────
const RUN_WINDOW_MIN = 15;       // must be >= the cron interval so no slot is skipped
const MORNING_HOUR = 7;
const FOOD_HOUR = 20;            // "what did you eat today?" nudge, while a reality-check is active
const SUMMARY_WINDOW_DAYS = 7;
const SUMMARY_HORIZON_DAYS = 45;
const DOSE_HORIZON_DAYS = 10;
const EXPO_BATCH = 100;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushMessage {
  to: string;
  title: string;
  body: string;
  channelId: string;
  priority: 'high';
  data: Record<string, unknown>;
  _dedupe: string; // internal — stripped before send
}

// minutes-of-day helper
const mod = (h: number, m: number) => h * 60 + m;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Auth: this is a scheduled function. Require the service-role key (or the cron
  // secret) in the Authorization header so it can't be triggered by anonymous
  // callers. verify_jwt is disabled for scheduled fns; we check the secret here.
  const auth = req.headers.get('Authorization') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  const ok = auth === `Bearer ${serviceKey}` || (cronSecret && auth === `Bearer ${cronSecret}`);
  if (!ok) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const DRY_RUN = (Deno.env.get('DRY_RUN') || '').toLowerCase() === 'true';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(supabaseUrl, serviceKey);
  const now = new Date();

  try {
    // 1. Every registered ANDROID device. iOS is intentionally local-only
    //    (usesServerPush() is Android-only on the client), so sending server pushes
    //    to iOS tokens would DOUBLE-FIRE against the local schedule. Filter here.
    const { data: tokens, error: tokErr } = await admin
      .from('push_tokens')
      .select('user_id, expo_token, platform, timezone')
      .eq('platform', 'android');
    if (tokErr) throw tokErr;
    if (!tokens || tokens.length === 0) {
      return json({ ok: true, tokens: 0, sent: 0, dry: DRY_RUN });
    }

    const userIds = [...new Set(tokens.map((r) => r.user_id))];

    // 2. Active protocols for those users (one query).
    const { data: protoRows } = await admin
      .from('protocols')
      .select('id, user_id, name, dose, dose_unit, reminder_time, interval_days, schedule_total, start_date, active, deleted_at')
      .in('user_id', userIds)
      .eq('active', true)
      .is('deleted_at', null)
      .is('purged_at', null); // a protocol deleted forever never reminds (A-90)
    const protosByUser = new Map<string, Protocol[]>();
    for (const p of (protoRows || [])) {
      if (!protosByUser.has(p.user_id)) protosByUser.set(p.user_id, []);
      protosByUser.get(p.user_id)!.push(p as Protocol);
    }

    // 3. Recent Taken logs (last 48h covers any tz offset) → set of "userId|protoId|localDate".
    const since = new Date(now.getTime() - 48 * 3600 * 1000).toISOString();
    const { data: logRows } = await admin
      .from('dose_logs')
      .select('user_id, protocol_id, outcome, logged_at')
      .in('user_id', userIds)
      .eq('outcome', 'Taken')
      .gte('logged_at', since);

    // 4. Preferences per user: dose_reminders (defaults on), language and the food
    //    switch. The open reality check comes from reality_check_open (below).
    const prefByUser = new Map<string, { enabled: boolean; lang: string; rcDate: string | null; foodOn: boolean }>();
    for (const uid of userIds) {
      let enabled = true; let lang = 'en'; let rcDate: string | null = null; let foodOn = true;
      try {
        const { data: u } = await admin.auth.admin.getUserById(uid);
        const meta = u?.user?.user_metadata || {};
        if (meta.dose_reminders === false) enabled = false;
        if (typeof meta.language === 'string') lang = meta.language;
        if (meta.food_reminders === false) foodOn = false; // the user's Settings off-switch
      } catch { /* default on/en */ }
      prefByUser.set(uid, { enabled, lang, rcDate, foodOn });
    }

    // The open reality check per user — the synced reality_check_open table (S-03),
    // not the old user_metadata copy.
    {
      const { data: open } = await admin.from('reality_check_open').select('user_id, start_date').in('user_id', userIds).is('stopped_at', null);
      for (const r of (open || [])) {
        const pref = prefByUser.get(r.user_id);
        if (pref && typeof r.start_date === 'string') pref.rcDate = r.start_date;
      }
    }

    // Days the user closed ("Nothing else today") — the food question skips them (FL-18).
    // entry_date is the user's LOCAL day; 2 days back covers any time zone.
    const closedDays = new Map<string, Set<string>>();
    {
      const since = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10);
      const { data: fl } = await admin.from('food_logs').select('user_id, entry_date').in('user_id', userIds).eq('source', 'day_closed').gte('entry_date', since);
      for (const r of (fl || [])) {
        if (!r.entry_date) continue;
        if (!closedDays.has(r.user_id)) closedDays.set(r.user_id, new Set());
        closedDays.get(r.user_id)!.add(String(r.entry_date).slice(0, 10));
      }
    }

    const messages: PushMessage[] = [];

    for (const tok of tokens) {
      const tz = tok.timezone || 'UTC';
      let lp;
      try { lp = localParts(now, tz); } catch { lp = localParts(now, 'UTC'); }
      const pref = prefByUser.get(tok.user_id) || { enabled: true, lang: 'en', rcDate: null, foodOn: true };
      const lang = pref.lang;
      const protos = protosByUser.get(tok.user_id) || [];
      const nowMin = mod(lp.hour, lp.minute);
      const channelId = 'dose-reminders';

      // ── Food-log nudge: fires in the 20:00 window while a reality-check is active.
      //    Independent of the dose_reminders preference (a separate feature), so it
      //    is evaluated BEFORE the dose/morning preference gate below. ──
      if (pref.rcDate && pref.foodOn) {
        const foodMin = mod(FOOD_HOUR, 0);
        if (foodMin <= nowMin && foodMin > nowMin - RUN_WINDOW_MIN) {
          // Same rule as the app (lib/notificationPlan.js foodNudgeDays): daily while the
          // check is open, skipped for a closed day. NOT YET: the food-log access rule
          // (remindersForAccess — none for locked users) needs the user's access on the
          // server; this sender stays undeployed until then (registry A-62).
          const closed = closedDays.get(tok.user_id) || new Set<string>();
          const due = foodNudgeDays(String(pref.rcDate).slice(0, 10), lp.key, closed, 1);
          if (due.includes(lp.key)) {
            messages.push({
              to: tok.expo_token,
              title: t(lang, 'notif_food_title'),
              body: t(lang, 'notif_food_body'),
              channelId: 'checkin-reminders', priority: 'high',
              data: { type: 'food_log' },
              _dedupe: `${tok.expo_token}:food:${lp.key}`,
            });
          }
        }
      }

      // Dose reminders + morning summary ARE gated by the dose_reminders preference.
      if (!pref.enabled) continue;

      // Local "Taken today" set for this user's tz.
      const takenToday = new Set<string>();
      for (const l of (logRows || [])) {
        if (l.user_id !== tok.user_id) continue;
        let d;
        try { d = localParts(new Date(l.logged_at), tz).key; } catch { continue; }
        if (d === lp.key) takenToday.add(`${l.protocol_id}|${d}`);
      }

      // ── Dose reminders: due today + a slot in this window + not taken ──
      for (const p of protos) {
        const dueKeys = dueDateKeys(p, lp.key, 1); // just today
        if (!dueKeys.includes(lp.key)) continue;
        if (takenToday.has(`${p.id}|${lp.key}`)) continue;
        const slots = reminderSlots(p);
        for (let si = 0; si < slots.length; si++) {
          const slotMin = mod(slots[si].hour, slots[si].minute);
          if (slotMin <= nowMin && slotMin > nowMin - RUN_WINDOW_MIN) {
            messages.push({
              to: tok.expo_token,
              title: p.name || '',
              body: fill(t(lang, 'notif_dose_body'), { dose: p.dose ?? '', unit: p.dose_unit ?? '' }),
              channelId, priority: 'high',
              data: { type: 'dose_reminder', protocolId: p.id },
              _dedupe: `${tok.expo_token}:dose:${p.id}:${lp.key}:t${si}`,
            });
          }
        }
      }

      // ── Morning summary: fires in the 7:00 window ──
      const morningMin = mod(MORNING_HOUR, 0);
      if (morningMin <= nowMin && morningMin > nowMin - RUN_WINDOW_MIN) {
        const plans = morningSummaryPlan(protos, lp.key, SUMMARY_WINDOW_DAYS, SUMMARY_HORIZON_DAYS);
        const today = plans.find((pl) => pl.dateKey === lp.key);
        if (today && today.kind !== 'none') {
          let body = '';
          if (today.kind === 'due') body = fill(t(lang, 'notif_morning_due_body'), { list: formatList(today.list) });
          else if (today.kind === 'next1') body = t(lang, 'notif_morning_next1_body');
          else body = fill(t(lang, 'notif_morning_next_body'), { days: today.days });
          messages.push({
            to: tok.expo_token,
            title: t(lang, 'notif_morning_title'),
            body, channelId, priority: 'high',
            data: { type: 'morning_summary' },
            _dedupe: `${tok.expo_token}:morning:${lp.key}`,
          });
        }
      }
    }
    void DOSE_HORIZON_DAYS; // (kept for parity with the client window; today-only here)

    // 5. Idempotency: claim each dedupe key BEFORE sending so overlapping cron runs
    //    can't double-send. A claim that then fails to deliver is RELEASED in step 6
    //    so the next run retries it — otherwise the 23505 skip would drop that slot
    //    forever (backend review).
    const toSend: PushMessage[] = [];
    for (const m of messages) {
      if (DRY_RUN) { toSend.push(m); continue; }
      const { error } = await admin
        .from('notification_sends')
        .insert({ dedupe_key: m._dedupe, user_id: userIdOf(tokens, m.to), sent_at: now.toISOString() });
      if (!error) toSend.push(m);        // claimed → send
      else if (error.code !== '23505') { // 23505 = already sent this slot → skip silently
        console.error('[send-reminders] claim error', error.code, error.message);
      }
    }

    if (DRY_RUN) {
      return json({ ok: true, dry: true, tokens: tokens.length, would_send: toSend.length, sample: toSend.slice(0, 5).map(stripDedupe) });
    }

    // 6. Send via Expo push, batched. Any message that does NOT get an "ok" receipt
    //    (error status, non-2xx, or a network throw) has its claim released so a
    //    later run retries; DeviceNotRegistered tokens are pruned.
    type Receipt = { status?: string; details?: { error?: string } };
    let sent = 0;
    const dead = new Set<string>();
    const release: string[] = [];
    for (let i = 0; i < toSend.length; i += EXPO_BATCH) {
      const slice = toSend.slice(i, i + EXPO_BATCH);
      let receipts: Receipt[] = [];
      try {
        const resp = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(slice.map(stripDedupe)),
        });
        const out = await resp.json().catch(() => null);
        receipts = resp.ok ? ((out?.data as Receipt[]) || []) : [];
      } catch {
        receipts = []; // network error → treat whole batch as failed → release below
      }
      for (let j = 0; j < slice.length; j++) {
        const r = receipts[j];
        if (r?.status === 'ok') { sent++; continue; }
        release.push(slice[j]._dedupe); // not delivered → allow retry next run
        if (r?.details?.error === 'DeviceNotRegistered') dead.add(slice[j].to);
      }
    }
    if (release.length) {
      await admin.from('notification_sends').delete().in('dedupe_key', release);
    }
    if (dead.size) {
      await admin.from('push_tokens').delete().in('expo_token', [...dead]);
    }

    // 7. Bound the idempotency ledger — a dedupe key is only needed until its slot's
    //    day has passed. Prune rows older than 4 days so the table can't grow forever.
    const cutoff = new Date(now.getTime() - 4 * 86400000).toISOString();
    await admin.from('notification_sends').delete().lt('sent_at', cutoff);

    return json({ ok: true, tokens: tokens.length, sent, pruned: dead.size });
  } catch (err) {
    console.error('[send-reminders] error', (err as Error)?.message, err);
    return new Response(JSON.stringify({ error: (err as Error)?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function stripDedupe(m: PushMessage) {
  const { _dedupe, ...rest } = m; void _dedupe; return rest;
}
function userIdOf(tokens: { user_id: string; expo_token: string }[], to: string): string | null {
  return tokens.find((tk) => tk.expo_token === to)?.user_id ?? null;
}
function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
