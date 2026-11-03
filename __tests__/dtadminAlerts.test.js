'use strict';
// Admin panel Phase 5 — DT Admin 0.8 shows the system alerts (founder 2026-11-03: "notificação … no
// aplicativo do ADM que eu tenho instalado no celular, não no DoseTrace"). Static checks of the plain-Java
// app (no Gradle, no androidx; built by dtadmin/build.sh) and of the page's one call that hands the app its
// alerts-only token. Rows SA12–SA15; the device proof rows stay open for the lead.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const D = path.join(ROOT, 'dtadmin');
const read = (p) => fs.readFileSync(path.join(D, p), 'utf8');
const MAN = read('AndroidManifest.xml');
const MAIN = read('src/io/outcom/dtadmin/MainActivity.java');
const JOB = read('src/io/outcom/dtadmin/AlertJob.java');
const STR = read('res/values/strings.xml');
const ICON = read('res/drawable/ic_alert.xml');
const PAGE = fs.readFileSync(path.join(ROOT, 'web/adm.html'), 'utf8');

test('SA12: DT Admin is 0.8 / versionCode 8 everywhere (manifest, bridge, user agent)', () => {
  assert.match(MAN, /android:versionCode="8"/);
  assert.match(MAN, /android:versionName="0\.8"/);
  assert.match(MAIN, /appVersion\(\) \{ return "0\.8"; \}/);
  assert.match(MAIN, /" DTAdmin\/0\.8"/);
  assert.ok(!/DTAdmin\/0\.7|return "0\.7"/.test(MAIN));
});

test('SA12: the manifest declares the job service and the permissions it needs (notifications, boot, network state)', () => {
  for (const p of ['POST_NOTIFICATIONS', 'RECEIVE_BOOT_COMPLETED', 'ACCESS_NETWORK_STATE', 'INTERNET']) {
    assert.ok(MAN.includes(`android:name="android.permission.${p}"`), p);
  }
  assert.match(MAN, /<service\s+android:name="\.AlertJob"\s+android:permission="android\.permission\.BIND_JOB_SERVICE"\s+android:exported="false"\s*\/>/);
});

test('SA13: AlertJob is a framework JobService: every 15 min, network required, persisted across reboots; no androidx', () => {
  assert.match(JOB, /public class AlertJob extends JobService/);
  assert.match(JOB, /new JobInfo\.Builder\(JOB_ID, new ComponentName\(c, AlertJob\.class\)\)/);
  assert.match(JOB, /\.setPeriodic\(15 \* 60 \* 1000L\)/);
  assert.match(JOB, /\.setRequiredNetworkType\(JobInfo\.NETWORK_TYPE_ANY\)/);
  assert.match(JOB, /\.setPersisted\(true\)/);
  for (const src of [JOB, MAIN]) assert.ok(!/import androidx\.|import com\.google\./.test(src), 'framework API only');
});

