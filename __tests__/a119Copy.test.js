'use strict';
// A-119 OD-12 (and OD-2, OD-6, OD-9): the new texts are the approved ones (pt / en as drawn in
// docs/design/a119-one-active-device.html and a119-more-texts.html), every language has every key,
// nothing is left unfilled, dates and times follow the app language and this phone's time zone.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../lib/deviceCopy');

function loadTranslations() {
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const T = loadTranslations();
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const tOf = (l) => (k) => T[l][k] || T.en[k] || k;
const NOW = new Date(2026, 9, 15, 9, 41);
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi).toISOString();
const iPhone = { platform: 'ios', name: 'iPhone', brand: null };
const body = (sheet) => sheet.body;

test('OD-12: every A-119 key exists in all 6 languages', () => {
  const keys = Object.keys(T.en).filter((k) => /^(dev_|so_)/.test(k));
  assert.ok(keys.length >= 50, `found ${keys.length}`);
  for (const l of LANGS) for (const k of keys) assert.ok(typeof T[l][k] === 'string' && T[l][k].length > 0, `${l}.${k}`);
});

test('Screen 1 / 1b (pt, en): exactly as approved', () => {
  const n = { device: iPhone, lastSentAt: at(2026, 10, 14, 21, 32), own: null };
  const pt = C.noticeSheet({ t: tOf('pt'), language: 'pt', timeFormat: 'auto', notice: n, now: NOW });
  assert.equal(pt.title, 'Sua conta estava em outro aparelho');
  assert.equal(body(pt), 'Até 14 de out. às 21:32, tudo o que estava no iPhone tinha backup. O que foi registrado nele depois disso, sem internet, pode não estar aqui.\n\nAgora sua conta fica só neste celular. O iPhone sai da conta quando voltar a ficar online.');
  assert.equal(pt.buttons[0].label, 'Entendi');
  assert.equal(pt.icon, undefined, 'no icon: nothing went wrong');
  const en = C.noticeSheet({ t: tOf('en'), language: 'en', timeFormat: 'auto', notice: n, now: NOW });
  assert.equal(en.title, 'Your account was on another device');
  assert.equal(body(en), 'Everything on the iPhone was backed up as of Oct 14 at 9:32 PM. Anything recorded on it after that without internet may not be here.\n\nYour account is now only on this phone. The iPhone signs out when it\'s back online.');
  const pt1b = C.noticeSheet({ t: tOf('pt'), language: 'pt', notice: { ...n, lastSentAt: null }, now: NOW });
  assert.equal(body(pt1b), 'O iPhone não chegou a fazer backup de nada. O que foi registrado nele pode não estar aqui.\n\nAgora sua conta fica só neste celular. O iPhone sai da conta quando voltar a ficar online.');
  const en1b = C.noticeSheet({ t: tOf('en'), language: 'en', notice: { ...n, lastSentAt: null }, now: NOW });
  assert.equal(body(en1b), 'The iPhone never backed anything up. Anything recorded on it may not be here.\n\nYour account is now only on this phone. The iPhone signs out when it\'s back online.');
});

test('More texts 1: the phone that takes over had unsent changes (pt, en), with the triangle', () => {
  const n = { device: iPhone, lastSentAt: at(2026, 10, 14, 21, 32), own: { count: 3, byKind: { dose: 2, weighIn: 1 }, from: '2026-10-10', to: '2026-10-11', refused: 0 } };
  const pt = C.noticeSheet({ t: tOf('pt'), language: 'pt', notice: n, now: NOW });
  assert.equal(pt.icon, 'warning');
  assert.ok(body(pt).endsWith('\n\nFicaram de fora, porque ainda não tinham backup: 2 doses e 1 pesagem deste celular, de 10 a 11 de out. Elas não estão na sua conta — se precisar, registre de novo aqui.'), body(pt));
  const en = C.noticeSheet({ t: tOf('en'), language: 'en', notice: n, now: NOW });
  assert.ok(body(en).endsWith('\n\nLeft out because they weren\'t backed up yet: 2 doses and 1 weigh-in from this phone, Oct 10 to 11. They\'re not in your account — if you need them, log them again here.'), body(en));
});

