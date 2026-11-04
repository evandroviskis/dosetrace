'use strict';
// App search "Buscar no DoseTrace" (docs/specs/app-search.md, founder pick B2 2026-11-04; picture
// docs/design/app-search.html). The matcher, the catalogue D01–D53, the text index and the record
// source are pure modules; these tests run the real code with the real i18n strings.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'i18n/translations.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
const tr = mod.exports.translations;
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const tFor = (l) => (k) => (tr[l][k] !== undefined ? tr[l][k] : tr.en[k] !== undefined ? tr.en[k] : k);

const S = require('../lib/appSearch');
const TX = require('../lib/appSearchText');
const REC = require('../lib/appSearchRecords');

// The picture's sample account: three active protocols, four markers, two vaccines.
const PROTOS = [
  { id: 1, compound_id: 'lyo_bpc_157', name: 'BPC-157', color: '#387BC4', type: 'lyophilized' },
  { id: 2, compound_id: 'rtu_testosterone_cypionate', name: 'Testosterone Cypionate', color: '#D9822B', type: 'rtu' },
  { id: 3, compound_id: null, name: 'Vitamina D3', color: '#2E9E6A', type: 'oral' },
];
const LAB_ROWS = [
  { id: 11, marker: 'TSH', value: 2.31, unit: 'mIU/L', report_date: '2026-10-12', notes: 'jejum 12h' },
  { id: 12, marker: 'Testosterone, Total', value: 642, unit: 'ng/dL', report_date: '2026-10-12' },
  { id: 13, marker: 'Vitamin D (25-OH)', value: 38.5, unit: 'ng/mL', report_date: '2026-10-12' },
  { id: 14, marker: 'Hemoglobin A1c', value: 5.4, unit: '%', report_date: '2026-09-01' },
  { id: 15, marker: 'TSH', value: 2.9, unit: 'mIU/L', report_date: '2026-09-01' },
  { id: 16, marker: 'Ferritin', value: 120, unit: 'ng/mL', report_date: '2026-09-01', sync_status: 'deleted' },
];
const VACCINES = [
  { id: 21, name: 'Gripe 2026', date_given: '2026-09-20', notes: 'lote AB123' },
  { id: 22, name: 'Hepatite B', date_given: '2026-05-02' },
  { id: 23, name: 'Raiva', date_given: '2026-04-02', sync_status: 'deleted' },
];
const FLAGS_ALL = { pending: true, alerts: true, ended: true, deleted: true };

function index(language, { flags = FLAGS_ALL, protocols = PROTOS } = {}) {
  const t = tFor(language);
  return S.buildPlaceIndex({
    translations: tr, language, flags,
    protocols: REC.protocolEntries(protocols, { translations: tr, t }),
    records: REC.markerRecords(LAB_ROWS, language).concat(REC.vaccineRecords(VACCINES)),
  });
}
const titles = (rows) => rows.map((r) => r.title);
const first = (idx, q) => S.searchPlaces(idx, q)[0];

test('AS-17: the new strings of the picture exist in the six languages, in the picture\'s words', () => {
  const keys = ['search_button', 'search_field', 'search_shortcuts', 'search_clear', 'search_none_title', 'search_none_body', 'search_text_group', 'search_more', 'search_count', 'search_count_one', 'search_t_missed', 'search_t_skipped', 'search_t_today_doses', 'search_t_upcoming', 'search_t_sites', 'search_t_lab_upload', 'search_t_lab_export'];
  for (const l of LANGS) for (const k of keys) assert.equal(typeof tr[l][k], 'string', `${l}.${k}`);
  assert.equal(tr.pt.search_field, 'Buscar no DoseTrace');
  assert.equal(tr.pt.search_none_title, 'Nada encontrado para “{q}”');
  assert.equal(tr.pt.search_text_group, 'Ajuda e textos legais');
  assert.equal(tr.pt.search_more, 'Mostrar mais {n}');
  assert.equal(tr.fr.search_none_body.includes('vos doses, adressez-vous'), true, 'fr "vous"');
  assert.equal(tr.de.search_none_body.includes('deiner Gesundheit'), true, 'de "du"');
  assert.match(tr.pt.search_none_body, /fale com um profissional de saúde\.$/);
});

