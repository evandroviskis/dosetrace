'use strict';
// docs/specs/food-log-recent-receipt.md (founder 2026-11-26; pictures docs/design/refeicoes-recentes.html
// v2 and docs/design/registro-comida-visual.html option A): the food chat screen. Runs the real handlers
// of screens/FoodChatScreen.js with fakes, and checks the source for the parts that are layout.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read } = require('./helpers/extractFn');
const { repeatEntry, canRepeat } = require('../lib/foodRecent');

const SRC = read('screens/FoodChatScreen.js');
const tr = (() => { const T = require('../i18n/translations.js'); return T.translations || T.default || T; })();

const MEAL = { key: 'k', label: 'Shake de proteína, 2 scoops', items: [{ food: 'Shake de proteína', qty: 2, unit: 'scoops', kcal: 240, carb_g: 8, protein_g: 48, fat_g: 3, confidence: 'high', msg: 'old', ask: { kind: 'brand' }, ask_skipped: true }] };

function repeatHarness({ access = { canLog: true, mode: 'free_days' }, logDay = null, open = null } = {}) {
  const log = { inserted: [], deleted: [], ai: 0, access: [], bye: [], undo: [], skipped: [], freeStart: 0, announced: 0, notice: [] };
  let timer = null;
  const deps = {
    busy: false, fuBusy: false, userId: 'u1', logDay, rows: [], access, screenReader: false,
    repeatingRef: { current: false }, undoTimer: { current: null },
    UNDO_MS: 6000, UNDO_MS_SCREEN_READER: 15000,
    touch() {}, localISO: () => '2026-11-26',
    loadFoodAccess: async () => ({ access }), setAccess: (a) => log.access.push(a), canRepeat,
    ensureFreeStart: () => { log.freeStart++; }, openFollowup: () => open,
    updateItem: (rowId, index, fn) => log.skipped.push(fn({ food: 'x' })), clearDraft() {}, fuDraftKey: () => 'k',
    setNotice: (n) => log.notice.push(n),
    insertFoodLog: (row) => { log.inserted.push(row); return 41; }, repeatEntry, newMessageId: () => 'fresh',
    requestSync() {}, refresh: () => [], announceLogged: () => { log.announced++; },
    sayBye: (day) => log.bye.push(day), setUndo: (u) => log.undo.push(u),
    clearTimeout() {}, setTimeout: (fn, ms) => { timer = { fn, ms }; return 1; },
    parseFood: async () => { log.ai++; return { ok: false }; }, parseFollowup: async () => { log.ai++; return { ok: false }; },
  };
  const repeatMeal = loadFn('screens/FoodChatScreen.js', 'async function repeatMeal(', 'repeatMeal', deps);
  return { log, deps, repeatMeal, timer: () => timer };
}

test('FR-4: one tap logs the meal at once as a normal entry, without an AI call, already read, with a new message id', async () => {
  const h = repeatHarness();
  await h.repeatMeal(MEAL);
  assert.equal(h.log.ai, 0, 'no AI call: no daily read used, works offline');
  assert.equal(h.log.inserted.length, 1);
  const row = h.log.inserted[0];
  assert.equal(row.parse_status, 'done');
  assert.equal(row.entry_date, '2026-11-26', 'today when no earlier day is open in the chat');
  assert.equal(row.raw_text, MEAL.label);
  const items = JSON.parse(row.parsed_items);
  assert.equal(items[0].msg, 'fresh');
  assert.ok(!('ask' in items[0]) && !('ask_skipped' in items[0]));
  assert.equal(h.log.freeStart, 1, 'the free days anchor is set like typing (FL-41)');
  assert.deepEqual(h.log.bye, ['2026-11-26'], 'FR-12: the goodbye follows');
  assert.equal(h.log.announced, 1, 'FR-9: a screen reader hears what was logged');
});

test('FR-4: the copy lands on the day open in the chat (a reminder or "Log it" for an earlier day)', async () => {
  const h = repeatHarness({ logDay: '2026-11-24' });
  await h.repeatMeal(MEAL);
  assert.equal(h.log.inserted[0].entry_date, '2026-11-24');
});

test('FR-4 / FL-27: a tap while a follow-up is open closes that question; the earlier item stays an estimate', async () => {
  const h = repeatHarness({ open: { rowId: 3, index: 0 } });
  await h.repeatMeal(MEAL);
  assert.deepEqual(h.log.skipped, [{ food: 'x', ask_skipped: true }]);
});