test('Screen 2 / 2b and more-texts 4 (pt, en): the replaced phone, locked, with the triangle', () => {
  const v = { kind: 'replaced', at: at(2026, 10, 15, 9, 10), summary: { count: 0, byKind: {}, from: null, to: null, refused: 0 } };
  const pt = C.verdictSheet({ t: tOf('pt'), language: 'pt', verdict: v, now: NOW });
  assert.equal(pt.title, 'Sua conta foi aberta em outro aparelho');
  assert.equal(body(pt), 'Isso aconteceu em 15 de out. às 9:10. Como a conta fica em um aparelho por vez, você vai sair dela neste celular e os dados do DoseTrace serão apagados daqui. Tudo o que já tinha backup continua na sua conta.');
  assert.equal(pt.locked, true);
  assert.equal(pt.icon, 'warning');
  assert.equal(pt.buttons[0].label, 'Continuar');
  const en = C.verdictSheet({ t: tOf('en'), language: 'en', verdict: v, now: NOW });
  assert.equal(body(en), 'That happened on Oct 15 at 9:10 AM. Your account stays on one device at a time, so you\'ll be signed out on this phone and its DoseTrace data will be removed. Everything that was backed up stays in your account.');
  const v2 = { ...v, summary: { count: 4, byKind: { dose: 3, weighIn: 1 }, from: '2026-10-12', to: '2026-10-14', refused: 0 } };
  const v2b = C.verdictSheet({ t: tOf('pt'), language: 'pt', verdict: { ...v2, summary: { ...v2.summary, count: 4, byKind: { dose: 3, weighIn: 1 } } }, now: NOW });
  assert.ok(body(v2b).endsWith('\n\nAinda não tinham backup e não estão na sua conta: 3 doses e 1 pesagem, de 12 a 14 de out. Isso será apagado junto com o resto — se precisar, registre de novo no outro aparelho.'), body(v2b));
  const en2b = C.verdictSheet({ t: tOf('en'), language: 'en', verdict: v2, now: NOW });
  assert.ok(body(en2b).endsWith('\n\nNot backed up yet and not in your account: 3 doses and 1 weigh-in from Oct 12 to 14. This is removed with the rest — if you need it, log it again on the other device.'));
  const v4 = { ...v, summary: { count: 6, byKind: { dose: 2, weighIn: 1, food: 3 }, from: '2026-10-12', to: '2026-10-14', refused: 0 } };
  assert.ok(body(C.verdictSheet({ t: tOf('pt'), language: 'pt', verdict: v4, now: NOW })).includes('não estão na sua conta: 2 doses, 1 pesagem e 3 itens de comida, de 12 a 14 de out.'));
  assert.ok(body(C.verdictSheet({ t: tOf('en'), language: 'en', verdict: v4, now: NOW })).includes('not in your account: 2 doses, 1 weigh-in and 3 food items from Oct 12 to 14.'));
});

test('More texts 2: the account deleted on another device (pt, en): its own message, no triangle, locked', () => {
  const pt = C.verdictSheet({ t: tOf('pt'), language: 'pt', verdict: { kind: 'gone' } });
  assert.equal(pt.title, 'Sua conta foi excluída');
  assert.equal(body(pt), 'Ela foi excluída em outro aparelho, com todos os dados dela. Por isso você vai sair da conta neste celular, e os dados do DoseTrace serão apagados daqui.');
  assert.equal(pt.icon, undefined);
  assert.equal(pt.locked, true);
  const en = C.verdictSheet({ t: tOf('en'), language: 'en', verdict: { kind: 'gone' } });
  assert.equal(body(en), 'It was deleted on another device, with all its data. So you\'ll be signed out on this phone, and DoseTrace\'s data will be removed from it.');
});