test('SA13: the job polls /api/adm-health?since=<last seen id> with X-DT-Alerts, and moves the last seen id forward', () => {
  assert.match(JOB, /"https:\/\/dosetrace\.io\/api\/adm-health"/);
  assert.match(JOB, /"\?since=" \+ lastSeen/);
  assert.match(JOB, /setRequestProperty\("X-DT-Alerts", token\)/);
  assert.match(JOB, /putLong\(KEY_LAST_ID/);
  assert.match(JOB, /code == 401/);
  assert.ok(!/Log\.[dewiv]\(/.test(JOB), 'nothing is logged');
});

test('SA14: channel "Alertas do sistema" with high importance; one notification per alert; titles in plain formal Portuguese', () => {
  assert.match(JOB, /new NotificationChannel\(CHANNEL, c\.getString\(R\.string\.alerts_channel\), NotificationManager\.IMPORTANCE_HIGH\)/);
  assert.match(STR, /<string name="alerts_channel">Alertas do sistema<\/string>/);
  assert.match(STR, /<string name="alert_slow">DoseTrace: lentidão no sistema<\/string>/);
  assert.match(STR, /<string name="alert_down">DoseTrace: sistema fora do ar<\/string>/);
  assert.match(STR, /<string name="alert_recovered">DoseTrace: sistema normalizado<\/string>/);
  assert.match(JOB, /R\.string\.alert_slow/);
  assert.match(JOB, /R\.string\.alert_down/);
  assert.match(JOB, /R\.string\.alert_recovered/);
  assert.match(JOB, /nm\.notify\(/);
  assert.match(JOB, /setSmallIcon\(R\.drawable\.ic_alert\)/);
  assert.ok(!/dá para|a gente|Não deu/.test(STR), 'formal Portuguese');
});

test('SA14: a tap opens the app (MainActivity, so biometrics as usual); immutable PendingIntent', () => {
  assert.match(JOB, /new Intent\(c, MainActivity\.class\)/);
  assert.match(JOB, /PendingIntent\.FLAG_IMMUTABLE/);
  assert.match(JOB, /setContentIntent\(/);
  assert.match(JOB, /setAutoCancel\(true\)/);
});

test('SA14: the icon is a vector drawable; no emoji anywhere in the app', () => {
  assert.match(ICON, /^<\?xml[^>]*\?>\s*<vector /);
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
  for (const [n, s] of [['MainActivity', MAIN], ['AlertJob', JOB], ['strings', STR], ['manifest', MAN]]) assert.ok(!emoji.test(s), n);
});

test('SA15: MainActivity asks POST_NOTIFICATIONS once on Android 13+, creates the channel, and takes the alerts token only from the unlocked panel page', () => {
  assert.match(MAIN, /Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.TIRAMISU/);
  assert.match(MAIN, /requestPermissions\(new String\[\] \{ "android\.permission\.POST_NOTIFICATIONS" \}/);
  assert.match(MAIN, /AlertJob\.ensureChannel\(this\)/);
  assert.match(MAIN, /@JavascriptInterface public boolean alertsTokenWanted\(\) \{ return unlocked && deviceKey != null && onPanelPage\(\) && !AlertJob\.hasToken\(MainActivity\.this\); \}/);
  assert.match(MAIN, /@JavascriptInterface public void setAlertsToken\(String t\) \{\s*if \(!unlocked \|\| deviceKey == null \|\| !onPanelPage\(\)\) return;/);
  assert.match(MAIN, /AlertJob\.saveToken\(/);
  assert.match(MAIN, /AlertJob\.schedule\(/);
});

test('SA15: the page asks for the alerts token once, only inside the app and only when the app says it needs one, after the panel loaded', () => {
  assert.match(PAGE, /function askAlertsToken\(\)/);
  assert.match(PAGE, /typeof window\.DTAdmin\.alertsTokenWanted!=='function'\|\|!window\.DTAdmin\.alertsTokenWanted\(\)/);
  assert.match(PAGE, /AUTH\.api\('POST',\{action:'alerts_token'\},'\/api\/adm-health'\)/);
  assert.match(PAGE, /window\.DTAdmin\.setAlertsToken\(x\.j\.token\)/);
  const load = PAGE.slice(PAGE.indexOf('  function load(){'), PAGE.indexOf("window.admReload=function"));
  assert.match(load, /writeLast\(payload\);[\s\S]*askAlertsToken\(\)/, 'asked after a successful load');
});

test('SA17: the job says once when the monitor itself is silent (feed 5xx, or last check older than 20 min, 2 polls in a row) and once when it answers again; a phone network error never counts', () => {
  assert.match(JOB, /static final long STALE_MS = 20 \* 60 \* 1000L;/);
  assert.match(JOB, /if \(code >= 500\) \{ badPoll\(c, p\); return; \}/);
  assert.match(JOB, /bad >= 2 && p\.getLong\(KEY_SILENT, 0\) == 0/);
  assert.match(JOB, /return; \/\/ no network after all/);
  assert.match(STR, /<string name="alert_silent">DoseTrace: monitor sem resposta<\/string>/);
  assert.match(STR, /<string name="alert_silent_body">Não foi possível confirmar o estado do sistema às %1\$s\./);
  assert.match(STR, /<string name="alert_silent_back">O monitor voltou a responder às %1\$s\.<\/string>/);
});
