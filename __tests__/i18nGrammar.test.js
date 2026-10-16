'use strict';
// Founder 2026-10-15: "fix all the grammar of the app, in natural language that is not too formal
// but clearly says what we mean" (found from the French "1 jours d'affilée sur 7").
// These guards hold the classes of grammar error a full 6-language pass found, so they cannot
// come back (report: docs/review/i18n-grammar-2026-10-15.md).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pluralKey } = require('../lib/plural');

function load() {
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const tr = load();
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// Every string of a language, nested FAQ arrays included, as [path, text].
function strings(lang) {
  const out = [];
  const walk = (v, p) => {
    if (typeof v === 'string') out.push([p, v]);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], p ? `${p}.${k}` : k);
  };
  walk(tr[lang], '');
  return out;
}
const noPh = (s) => s.replace(/\{[a-zA-Z0-9_]+\}/g, '#');
function offenders(langs, re, { strip = true } = {}) {
  const bad = [];
  for (const l of langs) for (const [k, v] of strings(l)) if (re.test(strip ? noPh(v) : v)) bad.push(`${l}.${k}: ${v.slice(0, 90)}`);
  return bad;
}

test('no "(s)" / "(es)" / "(e)" / "/i" plurals in any language (French inclusive "(e)" for gender is allowed)', () => {
  assert.deepEqual(offenders(LANGS, /[A-Za-zÀ-ÿ]\((s|es|i|en|n)\)|[a-zà-ÿ]\/(i|e|s)\b/), []);
  assert.deepEqual(offenders(['es', 'pt', 'de', 'it', 'en'], /[A-Za-zÀ-ÿ]\(e\)/), []);
});

test('French keeps "vous" everywhere (founder 2026-10-15): no "tu" forms', () => {
  assert.deepEqual(offenders(['fr'], /(^|[^\p{L}'’-])(tu|ton|ta|tes|toi|te|t['’])(?=[^\p{L}]|$)/iu), []);
});

test('es/pt/de/it keep the informal register: no usted, o senhor, formal Sie or Lei', () => {
  assert.deepEqual(offenders(['es'], /\busted(es)?\b/i), []);
  assert.deepEqual(offenders(['pt'], /\bo senhor\b|\ba senhora\b/i), []);
  assert.deepEqual(offenders(['de'], /[a-zäöüß,] (Sie|Ihnen|Ihre?[mnrs]?)\b/), []);
  assert.deepEqual(offenders(['it'], /[a-z,] (Lei|Suo|Sua|Suoi)\b/), []);
});

test('French elision and contractions (qu\'il, s\'il, l\'app, d\'un, du, au)', () => {
  assert.deepEqual(offenders(['fr'], /(^|[^\p{L}'’-])(que|si) (il|ils)\b|(^|[^\p{L}'’-])(que|de|le|la|ne|se|je|me|ce|jusque|lorsque|puisque) [aeiouyéèêàâîôû]/iu), []);
});

