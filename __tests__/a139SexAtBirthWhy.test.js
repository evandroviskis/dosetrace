'use strict';
// A-139 — why the app asks Sex at birth (founder 2026-10-17; picture docs/design/a139-sex-at-birth.html;
// founder 2026-10-20 "Pode seguir com as suas recomendações em todos": B, C, E + D′, with D′ worded
// "se a gordura corporal não estiver preenchida"). Spec: docs/specs/a139-sex-at-birth.md (SX-1…).
//  B  — the help line stays and a "Why do we ask?" link under it opens the full text (Edit profile and
//       sign-up About you).
//  C  — a note under the field when an already-saved value is changed, gone when it goes back to the
//       saved value; Save writes (Edit profile; sign-up only when a saved value exists).
//  E  — Progress › Your numbers uses the profile's own terms (Sex at birth, Male / Female as in the
//       profile) and the same link, full width under the Age / Sex row.
//  D′ — in Your numbers a tap saves at once, so changing a saved value asks first (Cancel / Change).
// True claims only, and the Dose accumulation curve stays sex-neutral (decision 2026-09-09).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations: tr } = require('../i18n/translations.js');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const KEYS = ['sex_why_link', 'sex_why_title', 'sex_why_body', 'sex_why_body2', 'sex_change_title', 'sex_change_body', 'sex_change_confirm_title', 'sex_change_confirm_btn'];

// ── Copy (×6, the picture's texts) ─────────────────────────────────────────
test('SX-7: every A-139 string exists in all 6 languages', () => {
  for (const lang of LANGS) for (const k of KEYS) assert.ok(typeof tr[lang][k] === 'string' && tr[lang][k].trim(), `${lang}.${k}`);
});

test('SX-7: Portuguese and English are the picture\'s texts, word for word', () => {
  const pt = tr.pt;
  assert.equal(pt.sex_why_link, 'Por que perguntamos?');
  assert.equal(pt.sex_why_title, 'Por que perguntamos o sexo ao nascer?');
  assert.equal(pt.sex_why_body, 'As fórmulas de energia usam a fisiologia do corpo, que muda com o sexo de nascimento. Se a gordura corporal não estiver preenchida, o gasto diário estimado muda cerca de 200 a 300 kcal de um para o outro. Esse dado também define o mínimo de calorias das metas e o desenho do corpo ao escolher o local da injeção. A curva de acúmulo de doses não usa esse dado.');
  assert.equal(pt.sex_why_body2, 'Ele serve só para as contas e não diz nada sobre quem você é. Se você faz terapia hormonal, converse com seu profissional de saúde sobre os seus números.');
  assert.equal(pt.sex_change_title, 'O que muda com isso');
  assert.equal(pt.sex_change_body, 'Isso muda o gasto diário estimado (cerca de 200 a 300 kcal, se a gordura corporal não estiver preenchida), o mínimo de calorias das metas e o desenho do corpo no local da injeção. A curva de acúmulo de doses não muda.');
  assert.equal(pt.sex_change_confirm_title.replace('{value}', pt.profile_gender_female), 'Mudar para Feminino?');
  assert.equal(pt.sex_change_confirm_btn, 'Mudar');
  const en = tr.en;
  assert.equal(en.sex_why_link, 'Why do we ask?');
  assert.equal(en.sex_why_title, 'Why we ask for sex at birth');
  assert.match(en.sex_why_body, /^Energy formulas are based on body physiology, which differs by sex at birth\. If you haven’t entered your body fat, your estimated daily burn differs by about 200–300 kcal between the two\./);
  assert.match(en.sex_why_body, /The Dose accumulation curve doesn’t use it\.$/);
  assert.equal(en.sex_why_body2, 'It’s only used for the math and says nothing about who you are. If you’re on hormone therapy, talk to your health professional about your numbers.');
  assert.equal(en.sex_change_title, 'What this changes');
  // The picture's text with the app's English serial comma (house style, commit b33c886).
  assert.equal(en.sex_change_body, 'This changes your estimated daily burn (by about 200–300 kcal if body fat isn’t entered), the minimum calories in your goals, and the body figure for your injection site. The Dose accumulation curve stays the same.');
});

