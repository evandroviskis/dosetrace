// wake-refresh — A-110 RG-6 (founder 2026-10-07). Once a day (pg_cron, migration
// 20261007000000_wake_refresh_schedule.sql) every Android device gets one SILENT data-only push that
// only wakes DoseTrace's background task, which then refreshes the reminders scheduled on the phone
// (lib/reminderRefresh.js). The reminders' text, buttons and privacy stay on the phone; a failed or
// missing wake-up changes nothing (the 6-hourly Android task still runs).
//
// No secret: the database function claim_wake_refresh() lets it run at most once per 20 hours, so a
// call from anyone who finds the URL does nothing (it can only bring the day's silent wake-up forward).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { wakeMessages, deadTokens } from './plan.js';

const EXPO_BATCH = 100;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (_req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const { data: claimed, error: claimErr } = await admin.rpc('claim_wake_refresh');
    if (claimErr) throw claimErr;
    if (!claimed) return json({ ok: true, skipped: 'too_soon' });

    const { data: tokens, error } = await admin.from('push_tokens').select('expo_token, platform').eq('platform', 'android');
    if (error) throw error;
    const msgs = wakeMessages(tokens || []);
    let sent = 0;
    const dead: string[] = [];
    for (let i = 0; i < msgs.length; i += EXPO_BATCH) {
      const slice = msgs.slice(i, i + EXPO_BATCH);
      try {
        const resp = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(slice),
        });
        const out = await resp.json().catch(() => null);
        const receipts = resp.ok ? (out?.data || []) : [];
        sent += receipts.filter((r: { status?: string }) => r?.status === 'ok').length;
        dead.push(...deadTokens(slice, receipts));
      } catch { /* a failed batch changes nothing on the phones */ }
    }
    if (dead.length) await admin.from('push_tokens').delete().in('expo_token', dead);
    // Counts only — never a token or a user id in the logs.
    return json({ ok: true, devices: msgs.length, sent, pruned: dead.length });
  } catch (err) {
    console.error('[wake-refresh] error', (err as Error)?.name || 'error');
    return json({ ok: false }, 500);
  }
});
