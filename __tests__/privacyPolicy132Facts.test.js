'use strict';
// Privacy policy for 1.3.2 (2026-10-30): the policy says what the app does now, and the in-app text
// (settings_privacy_body x6), the website page (web/privacy-policy.html) and the legal copies
// (docs/legal en + pt) are one text (DL-81). Before this change the website page still had the
// 16 October text: no per-dose details, no Expo updates, no team messages, and "so that your other
// phones know it was deleted" (one device at a time, AD-77).
// Facts added, each checked in code:
//   - A-119: the phone identifier (Android ID / a random id in the iPhone keychain, lib/deviceIdentity.js),
//     the kind of phone, platform, app version and last seen (user_devices, claim_device), sent with each
//     request (lib/deviceId.js deviceHeaders); kept until the account is deleted (delete-user).
//   - the push token row: platform, time zone, app version, language, device id (lib/notifications.js
//     registerPushToken); removed on sign-out, when notifications are off (A-173) and on a takeover.
//   - Expo Updates: checked at each launch (app.json updates.checkAutomatically ON_LOAD), with the running
//     update and recently failed updates (expo-updates request headers).
//   - A-127: "What's new in DoseTrace" (user_metadata.version_news), one push per version, recorded in
//     app_release_pushes (supabase/functions/version-notice).
//   - protocol assistant counts older than 30 days deleted at the next use (protocol-assistant/index.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations: tr } = require('../i18n/translations.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const paras = (body) => body.split('\n\n').map((s) => s.trim()).filter(Boolean);

// The website page as plain paragraphs: h1 dropped, h2 headings upper-cased like the app's.
function webParas() {
  const html = read('web/privacy-policy.html');
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  const out = [];
  const re = /<(h2|p)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(main))) {
    let t = m[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    if (m[1] === 'h2') t = t.toUpperCase();
    out.push(t);
  }
  return out;
}
// A legal markdown copy as plain paragraphs (bold and "## " dropped, headings upper-cased).
function mdParas(md) {
  return paras(md.replace(/\*\*/g, '')).filter((p) => !p.startsWith('# ')).map((p) => (p.startsWith('## ') ? p.slice(3).toLocaleUpperCase() : p));
}

test('DL-81: the website page says exactly what the English in-app policy says', () => {
  const app = paras(tr.en.settings_privacy_body).slice(1); // the app opens on its own title
  assert.deepEqual(webParas(), app);
});

test('DL-81: the legal copies (en, pt) say exactly what the in-app policy says', () => {
  assert.deepEqual(mdParas(read('docs/legal/privacy-policy-2026-10.md')), paras(tr.en.settings_privacy_body).slice(1));
  const pt = read('docs/legal/privacy-policy-2026-10.pt.md').split('\n---\n').slice(1).join('\n---\n');
  assert.deepEqual(mdParas(pt).map((p) => p.toLocaleUpperCase('pt')), paras(tr.pt.settings_privacy_body).slice(1).map((p) => p.toLocaleUpperCase('pt')));
});

const section = (body, n) => {
  const p = paras(body);
  const i = p.findIndex((x) => x.startsWith(`${n}. `));
  const j = p.findIndex((x, k) => k > i && x.startsWith(`${n + 1}. `));
  return p.slice(i + 1, j).join('\n');
};

const FACTS = {
  en: { id: /identifier Android gives DoseTrace.*random identifier kept in the phone's keychain/, last: /when the phone was last seen/, each: /with each request to our server/, tz: /time zone/, off: /notifications for DoseTrace are turned off/, expo: /checks for an update each time it opens/, assist: /older than 30 days are deleted the next time you use it/, keep: /record of each phone you signed in on/ },
  es: { id: /identificador que Android asigna a DoseTrace.*llavero del teléfono/, last: /cuándo se vio el teléfono por última vez/, each: /con cada solicitud a nuestro servidor/, tz: /zona horaria/, off: /notificaciones de DoseTrace están desactivadas/, expo: /comprueba si hay una actualización cada vez que se abre/, assist: /más de 30 días se eliminan la próxima vez/, keep: /registro de cada teléfono en el que iniciaste sesión/ },
  pt: { id: /identificador que o Android atribui ao DoseTrace.*identificador aleatório guardado no armazenamento seguro/, last: /quando o celular foi visto pela última vez/, each: /em cada solicitação ao nosso servidor/, tz: /fuso horário/, off: /notificações do DoseTrace estão desativadas/, expo: /verifica se há atualização sempre que é aberto/, assist: /mais de 30 dias são apagadas na próxima vez/, keep: /registro de cada celular em que você entrou/ },
  fr: { id: /identifiant qu'Android attribue à DoseTrace.*trousseau du téléphone/, last: /vu pour la dernière fois/, each: /avec chaque requête à notre serveur/, tz: /fuseau horaire/, off: /notifications de DoseTrace sont désactivées/, expo: /vérifie s'il existe une mise à jour à chaque ouverture/, assist: /plus de 30 jours sont supprimés la prochaine fois/, keep: /trace de chaque téléphone sur lequel vous vous êtes connecté/ },
  de: { id: /Kennung, die Android DoseTrace.*Schlüsselbund des iPhone/, last: /wann das Smartphone zuletzt aktiv war/, each: /mit jeder Anfrage an unseren Server/, tz: /Zeitzone/, off: /Benachrichtigungen für DoseTrace auf deinem Smartphone ausgeschaltet/, expo: /prüft bei jedem Start, ob es ein Update gibt/, assist: /älter als 30 Tage sind, werden bei seiner nächsten Nutzung gelöscht/, keep: /Eintrag jedes Smartphones, auf dem du dich angemeldet hast/ },
  it: { id: /identificativo che Android assegna a DoseTrace.*portachiavi del telefono/, last: /quando il telefono è stato visto l'ultima volta/, each: /con ogni richiesta al nostro server/, tz: /fuso orario/, off: /notifiche di DoseTrace sono disattivate/, expo: /controlla se c'è un aggiornamento ogni volta che si apre/, assist: /più vecchi di 30 giorni vengono cancellati la volta successiva/, keep: /registrazione di ogni telefono su cui hai effettuato l'accesso/ },
};

for (const l of LANGS) {
  test(`${l}: one device (section 2), the push row, Expo updates and the update notice (section 4), the assistant counts (section 5), phone records kept (section 8)`, () => {
    const b = tr[l].settings_privacy_body;
    const f = FACTS[l];
    assert.match(section(b, 2), f.id, `${l} §2 identifier`);
    assert.match(section(b, 2), f.last, `${l} §2 last seen`);
    assert.match(section(b, 2), f.each, `${l} §2 sent with each request`);
    const s4 = section(b, 4);
    for (const k of ['tz', 'off', 'expo']) assert.match(s4, f[k], `${l} §4 ${k}`);
    assert.ok(s4.includes(tr[l].settings_version_news), `${l} §4 names the Settings switch "${tr[l].settings_version_news}"`);
    assert.match(section(b, 5), f.assist, `${l} §5 assistant counts`);
    assert.match(section(b, 8), f.keep, `${l} §8 phone records`);
  });
}

test('no copy says "your other phones" (one device at a time) and every copy is dated October 30, 2026', () => {
  for (const f of ['web/privacy-policy.html', 'docs/legal/privacy-policy-2026-10.md']) {
    const s = read(f);
    assert.doesNotMatch(s, /other phones|other devices|sync your devices/, f);
    assert.match(s, /Last updated: October 30, 2026/, f);
  }
});
