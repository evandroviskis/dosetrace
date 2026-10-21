-- A-156 (part of A-127, 1.3.2): the app language on the push token row, so every server push
-- (send-reminders, version-notice) is written in the person's language. The app keeps the language on
-- the phone only; user_metadata never has it (0 of 134 production accounts on 2026-10-20).
--
-- NOT APPLIED. Apply only with the founder's "pode aplicar". Independent of every other migration (it
-- only adds one nullable column): it can go before or after 20261022000000_app_releases.sql.
-- Without it: the app's upsert retries without the column (lib/notifications registerPushToken), and
-- both senders read the tokens again without it on 42703 / PGRST204 and write in English
-- (supabase/functions/_shared/pushLanguage.js selectWithOptionalLanguage).
--
-- ROLLBACK: alter table public.push_tokens drop column if exists language;
--   (or leave it: nullable, unused by older builds.)

alter table public.push_tokens add column if not exists language text check (language is null or language in ('en', 'es', 'pt', 'fr', 'de', 'it'));
