// version-notice — A-127 UN-6 (founder 2026-10-15; docs/specs/update-notice.md). Once an hour
// (pg_cron, migration 20261022000000_app_releases.sql) every person who said yes to "Avisar quando
// houver versão nova?" and whose phone is below the latest version gets ONE push for that version, in
// their daytime, never in Silent mode (the rules: ./plan.js). Tapping it opens the invitation.
//
// NOT DEPLOYED. Deploy with verify_jwt off only after the founder's "pode aplicar" for the migration.
// Same design as wake-refresh / send-reminders: a database claim (claim_version_notice: at most one
// run per 50 minutes, so a call from anyone who finds the URL does nothing), Expo push in batches of
// 100, each push claimed in app_release_pushes BEFORE it is sent (two runs never send it twice) and
// released when Expo does not accept it (the next run retries), dead tokens pruned. Counts only in
// the logs — never a token, a user id or an address.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { versionMessages, deadTokens, versionBelow, sentKey } from './plan.js';

const EXPO_BATCH = 100;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Release = { platform: string; latest_version: string | null; notes: Record<string, string[]> };
type Token = { user_id: string; expo_token: string; platform: string; timezone: string | null; app_version: string | null; updated_at: string | null };

Deno.serve(async (_req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const DRY_RUN = (Deno.env.get('DRY_RUN') || '').toLowerCase() === 'true';
  const now = new Date();
  try {
    const { data: claimed, error: claimErr } = await admin.rpc('claim_version_notice');
    if (claimErr) throw claimErr;
    if (!claimed) return json({ ok: true, skipped: 'too_soon' });

    const { data: rels, error: relErr } = await admin.from('app_releases').select('platform, latest_version, notes');
    if (relErr) throw relErr;
    const releases = ((rels || []) as Release[]).filter((r) => r.latest_version);
    if (!releases.length) return json({ ok: true, releases: 0, sent: 0 });

    // Phones below a latest version (paged: the API returns at most 1000 rows per read).
    const tokens: Token[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from('push_tokens')
        .select('user_id, expo_token, platform, timezone, app_version, updated_at')
        .not('app_version', 'is', null).order('expo_token').range(from, from + 999);
      if (error) throw error;
      tokens.push(...((data || []) as Token[]));
      if (!data || data.length < 1000) break;
    }
    const below = tokens.filter((t) => releases.some((r) => r.platform === t.platform && versionBelow(t.app_version, r.latest_version)));
    const userIds = [...new Set(below.map((t) => t.user_id))];

    // Only what the rule needs from each account: the yes, Silent mode, the language.
    const users = new Map<string, Record<string, unknown>>();
    for (const uid of userIds) {
      try {
        const { data: u } = await admin.auth.admin.getUserById(uid);
        const m = (u?.user?.user_metadata || {}) as Record<string, unknown>;
        users.set(uid, { version_news: m.version_news === true, silent_mode: m.silent_mode === true, language: m.language });
      } catch { /* unread: not sent this run */ }
    }

    // Already sent (this version, this person).
    const sent = new Set<string>();
    if (userIds.length) {
      for (let i = 0; i < userIds.length; i += 500) {
        const { data } = await admin.from('app_release_pushes').select('user_id, platform, version').in('user_id', userIds.slice(i, i + 500));
        for (const r of data || []) sent.add(sentKey(r.user_id, r.platform, r.version));
      }
    }

    const msgs = versionMessages({ releases, tokens: below, users, sent, now });
    if (DRY_RUN) return json({ ok: true, dry: true, would_send: msgs.length });

    // Claim each push before sending (the primary key refuses a second claim).
    const toSend = [];
    for (const m of msgs) {
      const { error } = await admin.from('app_release_pushes').insert({ ...m._claim, sent_at: now.toISOString() });
      if (!error) toSend.push(m);
      else if (error.code !== '23505') console.error('[version-notice] claim error', error.code);
    }

    let ok = 0;
    const dead: string[] = [];
    const release: { user_id: string; platform: string; version: string }[] = [];
    for (let i = 0; i < toSend.length; i += EXPO_BATCH) {
      const slice = toSend.slice(i, i + EXPO_BATCH);
      let receipts: { status?: string; details?: { error?: string } }[] = [];
      try {
        const resp = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(slice.map(({ _claim, ...rest }) => rest)),
        });
        const out = await resp.json().catch(() => null);
        receipts = resp.ok ? (out?.data || []) : [];
      } catch { receipts = []; }
      for (let j = 0; j < slice.length; j++) {
        if (receipts[j]?.status === 'ok') { ok++; continue; }
        release.push(slice[j]._claim); // not accepted → the next run tries again
      }
      dead.push(...deadTokens(slice, receipts));
    }
    for (const c of release) {
      await admin.from('app_release_pushes').delete().eq('user_id', c.user_id).eq('platform', c.platform).eq('version', c.version);
    }
    if (dead.length) await admin.from('push_tokens').delete().in('expo_token', dead);
    return json({ ok: true, candidates: below.length, sent: ok, retried: release.length, pruned: dead.length });
  } catch (err) {
    console.error('[version-notice] error', (err as Error)?.name || 'error');
    return json({ ok: false }, 500);
  }
});