test('SX-6: D′ wording — the kcal range is only claimed when body fat is not filled in, in every language', () => {
  const bf = { en: /body fat/, es: /grasa corporal/, pt: /gordura corporal não estiver preenchida/, fr: /masse grasse/, de: /Körperfett/, it: /grasso corporeo/ };
  for (const lang of LANGS) {
    for (const k of ['sex_why_body', 'sex_change_body']) {
      const v = tr[lang][k];
      assert.match(v, /200/, `${lang}.${k}: the range`);
      assert.match(v, bf[lang], `${lang}.${k}: only without body fat`);
    }
  }
});

test('SX-8: neutral, true wording — curve does not change, hormone therapy → health professional, fr vous, de du, pt formal', () => {
  const pro = { en: /health professional/, es: /profesional de la salud/, pt: /profissional de saúde/, fr: /professionnel de santé/, de: /Ärztin oder deinem Arzt/, it: /medico/ };
  const curveNo = { en: /doesn’t use it/, es: /no lo usa/, pt: /não usa esse dado/, fr: /ne l’utilise pas/, de: /nutzt sie nicht/, it: /non lo usa/ };
  for (const lang of LANGS) {
    assert.match(tr[lang].sex_why_body2, pro[lang], `${lang}: health professional`);
    assert.match(tr[lang].sex_why_body, curveNo[lang], `${lang}: the curve does not use it`);
    assert.ok(tr[lang].sex_change_confirm_title.includes('{value}'), `${lang}: confirm title names the new value`);
    assert.doesNotMatch(tr[lang].sex_why_body + tr[lang].sex_change_body, /gender|género|gênero|genre|Gender|genere/i, `${lang}: says sex at birth, never gender`);
  }
  assert.match(tr.fr.sex_why_body2, /\bvous\b/, 'fr: vous');
  assert.match(tr.de.sex_why_body2, /\bdu\b/, 'de: du');
  assert.doesNotMatch(tr.pt.sex_why_body + tr.pt.sex_why_body2 + tr.pt.sex_change_body, /a gente|dá para|Não deu/, 'pt formal');
});

// ── The claims in the copy are true (lib/energyCalc.js, lib/bodySites.js) ───
test('SX-9: the copy is true — ~166 kcal BMR and ~200–300 kcal daily burn without body fat; none with body fat; floor + figure follow sex', () => {
  const e = require('../lib/energyCalc');
  const { figureSex } = require('../lib/bodySites');
  const base = { weightKg: 84, heightCm: 178, age: 37 };
  const m = e.computeBMR({ ...base, sex: 'male' });
  const f = e.computeBMR({ ...base, sex: 'female' });
  assert.equal(m.method, 'mifflin');
  assert.equal(Math.round(m.bmr - f.bmr), 166, 'Mifflin-St Jeor: +5 vs −161');
  for (const a of e.ACTIVITY_LEVELS) {
    const d = e.tdee(m.bmr, a.value) - e.tdee(f.bmr, a.value);
    assert.ok(d >= 195 && d <= 320, `daily burn differs about 200–300 kcal at ×${a.value} (${d.toFixed(0)})`);
  }
  const mb = e.computeBMR({ ...base, sex: 'male', bodyFatPct: 20 });
  const fb = e.computeBMR({ ...base, sex: 'female', bodyFatPct: 20 });
  assert.equal(mb.method, 'katch');
  assert.equal(mb.bmr, fb.bmr, 'with body fat the formula does not use sex — hence "if body fat is not entered"');
  assert.notEqual(e.CALORIE_FLOOR.male, e.CALORIE_FLOOR.female, 'minimum calories in the goals');
  assert.equal(figureSex({ gender: 'female' }), 'female', 'injection-site figure');
  assert.equal(figureSex({ gender: 'male' }), 'male');
});

