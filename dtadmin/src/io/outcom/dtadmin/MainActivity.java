package io.outcom.dtadmin;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.SystemClock;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.text.InputType;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.security.KeyStore;
import java.util.regex.Pattern;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * DT Admin (docs/specs/admin-panel.md Phase 4, founder 2026-11-02). The founder's private Android app:
 * opens dosetrace.io/adm in a WebView after the phone's biometrics and hands the panel the device key
 * through window.DTAdmin.deviceKey(). The key is encrypted with an AES key that lives in the Android
 * Keystore and can only be used right after a strong biometric (5 min validity); the ciphertext sits in
 * the app's private preferences. Nothing is logged; the key never leaves the device except in the
 * X-DT-Device header the panel sends to dosetrace.io. No Expo, no Gradle, never on Google Play.
 */
public class MainActivity extends Activity {
    private static final String PANEL = "https://dosetrace.io/adm";
    private static final long RELOCK_MS = 5 * 60 * 1000L;          // biometrics again after 5 min away
    private static final int AUTH_VALID_S = 300;                    // Keystore key usable 5 min after a biometric
    private static final String KS_ALIAS = "dtadmin_device_wrap";
    private static final String PREFS = "dtadmin";
    private static final Pattern KEY_RE = Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\.[A-Za-z0-9_-]{16,512}$");

    private FrameLayout root;
    private WebView web;
    private TextView gate;
    private LinearLayout reg;
    private EditText regInput;
    private TextView regMsg;
    private String deviceKey = null;      // plaintext only in memory, only after biometrics
    private boolean unlocked = false;
    private long leftAt = 0;
    private boolean prompting = false;
    private int insetTop = 0, insetBottom = 0; // px, system bars (status + gesture); pushed to the page as --sat/--sab