test('AS-5: every catalogue entry D01–D53 is present once, with title, path and landing that exist', () => {
  const ids = S.CATALOG.map((e) => e.id);
  for (let n = 1; n <= 53; n++) assert.ok(ids.includes(`D${String(n).padStart(2, '0')}`), `D${n}`);
  assert.equal(new Set(ids).size, ids.length);
  const ROUTES = ['Log', 'Progress', 'FoodChat', 'ReminderCheck', 'TeamMessages', 'FAQ'];
  const app = fs.readFileSync(path.join(ROOT, 'App.js'), 'utf8');
  for (const e of S.CATALOG) {
    for (const l of LANGS) {
      for (const k of [e.title].concat(e.path)) {
        if (k === '{name}') continue;
        assert.equal(typeof tr[l][k.replace(/^\^/, '')], 'string', `${e.id} ${l} ${k}`);
      }
      if (e.oral) for (const k of [e.oral.title].concat(e.oral.path)) if (k !== '{name}') assert.equal(typeof tr[l][k], 'string', `${e.id} oral ${l} ${k}`);
      assert.ok(Array.isArray(e.syn[l]), `${e.id} synonyms ${l}`);
    }
    assert.ok(['Today', 'Protocols', 'Journey', 'Body', 'Settings'].includes(e.open.tab), `${e.id} tab`);
    if (e.open.push) {
      assert.ok(ROUTES.includes(e.open.push), `${e.id} route`);
      assert.match(app, new RegExp(`name="${e.open.push}"`), `${e.id} route ${e.open.push} is in MainStack`);
    } else assert.equal(typeof e.open.target, 'string', `${e.id} target`);
  }
});

test('AS-5: every landing target is handled by the screen of its tab', () => {
  const files = { Today: 'screens/TodayScreen.js', Protocols: 'screens/ProtocolsScreen.js', Journey: 'screens/JourneyScreen.js', Body: 'screens/BodyScreen.js', Settings: 'screens/SettingsScreen.js' };
  const nav = fs.readFileSync(path.join(ROOT, 'lib/appSearchNav.js'), 'utf8');
  for (const e of S.CATALOG) {
    if (e.open.push) {
      if (e.open.params && e.open.params.focus) {
        const prog = fs.readFileSync(path.join(ROOT, 'screens/components/CalculatorSection.js'), 'utf8');
        assert.ok(prog.includes(`'${e.open.params.focus}'`), `${e.id} CalculatorSection handles ${e.open.params.focus}`);
      }
      if (e.open.params && e.open.params.filter) {
        const log = fs.readFileSync(path.join(ROOT, 'screens/LogScreen.js'), 'utf8');
        assert.ok(log.includes(`'${e.open.params.filter}'`), `${e.id} LogScreen filter ${e.open.params.filter}`);
      }
      continue;
    }
    const s = fs.readFileSync(path.join(ROOT, files[e.open.tab]), 'utf8');
    assert.ok(s.includes(`'${e.open.target}'`), `${e.id}: ${files[e.open.tab]} handles target '${e.open.target}'`);
  }
  assert.ok(nav.length > 0);
});

test('AS-6: place matching table (accents, typos, six languages, question words, every word)', () => {
  const pt = index('pt');
  for (const q of ['perdidas', 'pedidas', 'missed', 'verpasste dosen', 'onde ficam as doses perdidas']) {
    assert.equal(first(pt, q).id, 'D01', q);
  }
  const doses = titles(S.searchPlaces(pt, 'doses'));
  for (const want of ['Doses perdidas', 'Doses puladas', 'Pendente de ontem', 'Próximas doses']) assert.ok(doses.includes(want), `doses → ${want}`);
  const frasko = S.searchPlaces(pt, 'frasko');
  const vials = frasko.filter((r) => r.entry === 'D14').map((r) => r.title);
  assert.deepEqual(vials, ['Frasco · BPC-157', 'Frasco · Testosterona Cipionato', 'Frasco · Vitamina D3']);
  assert.equal(frasko.filter((r) => r.entry === 'D15' || r.entry === 'D16').length, 0, '"frasco" alone never lists Novo / Editar frasco');
  assert.equal(first(pt, 'idoma').id, 'D33');
  assert.equal(first(pt, 'tema escuro').id, 'D34');
  assert.equal(first(pt, 'aviso médico').id, 'D53');
  assert.equal(first(pt, 'aviso medico').id, 'D53');
  assert.equal(first(pt, 'excluir dados').id, 'D52');
  assert.ok(S.searchPlaces(pt, 'apagar conta').some((r) => r.id === 'D52'));
  assert.equal(first(pt, 'TSH').title, 'TSH');
  assert.equal(first(pt, 'gripe').title, 'Gripe 2026');
  const testo = titles(S.searchPlaces(pt, 'testosterona'));
  assert.ok(testo.includes('Testosterona total'), 'the marker');
  assert.ok(testo.includes('Testosterona Cipionato'), 'the protocol (compound name and aliases)');
  for (const q of ['efeito colateral', 'quanto aplicar', 'quanto puxar']) assert.deepEqual(S.searchPlaces(pt, q), [], q);
  // titles and paths in the app language, whatever language was typed
  const en = first(index('en'), 'perdidas');
  assert.equal(en.title, 'Missed doses');
  assert.equal(en.path, 'Today › View history › Missed');
  assert.equal(first(pt, 'missed').path, 'Hoje › Ver histórico › Perdidas');
});