test('Screen 4 (pt, en): Use here / Sign out of this phone, locked, no icon', () => {
  const pt = C.askSheet({ t: tOf('pt'), ask: { device: iPhone } });
  assert.equal(pt.title, 'Usar sua conta neste celular?');
  assert.equal(body(pt), 'Ela está em uso no iPhone, e a conta fica em um aparelho por vez.\n\nUsar aqui: este celular passa a ser o da sua conta, com o que está nela, e o iPhone sai da conta quando voltar a ficar online.\n\nSair deste celular: você sai da conta aqui e os dados do DoseTrace são apagados deste celular. No iPhone, nada muda.');
  assert.deepEqual(pt.buttons.map((b) => [b.label, b.kind]), [['Sair deste celular', 'secondary'], ['Usar aqui', 'primary']]);
  assert.equal(pt.locked, true);
  const en = C.askSheet({ t: tOf('en'), ask: { device: iPhone } });
  assert.equal(body(en), 'It\'s in use on the iPhone, and your account stays on one device at a time.\n\nUse here: this phone becomes your account\'s phone, with what\'s in your account, and the iPhone signs out when it\'s back online.\n\nSign out of this phone: you\'re signed out here and DoseTrace\'s data is removed from this phone. Nothing changes on the iPhone.');
});

test('Screens 3 / 3b / 5a / 5b (pt, en): sign-out never blocked, the truth, and the last full backup', () => {
  const s3 = { count: 3, byKind: { dose: 2, weighIn: 1 }, from: '2026-10-12', to: '2026-10-14', refused: 0 };
  const last = at(2026, 10, 14, 21, 32);
  const pt3 = C.signOutSheet({ t: tOf('pt'), language: 'pt', offline: true, summary: s3, lastBackup: last, now: NOW });
  assert.equal(pt3.title, 'Alterações ainda sem backup');
  assert.equal(body(pt3), 'Este celular está sem internet.\n\n3 alterações ainda não estão na sua conta: 2 doses e 1 pesagem, de 12 a 14 de out. Se você sair agora, elas serão apagadas deste celular.\n\nÚltimo backup completo deste celular: 14 de out. às 21:32.\n\nSe você está trocando de celular, também pode só entrar na sua conta no novo. Este celular sai da conta sozinho quando voltar a ficar online, e o que não teve backup não vai estar lá.');
  assert.deepEqual(pt3.buttons.map((b) => [b.label, b.kind]), [['Conectar à internet primeiro', 'secondary'], ['Sair mesmo assim', 'danger']]);
  const en3 = C.signOutSheet({ t: tOf('en'), language: 'en', offline: true, summary: s3, lastBackup: last, now: NOW });
  assert.equal(body(en3), 'This phone has no internet connection.\n\n3 changes aren\'t in your account yet: 2 doses and 1 weigh-in from Oct 12 to 14. Signing out now removes them from this phone.\n\nLast full backup of this phone: Oct 14 at 9:32 PM.\n\nIf you\'re switching phones, you can also just sign in on the new one. This phone signs out by itself when it\'s back online, and what wasn\'t backed up won\'t be there.');
  assert.deepEqual(en3.buttons.map((b) => b.label), ['Connect to the internet first', 'Sign out anyway']);
  const s3b = { count: 4, byKind: { dose: 3, weighIn: 1 }, from: '2026-10-12', to: '2026-10-14', refused: 1 };
  const pt3b = C.signOutSheet({ t: tOf('pt'), language: 'pt', offline: false, summary: s3b, lastBackup: last, now: NOW });
  assert.ok(body(pt3b).startsWith('Este celular está conectado, mas o backup não chegou a ser concluído.\n\n4 alterações ainda não estão na sua conta: 3 doses e 1 pesagem, de 12 a 14 de out. Uma delas é de um protocolo excluído para sempre em outro aparelho e não pode mais ser salva. Se você sair agora, elas serão apagadas deste celular.'), body(pt3b));
  assert.deepEqual(pt3b.buttons.map((b) => b.label), ['Continuar conectado', 'Sair mesmo assim']);
  const en3b = C.signOutSheet({ t: tOf('en'), language: 'en', offline: false, summary: s3b, lastBackup: last, now: NOW });
  assert.ok(body(en3b).startsWith('This phone is connected, but the backup didn\'t finish.\n\n4 changes aren\'t in your account yet: 3 doses and 1 weigh-in from Oct 12 to 14. One of them belongs to a protocol deleted forever on another device and can no longer be saved. Signing out now removes them from this phone.'));
  const s4 = { count: 4, byKind: { vaccine: 1, vial: 1, protocol: 2 }, from: '2026-10-12', to: '2026-10-14', refused: 0 };
  assert.ok(body(C.signOutSheet({ t: tOf('pt'), language: 'pt', offline: true, summary: s4, lastBackup: last, now: NOW })).includes('4 alterações ainda não estão na sua conta: 1 vacina, 1 frasco e 2 alterações de protocolo, de 12 a 14 de out.'));
  assert.ok(body(C.signOutSheet({ t: tOf('en'), language: 'en', offline: true, summary: s4, lastBackup: last, now: NOW })).includes('4 changes aren\'t in your account yet: 1 vaccine, 1 vial and 2 protocol changes from Oct 12 to 14.'));
  // 5a: never a full backup.
  const pt5a = C.signOutSheet({ t: tOf('pt'), language: 'pt', offline: true, summary: s3, lastBackup: null, now: NOW });
  assert.ok(body(pt5a).includes('\n\nEste celular ainda não fez nenhum backup completo.\n\n'));
  assert.ok(body(C.signOutSheet({ t: tOf('en'), language: 'en', offline: true, summary: s3, lastBackup: null, now: NOW })).includes('\n\nThis phone hasn\'t completed a backup yet.\n\n'));
  // 5b: could not count.
  const pt5b = C.signOutSheet({ t: tOf('pt'), language: 'pt', offline: true, summary: null, lastBackup: last, now: NOW });
  assert.equal(pt5b.title, 'Não foi possível conferir o backup');
  assert.equal(body(pt5b), 'Este celular está sem internet.\n\nO app não conseguiu contar o que ainda não tem backup neste celular. Se você sair agora, o que não teve backup será apagado daqui.\n\nÚltimo backup completo deste celular: 14 de out. às 21:32.\n\nSe você está trocando de celular, também pode só entrar na sua conta no novo. Este celular sai da conta sozinho quando voltar a ficar online, e o que não teve backup não vai estar lá.');
  const en5b = C.signOutSheet({ t: tOf('en'), language: 'en', offline: true, summary: null, lastBackup: last, now: NOW });
  assert.equal(en5b.title, 'Couldn\'t check the backup');
  assert.ok(body(en5b).startsWith('This phone has no internet connection.\n\nThe app couldn\'t count what isn\'t backed up on this phone yet. Signing out now removes whatever wasn\'t backed up from this phone.'));
});