test('Portuguese, Spanish and Italian contractions (no, da, al, del, nel)', () => {
  assert.deepEqual(offenders(['pt'], /(^|[^\p{L}])(em|por) (o|a|os|as)(?=\s)/iu), []);
  assert.deepEqual(offenders(['es'], /(^|[^\p{L}])(a|de) el(?=\s)/u), []);
  assert.deepEqual(offenders(['it'], /(^|[^\p{L}'’])(di|a|da|in|su) (il|lo|la|i|gli|le|I|Il|Lo|La)(?=\s)/u), []);
});

test('no double spaces, no leading or trailing spaces, no space before a comma or period', () => {
  assert.deepEqual(offenders(LANGS, / {2,}|^\s|\s$| [,.](?!\d|\.\.)/, { strip: false }), []);
});

test('no English words left in a translation', () => {
  assert.deepEqual(offenders(['es', 'pt', 'fr', 'de', 'it'], /(^|[^\p{L}])(the|your|you|with|please|this|will|and|tap|log|now)(?=[^\p{L}]|$)/u), []);
});

// {day} in these lines is "Today", "Yesterday" or a weekday date that most languages write in
// lowercase ("sex., 19 de out.", "lun. 12 oct."): the sentence cannot start with it, and nothing
// can agree with it.
test('a sentence never starts with a {day} that can be a lowercase date', () => {
  for (const k of ['nutri_nr_bubble', 'nutri_day_closed_on']) for (const l of ['es', 'pt', 'fr', 'it']) {
    assert.doesNotMatch(tr[l][k], /^\{day\}/, `${l}.${k}`);
  }
});

// Counts found by the pass that can be 1 (or 0 in French) and had no singular.
const NEW_ONE = ['nutri_echo_more', 'nutri_free_ending_note_nocheck', 'nutri_free_ending_note', 'nutri_grace_note_premium',
  'cal_tgt_eta', 'cal_rc_sofar_run', 'today_alert_vial_expiry_days', 'paywall_start_trial_months', 'today_doses_taken',
  'rc_setup_progress', 'blood_dropped_sub'];
const ph = (s) => (String(s).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join(',');

test('the new count strings have a singular with the same placeholders, in 6 languages', () => {
  for (const k of NEW_ONE) for (const l of LANGS) {
    assert.ok(tr[l][`${k}_one`], `${l}.${k}_one`);
    assert.equal(ph(tr[l][`${k}_one`]), ph(tr.en[k]), `${l}.${k}_one placeholders`);
  }
});

test('the new count strings read right with 1 (and French with 0)', () => {
  const fill = (l, k, n, vars) => Object.entries(vars).reduce((s, [p, v]) => s.split(`{${p}}`).join(String(v)), tr[l][pluralKey(k, n, l)]);
  assert.equal(fill('fr', 'nutri_echo_more', 1, { n: 1 }), '+1 autre');
  assert.equal(fill('it', 'nutri_echo_more', 1, { n: 1 }), '+1 altro');
  assert.equal(fill('es', 'paywall_start_trial_months', 1, { n: 1 }), 'Empieza tu prueba gratis de 1 mes');
  assert.equal(fill('de', 'paywall_start_trial_months', 2, { n: 2 }), '2 Monate kostenlos testen');
  assert.equal(fill('de', 'blood_dropped_sub', 1, { count: 1 }), '1 Wert konnte nicht als Zahl gelesen werden und wurde übersprungen.');
  assert.equal(fill('en', 'blood_dropped_sub', 3, { count: 3 }), "3 values couldn't be read as numbers and were skipped.");
  assert.match(fill('en', 'cal_tgt_eta', 1, { weeks: 1, when: 'Nov 12' }), /^~1 week to go/);
  assert.match(fill('fr', 'nutri_free_ending_note', 0, { logged: 0, day: 2, until: 'x', weighin: 'y' }), /sur 0 jour\./);
  assert.match(fill('pt', 'today_alert_vial_expiry_days', 1, { n: 1, name: 'BPC' }), /vence em 1 dia$/);
  assert.equal(fill('fr', 'today_doses_taken', 0, { x: 0, y: 3 }), '0 sur 3 effectuée');
  assert.equal(fill('es', 'rc_setup_progress', 1, { n: 1, total: 4 }), '1 de 4 listo');
});

test('the screens pick the new singulars with pluralKey', () => {
  const uses = {
    'screens/FoodChatScreen.js': ['nutri_echo_more'],
    'screens/components/CalculatorSection.js': ['cal_tgt_eta', 'cal_rc_sofar_run'],
    'screens/TodayScreen.js': ['today_alert_vial_expiry_days'],
    'lib/notifications.js': ['today_alert_vial_expiry_days'],
    'lib/paywallPlans.js': ['paywall_start_trial_months'],
    'lib/todayFormat.js': ['today_doses_taken'],
    'components/ReminderSetupList.js': ['rc_setup_progress'],
    'screens/SettingsScreen.js': ['rc_setup_progress'],
    'screens/BodyScreen.js': ['blood_dropped_sub'],
  };
  for (const [f, keys] of Object.entries(uses)) {
    const src = read(f);
    for (const k of keys) {
      assert.match(src, new RegExp(`pluralKey\\('${k}'`), `${f} picks ${k} with pluralKey`);
      assert.doesNotMatch(src, new RegExp(`t\\('${k}'\\)`), `${f} has no plain t('${k}') left`);
    }
  }
  // The food grace note picks its key at run time; the logged-days count chooses the singular.
  assert.match(read('screens/components/FoodGraceNote.js'), /pluralKey\(key, logged, language\)/);
  // Today passes the app language to the "x of y complete" label.
  assert.match(read('screens/TodayScreen.js'), /dosesTakenLabel\(doneDoses, totalDoses, t, language\)/);
  assert.match(read('screens/PaywallScreen.js'), /ctaModel\(\{[^}]*language[^}]*\}\)/);
});

// ── Follow-up decisions 2026-10-15 (ledger/logic) ─────────────────────────────
// English uses the serial (Oxford) comma, like the US spelling and Apple's style.
// A short list "A, B and C" (one- or two-word items) needs the comma before and/or.
const OXFORD_OK = new Set([
  'nutri_demo_meal', 'nutri_input_placeholder', // the food-chat example is what a user types; the demo splits it on ", " and " and "
]);
// Not lists: the pattern matches, but the words after the comma are one phrase.
const NOT_A_LIST = ['account.apple.com, under Sign-In and Security', 'longer, with letters and numbers', 'Name, birth month and year',
  'math estimates, not measurements or dosing', 'Desk job, little or no', 'any language, photo or PDF'];
test('English lists use the serial comma ("labs, vaccine cards, and vials")', () => {
  const bad = [];
  for (const [k, v] of strings('en')) {
    if (OXFORD_OK.has(k)) continue;
    let text = noPh(v);
    for (const n of NOT_A_LIST) text = text.split(n).join('~');
    const m = text.match(/(^|[\s(])[\w./-]+(?: [\w./-]+)?, [\w./-]+(?: [\w./-]+)? (and|or) [\w(-]+/);
    if (m) bad.push(`${k}: «${m[0].trim()}»`);
  }
  assert.deepEqual(bad, []);
});

// Council fix 4 (2026-10-16, Apple 2.3.10): each platform reads only its own store
// (lib/storeText.js; __tests__/storeSpecificCancel.test.js). On Android both still explain Google Play.
test('Terms and the FAQ "Can I cancel anytime?" explain cancelling on Android (Google Play), in 6 languages', () => {
  const { fillStoreText } = require('../lib/storeText');
  for (const l of LANGS) {
    const tt = (k) => tr[l][k];
    assert.match(fillStoreText(tr[l].settings_terms_body, tt, 'android'), /Google Play/, `${l} terms`);
    const faq = tr[l].faq_categories.flatMap((c) => c.questions);
    const cancelIdx = tr.en.faq_categories.flatMap((c) => c.questions).findIndex((q) => /cancel anytime/i.test(q.q));
    assert.ok(cancelIdx >= 0);
    assert.match(fillStoreText(faq[cancelIdx].a, tt, 'android'), /Google Play/, `${l} FAQ cancel answer`);
  }
});

test('the reality check names three numbers everywhere (start weight, weight now, daily intake)', () => {
  const three = { en: /\bthree\b/i, es: /\btres\b/i, pt: /\btrês\b/i, fr: /\btrois\b/i, de: /\bdrei\b/i, it: /\btre\b/i };
  const four = /\b(four|cuatro|quatro|quatre|vier|quattro)\b/i;
  for (const l of LANGS) for (const k of ['cal_rc_sub', 'cal_rc_locked_lead']) {
    assert.match(tr[l][k], three[l], `${l}.${k}`);
    assert.doesNotMatch(tr[l][k], four, `${l}.${k}`);
  }
});

test('German says "Fachperson" for a healthcare professional everywhere (one term)', () => {
  assert.deepEqual(offenders(['de'], /Fachkr(a|ä)ft/), []);
  assert.deepEqual(offenders(['de'], /Apple ID/), []); // German writes Apple-ID
});

// {store} is "Apple ID" or "Google Play": no article may sit right before it, since it would
// have to agree with whichever name comes in.
test('no article right before {store} (it is "Apple ID" or "Google Play")', () => {
  assert.deepEqual(offenders(['es', 'pt', 'fr', 'it'], /(^|[^\p{L}])(do|da|dos|das|no|na|o|a|el|la|del|al|le|du|au|il|lo|dello|della|nel|nella|sul) \{store\}/iu, { strip: false }), []);
});

test('the vial-low notification uses the singular for 1 (and French 0), with the count filled in', () => {
  for (const l of LANGS) assert.match(tr[l].notif_vial_body_one, /\{n\}/, l);
  const notif = read('lib/notifications.js');
  assert.doesNotMatch(notif, /remaining === 1 \? 'notif_vial_body_one'/);
  assert.equal((notif.match(/isOne\([^)]*remaining[^)]*\) \? 'notif_vial_body_one' : 'notif_vial_body_other'/g) || []).length, 2);
});

test('a vial that lasts about 1 day says "1 day", in the assistant fact and the review row', () => {
  for (const l of LANGS) for (const k of ['ap_fact_vial_day', 'ap_row_lasts_value_day']) {
    assert.ok(tr[l][k], `${l}.${k}`);
    const base = k === 'ap_fact_vial_day' ? 'ap_fact_vial' : 'ap_row_lasts_value';
    assert.equal(ph(tr[l][k]), ph(tr.en[base]), `${l}.${k} placeholders`);
    assert.doesNotMatch(tr[l][k].replace('{days}', '1'), /\b1 (days|días|dias|jours|Tage|giorni)\b/, `${l}.${k}`);
  }
  const pa = read('lib/protocolAssistant.js');
  assert.match(pa, /days === 1 \? 'ap_fact_vial_day'/);
  assert.match(pa, /'ap_row_lasts_value_day'/);
});
