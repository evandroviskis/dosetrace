-- Council 2026-10-27 (backend): dt_stamp_dose needs no elevated rights — it reads the protocol of the same
-- user_id the row carries, and dose_logs RLS ("Users can manage own logs": auth.uid() = user_id, also the
-- check on writes) already limits that to the signed-in user. SECURITY INVOKER = least privilege; the
-- protocols RLS then applies to the read too. Same body; nothing else changes.
alter function public.dt_stamp_dose() security invoker;
