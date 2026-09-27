-- parse-food v9 (food-log spec FL-21/FL-22): tell parse calls from follow-up answers
-- so follow-ups don't count toward the daily parse limit; limits count the user's
-- local day via entry_date. Additive: existing rows are parses.
alter table public.ai_food_usage add column if not exists kind text not null default 'parse';
create index if not exists ai_food_usage_user_day_kind on public.ai_food_usage (user_id, entry_date, kind);