test('OD-12: in every language every sheet is fully filled (no braces, no "undefined"), for every kind of device and every kind of change', () => {
  const devices = [iPhone, { platform: 'ios', name: 'iPad' }, { platform: 'android', name: 'Galaxy Z Fold7' }, { platform: 'android', brand: 'samsung' }, { platform: 'android' }, null];
  const allKinds = { dose: 2, weighIn: 1, food: 3, lab: 1, vaccine: 1, vial: 2, protocol: 1, target: 1, result: 1, calc: 1 };
  const sums = [
    { count: 1, byKind: { dose: 1 }, from: '2026-10-08', to: '2026-10-08', refused: 1 },
    { count: 14, byKind: allKinds, from: '2026-09-30', to: '2026-10-11', refused: 2 },
    { count: 2, byKind: { protocol: 1, target: 1 }, from: null, to: null, refused: 0 },
    { count: 3, byKind: { dose: 3 }, from: '2025-12-30', to: '2026-01-02', refused: 0 },
  ];
  for (const l of LANGS) {
    const t = tOf(l);
    const check = (sheet, what) => {
      const all = [sheet.title, sheet.body, ...sheet.buttons.map((b) => b.label)].join('\n');
      assert.ok(!/[{}]|\bundefined\b|\bnull\b|\bNaN\b/.test(all), `${l} ${what}: ${all}`);
      for (const k of Object.keys(T.en)) if (/^(dev_|so_)/.test(k)) assert.ok(!all.includes(k), `${l} ${what}: raw key ${k}`);
    };
    for (const dv of devices) {
      check(C.noticeSheet({ t, language: l, notice: { device: dv, lastSentAt: at(2026, 10, 8, 8, 5), own: sums[0] }, now: NOW }), 'notice');
      check(C.noticeSheet({ t, language: l, notice: { device: dv, lastSentAt: null, own: null }, now: NOW }), 'notice 1b');
      check(C.askSheet({ t, ask: { device: dv } }), 'ask');
    }
    for (const s of sums) {
      check(C.verdictSheet({ t, language: l, verdict: { kind: 'replaced', at: at(2026, 10, 11, 8, 0), summary: s }, now: NOW }), 'replaced');
      check(C.signOutSheet({ t, language: l, offline: false, summary: s, lastBackup: at(2026, 10, 1, 7, 0), now: NOW }), 'signout');
      check(C.noticeSheet({ t, language: l, notice: { device: iPhone, lastSentAt: null, own: s }, now: NOW }), 'notice own');
    }
    assert.equal(C.verdictSheet({ t, language: l, verdict: { kind: 'replaced', at: null, summary: null, unknown: true }, now: NOW }), null, 'never a wipe without a count');
    check(C.verdictSheet({ t, language: l, verdict: { kind: 'replaced', at: null, summary: sums[1] }, now: NOW }), 'replaced no date');
    for (const s of sums) check(C.askSheet({ t, language: l, ask: { device: iPhone, summary: s }, now: NOW }), 'ask with count');
    check(C.askSheet({ t, language: l, ask: { device: iPhone, summary: null, unknown: true }, now: NOW }), 'ask count unknown');
    check(C.verdictSheet({ t, language: l, verdict: { kind: 'gone' } }), 'gone');
    check(C.signOutSheet({ t, language: l, offline: true, summary: null, lastBackup: null, now: NOW }), 'signout unknown');
  }
});

