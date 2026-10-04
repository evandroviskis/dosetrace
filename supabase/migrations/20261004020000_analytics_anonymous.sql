-- Founder 2026-10-04 ("4 anônima"): usage analytics are truly anonymous. 1.3.0 apps insert rows
-- with user_id NULL and no health fields (lib/analyticsEvent). Older apps keep inserting their own
-- user_id under the existing policy until they update.
create policy "Signed-in apps insert anonymous events" on public.analytics_events
  for insert to authenticated with check (user_id is null);