// ── The curve stays sex-neutral (decision 2026-09-09) ───────────────────────
test('SX-10: the Dose accumulation model never reads sex — sources and behaviour', () => {
  for (const f of ['lib/serumModel.js', 'lib/halfLives.js', 'lib/curveSampling.js', 'lib/curveView.js', 'screens/SerumCurveScreen.js']) {
    const src = read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(src, /\bgender\b|\bsex\b|profileSex|figureSex|user_metadata|bodyProfile/i, `${f} reads no sex / profile`);
  }
  const serum = require('../lib/serumModel');
  const now = new Date(2026, 9, 1, 12, 0, 0).getTime();
  const p = { id: 'cyp', type: 'rtu', compound_id: 'rtu_testosterone_cypionate', name: 'Testosterone Cypionate', dose: 100, dose_unit: 'mg', interval_days: 7, doses_per_day: 1, start_date: '2026-06-01', reminder_time: '09:00' };
  const plain = serum.estimatedLevelNow(p, now);
  assert.ok(plain && plain.value > 0);
  for (const g of ['male', 'female']) {
    const withSex = serum.estimatedLevelNow({ ...p, gender: g, sex: g, user_metadata: { gender: g } }, now);
    assert.equal(withSex.value, plain.value, `same level with ${g}`);
  }
});

// ── Rules (lib/sexAtBirth.js) ───────────────────────────────────────────────
test('SX-3 / SX-5: the change note and the confirm only follow a change of an already-saved value', () => {
  const { isSex, sexChangeNoteShown, sexTapAction } = require('../lib/sexAtBirth');
  assert.ok(isSex('male') && isSex('female') && !isSex('') && !isSex(null) && !isSex('other'));
  // C
  assert.equal(sexChangeNoteShown('male', 'female'), true, 'saved male, now female');
  assert.equal(sexChangeNoteShown('male', 'male'), false, 'back to the saved value: gone');
  assert.equal(sexChangeNoteShown(null, 'female'), false, 'first choice: no note');
  assert.equal(sexChangeNoteShown('', 'male'), false);
  assert.equal(sexChangeNoteShown('female', ''), false);
  // D′
  assert.equal(sexTapAction('male', 'female'), 'confirm');
  assert.equal(sexTapAction(null, 'female'), 'save', 'first choice saves at once (no saved value to change)');
  assert.equal(sexTapAction('female', 'female'), 'none');
  assert.equal(sexTapAction('male', null), 'none', 'a cleared tap never writes');
});