test('Ledger "name the other phone truthfully": Android by name, else brand ("seu Samsung"), else "celular Android", nothing known "seu outro aparelho"; never a model code', () => {
  const t = tOf('pt');
  const b = (dv) => body(C.askSheet({ t, ask: { device: dv } })).split('\n')[0];
  assert.equal(b({ platform: 'android', name: 'Galaxy Z Fold7' }), 'Ela está em uso no Galaxy Z Fold7, e a conta fica em um aparelho por vez.');
  assert.equal(b({ platform: 'android', brand: 'samsung' }), 'Ela está em uso no seu Samsung, e a conta fica em um aparelho por vez.');
  assert.equal(b({ platform: 'android', name: 'SM-F966U' }), 'Ela está em uso no celular Android, e a conta fica em um aparelho por vez.');
  assert.equal(b(null), 'Ela está em uso no seu outro aparelho, e a conta fica em um aparelho por vez.');
  assert.equal(b({ platform: 'ios', name: 'iPad' }), 'Ela está em uso no iPad, e a conta fica em um aparelho por vez.');
});

test('Dates follow the app language: ranges, a single day, across months and years; Italian elision, French "1er"', () => {
  const n = new Date(2026, 9, 15);
  assert.equal(C.dayRange('pt', '2026-10-12', '2026-10-14', n), 'de 12 a 14 de out.');
  assert.equal(C.dayRange('en', '2026-10-12', '2026-10-14', n), 'Oct 12 to 14');
  assert.equal(C.dayRange('en', '2026-09-30', '2026-10-02', n), 'Sep 30 to Oct 2');
  assert.equal(C.dayRange('pt', '2026-10-12', '2026-10-12', n), 'de 12 de out.');
  assert.equal(C.dayRange('es', '2026-10-12', '2026-10-14', n), 'del 12 al 14 de oct');
  assert.equal(C.dayRange('de', '2026-10-12', '2026-10-14', n), 'vom 12. bis 14. Okt.');
  assert.equal(C.dayRange('fr', '2026-10-01', '2026-10-04', n), 'du 1er au 4 oct.');
  assert.equal(C.dayRange('it', '2026-10-08', '2026-10-11', n), "dall'8 all'11 ott");
  assert.equal(C.dayRange('en', '2025-12-30', '2026-01-02', n), 'Dec 30, 2025 to Jan 2, 2026');
  assert.equal(C.dayRange('pt', null, null, n), '');
});