    // ---- the bridge the panel page calls ---------------------------------------------------------
    private final class Bridge {
        @JavascriptInterface public String deviceKey() { return unlocked && deviceKey != null ? deviceKey : ""; }
        @JavascriptInterface public String appVersion() { return "0.3"; }
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0C2340"));

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportZoom(false);
        s.setUserAgentString(s.getUserAgentString() + " DTAdmin/0.3");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.addJavascriptInterface(new Bridge(), "DTAdmin");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String h = r.getUrl().getHost();
                return !(h != null && (h.equals("dosetrace.io") || h.endsWith(".supabase.co")));
            }
            @Override public void onPageFinished(WebView v, String url) { pushInsets(); }
        });
        // Edge-to-edge (Android 15): the page content would sit under the clock and the gesture bar.
        // Tell the page the system-bar heights so it pads the header and the bottom bar itself (theme colours stay right).
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            android.graphics.Insets sb = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            insetTop = sb.top; insetBottom = sb.bottom;
            pushInsets();
            return insets;
        });
        web.setVisibility(View.GONE);

        gate = new TextView(this);
        gate.setText(getString(R.string.bio_subtitle));
        gate.setTextColor(Color.WHITE);
        gate.setTextSize(16);
        gate.setGravity(Gravity.CENTER);
        gate.setPadding(48, 48, 48, 48);
        gate.setOnClickListener(v -> askBiometric());

        reg = buildRegistration();
        reg.setVisibility(View.GONE);

        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        root.addView(gate, new FrameLayout.LayoutParams(-1, -1));
        root.addView(reg, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
    }

    private void pushInsets() {
        float d = getResources().getDisplayMetrics().density;
        int top = Math.round(insetTop / d), bottom = Math.round(insetBottom / d);
        web.evaluateJavascript("(function(){var s=document.documentElement.style;s.setProperty('--sat','" + top + "px');s.setProperty('--sab','" + bottom + "px');})()", null);
    }

    private LinearLayout buildRegistration() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setGravity(Gravity.CENTER);
        l.setPadding(64, 64, 64, 64);
        l.setBackgroundColor(Color.parseColor("#0C2340"));
        TextView title = new TextView(this);
        title.setText(getString(R.string.reg_title));
        title.setTextColor(Color.WHITE); title.setTextSize(20); title.setGravity(Gravity.CENTER);
        TextView sub = new TextView(this);
        sub.setText(getString(R.string.reg_sub));
        sub.setTextColor(Color.parseColor("#B8C4D6")); sub.setTextSize(14); sub.setGravity(Gravity.CENTER); sub.setPadding(0, 16, 0, 32);
        regInput = new EditText(this);
        regInput.setHint(getString(R.string.reg_hint));
        regInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
        regInput.setTextColor(Color.WHITE); regInput.setHintTextColor(Color.parseColor("#7F8FA6"));
        regInput.setSingleLine(true);
        Button save = new Button(this);
        save.setText(getString(R.string.reg_save));
        save.setOnClickListener(v -> saveRegistration());
        regMsg = new TextView(this);
        regMsg.setTextColor(Color.parseColor("#FFB4A2")); regMsg.setTextSize(14); regMsg.setGravity(Gravity.CENTER); regMsg.setPadding(0, 16, 0, 0);
        l.addView(title); l.addView(sub); l.addView(regInput); l.addView(save); l.addView(regMsg);
        return l;
    }

    @Override protected void onResume() {
        super.onResume();
        if (!unlocked || (leftAt > 0 && SystemClock.elapsedRealtime() - leftAt > RELOCK_MS)) {
            unlocked = false; deviceKey = null;
            web.setVisibility(View.GONE); reg.setVisibility(View.GONE); gate.setVisibility(View.VISIBLE);
            askBiometric();
        }
    }

    @Override protected void onPause() { super.onPause(); leftAt = SystemClock.elapsedRealtime(); }

    private void askBiometric() {
        if (prompting) return;
        prompting = true;
        gate.setText(getString(R.string.bio_subtitle));
        BiometricPrompt prompt = new BiometricPrompt.Builder(this)
            .setTitle(getString(R.string.bio_title))
            .setSubtitle(getString(R.string.bio_subtitle))
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setNegativeButton(getString(R.string.bio_negative), getMainExecutor(), (d, w) -> { prompting = false; gate.setText(getString(R.string.bio_failed)); })
            .build();
        prompt.authenticate(new CancellationSignal(), getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
            @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult r) {
                prompting = false; unlocked = true;
                afterUnlock();
            }
            @Override public void onAuthenticationError(int code, CharSequence msg) { prompting = false; gate.setText(getString(R.string.bio_failed)); }
        });
    }

    // After biometrics: a stored key opens the panel; no key → registration (the key is pasted once).
    private void afterUnlock() {
        String k = loadKey();
        if (k == null) { showRegistration(false); return; }
        deviceKey = k;
        openPanel();
    }

    private void openPanel() {
        gate.setVisibility(View.GONE); reg.setVisibility(View.GONE); web.setVisibility(View.VISIBLE);
        if (web.getUrl() == null) web.loadUrl(PANEL);
    }

    private void showRegistration(boolean replacing) {
        gate.setVisibility(View.GONE); web.setVisibility(View.GONE); reg.setVisibility(View.VISIBLE);
        regInput.setText(""); regMsg.setText(replacing ? getString(R.string.reg_replacing) : "");
    }

    private void saveRegistration() {
        String v = regInput.getText() == null ? "" : regInput.getText().toString().trim();
        if (!KEY_RE.matcher(v).matches()) { regMsg.setText(getString(R.string.reg_bad)); return; }
        if (!storeKey(v)) { regMsg.setText(getString(R.string.reg_store_failed)); return; }
        regInput.setText("");
        deviceKey = v;
        // a new key = a new session: the page's stored session goes, the panel reloads with the bridge ready
        web.evaluateJavascript("(function(){try{localStorage.removeItem('dt_adm_session');}catch(e){}})()", null);
        web.loadUrl(PANEL);
        openPanel();
    }

    // ---- Keystore wrap / unwrap ----------------------------------------------------------------
    private SecretKey wrapKey(boolean create) throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KS_ALIAS)) return (SecretKey) ks.getKey(KS_ALIAS, null);
        if (!create) return null;
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(KS_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setUserAuthenticationParameters(AUTH_VALID_S, KeyProperties.AUTH_BIOMETRIC_STRONG)
            .setInvalidatedByBiometricEnrollment(true);
        kg.init(b.build());
        return kg.generateKey();
    }

    private boolean storeKey(String plain) {
        try {
            SecretKey k = wrapKey(true);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, k);
            byte[] iv = c.getIV();
            byte[] ct = c.doFinal(plain.getBytes("UTF-8"));
            SharedPreferences p = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            p.edit().putString("iv", Base64.encodeToString(iv, Base64.NO_WRAP)).putString("ct", Base64.encodeToString(ct, Base64.NO_WRAP)).apply();
            return true;
        } catch (Exception e) { return false; }
    }

    private String loadKey() {
        try {
            SharedPreferences p = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String iv = p.getString("iv", null), ct = p.getString("ct", null);
            if (iv == null || ct == null) return null;
            SecretKey k = wrapKey(false);
            if (k == null) return null;
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, k, new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            return new String(c.doFinal(Base64.decode(ct, Base64.NO_WRAP)), "UTF-8");
        } catch (Exception e) { return null; }  // e.g. biometrics re-enrolled → key invalidated → register again
    }

    @Override public void onBackPressed() {
        if (reg.getVisibility() == View.VISIBLE && deviceKey != null) { openPanel(); return; }
        if (unlocked && web.getVisibility() == View.VISIBLE && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}
