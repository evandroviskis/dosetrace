-- notification_sends — idempotency ledger for the send-reminders scheduled push
-- sender. Each row claims one (device, notification-slot, local-day) so overlapping
-- cron runs never double-send. Written ONLY by the sender via the service role;
-- no client ever reads or writes it (RLS on, zero policies → deny all to
-- anon/authenticated). Rows are disposable — prune anything older than a few days.
-- NOT APPLIED LIVE YET: apply this together with enabling send-reminders (see the
-- server-push activation checklist in STATE.md).
create table if not exists public.notification_sends (
  dedupe_key text primary key,           -- "<expo_token>:<type>:<...>:<YYYY-MM-DD>"
  user_id uuid references auth.users(id) on delete cascade,
  sent_at timestamptz not null default now()
);
create index if not exists idx_notification_sends_sent_at on public.notification_sends(sent_at);

alter table public.notification_sends enable row level security;
-- No policies on purpose: service role bypasses RLS; everyone else is denied.

-- Suggested retention (run from a daily job or inside the sender):
--   delete from public.notification_sends where sent_at < now() - interval '4 days';
