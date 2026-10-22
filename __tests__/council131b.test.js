'use strict';
// DT Council pre-build fixes for 1.3.1 (2026-10-22), A-163 team messages. Written BEFORE the code
// (CLAUDE.md evolution rule 1): every test here failed first.
//   1. the team message sheet can never trap the person (max height, scrolling text, button pinned)
//   2. the team messages list shows one line when it is empty
//   3. a tap on a message that no longer exists opens the list, never a silent Today
//   4. privacy policy section 4 names the team messages (founder-approved text, 6 languages)
//   5. "Download my data" includes the team messages
//   6. the account language is written on start only when missing; always on a change
//   7. no second foreground throttle in the Today gate (lib/teamMessages throttles)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel) => read(rel).split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';

// The JSX of one exported function (up to the next top-level "export function" / "function").
function fnBody(src, name) {
  const i = src.indexOf(`export function ${name}(`);
  assert.ok(i >= 0, name);
  const rest = src.slice(i + 10);
  const j = rest.search(/\n(export )?function /);
  return src.slice(i, j < 0 ? undefined : i + 10 + j);
}

// ── 1. the sheet never traps ─────────────────────────────────────────────────────────────────

test('council 1: DTSheet takes an opt-in maxHeight; with it the text scrolls and the buttons stay pinned below the scroll', () => {
  const sheet = fnBody(code('screens/components/ProtocolParts.js'), 'DTSheet');
  assert.match(sheet, /export function DTSheet\(\{ config, onClose, maxHeight \}\)/);
  assert.match(sheet, /maxHeight \? \{ maxHeight \} : null/, 'the sheet itself gets the max height');
  const open = sheet.indexOf('<ScrollView');
  const close = sheet.indexOf('</ScrollView>');
  assert.ok(open > 0 && close > open, 'a ScrollView inside the sheet');
  const inside = sheet.slice(open, close);
  assert.match(inside, /\{content\}/, 'the title, text and hint scroll');
  const btns = sheet.indexOf('ordered.map(');
  assert.ok(btns > 0, 'buttons found');
  assert.ok(!(btns > open && btns < close), 'the buttons are never inside the ScrollView');
  assert.ok(sheet.indexOf('{actions}') > close, 'the buttons come after the scroll (always visible)');
  // without maxHeight nothing changes for every other sheet: the content is drawn as before
  assert.match(sheet, /\{maxHeight \? \([\s\S]*?<ScrollView[\s\S]*?\) : content\}/);
});

test('council 1: only the team message sheet opts in, at 85% of the measured window height', () => {
  const gate = code('components/TeamMessageGate.js');
  assert.match(gate, /import \{ useWindowSize \} from '\.\.\/lib\/windowSize';/);
  assert.match(gate, /const \{ height: winH \} = useWindowSize\(\);/);
  assert.match(gate, /<DTSheet config=\{config\} onClose=\{onButton\} maxHeight=\{Math\.round\(winH \* 0\.85\)\} \/>/);
  assert.match(gate, /locked: true/, 'still locked: the button is the way out, and it is always on screen');
});

// ── 2. empty list ────────────────────────────────────────────────────────────────────────────

test('council 2: listFor gives the account\'s list and whether it was read (no empty line before the first read)', () => {
  const { listFor } = require('../lib/teamMessages');
  const m = { id: 'm1', body: 'x', created_at: '2026-10-22T10:00:00Z', read_at: null };
  assert.deepEqual(listFor({ uid: A, list: [m], loaded: true }, A), { list: [m], loaded: true });
  assert.deepEqual(listFor({ uid: A, list: [], loaded: true }, A), { list: [], loaded: true });
  assert.deepEqual(listFor({ uid: A, list: [m], loaded: false }, A), { list: [m], loaded: false });
  assert.deepEqual(listFor({ uid: B, list: [m], loaded: true }, A), { list: [], loaded: false }, 'another account: nothing, not "empty"');
  assert.deepEqual(listFor({ uid: A, list: [m], loaded: true }, null), { list: [], loaded: false });
});

