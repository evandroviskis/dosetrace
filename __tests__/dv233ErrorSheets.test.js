'use strict';
// DV-233 (founder 2026-11-01, picture docs/design/rodada2-conta-exames.html #dv233; decisions.md
// "Error sheets use the warning triangle" and "titles say what happened, never a generic Error",
// Q4 = A): every error sheet shows the warning triangle (FeatureIcon "warning", never the "alert"
// circle) and a title that says what happened; the body says what to do. Questions keep their glyph.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { translations } = require('../i18n/translations');
const E = require('../lib/errorSheet');
const { outcomeSheet } = require('../lib/paywallPlans');
const { scanErrorSheet } = require('../lib/bodyScan');
const { mixDateError } = require('../lib/vialEdit');

const ROOT = path.join(__dirname, '..');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const tr = (l) => (k) => (k in translations[l] ? translations[l][k] : `__missing:${k}`);

function appFiles() {
  const out = ['App.js'];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.js$/.test(e.name)) out.push(rel);
    }
  };
  ['lib', 'screens', 'components'].forEach(walk);
  return out;
}
// Code only: line and block comments out (a comment may still quote the old usage).
function code(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
}

// Sheets with the circle that are NOT errors (questions / a choice / an instruction after a purchase).
const NOT_ERRORS = ['reset_switch_title', 'account_guard_title', 'paywall_cancel_sub_title'];

test('DV-233: no sheet in the app is titled with the generic "Error"', () => {
  const hits = [];
  for (const f of appFiles()) {
    code(f).split('\n').forEach((l, i) => { if (/\bt\(\s*['"]error['"]\s*\)/.test(l)) hits.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(hits, [], `generic "Error" titles left: ${hits.join(', ')}`);
});

test('DV-233: error sheets never use the "alert" circle (only the listed questions keep it)', () => {
  const hits = [];
  for (const f of appFiles()) {
    const src = code(f);
    const re = /icon\s*[:=]\s*['"]alert['"]/g;
    let m;
    while ((m = re.exec(src))) {
      const after = src.slice(m.index, m.index + 260);
      if (!NOT_ERRORS.some((k) => after.includes(`'${k}'`))) hits.push(`${f}:${src.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepEqual(hits, [], `"alert" glyph on error sheets: ${hits.join(', ')}`);
});

test('DV-233: errorSheet = warning triangle + a title for the case + OK', () => {
  const t = tr('pt');
  const s = E.errorSheet(t, 'save', 'corpo');
  assert.equal(E.ERROR_ICON, 'warning');
  assert.deepEqual(s, { icon: 'warning', title: 'Não foi possível salvar', body: 'corpo', buttons: [{ label: 'OK', kind: 'primary' }] });
  assert.equal(E.errorSheet(t, 'session', 'b', { done: true }).done, true, 'extra fields pass through');
  assert.throws(() => E.errorSheet(t, 'nope', 'b'), /unknown kind/);
});

test('DV-233: the eight approved pt titles, word for word', () => {
  const t = tr('pt');
  const want = {
    save: 'Não foi possível salvar',
    restore: 'Não foi possível restaurar as compras',
    purchase: 'Não foi possível concluir a compra',
    plan: 'Plano indisponível no momento',
    file: 'Não foi possível gerar o arquivo',
    signin: 'Não foi possível entrar',
    session: 'Sua sessão terminou',
    age: 'Não foi possível salvar sua idade',
  };
  for (const [k, v] of Object.entries(want)) assert.equal(E.errorTitle(t, k), v, k);
});

test('DV-233: every error title exists in all 6 languages and is never the generic "Error"', () => {
  for (const l of LANGS) {
    const generic = translations[l].error;
    for (const [kind, key] of Object.entries(E.ERROR_TITLE_KEYS)) {
      const v = translations[l][key];
      assert.ok(typeof v === 'string' && v.trim(), `${l}.${key} (${kind}) missing`);
      assert.notEqual(v, generic, `${l}.${key} is the generic title`);
    }
  }
});

test('DV-233: paywall outcomes — triangle, the title says what happened, the body what to do', () => {
  for (const l of LANGS) {
    const t = tr(l);
    const r = outcomeSheet('restore_failed', t);
    assert.deepEqual([r.icon, r.title], ['warning', translations[l].err_title_restore], l);
    const p = outcomeSheet('failed', t);
    assert.deepEqual([p.icon, p.title], ['warning', translations[l].err_title_purchase], l);
    const u = outcomeSheet('unavailable', t);
    assert.deepEqual([u.icon, u.title], ['warning', translations[l].err_title_plan], l);
    assert.equal(outcomeSheet('none', t).icon, 'warning', l);
    for (const s of [r, p, u]) assert.match(s.body, /hello@dosetrace\.io/, `${l}: a way to reach support`);
  }
  // The old bodies only repeated the failure ("Falha ao restaurar" / "Falha na compra").
  assert.match(translations.pt.paywall_restore_failed, /^Verifique a internet e tente de novo\./);
  assert.match(translations.pt.paywall_purchase_failed, /^Verifique a internet e tente de novo\./);
  assert.equal(outcomeSheet('lifetime_cancel_sub', tr('pt'), 'ios').icon, 'alert', 'an instruction, not an error');
});

test('DV-233: scan errors and the mix date say what happened', () => {
  for (const l of LANGS) {
    const t = tr(l);
    for (const kind of ['signin', 'big', 'bigPhoto', 'camera', 'build', 'read']) {
      const s = scanErrorSheet(kind, t);
      assert.notEqual(s.title, translations[l].error, `${l} scan ${kind}`);
      assert.doesNotMatch(s.title, /__missing/, `${l} scan ${kind}`);
    }
    const d = mixDateError('invalid', t);
    assert.equal(d.title, translations[l].today_invalid_date, l);
    assert.equal(d.body, translations[l].vial_edit_invalid_body, l);
  }
});

test('DV-233: sign-in with an unconfirmed address uses the triangle and "Couldn\'t sign in"', () => {
  const src = code('screens/AuthScreen.js');
  const i = src.indexOf("t('auth_email_not_confirmed')");
  assert.ok(i > 0);
  const block = src.slice(i - 260, i);
  assert.match(block, /errorSheet\(t, 'signin'|icon: ERROR_ICON|icon: 'warning'/);
  assert.doesNotMatch(block, /icon: 'mail'/);
});