// ── Screens ─────────────────────────────────────────────────────────────────
test('SX-1: the shared component — link with chevron, opens the full text in a well box, the change note with the info icon; tokens only', () => {
  const src = read('components', 'SexAtBirthWhy.js');
  for (const k of ['sex_why_link', 'sex_why_title', 'sex_why_body', 'sex_why_body2', 'sex_change_title', 'sex_change_body']) assert.ok(src.includes(`t('${k}')`), k);
  assert.match(src, /accessibilityState=\{\{ expanded: open \}\}/, 'link reports open / closed');
  assert.match(src, /setOpen\(o => !o\)/, 'tap again closes');
  assert.match(src, /FeatureIcon name="info"/, 'note icon from the vector set');
  assert.match(src, /backgroundColor: c\.well/, 'open text sits on the well');
  assert.match(src, /borderColor: c\.line/, 'note outline is the line token');
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba\(/, 'no raw colours');
  const data = read('components', 'featureIconsData.js');
  assert.match(data, /\n  info: `<svg/, 'info glyph in the set');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'feature-icons', 'info.svg')), 'info.svg source');
});

test('SX-2 / SX-3: Edit profile — help line, then the link (B); the note (C) between the bar and the help line, only for a changed saved value', () => {
  const src = read('screens', 'SettingsScreen.js');
  const i = src.indexOf("<Text style={s.editLabel}>{t('profile_sex')}</Text>");
  assert.ok(i > 0);
  const block = src.slice(i, src.indexOf("t('profile_country')", i));
  const bar = block.indexOf('<SegmentedBar');
  const note = block.indexOf('<SexChangeNote');
  const help = block.indexOf("t('profile_sex_help')");
  const link = block.indexOf('<SexWhy');
  assert.ok(bar > 0 && note > bar && help > note && link > help, 'bar → note → help line → link');
  assert.match(block, /sexChangeNoteShown\(user\?\.user_metadata\?\.gender, gender\)/, 'compared with the saved profile value');
  assert.match(src, /import \{ SexWhy, SexChangeNote \} from '\.\.\/components\/SexAtBirthWhy'/);
});

test('SX-4: sign-up About you — help line, then the link (B); the note only when a saved value exists (signed-in) and changes', () => {
  const src = read('screens', 'OnboardingFlowScreen.js');
  const i = src.indexOf("<Text style={s.fieldLabel}>{t('profile_sex')}");
  assert.ok(i > 0);
  const block = src.slice(i, src.indexOf("t('profile_country')", i));
  const bar = block.indexOf('<SegmentedBar');
  const note = block.indexOf('<SexChangeNote');
  const help = block.indexOf("t('profile_sex_help')");
  const link = block.indexOf('<SexWhy');
  assert.ok(bar > 0 && note > bar && help > note && link > help, 'bar → note → help line → link');
  assert.match(block, /sexChangeNoteShown\(savedGender, d\.gender\)/);
  assert.match(src, /const savedGender = signedIn && isSex\(meta\.gender\) \? meta\.gender : null;/, 'pre-account (first choice) never shows the note');
});

test('SX-5 / SX-6: Your numbers — profile terms, the link full width under Age / Sex, and a changed saved value asks first (Cancel / Change)', () => {
  const src = read('screens', 'components', 'CalculatorSection.js');
  const form = src.match(/const numbersForm = \(([\s\S]*?)\n  \);\n/)[1];
  assert.ok(form.includes("t('profile_sex')"), 'label: Sex at birth');
  assert.ok(!/t\('cal_sex'\)/.test(form), 'the old "Sex" label is gone');
  assert.match(form, /label: t\(`profile_gender_\$\{sx\}`\)/, 'Male / Female as in the profile');
  assert.match(form, /onChange=\{askProfileSex\}/);
  const age = form.indexOf("t('cal_age')");
  const why = form.indexOf('<SexWhy');
  const bf = form.indexOf("t('cal_bodyfat')");
  assert.ok(age > 0 && why > age && bf > why, 'the link sits between the Age / Sex row and Body fat');
  const ask = src.match(/function askProfileSex\(val\) \{[\s\S]*?\n  \}\n/);
  assert.ok(ask, 'askProfileSex');
  assert.match(ask[0], /sexTapAction\(profileSex, val\)/);
  assert.match(ask[0], /setConfirm\(\{/);
  for (const k of ["t('sex_change_confirm_title')", "t('sex_change_body')", "t('cancel')", "t('sex_change_confirm_btn')"]) assert.ok(ask[0].includes(k), k);
  assert.match(ask[0], /\{ label: t\('cancel'\), kind: 'secondary' \},\s*\{ label: t\('sex_change_confirm_btn'\), kind: 'primary', onPress: \(\) => saveProfileSex\(val\) \}/, 'Cancel | Change, only Change saves');
  assert.match(src, /sexLabel: profileSex \? t\(`profile_gender_\$\{profileSex\}`\) : null/, 'the folded summary uses the same terms');
});

test('SX-5: the old calculator-only terms are gone in all 6 languages (one term per concept)', () => {
  for (const lang of LANGS) for (const k of ['cal_sex', 'cal_sex_male', 'cal_sex_female']) assert.equal(tr[lang][k], undefined, `${lang}.${k} removed`);
  const all = ['screens', 'components', 'lib'].flatMap(d => {
    const out = [];
    const walk = (p) => { for (const n of fs.readdirSync(p)) { const f = path.join(p, n); if (fs.statSync(f).isDirectory()) walk(f); else if (f.endsWith('.js')) out.push(fs.readFileSync(f, 'utf8')); } };
    walk(path.join(__dirname, '..', d));
    return out;
  }).join('\n') + read('App.js');
  assert.doesNotMatch(all, /'cal_sex'|cal_sex_\$\{|'cal_sex_(male|female)'/, 'no code reads them');
});
