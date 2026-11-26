-- Estado de partida da conta de gravação evandro1985+qa3 (vídeos "Como fazer", dia 1: vídeos 7, 1, 8, 9, 10).
-- Roteiro: Second Brain/dosetrace/reels-videos/como-fazer/roteiros/01-dados-qa3.md. Founder 2026-11-26:
-- "pode seguir com o script"; any test account may be changed server-side (never hello@dosetrace.io).
--
-- How to run: through the Supabase SQL tool, after replacing the two values in the first lines of the block
-- (__TZ__ = the phone's time zone, __LANG__ = the round's language, __D1__ = vazio | concluida). Every date is counted from the moment it
-- runs (D0 = today in that zone), so it can run again between rounds, any day.
--
-- What it does, in the app's own shapes (checked against rows the app wrote, 2026-11-26):
--   1. removes what a round left: protocols get the "Apagar de vez" tombstone (active=false, deleted_at,
--      purged_at) so phones drop them; their doses and vials are deleted (the app's purge does the same in the
--      cloud). A row is NEVER hard-deleted from protocols: a phone would treat it as absent and send it back.
--   2. profile: name "Teste", sex male, app language = the round's.
--   3. Composto 1: lyophilized 10 mg + 2 ml, 1,4 mg, 1 ml syringe, daily 23:00, started D-3, vial mixed D-3
--      (7 doses, 1 used); doses: D-3 23:00 Missed (as the scan writes it), D-2 23:00 Taken; D-1 left empty
--      ("Pendente de ontem" until D0 11:00 on the phone's clock).
--   4. Composto 2: same vial, every 4 days 09:00, started D-25, vial mixed D-25 (7 of 7 used, still active);
--      7 Taken doses D-25 … D-1 at 09:00.
-- created_at is set in the past (the app never offers a slot from before the protocol existed, and the phone's
-- schedule ledger starts at the creation); updated_at = now so the phone pulls the rows.
-- Food log, exams, vaccines: not touched here (day 2 handles them; see the roteiro).

DO $$
DECLARE
  tz   text := '__TZ__';     -- e.g. America/New_York
  lang text := '__LANG__';   -- pt | en | es | fr | de | it
  d1   text := '__D1__';     -- 'vazio' (video 7: Pendente de ontem) | 'concluida' (the state after video 7, for 1, 8, 9, 10 in the afternoon)
  uid  uuid := 'a6929b55-468e-4b73-b801-204b6fa31f2e';
  d0   date;
  p1   uuid := gen_random_uuid();
  p2   uuid := gen_random_uuid();
  k    int;
BEGIN
  IF lang NOT IN ('pt','en','es','fr','de','it') THEN RAISE EXCEPTION 'language %', lang; END IF;
  IF (SELECT email FROM auth.users WHERE id = uid) <> 'evandro1985+qa3@gmail.com' THEN RAISE EXCEPTION 'not +qa3'; END IF;
  d0 := (now() AT TIME ZONE tz)::date;

  -- 1. what a previous round left
  DELETE FROM public.dose_logs WHERE user_id = uid;
  DELETE FROM public.vials WHERE user_id = uid;
  UPDATE public.protocols
     SET active = false, deleted_at = coalesce(deleted_at, now()), purged_at = coalesce(purged_at, now()), updated_at = now()
   WHERE user_id = uid AND purged_at IS NULL;

  -- 2. profile
  UPDATE auth.users
     SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object('display_name', 'Teste', 'gender', 'male', 'language', lang)
   WHERE id = uid;

  -- 3. Composto 1
  INSERT INTO public.protocols (id, user_id, name, type, color, unit, amount, water, dose, dose_unit, syringe_size,
      concentration_unit, frequency, reminder_time, active, created_at, updated_at, interval_days, doses_per_day,
      start_date, vial_valid_days, units_taken)
  VALUES (p1, uid, 'Composto 1', 'recon', '#387BC4', 'mg', 10, 2, 1.4, 'mg', 100,
      'mg', 'Daily', '23:00', true, ((d0 - 3) + time '10:00') AT TIME ZONE tz, now(), 1, 1,
      d0 - 3, 30, 0);
  INSERT INTO public.vials (id, user_id, protocol_id, mixed_on, water_ml, total_doses, doses_taken, expiry_alert_days, active, created_at, updated_at)
  VALUES (gen_random_uuid(), uid, p1, d0 - 3, 2, 7, 1, 5, true, ((d0 - 3) + time '10:00') AT TIME ZONE tz, now());
  INSERT INTO public.dose_logs (id, user_id, protocol_id, logged_at, outcome, dose_edited, checkin_completed, created_at, updated_at)
  VALUES (gen_random_uuid(), uid, p1, ((d0 - 3) + time '23:00') AT TIME ZONE tz, 'Missed', 0, false, now(), now());
  INSERT INTO public.dose_logs (id, user_id, protocol_id, logged_at, outcome, dose_amount, dose_unit, outcome_by_person, checkin_completed, created_at, updated_at)
  VALUES (gen_random_uuid(), uid, p1, ((d0 - 2) + time '23:00') AT TIME ZONE tz, 'Taken', 1.4, 'mg', true, false, now(), now());
  IF d1 = 'concluida' THEN
    INSERT INTO public.dose_logs (id, user_id, protocol_id, logged_at, outcome, dose_amount, dose_unit, outcome_by_person, checkin_completed, created_at, updated_at)
    VALUES (gen_random_uuid(), uid, p1, ((d0 - 1) + time '23:00') AT TIME ZONE tz, 'Taken', 1.4, 'mg', true, false, now(), now());
    UPDATE public.vials SET doses_taken = 2 WHERE protocol_id = p1;
  ELSIF d1 <> 'vazio' THEN RAISE EXCEPTION 'd1 %', d1; END IF;

  -- 4. Composto 2
  INSERT INTO public.protocols (id, user_id, name, type, color, unit, amount, water, dose, dose_unit, syringe_size,
      concentration_unit, frequency, reminder_time, active, created_at, updated_at, interval_days, doses_per_day,
      start_date, vial_valid_days, units_taken)
  VALUES (p2, uid, 'Composto 2', 'recon', '#098964', 'mg', 10, 2, 1.4, 'mg', 100,
      'mg', 'Every 4 days', '09:00', true, ((d0 - 25) + time '08:00') AT TIME ZONE tz, now(), 4, 1,
      d0 - 25, 30, 0);
  INSERT INTO public.vials (id, user_id, protocol_id, mixed_on, water_ml, total_doses, doses_taken, expiry_alert_days, active, created_at, updated_at)
  VALUES (gen_random_uuid(), uid, p2, d0 - 25, 2, 7, 7, 5, true, ((d0 - 25) + time '08:00') AT TIME ZONE tz, now());
  FOR k IN 0..6 LOOP
    INSERT INTO public.dose_logs (id, user_id, protocol_id, logged_at, outcome, dose_amount, dose_unit, outcome_by_person, checkin_completed, created_at, updated_at)
    VALUES (gen_random_uuid(), uid, p2, ((d0 - 25 + 4 * k) + time '09:00') AT TIME ZONE tz, 'Taken', 1.4, 'mg', true, false, now(), now());
  END LOOP;
END $$;

-- Check (run after): what the phone should show.
SELECT p.name, p.start_date, p.reminder_time, p.interval_days,
       (SELECT total_doses - doses_taken FROM public.vials v WHERE v.protocol_id = p.id AND v.active) AS doses_left,
       (SELECT string_agg(to_char(d.logged_at AT TIME ZONE '__TZ__', 'MM-DD HH24:MI') || ' ' || d.outcome, ', ' ORDER BY d.logged_at)
          FROM public.dose_logs d WHERE d.protocol_id = p.id) AS doses
  FROM public.protocols p
 WHERE p.user_id = 'a6929b55-468e-4b73-b801-204b6fa31f2e' AND p.purged_at IS NULL
 ORDER BY p.name;
