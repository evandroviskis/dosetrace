'use strict';
// Food reminders at the person's meal times (docs/specs/meal-reminders.md; picture
// docs/design/food-goals-progress.html part 4; founder 2026-11-17 21:13 and 2026-11-18 20:40 EST
// "Pode construir o resto").
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../lib/mealReminders');
const plan = require('../lib/notificationPlan');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const T = require('../i18n/translations.js');
const tr = T.translations || T.default || T;
const LANGS = ['en', 'pt', 'es', 'fr', 'de', 'it'];
const tFor = (l) => (k) => (tr[l] && tr[l][k]) || tr.en[k] || k;

const at = (dayKey, hm) => { const [y, mo, d] = dayKey.split('-').map(Number); const [h, mi] = hm.split(':').map(Number); return new Date(y, mo - 1, d, h, mi).getTime(); };
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const entry = (day, hm, kcal, protein, extra = {}) => ({ entry_date: day, created_at: new Date(at(day, hm)).toISOString(), kcal, protein_g: protein, carb_g: 0, source: 'ai', ...extra });

test('MR-1: four choices with the design times; Choose the times keeps up to 8, in clock order', () => {
  assert.deepEqual(M.MEAL_PLANS, ['three', 'five', 'every3h', 'custom']);
  assert.deepEqual(M.presetMeals('three'), [{ at: '07:30', kind: 'breakfast' }, { at: '12:30', kind: 'lunch' }, { at: '19:30', kind: 'dinner' }]);
  assert.deepEqual(M.presetMeals('five').map((m) => m.at), ['07:30', '10:00', '12:30', '16:00', '19:30']);
  assert.deepEqual(M.presetMeals('five').map((m) => m.kind), ['breakfast', 'snack', 'lunch', 'snack', 'dinner']);
  assert.deepEqual(M.presetMeals('every3h').map((m) => m.at), ['07:00', '10:00', '13:00', '16:00', '19:00', '22:00']);
  // A preset always reads as its preset (a stale stored list never overrides it).
  assert.deepEqual(M.normalizeMeals({ plan: 'three', meals: [{ at: '05:00' }] }).meals.map((m) => m.at), ['07:30', '12:30', '19:30']);
  const c = M.normalizeMeals({ plan: 'custom', meals: [{ at: '18:00', kind: 'dinner' }, { at: '06:15', kind: 'breakfast' }, { at: '18:00', kind: 'meal' }, { at: '25:00' }, { at: 'x' }, { at: '11:00', kind: 'weird' }] });
  assert.deepEqual(c.meals, [{ at: '06:15', kind: 'breakfast' }, { at: '11:00', kind: 'meal' }, { at: '18:00', kind: 'dinner' }]);
  const many = Array.from({ length: 12 }, (_, i) => ({ at: `${String(6 + i).padStart(2, '0')}:00` }));
  assert.equal(M.normalizeMeals({ plan: 'custom', meals: many }).meals.length, M.MAX_MEALS);
  assert.equal(M.MAX_MEALS, 8);
  // Nothing chosen / unreadable → null (the 20:00 question stays).
  for (const bad of [null, undefined, {}, { plan: 'x' }, { plan: 'custom', meals: [] }, 'three']) assert.equal(M.normalizeMeals(bad), null);
  // "+ Add a meal": 3 hours after the latest, never past 22:00, never a time already there.
  assert.equal(M.nextMealTime(M.presetMeals('three')), '22:00');
  assert.equal(M.nextMealTime([{ at: '07:30' }]), '10:30');
  assert.equal(M.nextMealTime([{ at: '07:30' }, { at: '22:00' }]), '06:00');
});

