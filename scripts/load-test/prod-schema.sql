-- Load-test rig (scripts/load-test/run.cjs): a copy of the PRODUCTION public schema as it stood on
-- 2026-11-03, read from project mqfvnqfusqyhqhowfweh with read-only catalog queries only
-- (pg_attribute/pg_attrdef, pg_constraint, pg_indexes, pg_policies, pg_trigger, pg_get_functiondef,
-- relacl). No user row was read. Test data only — never run against production.
--
-- Faithful for the app's tables: every column with its type/default, primary keys, unique keys, foreign
-- keys, the CHECKs of the synced and device tables, every non-constraint index, every RLS policy
-- (verbatim from pg_policies), the triggers of the public tables, the device guard
-- (dt_pre_request -> dt_require_active_device, dt_device_guard), device_status, and the grants.
-- Left out (not on the sync path): the admin_* functions and CHECKs, the cron/notice functions,
-- claim_device and the other device RPCs (the rig seeds account_devices/user_devices directly).
-- Production runs Postgres 17.6; the local image is 15.8 (planner differences are possible).
--
-- Runs as supabase_admin (auth.users FKs, extension); scripts/load-test/run.cjs then hands the
-- tables and functions to postgres, as in production.

-- auth.uid()/auth.role() exactly as Supabase defines them (they read PostgREST 12's
-- request.jwt.claims, which is why they cost a jsonb parse each time they run).
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;

create extension if not exists moddatetime with schema public;

-- ── Tables ───────────────────────────────────────────────────────────────────
create sequence public.admin_actions_log_id_seq;
create sequence public.admin_audit_log_id_seq;
create sequence public.admin_translate_usage_id_seq;
create sequence public.version_notice_runs_id_seq;
create sequence public.wake_refresh_runs_id_seq;

