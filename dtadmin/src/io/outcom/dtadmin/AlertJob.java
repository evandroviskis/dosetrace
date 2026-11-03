package io.outcom.dtadmin;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.regex.Pattern;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * DT Admin 0.8 — system alerts (docs/specs/admin-panel.md Phase 5, rows SA12–SA15; founder 2026-11-03
 * "notificação … no aplicativo do ADM que eu tenho instalado no celular, não no DoseTrace").
 *
 * A periodic framework JobScheduler job (no androidx, no Firebase): every 15 minutes (the Android minimum),
 * only with a network, persisted across reboots. It calls GET https://dosetrace.io/api/adm-health?since=<last
 * seen id> with "X-DT-Alerts: <alerts-only token>" (minted by the panel on the device path and handed over by
 * MainActivity's bridge; it reads alert rows only) and posts one notification per new alert on the channel
 * "Alertas do sistema" (high importance). A tap opens MainActivity, so biometrics run as usual.
 *
 * The probe cannot report its own silence (Supabase entirely down → nothing is written), so the job also says
 * once when the feed answers with a server error, or its last check is older than 20 minutes, on 2 polls in a
 * row ("monitor sem resposta"), and once when it answers again. Nothing is logged.
 */
public class AlertJob extends JobService {
    static final int JOB_ID = 4108;
    static final String CHANNEL = "system_alerts";
    static final String API = "https://dosetrace.io/api/adm-health";
    static final String PREFS = "dtadmin_alerts";
    static final String KEY_TOKEN = "token";
    static final String KEY_LAST_ID = "last_id";
    static final String KEY_BAD = "bad_polls";
    static final String KEY_SILENT = "silent_since";
    static final long STALE_MS = 20 * 60 * 1000L;
    static final int NOTE_SILENT = 1;
    static final Pattern TOKEN_RE = Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\.[A-Za-z0-9_-]{32,128}$");

    // ---- called by MainActivity ------------------------------------------------------------------
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    static boolean hasToken(Context c) { return prefs(c).getString(KEY_TOKEN, null) != null; }

    static boolean saveToken(Context c, String t) {
        if (t == null || !TOKEN_RE.matcher(t).matches()) return false;
        prefs(c).edit().putString(KEY_TOKEN, t).apply();
        return true;
    }

    static void ensureChannel(Context c) {
        NotificationChannel ch = new NotificationChannel(CHANNEL, c.getString(R.string.alerts_channel), NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription(c.getString(R.string.alerts_channel_desc));
        c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
    }

    // Idempotent: an already scheduled job keeps its period (opening the app does not push the next run back).
    static void schedule(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js == null || js.getPendingJob(JOB_ID) != null) return;
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(c, AlertJob.class))
            .setPeriodic(15 * 60 * 1000L)
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPersisted(true)
            .build();
        js.schedule(job);
    }

    // ---- the job ---------------------------------------------------------------------------------
    @Override public boolean onStartJob(final JobParameters params) {
        new Thread(() -> {
            try { poll(this); } catch (Exception e) { /* next run */ }
            jobFinished(params, false);
        }).start();
        return true;
    }

    @Override public boolean onStopJob(JobParameters params) { return true; }

    static void poll(Context c) throws Exception {
        SharedPreferences p = prefs(c);
        String token = p.getString(KEY_TOKEN, null);
        if (token == null) return;
        long lastSeen = p.getLong(KEY_LAST_ID, -1);
        String url = API + (lastSeen >= 0 ? "?since=" + lastSeen : "");
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setConnectTimeout(15000);
        h.setReadTimeout(15000);
        h.setUseCaches(false);
        h.setRequestProperty("X-DT-Alerts", token);
        h.setRequestProperty("Accept", "application/json");
        int code;
        String text;
        try {
            code = h.getResponseCode();
            InputStream in = code >= 400 ? h.getErrorStream() : h.getInputStream();
            text = read(in);
        } catch (Exception e) {
            return; // no network after all, DNS, captive portal: the phone's problem, not the system's
        } finally {
            h.disconnect();
        }
        if (code == 401) { p.edit().remove(KEY_TOKEN).apply(); return; } // revoked or replaced: the next unlock fetches a new one
        if (code == 429) return;
        if (code >= 500) { badPoll(c, p); return; }
        if (code != 200) return;

        JSONObject j = new JSONObject(text);
        JSONArray alerts = j.optJSONArray("alerts");
        long max = Math.max(lastSeen, j.optLong("last_id", 0));
        if (alerts != null) {
            for (int i = 0; i < alerts.length(); i++) {
                JSONObject a = alerts.getJSONObject(i);
                long id = a.optLong("id", 0);
                if (id <= lastSeen) continue;
                notifyAlert(c, id, a.optString("kind", ""), a.optString("message", ""));
                if (id > max) max = id;
            }
        }
        p.edit().putLong(KEY_LAST_ID, max).apply();

        String lastCheck = j.isNull("last_check_at") ? null : j.optString("last_check_at", null);
        long lastMs = parseIso(lastCheck);
        if (lastMs <= 0 || System.currentTimeMillis() - lastMs > STALE_MS) badPoll(c, p);
        else goodPoll(c, p);
    }

    private static void badPoll(Context c, SharedPreferences p) {
        int bad = p.getInt(KEY_BAD, 0) + 1;
        SharedPreferences.Editor e = p.edit().putInt(KEY_BAD, bad);
        if (bad >= 2 && p.getLong(KEY_SILENT, 0) == 0) {
            long now = System.currentTimeMillis();
            e.putLong(KEY_SILENT, now);
            post(c, NOTE_SILENT, c.getString(R.string.alert_silent), c.getString(R.string.alert_silent_body, hhmm(now)));
        }
        e.apply();
    }

    private static void goodPoll(Context c, SharedPreferences p) {
        if (p.getLong(KEY_SILENT, 0) != 0) {
            post(c, NOTE_SILENT, c.getString(R.string.alert_recovered), c.getString(R.string.alert_silent_back, hhmm(System.currentTimeMillis())));
        }
        p.edit().putInt(KEY_BAD, 0).putLong(KEY_SILENT, 0).apply();
    }

    private static void notifyAlert(Context c, long id, String kind, String message) {
        int title;
        if ("slow".equals(kind)) title = R.string.alert_slow;
        else if ("down".equals(kind)) title = R.string.alert_down;
        else if ("recovered".equals(kind)) title = R.string.alert_recovered;
        else return;
        post(c, 1000 + (int) (id % 1000000), c.getString(title), message);
    }

    private static void post(Context c, int noteId, String title, String body) {
        ensureChannel(c);
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_alert)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setCategory(Notification.CATEGORY_ERROR)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build();
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        nm.notify(noteId, n);
    }

    private static String hhmm(long ms) { return new SimpleDateFormat("HH:mm", Locale.US).format(new Date(ms)); }

    // "2026-11-03T19:05:00.123+00:00" / "...Z" → epoch ms; 0 when unreadable.
    static long parseIso(String s) {
        if (s == null || s.length() < 19) return 0;
        try {
            return java.time.OffsetDateTime.parse(s.replace(" ", "T")).toInstant().toEpochMilli();
        } catch (Exception e) {
            try { return java.time.Instant.parse(s).toEpochMilli(); } catch (Exception e2) { return 0; }
        }
    }

    private static String read(InputStream in) throws Exception {
        if (in == null) return "";
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) > 0) { out.write(buf, 0, n); if (out.size() > 512 * 1024) break; }
        in.close();
        return out.toString("UTF-8");
    }
}
