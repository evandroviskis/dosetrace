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
-- Food log: ONE D-2 meal in the round's language, always the same row (id = md5 of the user id), upserted so
-- the phone pulls it; no other row of the account is touched (the app's free_start marker stays). Never delete food_logs rows here: food_logs has no tombstone, so a server delete never
-- reaches the phone (S25 2026-11-26: every remount added one more local copy; cleaned in the app). A meal a
-- take logged on the phone is removed in the app (Corrigir este registro > Remover registro).
-- Exams, vaccines: not touched here (an exam a take imported is removed in the app: Excluir este exame).

DO $$
DECLARE
  tz   text := '__TZ__';     -- e.g. America/New_York
  lang text := '__LANG__';   -- pt | en | es | fr | de | it
  d1   text := '__D1__';     -- 'vazio' (video 7: Pendente de ontem) | 'concluida' (the state after video 7, for 1, 8, 9, 10 in the afternoon)
  v_email text := '__EMAIL__'; -- the recording account of this device (founder 2026-11-26: one test account per device so devices record in parallel)
  uid  uuid;
  d0   date;
  p1   uuid := gen_random_uuid();
  p2   uuid := gen_random_uuid();
  k    int;
  meal text; f1 text; u1 text; f2 text; mid uuid;
  nm   text; -- protocol name per language (Ads 2026-11-26; fr "Produit": adb cannot type "é")
BEGIN
  IF lang NOT IN ('pt','en','es','fr','de','it') THEN RAISE EXCEPTION 'language %', lang; END IF;
  IF v_email NOT IN ('evandro1985+qa3@gmail.com', 'evandro1985+qa@gmail.com', 'dosetrace.io+s25@gmail.com', 'evandro1985+qa2@gmail.com', 'evandro1985+qa4@gmail.com') THEN RAISE EXCEPTION 'not a recording test account: %', v_email; END IF;
  SELECT id INTO uid FROM auth.users WHERE auth.users.email = v_email;
  IF uid IS NULL THEN RAISE EXCEPTION 'no account %', v_email; END IF;
  d0 := (now() AT TIME ZONE tz)::date;
  nm := CASE lang WHEN 'pt' THEN 'Composto' WHEN 'en' THEN 'Compound' WHEN 'es' THEN 'Compuesto' WHEN 'fr' THEN 'Produit' WHEN 'de' THEN 'Wirkstoff' ELSE 'Composto' END;
  SELECT x.meal, x.f1, x.u1, x.f2 INTO meal, f1, u1, f2 FROM (VALUES
    ('pt','iogurte natural e 1 banana','iogurte natural','pote','banana'),
    ('en','plain yogurt and 1 banana','plain yogurt','cup','banana'),
    ('es','yogur natural y 1 banana','yogur natural',null,'banana'),
    ('fr','yaourt nature et 1 banane','yaourt nature','pot','banane'),
    ('de','Naturjoghurt und 1 Banane','Naturjoghurt','Becher','Banane'),
    ('it','yogurt bianco e 1 banana','yogurt bianco','vasetto','banana')) AS x(l, meal, f1, u1, f2) WHERE x.l = lang;

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
  VALUES (p1, uid, nm || ' 1', 'recon', '#387BC4', 'mg', 10, 2, 1.4, 'mg', 100,
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
  VALUES (p2, uid, nm || ' 2', 'recon', '#098964', 'mg', 10, 2, 1.4, 'mg', 100,
      'mg', 'Every 4 days', '09:00', true, ((d0 - 25) + time '08:00') AT TIME ZONE tz, now(), 4, 1,
      d0 - 25, 30, 0);
  INSERT INTO public.vials (id, user_id, protocol_id, mixed_on, water_ml, total_doses, doses_taken, expiry_alert_days, active, created_at, updated_at)
  VALUES (gen_random_uuid(), uid, p2, d0 - 25, 2, 7, 7, 5, true, ((d0 - 25) + time '08:00') AT TIME ZONE tz, now());
  FOR k IN 0..6 LOOP
    INSERT INTO public.dose_logs (id, user_id, protocol_id, logged_at, outcome, dose_amount, dose_unit, outcome_by_person, checkin_completed, created_at, updated_at)
    VALUES (gen_random_uuid(), uid, p2, ((d0 - 25 + 4 * k) + time '09:00') AT TIME ZONE tz, 'Taken', 1.4, 'mg', true, false, now(), now());
  END LOOP;

  -- 5. the D-2 meal (same row every round, updated so the phone pulls it)
  -- Only the fixed-id row: an UPDATE by user_id alone also rewrote the app's free_start marker row.
  mid := md5(uid::text || '-d2meal')::uuid;
  INSERT INTO public.food_logs (id, user_id, entry_date, raw_text, parsed_items, kcal, protein_g, carb_g, fat_g, source, parse_status, created_at, updated_at)
  VALUES (mid, uid, to_char(d0 - 2, 'YYYY-MM-DD'), meal,
    jsonb_build_array(
      jsonb_build_object('qty',1,'unit',u1,'food',f1,'kcal',100,'protein_g',6,'carb_g',8,'fat_g',5,'fiber_g',0,'category','breakfast','days_ago',null,'confidence','med'),
      jsonb_build_object('qty',1,'unit',null,'food',f2,'kcal',105,'protein_g',1.3,'carb_g',27,'fat_g',0.4,'fiber_g',3.1,'category','breakfast','days_ago',null,'confidence','med')),
    205, 7, 35, 5, 'ai', 'done', ((d0 - 2) + time '08:00') AT TIME ZONE tz, now())
  ON CONFLICT (id) DO UPDATE SET entry_date = EXCLUDED.entry_date, raw_text = EXCLUDED.raw_text, parsed_items = EXCLUDED.parsed_items, updated_at = now();
END $$;

-- Check (run after): what the phone should show.
SELECT p.name, p.start_date, p.reminder_time, p.interval_days,
       (SELECT total_doses - doses_taken FROM public.vials v WHERE v.protocol_id = p.id AND v.active) AS doses_left,
       (SELECT string_agg(to_char(d.logged_at AT TIME ZONE '__TZ__', 'MM-DD HH24:MI') || ' ' || d.outcome, ', ' ORDER BY d.logged_at)
          FROM public.dose_logs d WHERE d.protocol_id = p.id) AS doses
  FROM public.protocols p JOIN auth.users u ON u.id = p.user_id
 WHERE u.email = '__EMAIL__' AND p.purged_at IS NULL
 ORDER BY p.name;