create table public.account_devices (
  user_id uuid not null,
  active_device text,
  since timestamp with time zone default now() not null,
  session_created_at timestamp with time zone,
  last_device text
);
create table public.admin_actions_log (
  id bigint default nextval('admin_actions_log_id_seq'::regclass) not null,
  at timestamp with time zone default now() not null,
  request_id uuid not null,
  actor uuid not null,
  action text not null,
  user_id uuid not null,
  expires_at timestamp with time zone,
  reason text,
  before jsonb,
  after jsonb,
  status text default 'pending'::text not null,
  http integer,
  result jsonb,
  message_id uuid,
  devices integer,
  accepted integer,
  failed integer,
  translated boolean
);
create table public.admin_annotations (
  id uuid default gen_random_uuid() not null,
  day date not null,
  label text not null,
  channel text,
  created_at timestamp with time zone default now() not null
);
create table public.admin_apple_days (
  day date not null,
  downloads integer default 0 not null,
  redownloads integer default 0 not null,
  updates integer default 0 not null,
  report boolean default true not null,
  fetched_at timestamp with time zone default now() not null
);
create table public.admin_audit_log (
  id bigint default nextval('admin_audit_log_id_seq'::regclass) not null,
  at timestamp with time zone default now() not null,
  action text not null,
  email text not null,
  before boolean,
  after boolean,
  actor uuid
);
create table public.admin_devices (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  key_hash text not null,
  created_at timestamp with time zone default now() not null,
  last_used_at timestamp with time zone,
  revoked_at timestamp with time zone
);
create table public.admin_test_accounts (
  email text not null,
  reason text not null,
  added_at timestamp with time zone default now() not null
);
create table public.admin_test_exceptions (
  email text not null,
  reason text not null,
  added_at timestamp with time zone default now() not null
);
create table public.admin_translate_usage (
  id bigint default nextval('admin_translate_usage_id_seq'::regclass) not null,
  actor uuid not null,
  at timestamp with time zone default now() not null
);
create table public.admin_users (
  user_id uuid not null,
  role text not null,
  added_at timestamp with time zone default now() not null
);
create table public.ai_assistant_usage (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  conversation_id uuid not null,
  kind text not null,
  door text,
  created_at timestamp with time zone default now() not null
);
create table public.ai_food_usage (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  entry_date text,
  created_at timestamp with time zone default now(),
  kind text default 'parse'::text not null
);
create table public.ai_scan_usage (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  kind text default 'bloodwork'::text not null,
  created_at timestamp with time zone default now() not null
);
create table public.analytics_events (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  event text not null,
  properties jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now()
);
create table public.app_release_pushes (
  user_id uuid not null,
  platform text not null,
  version text not null,
  sent_at timestamp with time zone default now() not null
);
create table public.app_releases (
  platform text not null,
  latest_version text,
  min_version text,
  notes jsonb default '{}'::jsonb not null,
  reason jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  latest_set_at timestamp with time zone
);
create table public.apple_tokens (
  user_id uuid not null,
  apple_sub text,
  refresh_token text not null,
  updated_at timestamp with time zone default now() not null
);
create table public.biomarkers (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  report_date date not null,
  marker text not null,
  value numeric,
  unit text,
  reference_min numeric,
  reference_max numeric,
  status text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default now(),
  qualifier text,
  value_text text
);
create table public.calc_inputs (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  payload jsonb,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table public.calc_snapshots (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  entry_date text not null,
  weight_kg real,
  body_fat_pct real,
  lbm real,
  bmr real,
  tdee real,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  waist_cm real
);
create table public.calc_targets (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  entry_date text,
  target_weight_kg real,
  target_body_fat_pct real,
  target_date text,
  start_date text,
  start_weight_kg real,
  start_body_fat_pct real,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table public.device_policy (
  id boolean default true not null,
  min_app_version text,
  legacy_until timestamp with time zone
);
create table public.dose_logs (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  protocol_id uuid,
  logged_at timestamp with time zone default timezone('utc'::text, now()),
  outcome text,
  injection_site text,
  notes text,
  pre_tags text[],
  checkin_scheduled_at timestamp with time zone,
  checkin_completed boolean default false,
  checkin_tags text[],
  checkin_notes text,
  updated_at timestamp with time zone default now(),
  created_at timestamp with time zone default timezone('utc'::text, now()),
  dose_amount numeric,
  dose_unit text,
  slot_at timestamp with time zone,
  dose_edited smallint
);
create table public.food_logs (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  entry_date text,
  raw_text text,
  parsed_items jsonb,
  kcal numeric,
  protein_g numeric,
  carb_g numeric,
  fat_g numeric,
  source text default 'ai'::text,
  parse_status text default 'pending'::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
create table public.lab_prefs (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  kind text not null,
  test_key text default ''::text not null,
  item_key text not null,
  value text not null,
  removed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table public.profiles (
  id uuid not null,
  email text,
  name text,
  plan text default 'free'::text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);
create table public.protocols (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  name text not null,
  type text not null,
  color text not null,
  unit text,
  amount numeric,
  water numeric,
  dose numeric,
  dose_unit text,
  syringe_size integer,
  concentration numeric,
  frequency text,
  reminder_time text,
  goal text,
  notes text,
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  interval_days integer default 1,
  doses_per_day integer default 1,
  start_date date,
  schedule_total integer,
  deleted_at timestamp with time zone,
  concentration_unit text default 'mg'::text,
  updated_at timestamp with time zone default now(),
  diluent text,
  compound_id text,
  vial_valid_days integer,
  note text,
  serving_strength double precision,
  serving_strength_unit text,
  serving_units double precision,
  container_units double precision,
  units_taken double precision default 0,
  divisible boolean,
  composition text,
  ended_at timestamp with time zone,
  history_from date,
  purged_at timestamp with time zone,
  ends_on date,
  still_going_at timestamp with time zone,
  dose_history text,
  schedule_history text
);
create table public.push_tokens (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  expo_token text not null,
  platform text,
  updated_at timestamp with time zone default now() not null,
  timezone text,
  device_id text,
  language text,
  app_version text
);
create table public.reality_check_open (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  start_date text,
  start_weight_kg double precision,
  stopped_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table public.reality_checks (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  entry_date text not null,
  tdee real,
  rate_per_week_kg real,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table public.referral_codes (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  code text not null,
  times_used integer default 0,
  created_at timestamp with time zone default now()
);
create table public.referrals (
  id uuid default gen_random_uuid() not null,
  referrer_id uuid,
  referred_id uuid,
  code text not null,
  created_at timestamp with time zone default now()
);
create table public.reminders (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  protocol_id uuid,
  "time" text not null,
  frequency text not null,
  days text[],
  duration_weeks integer,
  indefinite boolean default true,
  snooze_minutes integer default 15,
  silent boolean default false,
  log_from_notification boolean default true,
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now())
);
create table public.team_messages (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  body text not null,
  created_at timestamp with time zone default now() not null,
  read_at timestamp with time zone,
  withdrawn_at timestamp with time zone
);
create table public.user_devices (
  user_id uuid not null,
  device_id text not null,
  platform text,
  name text,
  brand text,
  app_version text,
  secret_hash text,
  registered_at timestamp with time zone default now() not null,
  last_seen_at timestamp with time zone,
  last_full_send_at timestamp with time zone,
  replaced_at timestamp with time zone,
  replaced_by text,
  rebuild_owed boolean default false not null,
  rebuild_mode text,
  notice jsonb
);
create table public.vaccines (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  name text,
  date_given text,
  next_due text,
  notes text,
  provider text,
  location text,
  manufacturer text,
  batch_lot text,
  dose_number integer,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
create table public.version_notice_runs (
  id bigint default nextval('version_notice_runs_id_seq'::regclass) not null,
  ran_at timestamp with time zone default now() not null
);
create table public.vials (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  protocol_id uuid,
  mixed_on date,
  water_ml numeric,
  total_doses integer,
  doses_taken integer default 0,
  expiry_alert_days integer default 5,
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default now(),
  expires_on text
);
create table public.wake_refresh_runs (
  id bigint default nextval('wake_refresh_runs_id_seq'::regclass) not null,
  ran_at timestamp with time zone default now() not null
);

-- ── Primary and unique keys ─────────────────────────────────────────────────
alter table public.account_devices add constraint account_devices_pkey PRIMARY KEY (user_id);
alter table public.admin_actions_log add constraint admin_actions_log_pkey PRIMARY KEY (id);
alter table public.admin_annotations add constraint admin_annotations_pkey PRIMARY KEY (id);
alter table public.admin_apple_days add constraint admin_apple_days_pkey PRIMARY KEY (day);
alter table public.admin_audit_log add constraint admin_audit_log_pkey PRIMARY KEY (id);
alter table public.admin_devices add constraint admin_devices_pkey PRIMARY KEY (id);
alter table public.admin_test_accounts add constraint admin_test_accounts_pkey PRIMARY KEY (email);
alter table public.admin_test_exceptions add constraint admin_test_exceptions_pkey PRIMARY KEY (email);
alter table public.admin_translate_usage add constraint admin_translate_usage_pkey PRIMARY KEY (id);
alter table public.admin_users add constraint admin_users_pkey PRIMARY KEY (user_id);
alter table public.ai_assistant_usage add constraint ai_assistant_usage_pkey PRIMARY KEY (id);
alter table public.ai_food_usage add constraint ai_food_usage_pkey PRIMARY KEY (id);
alter table public.ai_scan_usage add constraint ai_scan_usage_pkey PRIMARY KEY (id);
alter table public.analytics_events add constraint analytics_events_pkey PRIMARY KEY (id);
alter table public.app_release_pushes add constraint app_release_pushes_pkey PRIMARY KEY (user_id, platform, version);
alter table public.app_releases add constraint app_releases_pkey PRIMARY KEY (platform);
alter table public.apple_tokens add constraint apple_tokens_pkey PRIMARY KEY (user_id);
alter table public.biomarkers add constraint biomarkers_pkey PRIMARY KEY (id);
alter table public.calc_inputs add constraint calc_inputs_pkey PRIMARY KEY (id);
alter table public.calc_snapshots add constraint calc_snapshots_pkey PRIMARY KEY (id);
alter table public.calc_targets add constraint calc_targets_pkey PRIMARY KEY (id);
alter table public.device_policy add constraint device_policy_pkey PRIMARY KEY (id);
alter table public.dose_logs add constraint dose_logs_pkey PRIMARY KEY (id);
alter table public.food_logs add constraint food_logs_pkey PRIMARY KEY (id);
alter table public.lab_prefs add constraint lab_prefs_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.protocols add constraint protocols_pkey PRIMARY KEY (id);
alter table public.push_tokens add constraint push_tokens_pkey PRIMARY KEY (id);
alter table public.reality_check_open add constraint reality_check_open_pkey PRIMARY KEY (id);
alter table public.reality_checks add constraint reality_checks_pkey PRIMARY KEY (id);
alter table public.referral_codes add constraint referral_codes_pkey PRIMARY KEY (id);
alter table public.referrals add constraint referrals_pkey PRIMARY KEY (id);
alter table public.reminders add constraint reminders_pkey PRIMARY KEY (id);
alter table public.team_messages add constraint team_messages_pkey PRIMARY KEY (id);
alter table public.user_devices add constraint user_devices_pkey PRIMARY KEY (user_id, device_id);
alter table public.vaccines add constraint vaccines_pkey PRIMARY KEY (id);
alter table public.version_notice_runs add constraint version_notice_runs_pkey PRIMARY KEY (id);
alter table public.vials add constraint vials_pkey PRIMARY KEY (id);
alter table public.wake_refresh_runs add constraint wake_refresh_runs_pkey PRIMARY KEY (id);
alter table public.admin_actions_log add constraint admin_actions_log_request_id_key UNIQUE (request_id);
alter table public.admin_devices add constraint admin_devices_key_hash_key UNIQUE (key_hash);
alter table public.calc_inputs add constraint calc_inputs_one_per_user UNIQUE (user_id);
alter table public.push_tokens add constraint push_tokens_user_id_expo_token_key UNIQUE (user_id, expo_token);
alter table public.referral_codes add constraint referral_codes_code_key UNIQUE (code);
alter table public.referral_codes add constraint referral_codes_user_id_key UNIQUE (user_id);
alter table public.referrals add constraint referrals_referred_id_key UNIQUE (referred_id);

-- ── CHECKs (synced and device tables) ───────────────────────────────────────
alter table public.biomarkers add constraint biomarkers_qualifier_check CHECK (((qualifier IS NULL) OR (qualifier = ANY (ARRAY['<'::text, '>'::text, '≤'::text, '≥'::text]))));
alter table public.biomarkers add constraint biomarkers_value_or_text_check CHECK (((value IS NOT NULL) OR ((value_text IS NOT NULL) AND (length(btrim(value_text)) > 0))));
alter table public.device_policy add constraint device_policy_id_check CHECK (id);
alter table public.device_policy add constraint device_policy_min_app_version_check CHECK (((min_app_version IS NULL) OR (min_app_version ~ '^[0-9]+(\.[0-9]+)*$'::text)));
alter table public.lab_prefs add constraint lab_prefs_kind_check CHECK ((kind = ANY (ARRAY['star'::text, 'label'::text])));
alter table public.push_tokens add constraint push_tokens_app_version_check CHECK (((app_version IS NULL) OR (char_length(app_version) <= 20)));
alter table public.push_tokens add constraint push_tokens_language_check CHECK (((language IS NULL) OR (language = ANY (ARRAY['en'::text, 'es'::text, 'pt'::text, 'fr'::text, 'de'::text, 'it'::text]))));
alter table public.team_messages add constraint team_messages_body_check CHECK ((((char_length(body) >= 1) AND (char_length(body) <= 200)) AND (body = btrim(body))));
alter table public.team_messages add constraint team_messages_read_or_withdrawn CHECK (((read_at IS NULL) OR (withdrawn_at IS NULL)));
alter table public.user_devices add constraint user_devices_app_version_check CHECK (((app_version IS NULL) OR (char_length(app_version) <= 20)));
alter table public.user_devices add constraint user_devices_brand_check CHECK (((brand IS NULL) OR (char_length(brand) <= 40)));
alter table public.user_devices add constraint user_devices_device_id_check CHECK (((char_length(device_id) >= 8) AND (char_length(device_id) <= 128)));
alter table public.user_devices add constraint user_devices_name_check CHECK (((name IS NULL) OR (char_length(name) <= 60)));
alter table public.user_devices add constraint user_devices_platform_check CHECK (((platform IS NULL) OR (char_length(platform) <= 16)));
alter table public.user_devices add constraint user_devices_rebuild_mode_check CHECK (((rebuild_mode IS NULL) OR (rebuild_mode = ANY (ARRAY['takeover'::text, 'stale'::text]))));

-- ── Foreign keys ────────────────────────────────────────────────────────────
alter table public.account_devices add constraint account_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.admin_actions_log add constraint admin_actions_log_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.team_messages(id) ON DELETE SET NULL;
alter table public.admin_devices add constraint admin_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.admin_users add constraint admin_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.ai_assistant_usage add constraint ai_assistant_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.ai_food_usage add constraint ai_food_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.ai_scan_usage add constraint ai_scan_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.analytics_events add constraint analytics_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.app_release_pushes add constraint app_release_pushes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.apple_tokens add constraint apple_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.biomarkers add constraint biomarkers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public.calc_inputs add constraint calc_inputs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.calc_snapshots add constraint calc_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.calc_targets add constraint calc_targets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.dose_logs add constraint dose_logs_protocol_id_fkey FOREIGN KEY (protocol_id) REFERENCES public.protocols(id) ON DELETE CASCADE;
alter table public.dose_logs add constraint dose_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public.food_logs add constraint food_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.lab_prefs add constraint lab_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.protocols add constraint protocols_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public.push_tokens add constraint push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.reality_check_open add constraint reality_check_open_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.reality_checks add constraint reality_checks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.referral_codes add constraint referral_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.referrals add constraint referrals_referred_id_fkey FOREIGN KEY (referred_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.referrals add constraint referrals_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.reminders add constraint reminders_protocol_id_fkey FOREIGN KEY (protocol_id) REFERENCES public.protocols(id) ON DELETE CASCADE;
alter table public.reminders add constraint reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public.team_messages add constraint team_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.user_devices add constraint user_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.vaccines add constraint vaccines_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.vials add constraint vials_protocol_id_fkey FOREIGN KEY (protocol_id) REFERENCES public.protocols(id) ON DELETE CASCADE;
alter table public.vials add constraint vials_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ── Indexes (every non-constraint index in production) ──────────────────────
CREATE INDEX admin_actions_log_actor_at ON public.admin_actions_log USING btree (actor, at DESC);
CREATE INDEX admin_actions_log_message ON public.admin_actions_log USING btree (message_id);
CREATE INDEX admin_actions_log_user_at ON public.admin_actions_log USING btree (user_id, at DESC);
CREATE INDEX admin_translate_usage_actor_at ON public.admin_translate_usage USING btree (actor, at DESC);
CREATE INDEX ai_assistant_usage_conversation_idx ON public.ai_assistant_usage USING btree (user_id, conversation_id, kind);
CREATE INDEX ai_assistant_usage_user_kind_time_idx ON public.ai_assistant_usage USING btree (user_id, kind, created_at);
CREATE INDEX ai_food_usage_user_day_kind ON public.ai_food_usage USING btree (user_id, entry_date, kind);
CREATE INDEX idx_ai_food_usage_user_day ON public.ai_food_usage USING btree (user_id, created_at);
CREATE INDEX ai_scan_usage_user_month_idx ON public.ai_scan_usage USING btree (user_id, created_at);
CREATE INDEX idx_analytics_created ON public.analytics_events USING btree (created_at DESC);
CREATE INDEX idx_analytics_event ON public.analytics_events USING btree (event);
CREATE INDEX idx_analytics_event_time ON public.analytics_events USING btree (event, created_at DESC);
CREATE INDEX idx_analytics_user ON public.analytics_events USING btree (user_id);
CREATE INDEX calc_inputs_user_idx ON public.calc_inputs USING btree (user_id);
CREATE INDEX idx_calc_snapshots_user_date ON public.calc_snapshots USING btree (user_id, entry_date);
CREATE INDEX idx_calc_targets_user ON public.calc_targets USING btree (user_id);
CREATE INDEX idx_food_logs_date ON public.food_logs USING btree (user_id, entry_date);
CREATE INDEX idx_food_logs_updated ON public.food_logs USING btree (user_id, updated_at);
CREATE INDEX idx_food_logs_user ON public.food_logs USING btree (user_id);
CREATE INDEX lab_prefs_user_idx ON public.lab_prefs USING btree (user_id);
CREATE INDEX lab_prefs_user_updated_idx ON public.lab_prefs USING btree (user_id, updated_at, id);
CREATE INDEX idx_push_tokens_user ON public.push_tokens USING btree (user_id);
CREATE INDEX reality_check_open_user_idx ON public.reality_check_open USING btree (user_id);
CREATE INDEX idx_reality_checks_user_date ON public.reality_checks USING btree (user_id, entry_date);
CREATE INDEX idx_referral_codes_code ON public.referral_codes USING btree (code);
CREATE INDEX idx_referral_codes_user ON public.referral_codes USING btree (user_id);
CREATE INDEX idx_referrals_code ON public.referrals USING btree (code);
CREATE INDEX idx_referrals_referrer ON public.referrals USING btree (referrer_id);
CREATE INDEX team_messages_user_created ON public.team_messages USING btree (user_id, created_at DESC);
CREATE INDEX user_devices_secret_hash ON public.user_devices USING btree (secret_hash) WHERE (secret_hash IS NOT NULL);
CREATE INDEX idx_vaccines_updated ON public.vaccines USING btree (user_id, updated_at);
CREATE INDEX idx_vaccines_user ON public.vaccines USING btree (user_id);

-- ── RLS: enabled on every public table (production: relrowsecurity true everywhere) ──
do $$ declare t text; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('alter table public.%I enable row level security', t);
  end loop; end $$;

-- ── Policies (verbatim from pg_policies, 2026-11-03) ────────────────────────
create policy "Signed-in apps insert anonymous events" on public.analytics_events as permissive for insert to authenticated with check ((user_id IS NULL));
create policy "Users can insert own events" on public.analytics_events as permissive for insert to public with check ((auth.uid() = user_id));
create policy "Users can read own events" on public.analytics_events as permissive for select to public using ((auth.uid() = user_id));
create policy "app_releases_read" on public.app_releases as permissive for select to anon, authenticated using (true);
create policy "Users can manage own biomarkers" on public.biomarkers as permissive for all to public using ((auth.uid() = user_id));
create policy "calc_inputs delete own" on public.calc_inputs as permissive for delete to public using ((auth.uid() = user_id));
create policy "calc_inputs insert own" on public.calc_inputs as permissive for insert to public with check ((auth.uid() = user_id));
create policy "calc_inputs select own" on public.calc_inputs as permissive for select to public using ((auth.uid() = user_id));
create policy "calc_inputs update own" on public.calc_inputs as permissive for update to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "calc_snapshots delete own" on public.calc_snapshots as permissive for delete to public using ((auth.uid() = user_id));
create policy "calc_snapshots insert own" on public.calc_snapshots as permissive for insert to public with check ((auth.uid() = user_id));
create policy "calc_snapshots select own" on public.calc_snapshots as permissive for select to public using ((auth.uid() = user_id));
create policy "calc_snapshots update own" on public.calc_snapshots as permissive for update to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "calc_targets delete own" on public.calc_targets as permissive for delete to public using ((auth.uid() = user_id));
create policy "calc_targets insert own" on public.calc_targets as permissive for insert to public with check ((auth.uid() = user_id));
create policy "calc_targets select own" on public.calc_targets as permissive for select to public using ((auth.uid() = user_id));
create policy "calc_targets update own" on public.calc_targets as permissive for update to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users can manage own logs" on public.dose_logs as permissive for all to public using ((auth.uid() = user_id));
create policy "Users can delete own food_logs" on public.food_logs as permissive for delete to public using ((auth.uid() = user_id));
create policy "Users can insert own food_logs" on public.food_logs as permissive for insert to public with check ((auth.uid() = user_id));
create policy "Users can read own food_logs" on public.food_logs as permissive for select to public using ((auth.uid() = user_id));
create policy "Users can update own food_logs" on public.food_logs as permissive for update to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "lab_prefs delete own" on public.lab_prefs as permissive for delete to public using ((auth.uid() = user_id));
create policy "lab_prefs insert own" on public.lab_prefs as permissive for insert to public with check ((auth.uid() = user_id));
create policy "lab_prefs select own" on public.lab_prefs as permissive for select to public using ((auth.uid() = user_id));
create policy "lab_prefs update own" on public.lab_prefs as permissive for update to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users can manage own profile" on public.profiles as permissive for all to public using ((auth.uid() = id));
create policy "Users insert own protocols" on public.protocols as permissive for insert to public with check ((auth.uid() = user_id));
create policy "Users read own protocols" on public.protocols as permissive for select to public using ((auth.uid() = user_id));
create policy "Users update own protocols" on public.protocols as permissive for update to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "push_tokens delete own" on public.push_tokens as permissive for delete to public using ((auth.uid() = user_id));
create policy "push_tokens insert own" on public.push_tokens as permissive for insert to public with check ((auth.uid() = user_id));
create policy "push_tokens select own" on public.push_tokens as permissive for select to public using ((auth.uid() = user_id));
create policy "push_tokens update own" on public.push_tokens as permissive for update to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "reality_check_open delete own" on public.reality_check_open as permissive for delete to public using ((auth.uid() = user_id));
create policy "reality_check_open insert own" on public.reality_check_open as permissive for insert to public with check ((auth.uid() = user_id));
create policy "reality_check_open select own" on public.reality_check_open as permissive for select to public using ((auth.uid() = user_id));
create policy "reality_check_open update own" on public.reality_check_open as permissive for update to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "reality_checks delete own" on public.reality_checks as permissive for delete to public using ((auth.uid() = user_id));
create policy "reality_checks insert own" on public.reality_checks as permissive for insert to public with check ((auth.uid() = user_id));
create policy "reality_checks select own" on public.reality_checks as permissive for select to public using ((auth.uid() = user_id));
create policy "reality_checks update own" on public.reality_checks as permissive for update to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users can insert own referral code" on public.referral_codes as permissive for insert to public with check ((auth.uid() = user_id));
create policy "Users can read own referral code" on public.referral_codes as permissive for select to public using ((auth.uid() = user_id));
create policy "Users can update own code stats" on public.referral_codes as permissive for update to public using ((auth.uid() = user_id));
create policy "Users can insert referral records" on public.referrals as permissive for insert to public with check ((auth.uid() = referred_id));
create policy "Users can see referrals they made" on public.referrals as permissive for select to public using ((auth.uid() = referrer_id));
create policy "Users can see their own referral record" on public.referrals as permissive for select to public using ((auth.uid() = referred_id));
create policy "Users can manage own reminders" on public.reminders as permissive for all to public using ((auth.uid() = user_id));
create policy "team_messages select own" on public.team_messages as permissive for select to authenticated using (((auth.uid() = user_id) AND (withdrawn_at IS NULL)));
create policy "Users can delete own vaccines" on public.vaccines as permissive for delete to public using ((auth.uid() = user_id));
create policy "Users can insert own vaccines" on public.vaccines as permissive for insert to public with check ((auth.uid() = user_id));
create policy "Users can read own vaccines" on public.vaccines as permissive for select to public using ((auth.uid() = user_id));
create policy "Users can update own vaccines" on public.vaccines as permissive for update to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users delete own vials of live or purged protocols" on public.vials as permissive for delete to public using (((auth.uid() = user_id) AND (NOT (EXISTS ( SELECT 1
   FROM protocols p
  WHERE ((p.id = vials.protocol_id) AND (p.deleted_at IS NOT NULL) AND (p.purged_at IS NULL)))))));
create policy "Users insert own vials" on public.vials as permissive for insert to public with check ((auth.uid() = user_id));
create policy "Users read own vials" on public.vials as permissive for select to public using ((auth.uid() = user_id));
create policy "Users update own vials" on public.vials as permissive for update to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

-- ── Functions (verbatim from pg_get_functiondef) ────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_events_anonymize()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.user_id := null;
  new.properties := coalesce(new.properties, '{}'::jsonb) - array['compound','dose','dose_unit','frequency','wellness_goal','color','type','compound_type','query','name','goal','tracking_types'];
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dt_header(p_name text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select nullif(coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> p_name, '')
$function$
;

CREATE OR REPLACE FUNCTION public.dt_version_below(p_version text, p_min text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when p_version is null or p_min is null then false
    when p_version !~ '^[0-9]+(\.[0-9]+)*$' or p_min !~ '^[0-9]+(\.[0-9]+)*$' then false
    else string_to_array(p_version, '.')::int[] < string_to_array(p_min, '.')::int[]
  end
$function$
;

CREATE OR REPLACE FUNCTION public.dt_require_active_device(p_lock boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_dev text := public.dt_header('x-dt-device');
  v_ver text := public.dt_header('x-dt-app-version');
  v_min text;
  v_legacy timestamptz;
  v_active text;
  v_found boolean;
begin
  if v_uid is null or coalesce(auth.role(), '') = 'service_role' then return; end if;
  -- claim_device's own writes (it removes the other devices' push tokens).
  if coalesce(current_setting('dt.in_claim', true), '') = '1' then return; end if;
  select min_app_version, legacy_until into v_min, v_legacy from public.device_policy where id;
  if v_min is not null and v_ver is not null and public.dt_version_below(v_ver, v_min) then
    raise exception using errcode = 'DT003', message = 'update_required', hint = v_min;
  end if;
  -- An older version (no device id) keeps working until the founder's cutoff, then is refused.
  if v_dev is null then
    if v_legacy is not null and now() >= v_legacy then raise exception using errcode = 'DT002', message = 'device_required'; end if;
    return;
  end if;
  if p_lock then
    select active_device into v_active from public.account_devices where user_id = v_uid for share;
  else
    select active_device into v_active from public.account_devices where user_id = v_uid;
  end if;
  v_found := found;
  if not v_found or v_active is distinct from v_dev then
    raise exception using errcode = 'DT001', message = 'device_not_active';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dt_pre_request()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_path text := regexp_replace(coalesce(current_setting('request.path', true), ''), '^/+', '');
  v_method text := upper(coalesce(nullif(current_setting('request.method', true), ''), 'GET'));
  v_table text := split_part(split_part(v_path, '?', 1), '/', 1);
begin
  if v_table = any (array['protocols', 'vials', 'dose_logs', 'biomarkers', 'vaccines', 'food_logs', 'reality_checks', 'calc_snapshots', 'calc_targets', 'reality_check_open', 'calc_inputs', 'lab_prefs']) then
    perform public.dt_require_active_device(v_method not in ('GET', 'HEAD'));
  elsif v_table = 'push_tokens' and v_method in ('POST', 'PATCH', 'PUT') then
    perform public.dt_require_active_device(true);
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dt_device_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.dt_require_active_device(true);
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dt_stamp_dose()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.outcome = 'Taken' and new.dose_amount is null and new.protocol_id is not null then
    select p.dose, coalesce(p.dose_unit, 'mg') into new.dose_amount, new.dose_unit
      from public.protocols p
     where p.id = new.protocol_id and p.user_id = new.user_id and p.dose > 0;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.protocols_blank_purged()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.purged_at is not null then
    new.name := ''; new.unit := null; new.amount := null; new.water := null; new.dose := null;
    new.dose_unit := null; new.syringe_size := null; new.concentration := null; new.frequency := null;
    new.reminder_time := null; new.goal := null; new.notes := null; new.note := null;
    new.start_date := null; new.schedule_total := null; new.diluent := null; new.compound_id := null;
    new.vial_valid_days := null; new.serving_strength := null; new.serving_strength_unit := null;
    new.serving_units := null; new.container_units := null; new.units_taken := null;
    new.composition := null; new.history_from := null; new.ended_at := null; new.active := false;
    new.ends_on := null; new.still_going_at := null;
    new.interval_days := 1; new.doses_per_day := 1; new.concentration_unit := 'mg'; new.divisible := null; new.dose_history := null;
    new.schedule_history := null;
    new.deleted_at := coalesce(new.deleted_at, new.purged_at);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.protocols_purge_children()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  delete from public.dose_logs where protocol_id = new.id and user_id = new.user_id;
  delete from public.vials where protocol_id = new.id and user_id = new.user_id;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.protocols_still_going_forward()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.purged_at is not null then return new; end if;
  if new.still_going_at is not null then new.still_going_at := least(new.still_going_at, now()); end if;
  if tg_op = 'UPDATE' then new.still_going_at := greatest(old.still_going_at, new.still_going_at); end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reality_check_open_keep_stop()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if old.stopped_at is not null then
    new.stopped_at := old.stopped_at;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refuse_child_of_purged_protocol()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.protocol_id is not null and exists (
    select 1 from public.protocols p
    where p.id = new.protocol_id and p.user_id = new.user_id and p.purged_at is not null
  ) then
    raise exception 'protocol % was deleted forever', new.protocol_id using errcode = 'P0001';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.device_status(p_device text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_acc public.account_devices;
  v_me public.user_devices;
  v_act public.user_devices;
  v_min text;
begin
  if v_uid is null then raise exception using errcode = '28000', message = 'not signed in'; end if;
  if not exists (select 1 from auth.users where id = v_uid) then
    return jsonb_build_object('status', 'account_gone', 'server_time', v_now);
  end if;
  select min_app_version into v_min from public.device_policy where id;
  select * into v_acc from public.account_devices where user_id = v_uid;
  select * into v_me from public.user_devices where user_id = v_uid and device_id = p_device;
  if v_acc.user_id is not null and v_acc.active_device = p_device then
    update public.user_devices set last_seen_at = v_now where user_id = v_uid and device_id = p_device;
    return jsonb_build_object('status', 'active', 'rebuild_owed', coalesce(v_me.rebuild_owed, false), 'rebuild_mode', v_me.rebuild_mode, 'notice', v_me.notice, 'min_version', v_min, 'server_time', v_now);
  end if;
  if v_me.replaced_at is not null then
    return jsonb_build_object('status', 'replaced', 'at', v_me.replaced_at, 'min_version', v_min, 'server_time', v_now);
  end if;
  if v_acc.user_id is null or v_acc.active_device is null then
    return jsonb_build_object('status', 'none', 'min_version', v_min, 'server_time', v_now);
  end if;
  select * into v_act from public.user_devices where user_id = v_uid and device_id = v_acc.active_device;
  return jsonb_build_object('status', 'in_use', 'device', jsonb_build_object('platform', v_act.platform, 'name', v_act.name, 'brand', v_act.brand),
    'min_version', v_min, 'server_time', v_now);
end;
$function$
;

-- ── Triggers (verbatim from pg_get_triggerdef) ──────────────────────────────
CREATE TRIGGER dose_logs_refuse_purged_parent BEFORE INSERT OR UPDATE ON public.dose_logs FOR EACH ROW EXECUTE FUNCTION refuse_child_of_purged_protocol();
CREATE TRIGGER dt_device_guard BEFORE INSERT OR DELETE OR UPDATE ON public.dose_logs FOR EACH STATEMENT EXECUTE FUNCTION dt_device_guard();
CREATE TRIGGER dt_stamp_dose BEFORE INSERT OR UPDATE ON public.dose_logs FOR EACH ROW EXECUTE FUNCTION dt_stamp_dose();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.dose_logs FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');
CREATE TRIGGER dt_device_guard BEFORE INSERT OR DELETE OR UPDATE ON public.vials FOR EACH STATEMENT EXECUTE FUNCTION dt_device_guard();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.vials FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');
CREATE TRIGGER vials_refuse_purged_parent BEFORE INSERT OR UPDATE ON public.vials FOR EACH ROW EXECUTE FUNCTION refuse_child_of_purged_protocol();
CREATE TRIGGER dt_device_guard BEFORE INSERT OR DELETE OR UPDATE ON public.vaccines FOR EACH STATEMENT EXECUTE FUNCTION dt_device_guard();
CREATE TRIGGER vaccines_set_updated_at BEFORE UPDATE ON public.vaccines FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER calc_targets_set_updated_at BEFORE UPDATE ON public.calc_targets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER dt_device_guard BEFORE INSERT OR DELETE OR UPDATE ON public.calc_targets FOR EACH STATEMENT EXECUTE FUNCTION dt_device_guard();
CREATE TRIGGER dt_device_guard BEFORE INSERT OR DELETE OR UPDATE ON public.biomarkers FOR EACH STATEMENT EXECUTE FUNCTION dt_device_guard();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.biomarkers FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');
CREATE TRIGGER dt_device_guard BEFORE INSERT OR DELETE OR UPDATE ON public.food_logs FOR EACH STATEMENT EXECUTE FUNCTION dt_device_guard();
CREATE TRIGGER food_logs_set_updated_at BEFORE UPDATE ON public.food_logs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER analytics_events_anonymize BEFORE INSERT OR UPDATE ON public.analytics_events FOR EACH ROW EXECUTE FUNCTION analytics_events_anonymize();
CREATE TRIGGER dt_device_guard BEFORE INSERT OR DELETE OR UPDATE ON public.protocols FOR EACH STATEMENT EXECUTE FUNCTION dt_device_guard();
CREATE TRIGGER protocols_blank_purged BEFORE INSERT OR UPDATE ON public.protocols FOR EACH ROW EXECUTE FUNCTION protocols_blank_purged();
CREATE TRIGGER protocols_purge_children AFTER UPDATE OF purged_at ON public.protocols FOR EACH ROW WHEN ((new.purged_at IS NOT NULL)) EXECUTE FUNCTION protocols_purge_children();
CREATE TRIGGER protocols_still_going_forward BEFORE INSERT OR UPDATE ON public.protocols FOR EACH ROW EXECUTE FUNCTION protocols_still_going_forward();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.protocols FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');
CREATE TRIGGER calc_snapshots_set_updated_at BEFORE UPDATE ON public.calc_snapshots FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER dt_device_guard BEFORE INSERT OR DELETE OR UPDATE ON public.calc_snapshots FOR EACH STATEMENT EXECUTE FUNCTION dt_device_guard();
CREATE TRIGGER dt_device_guard BEFORE INSERT OR DELETE OR UPDATE ON public.reality_checks FOR EACH STATEMENT EXECUTE FUNCTION dt_device_guard();
CREATE TRIGGER dt_device_guard BEFORE INSERT OR DELETE OR UPDATE ON public.reality_check_open FOR EACH STATEMENT EXECUTE FUNCTION dt_device_guard();
CREATE TRIGGER reality_check_open_keep_stop BEFORE UPDATE ON public.reality_check_open FOR EACH ROW EXECUTE FUNCTION reality_check_open_keep_stop();
CREATE TRIGGER reality_check_open_set_updated_at BEFORE UPDATE ON public.reality_check_open FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER calc_inputs_set_updated_at BEFORE UPDATE ON public.calc_inputs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER dt_device_guard BEFORE INSERT OR DELETE OR UPDATE ON public.calc_inputs FOR EACH STATEMENT EXECUTE FUNCTION dt_device_guard();
CREATE TRIGGER dt_device_guard BEFORE INSERT OR DELETE OR UPDATE ON public.push_tokens FOR EACH STATEMENT EXECUTE FUNCTION dt_device_guard();
CREATE TRIGGER dt_device_guard BEFORE INSERT OR DELETE OR UPDATE ON public.lab_prefs FOR EACH STATEMENT EXECUTE FUNCTION dt_device_guard();
CREATE TRIGGER lab_prefs_set_updated_at BEFORE UPDATE ON public.lab_prefs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Grants as in production (relacl) ────────────────────────────────────────
do $$ declare t text; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('alter table public.%I owner to postgres', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
  end loop; end $$;
grant all on public.analytics_events, public.biomarkers, public.calc_inputs, public.calc_snapshots, public.calc_targets,
  public.dose_logs, public.food_logs, public.lab_prefs, public.profiles, public.protocols, public.push_tokens,
  public.reality_check_open, public.reality_checks, public.referral_codes, public.referrals, public.reminders,
  public.vaccines, public.vials to anon, authenticated, service_role;
grant all on public.account_devices, public.user_devices, public.device_policy to service_role;
grant select on public.admin_devices to service_role;
grant select on public.team_messages to authenticated, service_role;
grant select on public.app_releases to anon, authenticated, service_role;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname not in ('moddatetime') loop
    execute format('alter function %s owner to postgres', f.sig);
  end loop; end $$;
revoke all on function public.dt_pre_request() from public;
grant execute on function public.dt_pre_request() to anon, authenticated, service_role;
revoke all on function public.dt_header(text), public.dt_version_below(text, text), public.dt_require_active_device(boolean), public.dt_device_guard() from public, anon, authenticated;
revoke all on function public.device_status(text) from public, anon;
grant execute on function public.device_status(text) to authenticated;

-- The one device-policy row (values are the rig's own: every virtual user sends a device id, so the
-- legacy branch is never taken and the values do not change the path measured).
insert into public.device_policy (id, min_app_version, legacy_until) values (true, null, now() - interval '1 day');

-- PostgREST settings exactly as production's role config.
alter role anon set statement_timeout = '3s';
alter role authenticated set statement_timeout = '8s';
alter role authenticator set statement_timeout = '8s';
alter role authenticator set lock_timeout = '8s';
alter role authenticator set session_preload_libraries = 'safeupdate';
alter role authenticator set pgrst.db_pre_request = 'public.dt_pre_request';
alter role authenticator with password 'authpass';