test('AS-4: results are grouped by tab with the best group first, then tab order', () => {
  const pt = index('pt');
  const groups = S.groupRows(S.searchPlaces(pt, 'doses'));
  assert.equal(groups[0].g, 'today');
  assert.equal(groups[0].rows[0].title, 'Doses perdidas');
  const order = groups.map((g) => S.GROUP_ORDER.indexOf(g.g));
  assert.equal(new Set(groups.map((g) => g.g)).size, groups.length, 'one block per tab');
  assert.ok(order.length >= 2);
  // the protocol row carries its colour dot; places their monoline icon
  const p = S.searchPlaces(pt, 'bpc').find((r) => r.entry === 'D12');
  assert.equal(p.color, '#387BC4');
  assert.equal(p.path, 'Protocolos › BPC-157');
});

test('AS-11: only what exists is listed; oral calculator; Novo / Editar frasco need their own word', () => {
  const none = index('pt', { flags: {} });
  assert.equal(S.searchPlaces(none, 'pendente ontem').some((r) => r.id === 'D05'), false);
  assert.equal(S.searchPlaces(none, 'alertas').some((r) => r.id === 'D08'), false);
  assert.equal(S.searchPlaces(none, 'encerrados').some((r) => r.id === 'D18'), false);
  assert.equal(S.searchPlaces(none, 'lixeira').some((r) => r.id === 'D19'), false);
  const all = index('pt');
  assert.ok(S.searchPlaces(all, 'pendente ontem').some((r) => r.id === 'D05'));
  const calc = S.searchPlaces(all, 'calculadora').filter((r) => r.entry === 'D13').map((r) => r.title);
  assert.deepEqual(calc, ['Calculadora de seringa · BPC-157', 'Calculadora de seringa · Testosterona Cipionato', 'Calculadora de porções · Vitamina D3']);
  assert.ok(S.searchPlaces(all, 'novo frasco').some((r) => r.entry === 'D15'));
  assert.ok(S.searchPlaces(all, 'editar frasco').some((r) => r.entry === 'D16'));
  // only active protocols are given to the index (ended / deleted never reach it)
  assert.equal(index('pt', { protocols: [PROTOS[0]] }).rows.filter((r) => r.entry === 'D14').length, 1);
});

test('AS-3: the shortcuts follow the tab the search was opened from (B2), as drawn', () => {
  const pt = index('pt');
  assert.deepEqual(titles(S.shortcutsFor(pt, 'Today')), ['Doses perdidas', 'Registro de doses', 'Próximas doses', 'Verificar lembretes', 'Diário de exames', 'FAQ']);
  assert.deepEqual(titles(S.shortcutsFor(pt, 'Settings')), ['Idioma', 'Aparência', 'Notificações', 'Verificar lembretes', 'Baixar meus dados', 'Fale conosco']);
  assert.deepEqual(S.shortcutsFor(pt, 'Settings').map((r) => r.path), ['Ajustes › Preferências › Idioma', 'Ajustes › Preferências › Aparência', 'Ajustes › Notificações', 'Ajustes › Notificações › Verificar lembretes', 'Ajustes › Dados e privacidade › Baixar meus dados', 'Ajustes › Suporte › Fale conosco']);
  for (const tab of ['Protocols', 'Journey', 'Body']) assert.equal(S.shortcutsFor(pt, tab).length, 6, tab);
});

