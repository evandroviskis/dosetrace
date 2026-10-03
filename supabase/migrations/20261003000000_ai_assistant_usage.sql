-- AI protocol assistant usage (docs/specs/ai-protocol-assistant.md AP-18): one row per
-- conversation started ('start' = one use; 10 per user per rolling 7 days) and one per
-- typed answer read by the AI ('turn', capped per conversation and per day). Separate from
-- ai_scan_usage (the scan pool) and ai_food_usage on purpose.
--
-- Written ONLY by the protocol-assistant edge function through the service role. RLS is
-- enabled with NO policies, so the app's anon/authenticated clients can neither read nor
-- tamper with it (the limit can't be bypassed from the phone). The FK cascade removes a
-- user's rows when the account is deleted. No user text is stored here.
create table if not exists public.ai_assistant_usage (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  kind            text not null check (kind in ('start', 'turn')),
  door            text,
  created_at      timestamptz not null default now()
);

create index if not exists ai_assistant_usage_user_kind_time_idx
  on public.ai_assistant_usage (user_id, kind, created_at);
create index if not exists ai_assistant_usage_conversation_idx
  on public.ai_assistant_usage (user_id, conversation_id, kind);

alter table public.ai_assistant_usage enable row level security;
-- Intentionally NO policies: clients have zero access; the service role bypasses RLS.