test('FR-5: "Undo" shows for a few seconds; undo deletes the new row through the normal delete (tombstone)', async () => {
  const h = repeatHarness();
  await h.repeatMeal(MEAL);
  assert.deepEqual(h.log.undo, [{ rowId: 41, label: MEAL.label }]);
  assert.equal(h.timer().ms, 6000, 'a few seconds');
  const log = { deleted: [], bye: [], undo: [] };
  const undoRepeat = loadFn('screens/FoodChatScreen.js', 'function undoRepeat(', 'undoRepeat', {
    undo: { rowId: 41, label: MEAL.label }, undoTimer: { current: 1 }, clearTimeout() {}, setUndo: (u) => log.undo.push(u), touch() {},
    deleteFoodLog: (id) => log.deleted.push(id), requestSync() {}, refresh() {}, userId: 'u1', setBye: (b) => log.bye.push(b),
  });
  undoRepeat();
  assert.deepEqual(log.deleted, [41], 'deleteFoodLog = the synced tombstone');
  assert.deepEqual(log.undo, [null]);
  assert.deepEqual(log.bye, [null], 'the goodbye for the removed entry goes too');
  assert.match(SRC, /export function deleteFoodLog|deleteFoodLog\(u\.rowId\); \/\/ the normal delete: a synced tombstone/);
});