test('MR-2: the choice is written as ONE top-level account key (the metadata merge keeps every other key)', () => {
  const p = M.mealChoicePayload('five', null, '2026-11-18T12:00:00.000Z');
  assert.deepEqual(Object.keys(p), ['food_meals']);
  assert.equal(p.food_meals.plan, 'five');
  assert.equal(p.food_meals.meals.length, 5);
  assert.equal(M.mealChoicePayload('custom', []), null, 'an empty custom list is never written');
  // Every writer goes through supabase.auth.updateUser({ data: payload }) with that payload only.
  const sheet = read('screens/components/MealTimesSheet.js');
  assert.match(sheet, /mealChoicePayload\(/);
  assert.match(sheet, /supabase\.auth\.updateUser\(\{ data: payload \}\)/);
  assert.ok(!/AsyncStorage/.test(sheet), 'not kept on the phone alone');
  // A failed save keeps the sheet open and says so (the DoseTrace error sheet).
  assert.match(sheet, /if \(error\) \{[^}]*setErr\(/);
});

test('MR-3: the sheet opens right after a Reality check starts, only when nothing was chosen; Not now writes nothing', () => {
  const calc = read('screens/components/CalculatorSection.js');
  const i = calc.indexOf('async function beginRealityCheck(');
  const begin = calc.slice(i, calc.indexOf('async function resetRealityCheck', i));
  assert.match(begin, /askMealsAfterStart\(\)/);
  assert.match(calc, /<MealTimesSheet visible=\{mealsOpen\}/);
  const sheet = read('screens/components/MealTimesSheet.js');
  assert.match(sheet, /export function shouldAskMeals\(meta\)/);
  const { shouldAskMeals } = loadSheetHelpers();
  assert.equal(shouldAskMeals({}), true);
  assert.equal(shouldAskMeals({ food_meals: { plan: 'three' } }), false);
  assert.equal(shouldAskMeals({ food_reminders: false }), false, 'reminders off: nothing to set');
  // "Not now" only closes.
  assert.match(sheet, /t\('meal_not_now'\)/);
  assert.match(sheet, /onPress=\{onClose\}[^>]*>\s*<Text style=\{s\.linkText\}>\{t\('meal_not_now'\)\}/);
});

// The sheet's pure helper, read without React Native.
function loadSheetHelpers() {
  const src = read('screens/components/MealTimesSheet.js');
  const m = src.match(/export function shouldAskMeals\(meta\) \{[\s\S]*?\n\}/);
  // eslint-disable-next-line no-new-func
  const fn = new Function('normalizeMeals', `${m[0].replace('export ', '')}; return shouldAskMeals;`)(M.normalizeMeals);
  return { shouldAskMeals: fn };
}

test('MR-4: the choice can be changed where food reminders are set (Reality check card row and Settings)', () => {
  const nl = read('screens/components/NutritionLogger.js');
  assert.match(nl, /<MealTimesRow /);
  const st = read('screens/SettingsScreen.js');
  assert.match(st, /<MealTimesRow /);
  const sheet = read('screens/components/MealTimesSheet.js');
  assert.match(sheet, /export function MealTimesRow\(/);
  // The row opens the sheet on the saved choice.
  assert.match(sheet, /normalizeMeals\(user\?\.user_metadata\?\.food_meals\)/);
  // The Settings / card subtitle says when the reminders come.
  assert.match(nl, /settings_food_reminders_sub_meals/);
  assert.match(st, /settings_food_reminders_sub_meals/);
});

test('MR-5: each reminder comes 1 hour after its meal; a meal at 23:00 or later stays on its own day (23:59)', () => {
  assert.equal(M.MEAL_DELAY_MIN, 60);
  const day = '2026-11-18';
  const now = at(day, '05:00');
  const days = ['2026-11-18'];
  let p = M.mealReminderPlan({ meals: M.presetMeals('three'), days, todayKey: day, nowMs: now });
  assert.deepEqual(p.map((x) => hhmm(x.fireMs)), ['08:30', '13:30', '20:30']);
  p = M.mealReminderPlan({ meals: M.presetMeals('every3h'), days, todayKey: day, nowMs: now });
  assert.deepEqual(p.map((x) => hhmm(x.fireMs)), ['08:00', '11:00', '14:00', '17:00', '20:00', '23:00']);
  p = M.mealReminderPlan({ meals: [{ at: '23:15' }], days, todayKey: day, nowMs: now });
  assert.deepEqual(p.map((x) => hhmm(x.fireMs)), ['23:59']);
  assert.ok(p.every((x) => new Date(x.fireMs).getDate() === 18));
  // Past reminders are never scheduled.
  p = M.mealReminderPlan({ meals: M.presetMeals('three'), days, todayKey: day, nowMs: at(day, '14:00') });
  assert.deepEqual(p.map((x) => hhmm(x.fireMs)), ['20:30']);
});

test('MR-6: a meal reminder does not go out when food was logged for the day since halfway from the previous meal', () => {
  const day = '2026-11-18';
  const meals = M.presetMeals('three'); // 07:30 · 12:30 · 19:30 → windows from 01:30 · 10:00 · 16:00
  assert.deepEqual([0, 1, 2].map((i) => M.mealWindowStartMin(meals, i)), [90, 600, 960]);
  const plan3 = (entries, nowHm = '06:00') => M.mealReminderPlan({ meals, days: [day, '2026-11-19'], todayKey: day, nowMs: at(day, nowHm), entries, horizonMs: Infinity })
    .filter((x) => x.dayKey === day).map((x) => x.meal.kind);
  assert.deepEqual(plan3([]), ['breakfast', 'lunch', 'dinner']);
  // Breakfast logged at 07:10 → no breakfast reminder; lunch and dinner still come.
  assert.deepEqual(plan3([entry(day, '07:10', 400, 30)]), ['lunch', 'dinner']);
  // Breakfast logged late, at 08:45 (after its own reminder): lunch is NOT silenced.
  assert.deepEqual(plan3([entry(day, '08:45', 400, 30)], '09:00'), ['lunch', 'dinner']);
  // Lunch logged at 12:50 → no 13:30 reminder.
  assert.deepEqual(plan3([entry(day, '12:50', 650, 45)], '13:00'), ['dinner']);
  // A catch-up typed today for yesterday, and a marker, never count.
  assert.deepEqual(plan3([entry('2026-11-17', '12:00', 600, 40), { entry_date: day, created_at: new Date(at(day, '12:00')).toISOString(), source: 'day_closed' }], '11:00'), ['lunch', 'dinner']);
  // Only today is judged: tomorrow's reminders are all there.
  const tomorrow = M.mealReminderPlan({ meals, days: [day, '2026-11-19'], todayKey: day, nowMs: at(day, '13:00'), entries: [entry(day, '12:50', 650, 45)] }).filter((x) => x.dayKey === '2026-11-19');
  assert.equal(tomorrow.length, 3);
});

test('MR-7: the day\'s last meal takes the 20:00 id and buttons; the others add Skip this meal', () => {
  const day = '2026-11-18';
  const p = M.mealReminderPlan({ meals: M.presetMeals('three'), days: [day], todayKey: day, nowMs: at(day, '05:00') });
  assert.deepEqual(p.map((x) => x.id), ['food-log-2026-11-18-0730', 'food-log-2026-11-18-1230', 'food-log-2026-11-18']);
  assert.deepEqual(p.map((x) => x.last), [false, false, true]);
  const t = tFor('en');
  assert.equal(M.mealReminderContent({ t, item: p[0] }).category, 'food-meal');
  assert.equal(M.mealReminderContent({ t, item: p[2] }).category, 'food-evening');
  // The ids stay food reminders everywhere (day lookup, Settings switch, the cap).
  assert.equal(plan.foodReminderDay('food-log-2026-11-18-1230', {}), '2026-11-18');
  assert.equal(plan.snoozeKindOff({ id: 'food-log-2026-11-18-1230' }, { food_reminders: false }), true);
  // Categories: food-meal = Log · Skip this meal · Nothing else today; food-evening unchanged.
  const n = read('lib/notifications.js');
  assert.match(n, /setNotificationCategoryAsync\('food-meal', \[FOOD_LOG, FOOD_SKIP, FOOD_DONE\]\)/);
  assert.match(n, /setNotificationCategoryAsync\('food-evening', \[FOOD_LOG, FOOD_DONE\]\)/);
  // With a choice there is no 20:00 question: the meal plan replaces it; without one, the 20:00 path is untouched.
  const i = n.indexOf('export async function syncFoodLogReminder(');
  const fn = n.slice(i, n.indexOf('// Close a local day', i));
  assert.match(fn, /const choice = normalizeMeals\(user\.user_metadata\?\.food_meals\)/);
  assert.match(fn, /if \(choice\) \{/);
  assert.match(fn, /fire\.setHours\(FOOD_HOUR, FOOD_MIN, 0, 0\)/);
  assert.match(n, /const FOOD_HOUR = 20;/);
});

test('MR-8: Nothing more today closes the day (every remaining reminder goes); Skip this meal writes nothing and opens nothing', () => {
  // A closed day gets nothing: the days come from foodNudgeDays, which leaves closed days out.
  const days = plan.foodNudgeDays('2026-11-10', '2026-11-18', new Set(['2026-11-18']), 2);
  const p = M.mealReminderPlan({ meals: M.presetMeals('five'), days, todayKey: '2026-11-18', nowMs: at('2026-11-18', '09:00') });
  assert.ok(p.every((x) => x.dayKey === '2026-11-19'));
  // The resync cancels every food-log id no longer wanted, the per-meal ones included.
  const n = read('lib/notifications.js');
  assert.match(n, /cancelUnwanted\(N, \(id\) => id === 'food-log-daily' \|\| id\.startsWith\('food-log-'\), wanted\)/);
  // Skip: no navigation, nothing written, Android banner cleared like the other buttons.
  const a = read('lib/notificationActions.js');
  assert.match(a, /'FOOD_MEAL_SKIP'/);
  assert.match(a, /else if \(r\.action === 'FOOD_MEAL_SKIP'\) \{ \/\* nothing to write/);
  const resp = (action) => ({ actionIdentifier: action, notification: { request: { identifier: 'food-log-2026-11-18-1230', content: { data: { type: 'food_log', dayKey: '2026-11-18', meal: { at: '12:30', kind: 'lunch' } } } } } });
  assert.equal(plan.notifTapTarget(resp('FOOD_MEAL_SKIP'), Date.now()), null);
  assert.equal(plan.notifTapTarget(resp('FOOD_DAY_DONE'), Date.now()), null);
});

test('MR-9: the text carries the day so far, numbers only — with the plan, without it, and none when nothing is logged', () => {
  const day = '2026-11-18';
  const items = M.mealReminderPlan({ meals: M.presetMeals('three'), days: [day], todayKey: day, nowMs: at(day, '05:00') });
  const entries = [entry(day, '08:00', 300, 20), entry(day, '12:40', 350, 25), { entry_date: day, source: 'day_closed', kcal: null }, entry('2026-11-17', '12:00', 900, 60)];
  const totals = M.mealDayTotals(entries, day);
  assert.deepEqual(totals, { kcal: 650, protein_g: 45, carb_g: 0 });
  const pt = M.mealReminderContent({ t: tFor('pt'), language: 'pt', item: items[1], totals, plan: { kcal: 2200, proteinG: 180 } });
  assert.equal(pt.title, 'Já almoçou?');
  assert.equal(pt.body, 'Registre o almoço e o que comeu desde o café. Hoje até agora: proteína 45 de 180 g · calorias 650 de 2.200.');
  const en = M.mealReminderContent({ t: tFor('en'), language: 'en', item: items[2], totals: { kcal: 1650, protein_g: 120 }, plan: { kcal: 2200, proteinG: 180 } });
  assert.equal(en.title, 'Had dinner?');
  assert.equal(en.body, 'Log your dinner. Today so far: protein 120 of 180 g · calories 1,650 of 2,200.');
  // No plan: the totals alone.
  const noPlan = M.mealReminderContent({ t: tFor('en'), language: 'en', item: items[2], totals: { kcal: 650, protein_g: 45 }, plan: null });
  assert.equal(noPlan.body, 'Log your dinner. Today so far: protein 45 g · calories 650.');
  // Nothing logged: no zeros.
  assert.equal(M.mealReminderContent({ t: tFor('en'), language: 'en', item: items[0], totals: { kcal: 0, protein_g: 0 }, plan: { kcal: 2200, proteinG: 180 } }).body, 'Log your breakfast.');
  // A meal without a name: "Meal at 16:00" / "Refeição das 16:00".
  const snack = M.mealReminderPlan({ meals: M.presetMeals('five'), days: [day], todayKey: day, nowMs: at(day, '05:00') })[3];
  assert.equal(M.mealReminderContent({ t: tFor('pt'), language: 'pt', item: snack }).title, 'Refeição das 16:00');
  assert.equal(M.mealReminderContent({ t: tFor('pt'), language: 'pt', item: snack }).body, 'Registre o que comeu.');
  assert.equal(M.mealReminderContent({ t: tFor('en'), language: 'en', item: snack, timeFormat: '24h' }).title, 'Meal at 16:00');
});

const JUDGE = {
  en: [/\beat more\b/i, /\beat less\b/i, /\btoo (much|little|many|few)\b/i, /\bgreat\b/i, /\bwell done\b/i, /\bgood job\b/i, /\bbehind\b/i, /\bshould\b/i, /\btry\b/i],
  pt: [/coma mais/i, /coma menos/i, /\bdemais\b/i, /muito bem/i, /parabéns/i, /\bdeveria\b/i, /\btente\b/i, /atrasad/i],
  es: [/come más/i, /come menos/i, /demasiad/i, /muy bien/i, /\bdeberías\b/i, /\bintenta\b/i],
  fr: [/mangez plus/i, /mangez moins/i, /\btrop\b/i, /bravo/i, /\bdevriez\b/i, /\bessayez\b/i],
  de: [/iss mehr/i, /iss weniger/i, /\bzu viel\b/i, /\bzu wenig\b/i, /gut gemacht/i, /\bsolltest\b/i, /\bversuch/i],
  it: [/mangia di più/i, /mangia meno/i, /\btroppo\b/i, /\bbravo\b/i, /\bdovresti\b/i, /\bprova\b/i],
};
const MEAL_KEYS = [
  'meal_sheet_title', 'meal_sheet_sub', 'meal_plan_three', 'meal_plan_five', 'meal_plan_every3h', 'meal_plan_custom',
  'meal_count', 'meal_count_one', 'meal_kind_breakfast', 'meal_kind_lunch', 'meal_kind_dinner', 'meal_kind_snack', 'meal_kind_meal',
  'meal_add', 'meal_remove', 'meal_continue', 'meal_not_now', 'meal_row_none',
  'settings_food_reminders_sub_meals',
  'notif_meal_title_breakfast', 'notif_meal_title_lunch', 'notif_meal_title_dinner', 'notif_meal_title_at',
  'notif_meal_body_breakfast', 'notif_meal_body_lunch', 'notif_meal_body_lunch_since', 'notif_meal_body_dinner', 'notif_meal_body_any',
  'notif_meal_so_far', 'notif_meal_protein_of', 'notif_meal_protein', 'notif_meal_kcal_of', 'notif_meal_kcal', 'notif_meal_action_skip',
  'nutri_meal_ask_breakfast', 'nutri_meal_ask_lunch', 'nutri_meal_ask_dinner', 'nutri_meal_ask_at',
];

test('MR-15: every new string in the 6 languages, same placeholders, no judgement words, no emoji', () => {
  for (const l of LANGS) {
    for (const k of MEAL_KEYS) {
      assert.equal(typeof tr[l][k], 'string', `${l}.${k}`);
      const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
      assert.equal(ph(tr[l][k]), ph(tr.en[k]), `${l}.${k} placeholders`);
      assert.ok(!/\p{Extended_Pictographic}/u.test(tr[l][k]), `${l}.${k} emoji`);
      if (/^notif_meal|^nutri_meal|^meal_sheet_sub/.test(k)) for (const re of JUDGE[l]) assert.ok(!re.test(tr[l][k]), `${l}.${k} judges: ${re}`);
    }
  }
  // pt is formal (never "dá para", "a gente").
  for (const k of MEAL_KEYS) assert.ok(!/dá para|a gente|\bpra\b/i.test(tr.pt[k]), `pt.${k}`);
  // The terms the app already uses: Settings in each language, "Seus números reais" in the subtitle.
  assert.match(tr.pt.meal_sheet_sub, /Ajustes/);
  assert.match(tr.fr.meal_sheet_sub, /Paramètres/);
  assert.match(tr.de.meal_sheet_sub, /Optionen/);
  assert.match(tr.it.meal_sheet_sub, /Opzioni/);
  assert.match(tr.pt.settings_food_reminders_sub_meals, /números reais/);
  assert.equal(tr.pt.notif_meal_action_skip, 'Pular esta refeição');
  assert.equal(tr.pt.notif_food_action_done, 'Nada mais hoje');
});

test('MR-11: Log (and a tap) on a meal reminder opens the chat asking for that meal, on the reminder\'s day', () => {
  const resp = (action) => ({ actionIdentifier: action, notification: { request: { identifier: 'food-log-2026-11-18-1230', content: { data: { type: 'food_log', dayKey: '2026-11-18', meal: { at: '12:30', kind: 'lunch' } } } } } });
  const now = at('2026-11-18', '13:31');
  for (const a of ['FOOD_LOG_IT', 'expo.modules.notifications.actions.DEFAULT']) {
    const p = plan.foodTapParams(resp(a), now);
    assert.deepEqual(p, { logIt: now, mealDay: '2026-11-18', meal: { at: '12:30', kind: 'lunch' }, nonce: now });
  }
  // The legacy 20:00 question keeps its own path.
  const legacy = { actionIdentifier: 'expo.modules.notifications.actions.DEFAULT', notification: { request: { identifier: 'food-log-2026-11-18', content: { data: { type: 'food_log', dayKey: '2026-11-18' } } } } };
  assert.deepEqual(plan.foodTapParams(legacy, now), { eveningDay: '2026-11-18', nonce: now });
  assert.equal(M.mealChatAsk(tFor('pt'), { at: '12:30', kind: 'lunch' }, 'pt'), 'O que você comeu no almoço?');
  assert.equal(M.mealChatAsk(tFor('en'), { at: '16:00', kind: 'snack' }, 'en', '24h'), 'What did you eat at 16:00?');
  const chat = read('screens/FoodChatScreen.js');
  assert.match(chat, /routeParams\?\.meal/);
  assert.match(chat, /case 'mealAsk':/);
  assert.match(chat, /mealChatAsk\(t, x\.meal, language, timeFormat\)/);
});

test('MR-12: iPhone budget — food holds at most 7 + (meals − 1); the reserve and the dose total follow', () => {
  const day = '2026-11-18';
  const days = plan.foodNudgeDays('2026-11-10', day, new Set(), 7);
  for (const preset of ['three', 'five', 'every3h']) {
    const meals = M.presetMeals(preset);
    for (const hm of ['00:30', '09:00', '13:45', '21:00', '23:59']) {
      const p = M.mealReminderPlan({ meals, days, todayKey: day, nowMs: at(day, hm), horizonMs: 24 * 3600 * 1000 });
      assert.ok(p.length <= M.iosFoodPendingMax(meals), `${preset} at ${hm}: ${p.length}`);
      assert.ok(p.filter((x) => x.last).length <= 7);
    }
  }
  const eight = Array.from({ length: 8 }, (_, i) => ({ at: `${String(7 + 2 * i).padStart(2, '0')}:00` }));
  assert.equal(M.iosFoodPendingMax(eight), 14);
  assert.equal(M.iosFoodPendingMax(null), 7, 'no choice: the 7 evening questions, as before');
  // Reserve when the real counts are unknown: 7 summaries + check-in + weigh-in + 14 food + 4 snoozes.
  assert.equal(plan.IOS_OTHER_RESERVED, 7 + 1 + 1 + 14 + plan.MAX_SNOOZES);
  assert.equal(plan.doseBudget({ os: 'ios', protocolCount: 3, expiryAlerts: 8 }).total, 64 - 27 - 8);
  // With the real counts (three meals, all kinds on): 64 − (7 + 1 + 1 + 9 + 4) − 8 expiry = 34 dose reminders.
  assert.equal(plan.doseBudget({ os: 'ios', protocolCount: 3, expiryAlerts: 8, otherPending: plan.iosOtherPending({ summaries: 7, checkin: 1, weighIn: 1, food: M.iosFoodPendingMax(M.presetMeals('three')) }) }).total, 34);
  const n = read('lib/notifications.js');
  assert.match(n, /food = meta\.food_reminders === false \? 0 : iosFoodPendingMax\(\(normalizeMeals\(meta\.food_meals\) \|\| \{\}\)\.meals\)/);
  assert.match(n, /horizonMs: Platform\.OS === 'ios' \? MEAL_IOS_HORIZON_MS : Infinity/);
});

test('MR-10 / MR-13: re-planned on app open and after every food change; same gates as the 20:00 question', () => {
  const n = read('lib/notifications.js');
  const i = n.indexOf('export async function syncFoodLogReminder(');
  const fn = n.slice(i, n.indexOf('// Close a local day', i));
  // Gates: switch off, no open check, locked → nothing (unchanged, before the meal branch).
  assert.ok(fn.indexOf("food_reminders === false") < fn.indexOf('if (choice) {'));
  assert.ok(fn.indexOf('remindersForAccess(days, access)') < fn.indexOf('if (choice) {'));
  // Today's logs feed the skip rule and the totals; the plan numbers come from the Progress plan card's source.
  assert.match(fn, /mealReminderPlan\(\{ meals: choice\.meals, days, todayKey, nowMs: now\.getTime\(\), entries: todayEntries,/);
  assert.match(fn, /mealDayTotals\(todayEntries, item\.dayKey\)/);
  assert.match(n, /async function foodPlanTargets\(/);
  // The food chat re-plans after every write (refresh → syncAllNotifications), the app open does too.
  const chat = read('screens/FoodChatScreen.js');
  assert.match(chat, /function refresh\(uid, announce = true\) \{[\s\S]*?syncAllNotifications\(\)/);
  assert.match(n, /await syncFoodLogReminder\(\);/);
  // The plan numbers: the same daily plan as the Progress plan card (calories) and its protein.
  const tile = read('lib/progressTile.js');
  assert.match(tile, /plan: targets,/);
  assert.match(n, /return tile\.plan \? \{ kcal: tile\.plan\.kcal \|\| null, proteinG: tile\.plan\.protein_g \|\| null \} : null;/);
});

test('MR-14: the Android server sender plans the same meal reminders as the app (parity) and says the same words', () => {
  const S = require('../supabase/functions/send-reminders/plan.ts');
  const stored = [null, {}, { plan: 'three' }, { plan: 'five' }, { plan: 'every3h' }, { plan: 'custom', meals: [{ at: '18:00', kind: 'dinner' }, { at: '06:15', kind: 'breakfast' }, { at: '18:00' }, { at: '25:00' }, { at: '11:00', kind: 'weird' }] }, { plan: 'custom', meals: [] }];
  for (const s of stored) assert.deepEqual(S.normalizeMeals(s), M.normalizeMeals(s), JSON.stringify(s));
  for (const at of ['07:30', '12:30', '22:00', '23:15', '23:59', 'x']) assert.equal(S.mealFireMin(at), M.mealFireMin(at), at);
  for (const p of ['three', 'five', 'every3h']) {
    const meals = M.presetMeals(p);
    for (let i = 0; i < meals.length; i++) assert.equal(S.mealWindowStartMin(meals, i), M.mealWindowStartMin(meals, i), `${p} ${i}`);
  }
  // The skip rule on the same rows (the server reads them in the user's time zone).
  const day = '2026-11-18';
  const meals = M.presetMeals('three');
  const cases = [[], [entry(day, '07:10', 400, 30)], [entry(day, '08:45', 400, 30)], [entry(day, '12:50', 650, 45)], [entry('2026-11-17', '12:00', 600, 40)]];
  for (const rows of cases) {
    const srv = rows.map((r) => { const c = S.localParts(new Date(r.created_at), 'America/New_York'); return { entryKey: r.entry_date, key: c.key, minute: c.hour * 60 + c.minute }; });
    for (let i = 0; i < meals.length; i++) assert.equal(S.loggedForMeal(srv, day, meals, i), M.loggedForMeal(rows, day, meals, i), `${JSON.stringify(rows)} ${i}`);
  }
  // Sent in the run window that holds the fire time (13:30 for lunch).
  assert.deepEqual(S.mealsDueNow(meals, 13 * 60 + 35, 15), [1]);
  assert.deepEqual(S.mealsDueNow(meals, 13 * 60 + 29, 15), []);
  // The text: the app's words without the plan (the server has no plan engine), in each language.
  const MEAL_STRINGS = serverMealStrings();
  for (const l of LANGS) {
    for (const [k, v] of Object.entries(MEAL_STRINGS[l])) assert.equal(v, tr[l][k], `server ${l}.${k}`);
    const tt = (k) => MEAL_STRINGS[l][k];
    for (const p of ['three', 'five', 'every3h']) {
      const ms = M.presetMeals(p);
      const items = M.mealReminderPlan({ meals: ms, days: [day], todayKey: day, nowMs: at(day, '00:10') });
      for (const item of items) {
        for (const totals of [{ kcal: 0, protein_g: 0 }, { kcal: 2480, protein_g: 45 }, { kcal: 12480, protein_g: 120 }]) {
          assert.deepEqual(S.mealPushContent(tt, l, ms, item.index, totals), M.mealReminderContent({ t: tFor(l), language: l, item, totals, plan: null }), `${l} ${p} ${item.index}`);
        }
      }
    }
  }
  // The sender reads the choice, sends with the buttons, one claim per meal and day.
  const src = read('supabase/functions/send-reminders/index.ts');
  assert.match(src, /normalizeMeals\(meta\.food_meals\)/);
  assert.match(src, /categoryId: c\.category/);
  assert.match(src, /_dedupe: `\$\{tok\.expo_token\}:food:\$\{lp\.key\}:\$\{m\.at\.replace\(':', ''\)\}`/);
  assert.match(src, /from\('food_logs'\)\.select\('user_id, entry_date, created_at, kcal, protein_g, source'\)/);
});

// The REAL syncFoodLogReminder (helpers/extractFn) with a fake expo-notifications.
function runFood({ meta, entries = [], os = 'ios', targets = { kcal: 2200, proteinG: 180 }, start = { date: '2026-11-15' }, startIds = [] }) {
  const { loadFn } = require('./helpers/extractFn');
  const cancelUnwanted = loadFn('lib/notifications.js', 'async function cancelUnwanted(', 'cancelUnwanted');
  const scheduled = new Map(startIds.map((id) => [id, { identifier: id, content: { data: {} } }]));
  const N = { scheduled, async getAllScheduledNotificationsAsync() { return [...scheduled.values()]; }, async cancelScheduledNotificationAsync(id) { scheduled.delete(id); } };
  const reqMap = {
    './realityCheck': { getRealityStart: async () => start },
    './foodLogActions': { loadFoodAccess: async () => ({ access: { canLog: true, mode: 'premium' } }) },
  };
  const tr = require('../i18n/translations.js');
  const T2 = tr.translations || tr.default || tr;
  const fn = loadFn('lib/notifications.js', 'export async function syncFoodLogReminder(', 'syncFoodLogReminder', {
    getNotifications: () => N, usesServerPush: () => false, getCachedUser: async () => ({ id: 'u1', user_metadata: meta }), cancelUnwanted,
    require: (m) => reqMap[m], ymd: plan.ymd, parseYmd: plan.parseYmd, closedDays: require('../lib/nutrition').closedDays, getFoodLogsSince: () => entries,
    foodNudgeDays: plan.foodNudgeDays, remindersForAccess: plan.remindersForAccess, FOOD_WINDOW_DAYS: 7, FOOD_HOUR: 20, FOOD_MIN: 0,
    getT: async () => Object.assign((k) => T2.pt[k] || k, { language: 'pt' }), Platform: { OS: os }, _background: false,
    AsyncStorage: { getItem: async () => null },
    scheduleReq: async (n, req) => { n.scheduled.set(req.identifier, req); },
    normalizeMeals: M.normalizeMeals, mealReminderPlan: M.mealReminderPlan, mealReminderContent: M.mealReminderContent, mealDayTotals: M.mealDayTotals,
    foodPlanTargets: async () => targets, MEAL_IOS_HORIZON_MS: 24 * 3600 * 1000,
  });
  return fn().then(() => scheduled);
}

test('MR-7 / MR-9 / MR-10 (run): the real schedule — one per meal with the day so far, no 20:00 question; no choice = the 20:00 question', async () => {
  const today = plan.ymd(new Date());
  const nowHm = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  // With a choice: every id is a meal reminder, the day's last keeps food-log-<day>, no other kind.
  const lunchLog = entry(today, '00:00', 650, 45);
  lunchLog.created_at = new Date(Date.now() - 60 * 1000).toISOString(); // logged a minute ago, today
  const s = await runFood({ meta: { food_meals: { plan: 'three' } }, entries: [lunchLog], startIds: ['food-log-daily'] });
  const ids = [...s.keys()];
  assert.ok(ids.length > 0 && ids.every((id) => id.startsWith('food-log-')), ids.join(','));
  assert.ok(!s.has('food-log-daily'), 'the old single id goes');
  for (const r of s.values()) {
    assert.ok(r.content.data.meal && r.content.data.meal.at, 'every reminder names its meal');
    assert.notEqual(new Date(r.trigger.date).getHours() * 60 + new Date(r.trigger.date).getMinutes(), 20 * 60, 'nothing at 20:00');
    if (r.content.data.dayKey === today) assert.match(r.content.body, /Hoje até agora: proteína 45 de 180 g · calorias 650 de 2\.200\.$/);
    else assert.ok(!/Hoje até agora/.test(r.content.body), 'a later day has nothing logged yet: no numbers');
  }
  const tomorrow = plan.ymd(new Date(Date.now() + 86400000));
  assert.equal(s.get(`food-log-${tomorrow}`).content.categoryIdentifier, 'food-evening');
  // iPhone: the non-last meals only inside 24 h; at most 7 + 2 in all.
  assert.ok(s.size <= M.iosFoodPendingMax(M.presetMeals('three')), `${s.size} at ${nowHm}`);
  // Android: every meal of the window.
  const a = await runFood({ meta: { food_meals: { plan: 'three' } }, os: 'android' });
  assert.ok(a.has(`food-log-${tomorrow}-0730`) && a.has(`food-log-${tomorrow}-1230`) && a.has(`food-log-${tomorrow}`));
  // No choice: exactly the 20:00 question, as before.
  const legacy = await runFood({ meta: {} });
  for (const r of legacy.values()) {
    assert.equal(new Date(r.trigger.date).getHours(), 20);
    assert.equal(r.content.body, require('../i18n/translations.js').translations.pt.notif_food_body);
    assert.ok(!r.content.data.meal);
  }
  assert.ok(legacy.has(`food-log-${tomorrow}`));
  // Switch off: nothing.
  assert.equal((await runFood({ meta: { food_reminders: false, food_meals: { plan: 'three' } }, startIds: [`food-log-${tomorrow}-0730`] })).size, 0);
});

function serverMealStrings() {
  const src = read('supabase/functions/send-reminders/index.ts');
  const block = src.slice(src.indexOf('const MEAL_STRINGS'), src.indexOf('};', src.indexOf('const MEAL_STRINGS')));
  const out = {};
  for (const line of block.split('\n')) {
    const m = /^\s{2}(\w{2}): (\{.*\}),$/.exec(line);
    if (m) out[m[1]] = JSON.parse(m[2]);
  }
  return out;
}

test('MR-16 (simulator 2026-11-18): the Settings meal row lines up with the other notification rows', () => {
  // Seen on the simulator: the row's text started left of the other rows' text and its chevron ran past
  // their right edge (no side margin), and it had no line under it.
  const sheet = read('screens/components/MealTimesSheet.js');
  assert.match(sheet, /rowSettings: \{ flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, minHeight: 60, paddingVertical: 10, paddingLeft: 40, borderBottomWidth: 1, borderBottomColor: c\.line \}/);
  assert.match(sheet, /rowLabelSettings: \{ fontSize: 17, color: c\.ink \}/);
  const st = read('screens/SettingsScreen.js');
  assert.match(st, /rowLabel: \{ fontSize: 17, color: c\.ink \}/);
  assert.match(st, /row: \{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginHorizontal: 16,/);
});
