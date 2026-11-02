#!/usr/bin/env node
// One-time update notice before the 1.3.0 cutoff (founder 2026-10-26: "Enviar aviso a todos os
// usuarios pedindo update e nao permitir mais acesso a versao antiga"; 2026-11-02: text approved,
// "pode enviar sem pedir para apagar o app"). Every push token below 1.3.1 (1.3.0 and older report no
// version) of an account that is not already on 1.3.1 gets ONE push in its language — also accounts
// that never said yes to "Novidades do DoseTrace" (the founder's one-time override of UN-6).
// The send runs inside Postgres (pg_net → Expo), so no token ever leaves the database here.
//   node scripts/notice130.cjs                 → prints the SQL for everyone
//   node scripts/notice130.cjs --user <uuid>   → the SQL for one test account (any version)
// Read the Expo answers after: select status_code, content from net._http_response where id in (…).
const COPY = {
  en: { title: 'DoseTrace update', body: 'A new version of DoseTrace is available. Update from the App Store or Google Play to keep syncing your records.' },
  pt: { title: 'Atualização do DoseTrace', body: 'Uma nova versão do DoseTrace está disponível. Atualize pela App Store ou pela Google Play para continuar sincronizando seus registros.' },
  es: { title: 'Actualización de DoseTrace', body: 'Hay una nueva versión de DoseTrace. Actualiza desde la App Store o Google Play para seguir sincronizando tus registros.' },
  fr: { title: 'Mise à jour de DoseTrace', body: 'Une nouvelle version de DoseTrace est disponible. Mettez-la à jour depuis l’App Store ou Google Play pour continuer à synchroniser vos données.' },
  de: { title: 'DoseTrace-Update', body: 'Eine neue Version von DoseTrace ist verfügbar. Aktualisiere sie im App Store oder bei Google Play, damit deine Einträge weiter synchronisiert werden.' },
  it: { title: 'Aggiornamento di DoseTrace', body: 'È disponibile una nuova versione di DoseTrace. Aggiornala dall’App Store o da Google Play per continuare a sincronizzare i tuoi dati.' },
};
const LANGS = Object.keys(COPY);
// 1.3.0 tokens carry no language: the time zone is the best guess left (else English).
const TZ = [
  ['pt', '^(America/(Sao_Paulo|Fortaleza|Recife|Bahia|Belem|Manaus|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista|Rio_Branco|Araguaina|Maceio|Santarem|Noronha|Eirunepe)|Europe/Lisbon|Atlantic/(Azores|Madeira)|Africa/(Luanda|Maputo))$'],
  ['es', '^(Europe/Madrid|Atlantic/Canary|America/(Mexico_City|Monterrey|Tijuana|Cancun|Merida|Chihuahua|Hermosillo|Mazatlan|Bogota|Lima|Santiago|Buenos_Aires|Argentina/.*|Caracas|Montevideo|Asuncion|La_Paz|Guayaquil|Guatemala|Costa_Rica|Panama|El_Salvador|Tegucigalpa|Managua|Havana|Santo_Domingo|Puerto_Rico))$'],
  ['fr', '^Europe/(Paris|Brussels|Luxembourg|Monaco)$'],
  ['de', '^Europe/(Berlin|Vienna|Zurich|Busingen)$'],
  ['it', '^Europe/(Rome|San_Marino|Vatican)$'],
];

function langFor({ language, metaLanguage, timezone } = {}) {
  if (LANGS.includes(language)) return language;
  if (LANGS.includes(metaLanguage)) return metaLanguage;
  for (const [l, re] of TZ) if (timezone && new RegExp(re).test(timezone)) return l;
  return 'en';
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildSql({ onlyUser = null, anyVersion = false } = {}) {
  if (onlyUser && !UUID.test(onlyUser)) throw new Error('onlyUser must be a uuid');
  const langList = LANGS.map(q).join(', ');
  const tzCase = TZ.map(([l, re]) => `when p.timezone ~ ${q(re)} then ${q(l)}`).join(' ');
  const pick = (field) => `case l.lang ${LANGS.map((l) => `when ${q(l)} then ${q(COPY[l][field])}`).join(' ')} end`;
  const who = [];
  if (onlyUser) who.push(`p.user_id = ${q(onlyUser)}`);
  if (!anyVersion) {
    who.push(`(p.app_version is null or public.dt_version_below(p.app_version, '1.3.1'))`);
    who.push(`not exists (select 1 from public.push_tokens q where q.user_id = p.user_id and q.app_version is not null and not public.dt_version_below(q.app_version, '1.3.1'))`);
  }
  return `with cand as (
  select distinct on (p.expo_token) p.expo_token,
    case when p.language in (${langList}) then p.language
         when u.raw_user_meta_data->>'language' in (${langList}) then u.raw_user_meta_data->>'language'
         ${tzCase} else 'en' end as lang
  from public.push_tokens p join auth.users u on u.id = p.user_id
  where ${who.length ? who.join('\n    and ') : 'true'}
), msgs as (
  select (row_number() over (order by l.expo_token) - 1) / 100 as batch,
    jsonb_build_object('to', l.expo_token, 'title', ${pick('title')}, 'body', ${pick('body')}, 'sound', 'default', 'priority', 'high') as m
  from cand l
)
select batch, count(*) as n, net.http_post(
  url := 'https://exp.host/--/api/v2/push/send',
  body := jsonb_agg(m),
  headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
) as request_id
from msgs group by batch order by batch;`;
}

module.exports = { COPY, langFor, buildSql };

if (require.main === module) {
  const i = process.argv.indexOf('--user');
  const onlyUser = i > 0 ? process.argv[i + 1] : null;
  process.stdout.write(buildSql({ onlyUser, anyVersion: !!onlyUser }) + '\n');
}