test('FR-7: the free 7 days and the Premium lock apply exactly as for typing', async () => {
  const h = repeatHarness({ access: { canLog: false, mode: 'locked' } });
  await h.repeatMeal(MEAL);
  assert.equal(h.log.inserted.length, 0, 'locked: nothing is logged');
  assert.deepEqual(h.log.access, [{ canLog: false, mode: 'locked' }], 'the screen shows the lock (access asked again at the tap)');
  // Locked → the whole composer (the row included) is replaced by the Premium card.
  assert.match(SRC, /\{gated \? \(/);
});

test('FR-1: the row sits above the field, names only, sideways scroll, hidden until the first meal; FR-6: the "i" opens the sheet', () => {
  const comp = SRC.slice(SRC.indexOf('<View style={s.composer}>'), SRC.indexOf('<View style={s.field}>'));
  assert.match(comp, /\{recent\.length > 0 && \(/, 'hidden until the first meal is logged');
  assert.match(comp, /\{t\('nutri_recent_label'\)\}/);
  assert.match(comp, /<FeatureIcon name="info"/, 'the "i" is the app icon, never an emoji');
  assert.match(comp, /accessibilityLabel=\{t\('nutri_recent_info'\)\}/);
  assert.match(comp, /<ScrollView horizontal/);
  assert.match(comp, /<Text style=\{s\.recentChipText\} numberOfLines=\{1\}>\{m\.label\}<\/Text>/, 'the chip shows the name only');
  assert.doesNotMatch(comp, /kcal|protein_g|carb_g/, 'no kcal and no macros on the row');
  assert.match(SRC, /const recent = useMemo\(\(\) => recentMeals\(rows, \{ todayISO: today, now: new Date\(minute \* 60000\), language \}\)/);
  const log = [];
  const openRecentInfo = loadFn('screens/FoodChatScreen.js', 'function openRecentInfo(', 'openRecentInfo', { touch() {}, t: (k) => k, alert: (...a) => log.push(a) });
  openRecentInfo();
  assert.deepEqual(log, [['nutri_recent_title', 'nutri_recent_body', [{ text: 'nutri_how_cta' }], 'info']]);
  assert.equal(tr.pt.nutri_how_cta, 'Entendi');
});

test('FR-8: each entry is a receipt — names left, kcal in a right column, a total line, the estimate underlined; no category tag', () => {
  const entry = SRC.slice(SRC.indexOf("case 'entry': {"), SRC.indexOf("case 'asked':"));
  assert.match(entry, /<View style=\{\[s\.lnEstWrap, flag && s\.lnEstBox\]\}><Text style=\{s\.lnFood\}>\{itemLabel\(it, language, x\.raw\)\}<\/Text><\/View>/);
  assert.match(entry, /<Text style=\{s\.lnKcal\}>/);
  assert.match(entry, /<Text style=\{s\.totK\}>/);
  assert.match(entry, /\{est \? <Text style=\{s\.estn\}>\{t\('nutri_estimate'\)\}<\/Text> : null\}/);
  assert.match(entry, /t\('nutri_receipt_logged'\)\.replace\('\{time\}', time\)/);
  assert.doesNotMatch(SRC, /nutri_cat_|catTag/, 'no per-item "Meal" tag (the category is still stored)');
  assert.match(SRC, /lnEstBox: \{ borderBottomWidth: 1\.5, borderStyle: 'dotted', borderColor: c\.attention \}/);
  assert.match(SRC, /lnKcal: \{ fontFamily: MONO\['500'\][^}]*fontVariant: \['tabular-nums'\] \}/, 'tabular numbers');
  assert.equal(tr.pt.nutri_estimate, 'estimativa · toque para corrigir');
});

test('FR-9: no separate echo bubble; the receipt is the echo and a screen reader still hears what was logged', () => {
  assert.doesNotMatch(SRC, /case 'echo':/);
  const entry = SRC.slice(SRC.indexOf("case 'entry': {"), SRC.indexOf("case 'asked':"));
  assert.match(entry, /accessibilityLabel=\{said \? `\$\{t\('nutri_echo'\)\.replace\('\{items\}', said\)\} \$\{t\('nutri_edit_title'\)\}` : t\('nutri_edit_title'\)\}/);
  assert.match(SRC, /AccessibilityInfo\.announceForAccessibility\(t\('nutri_echo'\)\.replace\('\{items\}', e\)\)/);
  const submit = SRC.slice(SRC.indexOf('  async function onSubmit() {'), SRC.indexOf('  // ── Follow-up'));
  assert.match(submit, /announceLogged\(keep, raw\);/);
});

test('FR-10: the day total is a small panel fixed on top with a ruler, not a line inside the thread', () => {
  const top = SRC.slice(SRC.indexOf('{dayTot ? <View style={s.band}>'), SRC.indexOf('<FlatList'));
  assert.ok(top.length > 0, 'the panel comes before the thread');
  assert.match(top, /<View style=\{s\.ticks\}>/, 'the ruler');
  assert.match(top, /<Text style=\{s\.gK\}>/, 'kcal large');
  assert.doesNotMatch(SRC, /case 'day_total':/);
});

test('FR-11: the follow-up keeps the quick answers, the typed answer and Skip — no "That\'s all for today"', () => {
  const fu = SRC.slice(SRC.indexOf("case 'followup':"), SRC.indexOf("case 'bye':"));
  assert.match(fu, /x\.options\.map/);
  assert.match(fu, /onSubmitEditing=\{\(\) => answerFollowup\(x, fuText\)\}/);
  assert.match(fu, /t\('nutri_ask_skip'\)/);
  assert.doesNotMatch(SRC, /nutri_day_done_btn/);
});

async function submitHarness(res) {
  const log = { bye: [], announced: [], ai: 0 };
  const deps = {
    text: '2 ovos', busy: false, userId: 'u1', logDay: null, rows: [], language: 'pt',
    touch() {}, isDoneText: () => false, isNoText: () => false, setText() {}, saveDraftNow() {}, closeDay: async () => {},
    localISO: () => '2026-11-26', setNotice() {}, setBye: (b) => log.bye.push(b), openFollowup: () => null, skipFollowup() {},
    mustAskWhichEarlier: () => false, recentForParse: () => [], getFoodLogsSince: () => [], setConsentOpen() {}, askAIConsent: async () => true,
    updateItem() {}, setBusy() {}, ensureFreeStart() {}, insertFoodLog: () => 7, rememberTypedHere() {}, inFlight: new Set(), setSendingId() {},
    refresh: () => ['rows'], parseFood: async () => { log.ai++; return res; }, deleteFoodLog() {}, requestSync() {},
    catchUpOutcome: (items) => ({ save: items, notice: null }), saveParsed() {}, sendFailureNotice: () => 'retry', isOnlineNow: () => true, scheduleCatchUp() {},
    announceLogged: (items) => log.announced.push(items.length), sayBye: (day, r) => log.bye.push({ day, r }),
  };
  await loadFn('screens/FoodChatScreen.js', 'async function onSubmit(', 'onSubmit', deps)();
  return log;
}

test('FR-12: after an entry the app says goodbye instead of asking right away; an open follow-up asks first', async () => {
  const done = await submitHarness({ ok: true, items: [{ food: 'ovos', qty: 2, kcal: 155 }], totals: { kcal: 155 }, ask: null, daysAgo: null });
  assert.deepEqual(done.bye.at(-1), { day: '2026-11-26', r: ['rows'] });
  assert.deepEqual(done.announced, [1]);
  const asked = await submitHarness({ ok: true, items: [{ food: 'iogurte', kcal: 100 }], totals: { kcal: 100 }, ask: { item: 0, kind: 'size', options: ['170 g'] }, daysAgo: null });
  assert.ok(!asked.bye.some((b) => b && b.day), 'a follow-up is open: no goodbye yet');
  assert.doesNotMatch(SRC, /askNext|threadQuestion|nutri_q_/, 'no question right after each entry (FL-4 amended)');
  const fu = SRC.slice(SRC.indexOf('  async function answerFollowup('), SRC.indexOf('  function confirmRemove('));
  assert.match(fu, /sayBye\(open\.entry_date, r\); \/\/ FR-12: after a follow-up answer, the goodbye/);
  assert.match(fu, /sayBye\(open\.entry_date, refresh\(userId\)\);/, 'Skip ends with the goodbye too');
});

test('FR-12: the goodbye text — "Done, logged." and the next meal only when its reminder is on (6 languages)', () => {
  const t = (k) => tr.pt[k];
  const byeText = loadFn('screens/FoodChatScreen.js', 'function byeText(', 'byeText', {
    t, language: 'pt', timeFormat: '24h', BYE_NAMED: new Set(['breakfast', 'lunch', 'dinner']), formatTime: require('../lib/timeFormat').formatTime,
  });
  assert.equal(byeText({ day: '2026-11-26', next: { kind: 'dinner', at: '19:30' } }), 'Pronto, anotado. Até daqui a pouco: às 19:30 eu pergunto do jantar.');
  assert.equal(byeText({ day: '2026-11-26', next: null }), 'Pronto, anotado. Se comer mais alguma coisa, é só me contar.');
  assert.equal(byeText({ day: '2026-11-26', next: { kind: 'snack', at: '17:00' } }), 'Pronto, anotado. Até daqui a pouco: às 17:00 eu pergunto de novo.');
  // The reminder state comes from the account (Settings switch + meal times), read on open.
  assert.match(SRC, /mealMetaRef\.current = \{ meals: \(normalizeMeals\(meta\.food_meals\) \|\| \{\}\)\.meals \|\| null, on: meta\.food_reminders !== false \};/);
  assert.match(SRC, /checkOpen: !!\(rcStart && rcStart\.date\), access: acc, closed: closedDays\(list\)\.has\(todayKey\),/);
});

test('FR-13: the empty field reads "What did you eat?"; the AI notice stays, smaller', () => {
  assert.match(SRC, /placeholder=\{t\('nutri_input_placeholder'\)\}/);
  assert.deepEqual(['en', 'es', 'pt', 'fr', 'de', 'it'].map((l) => tr[l].nutri_input_placeholder),
    ['What did you eat?', '¿Qué comiste?', 'O que você comeu?', "Qu'avez-vous mangé ?", 'Was hast du gegessen?', 'Cosa hai mangiato?']);
  assert.match(SRC, /<Text style=\{s\.caveat\} numberOfLines=\{2\}>\{t\('nutri_est_note'\)\}/);
  assert.match(SRC, /caveat: \{ fontSize: 11,/);
});

test('FR-14: a handle shows on top of the title bar; the swipe down still closes only from the title bar', () => {
  assert.match(SRC, /<View style=\{s\.header\} \{\.\.\.headerSwipe\.panHandlers\}>\s*\{\/\*[^]*?\*\/\}\s*\{embedded \? null : <View style=\{s\.grab\} \/>\}/);
  assert.match(SRC, /grab: \{ position: 'absolute'[^}]*backgroundColor: c\.line \}/);
});

test('FR-15: theme tokens only and no emoji in the food chat', () => {
  const styles = SRC.slice(SRC.indexOf('const makeStyles = (c) => StyleSheet.create({'));
  assert.doesNotMatch(styles, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/, 'no raw colour');
  assert.doesNotMatch(SRC, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'no emoji');
});
