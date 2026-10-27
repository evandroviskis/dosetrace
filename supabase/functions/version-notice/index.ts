// version-notice — A-127 UN-6 (founder 2026-10-15; docs/specs/update-notice.md). Once an hour
// (pg_cron, migration 20261022000000_app_releases.sql) every person who said yes to "Avisar quando
// houver versão nova?" and whose phone is below the latest version gets ONE push for that version, in
// their daytime, never in Silent mode, at least 24 h after the founder set latest_version, in the
// language on their token row (the rules: ./plan.js).
//
// NOT DEPLOYED. Deploy only after the founder's "pode aplicar" for the migration:
//   supabase functions deploy version-notice --no-verify-jwt
//   (the hourly secret is generated in the Vault and checked by version_notice_secret_ok — no
//   CRON_SECRET needed; it still works when set)
// --no-verify-jwt because the cron call carries no user JWT; the function itself refuses any call
// without "Authorization: Bearer <CRON_SECRET or the service-role key>" (as send-reminders does), and
// claim_version_notice() lets it run at most once per 50 minutes.
// Each push is claimed in app_release_pushes BEFORE it is sent (two runs never send it twice) and
// released when Expo does not accept it (the next run retries); dead tokens are pruned. Accounts are
// read only for the phones that pass every cheap filter first (ledger, version, 24 h, daytime).
// Counts only in the logs — never a token, a user id or an address.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { versionMessages, pushCandidates, deadTokens, versionBelow, sentKey } from './plan.js';
import { selectWithOptionalLanguage } from '../_shared/pushLanguage.js';

const EXPO_BATCH = 100;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Release = { platform: string; latest_version: string | null; latest_set_at: string | null; notes: Record<string, string[]> };
type Token = { user_id: string; expo_token: string; platform: string; timezone: string | null; app_version: string | null; language: string | null; updated_at: string | null };

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  const auth = req.headers.get('Authorization') || '';
  // The hourly call's secret lives only in the Vault (generated in the database, migration
  // 20261027010000_version_notice_cron.sql): checked by a service-role-only RPC, never seen here.
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  let vaultOk = false;
  if (bearer && bearer !== serviceKey && !(cronSecret && bearer === cronSecret)) {
    const checker = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
    const { data, error } = await checker.rpc('version_notice_secret_ok', { p_secret: bearer });
    if (error) console.error('[version-notice] secret check failed:', error.code);
    vaultOk = data === true;
  }
  if (!(auth === `Bearer ${serviceKey}` || (cronSecret && auth === `Bearer ${cronSecret}`) || vaultOk)) {
    // Review round 2, item 6: the hourly call builds its header from the Vault secret; a missing
    // secret sends no usable header and every run would be refused in silence. Said loudly (never
    // the header or a secret).
    const bare = !auth || /^Bearer\s*(null|undefined)?\s*$/i.test(auth);
    if (bare) console.error('[version-notice] refused: no Authorization header — is the Vault secret dosetrace_cron_secret missing? (see the migration header)');
    else console.error('[version-notice] refused: the Authorization header matches neither the Vault secret dosetrace_cron_secret nor CRON_SECRET');
    return json({ error: 'unauthorized' }, 401);
  }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
  const DRY_RUN = (Deno.env.get('DRY_RUN') || '').toLowerCase() === 'true';
  const now = new Date();
  try {
    const { data: claimed, error: claimErr } = await admin.rpc('claim_version_notice');
    if (claimErr) throw claimErr;
    if (!claimed) return json({ ok: true, skipped: 'too_soon' });

    const { data: rels, error: relErr } = await admin.from('app_releases').select('platform, latest_version, latest_set_at, notes');
    if (relErr) throw relErr;
    const releases = ((rels || []) as Release[]).filter((r) => r.latest_version);
    if (!releases.length) return json({ ok: true, releases: 0, sent: 0 });

    // Phones that report a version (paged: the API returns at most 1000 rows per read). The language
    // column (migration 20261021230000_push_tokens_language.sql) is optional: without it, English.
    const tokens: Token[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await selectWithOptionalLanguage(
        (cols: string) => admin.from('push_tokens').select(cols).not('app_version', 'is', null).order('expo_token').range(from, from + 999),
        'user_id, expo_token, platform, timezone, app_version, updated_at',
      );
      if (error) throw error;
      tokens.push(...((data || []) as Token[]));
      if (!data || data.length < 1000) break;
    }
    const below = tokens.filter((t) => releases.some((r) => r.platform === t.platform && versionBelow(t.app_version, r.latest_version)));

    // The ledger first: who already got this version.
    const sent = new Set<string>();
    const belowIds = [...new Set(below.map((t) => t.user_id))];
    for (let i = 0; i < belowIds.length; i += 500) {
      const { data } = await admin.from('app_release_pushes').select('user_id, platform, version').in('user_id', belowIds.slice(i, i + 500));
      for (const r of data || []) sent.add(sentKey(r.user_id, r.platform, r.version));
    }
    const candidates = pushCandidates({ releases, tokens: below, sent, now });
    const userIds = [...new Set(candidates.map((t) => t.user_id))];

    // Only what the rule needs from each remaining account: the yes and Silent mode.
    const users = new Map<string, Record<string, unknown>>();
    for (const uid of userIds) {
      try {
        const { data: u } = await admin.auth.admin.getUserById(uid);
        const m = (u?.user?.user_metadata || {}) as Record<string, unknown>;
        users.set(uid, { version_news: m.version_news === true, silent_mode: m.silent_mode === true });
      } catch { /* unread: not sent this run */ }
    }

    const msgs = versionMessages({ releases, tokens: candidates, users, sent, now });
    if (DRY_RUN) return json({ ok: true, dry: true, candidates: candidates.length, would_send: msgs.length });

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
    return json({ ok: true, candidates: candidates.length, sent: ok, retried: release.length, pruned: dead.length });
  } catch (err) {
    console.error('[version-notice] error', (err as Error)?.name || 'error');
    return json({ ok: false }, 500);
  }
});