test('AS-13 / AS-28: rows show only names and paths, never a value, unit, date, dose or note', () => {
  const pt = index('pt');
  const text = JSON.stringify(pt.rows.map((r) => [r.title, r.path]));
  for (const bad of ['2.31', '642', '38.5', '5.4', 'mIU', 'ng/dL', '2026-10-12', '2026-09-20', 'jejum', 'AB123', '%']) assert.equal(text.includes(bad), false, bad);
  // a stored value, a unit, a date or a note typed into the search finds no record row
  for (const q of ['2.31', '642', 'mIU', '2026-10-12', '12 de out', 'jejum', 'AB123', 'lote']) {
    assert.equal(S.searchPlaces(pt, q).some((r) => r.record), false, q);
  }
  // deleted records are not listed; one row per marker and per vaccine name
  assert.equal(pt.rows.some((r) => /Ferritin|Ferritina|Raiva/.test(r.title)), false);
  assert.equal(pt.rows.filter((r) => r.record === 'marker' && r.title === 'TSH').length, 1);
  assert.deepEqual(first(pt, 'TSH').path, 'Meu corpo › Diário de exames › TSH');
  assert.deepEqual(first(pt, 'gripe').path, 'Meu corpo › Diário de vacinas › Gripe 2026');
  assert.deepEqual(first(pt, 'TSH').open, { tab: 'Body', target: 'marker', key: first(pt, 'TSH').open.key });
  assert.equal(first(pt, 'gripe').open.key, '21');
  // the marker in the app language (lib/markerNames.js)
  assert.ok(titles(pt.rows).includes('Hemoglobina glicada (HbA1c)'));
  assert.ok(titles(index('en').rows).includes('Testosterone, Total'));
});

// ── The text index (AS-24 … AS-26) ───────────────────────────────────────────
const textIndex = (l) => TX.buildTextIndex(tFor(l), 'ios');
const tsearch = (l, q) => TX.makeTextSearch(textIndex(l))(q);