test('council 2: the list screen shows one ink3 line when the account has no message left', () => {
  const scr = code('screens/TeamMessagesScreen.js');
  assert.match(scr, /const \{ list, loaded \} = useTeamMessageList\(userId\);/);
  assert.match(scr, /\{loaded && !list\.length \? \(\s*<Text style=\{s\.empty\}>\{t\('team_msgs_empty'\)\}<\/Text>/);
  assert.match(scr, /empty: \{[^}]*color: c\.ink3/);
  const hook = code('lib/useTeamMessages.js');
  assert.match(hook, /export function useTeamMessageList\(userId\)/);
  assert.match(hook, /listFor\(snap, userId\)/);
});

test('council 2: "No messages." reads natively in the 6 languages (formal Portuguese)', () => {
  const { translations: tr } = require('../i18n/translations');
  const WANT = { en: 'No messages.', es: 'No hay mensajes.', pt: 'Nenhuma mensagem.', fr: 'Aucun message.', de: 'Keine Nachrichten.', it: 'Nessun messaggio.' };
  for (const l of LANGS) assert.equal(tr[l].team_msgs_empty, WANT[l], l);
});

// ── 3. a tap on a message that is gone ───────────────────────────────────────────────────────

test('council 3: tapOutcome — the tapped message (or other unread) → the sheet; gone after a real read → the list; not read yet → nothing', () => {
  const { tapOutcome } = require('../lib/teamMessages');
  const m = (id, read_at = null) => ({ id, body: 'x', created_at: '2026-10-22T10:00:00Z', read_at });
  assert.equal(tapOutcome({ list: [m('m1')] }, { id: 'm1', fetched: true }), 'sheet');
  assert.equal(tapOutcome({ list: [m('m1', '2026-10-22T11:00:00Z')] }, { id: 'm1', fetched: true }), 'sheet', 'read on the other phone: the tap still asked for it');
  assert.equal(tapOutcome({ list: [] }, { id: 'gone', fetched: true }), 'list', 'withdrawn: the list (its empty line), never a silent Today');
  assert.equal(tapOutcome({ list: [m('m2', '2026-10-22T11:00:00Z')] }, { id: 'gone', fetched: true }), 'list');
  assert.equal(tapOutcome({ list: [m('m2')] }, { id: 'gone', fetched: true }), 'sheet', 'another unread message is shown instead');
  assert.equal(tapOutcome({ list: [] }, { id: 'gone', fetched: false }), 'none', 'offline: it cannot say the message is gone; it shows on the next open that can read it');
  assert.equal(tapOutcome({ list: [] }, null), 'none');
  assert.equal(tapOutcome({ list: [m('m1')] }, null), 'sheet');
  assert.equal(tapOutcome({ list: [] }, { id: null, fetched: true }), 'none', 'a push with no id: as before');
});

test('council 3: the Today gate opens the list for a gone message, only when the sheet itself could open (never over a dose being logged)', () => {
  const gate = code('components/TeamMessageGate.js');
  assert.match(gate, /import \{ useNavigation, useFocusEffect \} from '@react-navigation\/native';/);
  assert.match(gate, /tapOutcome\(tm\.snapshot\(\), tapRef\.current\)/);
  const tryOpen = gate.slice(gate.indexOf('const tryOpen'), gate.indexOf('const refreshThenTry'));
  const wait = tryOpen.indexOf('teamSheetMayOpen(');
  const nav = tryOpen.indexOf("navigation.navigate('TeamMessages')");
  assert.ok(wait > 0 && nav > wait, 'the list opens only after the same wait rules as the sheet');
  assert.match(tryOpen, /if \(tap && !tap\.settled\) return;/, 'nothing is decided before the tap\'s own read');
  assert.match(gate, /tap\.fetched = tap\.fetched \|\| !!\(r && r\.ok && !r\.cached\)/, '"gone" only after a real read of the server');
});

// ── 4. privacy policy ────────────────────────────────────────────────────────────────────────

const PARA = {
  en: 'Messages from the DoseTrace team. We may send your account a short message about your account or support (for example, that your Premium access was unlocked or that a problem you reported was fixed). It arrives as a notification, unless notifications are off or Silent mode is on, and it is also shown inside the app, in Settings › Support › Team messages. We never use these messages for health, dose, or treatment advice. The messages are stored with your account and deleted when you delete it; we also record when each one was sent, to how many devices, and when you read it. To write the notification title in your language, the app saves your app language with your account.',
  pt: 'Mensagens da equipe DoseTrace. Podemos enviar à sua conta uma mensagem curta sobre a conta ou o suporte (por exemplo, que o seu acesso Premium foi liberado ou que um problema relatado por você foi corrigido). Ela chega como notificação, a menos que as notificações estejam desativadas ou o Modo silencioso esteja ligado, e também aparece dentro do app, em Ajustes › Suporte › Mensagens da equipe. Nunca usamos essas mensagens para orientação de saúde, dose ou tratamento. As mensagens ficam guardadas com a sua conta e são apagadas quando você exclui a conta; registramos também quando cada uma foi enviada, para quantos aparelhos e quando foi lida. Para escrever o título da notificação no seu idioma, o app guarda o idioma escolhido junto com a sua conta.',
  es: 'Mensajes del equipo de DoseTrace. Podemos enviar a tu cuenta un mensaje breve sobre la cuenta o el soporte (por ejemplo, que se activó tu acceso Premium o que se corrigió un problema que nos informaste). Llega como notificación, salvo que tengas las notificaciones desactivadas o el modo silencioso activado, y también aparece dentro de la app, en Ajustes › Soporte › Mensajes del equipo. Nunca usamos estos mensajes para dar orientación sobre salud, dosis o tratamientos. Los mensajes se guardan con tu cuenta y se eliminan cuando la eliminas; también registramos cuándo se envió cada uno, a cuántos dispositivos y cuándo lo leíste. Para escribir el título de la notificación en tu idioma, la app guarda con tu cuenta el idioma que elegiste.',
  fr: 'Messages de l\'équipe DoseTrace. Nous pouvons envoyer à votre compte un court message concernant votre compte ou l\'assistance (par exemple, pour vous dire que votre accès Premium a été activé ou qu\'un problème que vous avez signalé a été corrigé). Il arrive sous forme de notification, sauf si les notifications sont désactivées ou le mode silencieux activé, et il s\'affiche aussi dans l\'app, dans Paramètres › Support › Messages de l\'équipe. Nous n\'utilisons jamais ces messages pour donner des conseils de santé, de dose ou de traitement. Les messages sont conservés avec votre compte et supprimés lorsque vous le supprimez ; nous gardons aussi la trace de la date d\'envoi de chaque message, du nombre d\'appareils et de la date de lecture. Pour écrire le titre de la notification dans votre langue, l\'app enregistre la langue choisie avec votre compte.',
  de: 'Nachrichten vom DoseTrace-Team. Wir können deinem Konto eine kurze Nachricht zu deinem Konto oder zum Support schicken (zum Beispiel, dass dein Premium-Zugang freigeschaltet wurde oder dass ein von dir gemeldetes Problem behoben ist). Sie kommt als Benachrichtigung an, außer wenn Benachrichtigungen ausgeschaltet sind oder der „Stille Modus“ aktiv ist, und sie erscheint auch in der App unter Einstellungen › Support › Nachrichten vom Team. Wir nutzen diese Nachrichten nie für Gesundheits-, Dosis- oder Behandlungsempfehlungen. Die Nachrichten werden mit deinem Konto gespeichert und gelöscht, wenn du dein Konto löschst; außerdem halten wir fest, wann jede Nachricht gesendet wurde, an wie viele Geräte und wann du sie gelesen hast. Damit der Titel der Benachrichtigung in deiner Sprache erscheint, speichert die App die gewählte Sprache zu deinem Konto.',
  it: 'Messaggi dal team di DoseTrace. Possiamo inviare al tuo account un breve messaggio sull\'account o sull\'assistenza (per esempio, che il tuo accesso Premium è stato attivato o che un problema che ci hai segnalato è stato risolto). Arriva come notifica, a meno che le notifiche siano disattivate o la Modalità silenziosa sia attiva, e compare anche nell\'app, in Impostazioni › Supporto › Messaggi del team. Non usiamo mai questi messaggi per dare indicazioni su salute, dosi o trattamenti. I messaggi vengono conservati con il tuo account e cancellati quando elimini l\'account; registriamo anche quando è stato inviato ciascun messaggio, a quanti dispositivi e quando l\'hai letto. Per scrivere il titolo della notifica nella tua lingua, l\'app salva con il tuo account la lingua scelta.',
};
const DATE = {
  en: 'Last updated: October 22, 2026', es: 'Última actualización: 22 de octubre de 2026', pt: 'Última atualização: 22 de outubro de 2026',
  fr: 'Dernière mise à jour : 22 octobre 2026', de: 'Zuletzt aktualisiert: 22. Oktober 2026', it: 'Ultimo aggiornamento: 22 ottobre 2026',
};
const section = (body, n) => {
  const parts = body.split('\n\n');
  const i = parts.findIndex((x) => x.startsWith(`${n}. `));
  const j = parts.findIndex((x, k) => k > i && x.startsWith(`${n + 1}. `));
  return parts.slice(i + 1, j);
};

test('council 4: section 4 of the in-app policy ends with the approved team-messages paragraph, in each language', () => {
  const { translations: tr } = require('../i18n/translations');
  for (const l of LANGS) {
    const s4 = section(tr[l].settings_privacy_body, 4);
    assert.equal(s4[s4.length - 1], PARA[l], `${l}: the last paragraph of section 4`);
    assert.equal(tr[l].settings_privacy_body.split(PARA[l]).length, 2, `${l}: once`);
  }
});

test('council 4: "Last updated" is October 22, 2026 in each language\'s own format (app and the website copies)', () => {
  const { translations: tr } = require('../i18n/translations');
  for (const l of LANGS) assert.equal(tr[l].settings_privacy_body.split('\n\n')[1], DATE[l], l);
  assert.match(read('docs/legal/privacy-policy-2026-10.md'), /^Last updated: October 22, 2026$/m);
  assert.match(read('docs/legal/privacy-policy-2026-10.pt.md'), /^Última atualização: 22 de outubro de 2026$/m);
});

test('council 4: the paragraph names the app\'s real Settings › Support › Team messages path and Silent mode label', () => {
  const { translations: tr } = require('../i18n/translations');
  for (const l of LANGS) {
    const p = PARA[l];
    assert.ok(p.includes(`${tr[l].tab_settings} › ${tr[l].settings_support} › ${tr[l].settings_team_messages}`), `${l}: menu path`);
    // German declines the label after "der" (Stiller Modus → der Stille Modus); compare the stem
    const silent = tr[l].settings_silent.toLowerCase().replace(/^stiller /, 'stille ');
    assert.ok(p.toLowerCase().includes(silent), `${l}: Silent mode label "${tr[l].settings_silent}"`);
  }
});

// ── 5. Download my data ──────────────────────────────────────────────────────────────────────

test('council 5: exportRows keeps id, body, created_at and read_at of each message', () => {
  const { exportRows } = require('../lib/teamMessages');
  assert.deepEqual(
    exportRows([{ id: 'm1', body: 'Premium on', created_at: '2026-10-22T10:00:00Z', read_at: null, extra: 1 }]),
    [{ id: 'm1', body: 'Premium on', created_at: '2026-10-22T10:00:00Z', read_at: null }],
  );
  assert.deepEqual(exportRows(null), []);
});

test('council 5: exportList reads the account\'s local copy (memory when loaded, else the kept copy), never another account\'s', async () => {
  const { createTeamMessages, storageKey } = require('../lib/teamMessages');
  const store = new Map();
  store.set(storageKey(A), JSON.stringify({ list: [{ id: 'k1', body: 'kept', created_at: '2026-10-21T10:00:00Z', read_at: '2026-10-21T11:00:00Z' }], pending: {} }));
  const deps = {
    storage: { getItem: async (k) => store.get(k) ?? null, setItem: async (k, v) => { store.set(k, v); }, getAllKeys: async () => [...store.keys()], multiRemove: async (ks) => ks.forEach((k) => store.delete(k)) },
    getUserId: async () => A,
    fetchRows: async () => ({ data: [{ id: 'm1', user_id: A, body: 'fresh', created_at: '2026-10-22T10:00:00Z', read_at: null }], error: null }),
    markReadRemote: async () => ({ data: null, error: null }),
  };
  const tm = createTeamMessages(deps);
  assert.deepEqual(await tm.exportList(A), [{ id: 'k1', body: 'kept', created_at: '2026-10-21T10:00:00Z', read_at: '2026-10-21T11:00:00Z' }], 'not loaded yet: the kept copy');
  await tm.refresh();
  assert.deepEqual((await tm.exportList(A)).map((m) => m.id), ['m1'], 'loaded: the current list');
  assert.deepEqual(await tm.exportList(B), [], 'another account: nothing of A');
  assert.deepEqual(await tm.exportList(null), []);
});

test('council 5: "Download my data" (exportMyData) writes team_messages from the local copy', () => {
  const src = code('lib/accountActions.js');
  const fn = src.slice(src.indexOf('export async function exportMyData('), src.indexOf('export async function requestAccountDeletion('));
  assert.match(fn, /const teamMessagesRows = await teamMessagesForExport\(user\.id\);/);
  assert.match(fn, /team_messages: teamMessagesRows,/);
  assert.match(src, /import \{ teamMessagesForExport \} from '\.\/teamMessages';/);
  const tmSrc = code('lib/teamMessages.js');
  assert.match(tmSrc, /async function teamMessagesForExport\(uid\) \{\s*try \{ return await teamMessages\(\)\.exportList\(uid\); \} catch \{ return \[\]; \}/, 'never blocks the export');
});

// ── 6. account language ──────────────────────────────────────────────────────────────────────

test('council 6: on start the account language is written only when the account has none; a change always writes', async () => {
  const { syncAccountLanguage } = require('../lib/accountLanguage');
  const writes = [];
  const updateUser = async (p) => { writes.push(p); return { data: {}, error: null }; };
  const user = (lang) => ({ id: A, user_metadata: { silent_mode: true, ...(lang ? { language: lang } : {}) } });
  assert.equal(await syncAccountLanguage({ language: 'en', onlyIfMissing: true, getUser: async () => user('pt'), updateUser }), 'kept', 'the other phone set pt: start never overwrites it');
  assert.equal(writes.length, 0);
  assert.equal(await syncAccountLanguage({ language: 'en', onlyIfMissing: true, getUser: async () => user(null), updateUser }), 'written', 'missing: written on start');
  assert.equal(await syncAccountLanguage({ language: 'en', onlyIfMissing: true, getUser: async () => user('zz'), updateUser }), 'written', 'an unknown value counts as missing');
  assert.equal(await syncAccountLanguage({ language: 'en', getUser: async () => user('pt'), updateUser }), 'written', 'a change in Settings always writes');
  assert.deepEqual(writes, [{ data: { language: 'en' } }, { data: { language: 'en' } }, { data: { language: 'en' } }], 'only the language key (merge)');
});

test('council 6: languageSyncMode — the first run for an account is "start", a later language change for the same account is "change"', () => {
  const { languageSyncMode } = require('../lib/accountLanguage');
  assert.equal(languageSyncMode(null, A, 'pt'), 'start');
  assert.equal(languageSyncMode({ userId: A, language: 'pt' }, A, 'pt'), null, 'nothing changed');
  assert.equal(languageSyncMode({ userId: A, language: 'pt' }, A, 'en'), 'change');
  assert.equal(languageSyncMode({ userId: A, language: 'pt' }, B, 'pt'), 'start', 'another account signed in');
  assert.equal(languageSyncMode({ userId: null, language: 'pt' }, A, 'en'), 'start', 'a pick made before sign-in is not a change of this account');
});

test('council 6: AccountLanguageSync passes onlyIfMissing on start and remembers the last account + language', () => {
  const comp = code('components/AccountLanguageSync.js');
  assert.match(comp, /const lastRef = useRef\(null\);/);
  assert.match(comp, /const mode = languageSyncMode\(lastRef\.current, userId, language\);/);
  assert.match(comp, /onlyIfMissing: mode === 'start' && !owed,/);
  assert.match(comp, /owedAfter\(owedUid, userId, mode === 'change' \|\| owed, r\)/);
  assert.match(comp, /useEffect\([\s\S]*syncAccountLanguage[\s\S]*\[language, userId, ready\]/);
});

test('council 6: a change that failed offline is owed and written on the next start (never lost to the start rule)', () => {
  const { owedAfter } = require('../lib/accountLanguage');
  assert.equal(owedAfter(null, A, true, 'failed'), A, 'the change did not reach the account: owed');
  assert.equal(owedAfter(A, A, true, 'written'), null, 'written on the next start: cleared');
  assert.equal(owedAfter(A, A, true, 'same'), null);
  assert.equal(owedAfter(null, A, false, 'failed'), null, 'a start write that failed is simply tried again next start');
  assert.equal(owedAfter(B, A, false, 'kept'), B, 'another account\'s owed change stays for it');
  assert.equal(owedAfter(B, A, true, 'written'), B);
});

// ── 7. one throttle ──────────────────────────────────────────────────────────────────────────

test('council 7: the Today gate has no foreground throttle of its own; a return to the foreground asks the shared (throttled) refresh', () => {
  const gate = code('components/TeamMessageGate.js');
  assert.doesNotMatch(gate, /lastFgRef|FOREGROUND_GAP_MS/);
  assert.match(gate, /if \(s !== 'active' \|\| !focusedRef\.current\) return;\s*refreshThenTry\(\);/);
});
