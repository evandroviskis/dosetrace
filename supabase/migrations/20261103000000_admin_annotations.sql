-- Admin panel — campaign marks on the "Quantas pessoas reais chegam?" chart (Admin Council round 2, founder
-- approved the picture 2026-11-02 23:30 EST). One row per mark: the day, a short label ("carrossel D") and an
-- optional channel. Written only by the panel's service role through api/adm.js (admin role + step-up).
-- Applied live 2026-11-03 00:15 EST with the founder's go (ACL service_role=ard, anon 42501).

create extension if not exists pgcrypto;

create table if not exists public.admin_annotations (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  label text not null check (char_length(label) between 1 and 80),
  channel text,
  created_at timestamptz not null default now()
);

alter table public.admin_annotations enable row level security;
revoke all on table public.admin_annotations from public, anon, authenticated;
grant select, insert, delete on table public.admin_annotations to service_role;
revoke update, truncate, references, trigger on table public.admin_annotations from service_role;