test('AS-24: the text index holds 65 paragraphs in each language, built from the strings the screens show', () => {
  const { legalBlocks } = require('../lib/legalBlocks');
  for (const l of LANGS) {
    const u = textIndex(l);
    const by = {};
    u.forEach((x) => { by[x.src] = (by[x.src] || 0) + 1; });
    assert.equal(u.length, 65, `${l}: ${JSON.stringify(by)}`);
    assert.equal(by.faq, 17, l);
    assert.equal(by.learn, 5, l);
    // every paragraph is exactly a block LegalModal renders, with the heading above it
    for (const d of TX.LEGAL) {
      const blocks = legalBlocks(TX.legalContent(tFor(l), d.doc, 'ios'));
      const paras = u.filter((x) => x.src === d.doc);
      assert.equal(paras.length, blocks.filter((b) => !b.heading).length, `${l} ${d.doc}`);
      paras.forEach((p) => { assert.equal(blocks[p.open.block].text, p.body); assert.equal(blocks[p.open.block].heading, false); });
    }
    // the FAQ answers with the store text filled, as FAQScreen shows them (no {store_…} token left)
    assert.equal(u.some((x) => /\{store_/.test(x.body)), false, l);
    tr[l].faq_categories.forEach((c, ci) => c.questions.forEach((q, qi) => {
      const p = u.find((x) => x.src === 'faq' && x.open.ci === ci && x.open.qi === qi);
      assert.equal(p.title, q.q);
    }));
  }
  // the screens read the same keys: LegalModal content in Settings, faq_categories in FAQScreen, the LearnBlock explainers
  const settings = fs.readFileSync(path.join(ROOT, 'screens/SettingsScreen.js'), 'utf8');
  for (const d of TX.LEGAL) assert.ok(settings.includes(d.key), d.key);
  assert.ok(fs.readFileSync(path.join(ROOT, 'screens/FAQScreen.js'), 'utf8').includes("t('faq_categories')"));
  const learn = fs.readFileSync(path.join(ROOT, 'screens/components/LearnBlock.js'), 'utf8');
  for (const e of TX.LEARN) { assert.ok(learn.includes(`'${e.title}'`), e.title); assert.ok(learn.includes(`'${e.body}'`), e.body); }
});

test('AS-25: text matching table (same paragraph, endings, typos, closest words first)', () => {
  const top = (l, q) => { const h = tsearch(l, q)[0]; return h ? `${h.unit.src}|${h.unit.heading}|${h.unit.title}` : null; };
  const head = (l, n) => {
    const u = textIndex(l).filter((x) => x.src === 'privacy').map((x) => x.heading);
    return u.find((h) => h.startsWith(`${n}.`));
  };
  assert.equal(top('pt', 'excluir dados'), `privacy|${head('pt', 9)}|Política de privacidade`);
  assert.equal(top('pt', 'apagar meus dados'), `privacy|${head('pt', 8)}|Política de privacidade`);
  assert.match(top('pt', 'frasco vence'), /^faq\|.*\|O que acontece quando um frasco vence\?$/);
  assert.equal(top('pt', 'menor de idade'), `privacy|${head('pt', 11)}|Política de privacidade`);
  assert.equal(top('en', 'delete my data'), `privacy|${head('en', 9)}|${tr.en.settings_privacy_policy}`);
  assert.equal(top('es', 'eliminar datos'), `privacy|${head('es', 9)}|${tr.es.settings_privacy_policy}`);
  assert.equal(top('de', 'daten löschen'), `privacy|${head('de', 9)}|${tr.de.settings_privacy_policy}`);
  assert.match(top('de', 'Abo kündigen'), /^terms\|PREMIUM-ABONNEMENT\|/);
  assert.equal(top('fr', 'supprimer mes données'), `privacy|${head('fr', 9)}|${tr.fr.settings_privacy_policy}`);
  assert.equal(top('it', 'cancellare i dati'), `privacy|${head('it', 9)}|${tr.it.settings_privacy_policy}`);
  for (const q of ['quanto aplicar', 'efeito colateral', 'quanto puxar']) assert.deepEqual(tsearch('pt', q), [], q);
  // texts are searched in the app language only
  assert.equal(tsearch('pt', 'delete my data').length, 0);
});

test('AS-26: a text hit carries its source icon, title, where it lives and a short excerpt with the typed words marked', () => {
  const h = tsearch('pt', 'excluir dados')[0];
  assert.equal(h.unit.icon, 'lock');
  assert.ok(h.unit.where.startsWith('Ajustes › Dados e privacidade · 9.'));
  assert.ok(h.text.length <= 220, `excerpt ${h.text.length}`);
  const marked = h.marks.map(([a, b]) => h.text.slice(a, b).toLowerCase());
  assert.ok(marked.includes('excluir'));
  assert.ok(marked.includes('dados'));
  // cut at word boundaries
  assert.ok(!/\S$/.test(h.unit.body.slice(0, h.unit.body.indexOf(h.text) + 0)) || !h.pre);
  const icons = {};
  textIndex('pt').forEach((u) => { icons[u.src] = u.icon; });
  assert.deepEqual(icons, { faq: 'help', learn: 'info', privacy: 'lock', terms: 'clipboard', disclaimer: 'info' });
  // the pieces the row draws keep the text unchanged
  assert.equal(TX.markedPieces(h.text, h.marks).map((p) => p.text).join(''), h.text);
});

test('AS-15 (node part): places, records and texts answer within 50 ms per keystroke with 10 protocols, 40 markers, 20 vaccines', () => {
  const protocols = Array.from({ length: 10 }, (_, i) => ({ id: 100 + i, compound_id: i % 2 ? 'lyo_bpc_157' : null, name: `Protocolo ${i}`, color: '#387BC4', type: i % 3 ? 'lyophilized' : 'oral' }));
  const { MARKER_NAMES } = require('../lib/markerNames');
  const labs = MARKER_NAMES.slice(0, 40).map((r, i) => ({ id: 500 + i, marker: r[0], value: i, unit: 'x', report_date: '2026-01-01' }));
  const vax = Array.from({ length: 20 }, (_, i) => ({ id: 900 + i, name: `Vacina ${i}` }));
  for (const l of LANGS) {
    const t = tFor(l);
    const idx = S.buildPlaceIndex({ translations: tr, language: l, flags: FLAGS_ALL, protocols: REC.protocolEntries(protocols, { translations: tr, t }), records: REC.markerRecords(labs, l).concat(REC.vaccineRecords(vax)) });
    const ts = TX.makeTextSearch(TX.buildTextIndex(t, 'ios'));
    const word = 'excluir dados privacidade';
    let worst = 0;
    for (let n = 1; n <= word.length; n++) {
      const q = word.slice(0, n);
      const t0 = process.hrtime.bigint();
      S.searchPlaces(idx, q); ts(q);
      worst = Math.max(worst, Number(process.hrtime.bigint() - t0) / 1e6);
    }
    assert.ok(worst < 50, `${l}: worst keystroke ${worst.toFixed(1)} ms`);
  }
});

test('AS-14: the search modules are offline and private (no network, no storage, no analytics)', () => {
  for (const f of ['lib/appSearch.js', 'lib/appSearchCatalog.js', 'lib/appSearchText.js', 'lib/appSearchRecords.js', 'lib/appSearchNav.js', 'screens/AppSearchScreen.js']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\/.*$/gm, '');
    for (const bad of [/\bfetch\(/, /supabase/, /AsyncStorage/, /\bAnalytics\b/, /lib\/analytics|\.\/analytics'/, /XMLHttpRequest/, /SecureStore/, /setItem\(/]) assert.doesNotMatch(s, bad, `${f}: ${bad}`);
  }
});
