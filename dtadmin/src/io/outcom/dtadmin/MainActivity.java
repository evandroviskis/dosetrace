package io.outcom.dtadmin;

import android.app.Activity;
import android.graphics.Color;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

/**
 * DT Admin — prova de conceito (2026-11-02). Abre dosetrace.io/adm numa WebView depois da
 * biometria do aparelho. Sem Expo, sem Play: APK instalado só nos aparelhos do Evandro.
 * Nada do servidor muda: o painel continua exigindo a conta na lista de admin e o segundo fator.
 */
public class MainActivity extends Activity {
    private static final String PANEL = "https://dosetrace.io/adm";
    private static final long RELOCK_MS = 5 * 60 * 1000L; // pede a biometria de novo após 5 min fora

    private WebView web;
    private TextView gate;
    private boolean unlocked = false;
    private long leftAt = 0;
    private boolean prompting = false;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0C2340"));

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportZoom(false);
        s.setUserAgentString(s.getUserAgentString() + " DTAdmin/0.1");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                // Só o painel e o Supabase ficam dentro do app; qualquer outro endereço é ignorado.
                String h = r.getUrl().getHost();
                return !(h != null && (h.equals("dosetrace.io") || h.endsWith(".supabase.co")));
            }
        });
        web.setVisibility(View.GONE);

        gate = new TextView(this);
        gate.setText(getString(R.string.bio_subtitle));
        gate.setTextColor(Color.WHITE);
        gate.setTextSize(16);
        gate.setGravity(Gravity.CENTER);
        gate.setPadding(48, 48, 48, 48);
        gate.setOnClickListener(v -> askBiometric());

        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        root.addView(gate, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
    }

    @Override protected void onResume() {
        super.onResume();
        if (!unlocked || (leftAt > 0 && SystemClock.elapsedRealtime() - leftAt > RELOCK_MS)) {
            unlocked = false;
            web.setVisibility(View.GONE);
            gate.setVisibility(View.VISIBLE);
            askBiometric();
        }
    }

    @Override protected void onPause() {
        super.onPause();
        leftAt = SystemClock.elapsedRealtime();
    }

    private void askBiometric() {
        if (prompting) return;
        prompting = true;
        gate.setText(getString(R.string.bio_subtitle));
        BiometricPrompt prompt = new BiometricPrompt.Builder(this)
            .setTitle(getString(R.string.bio_title))
            .setSubtitle(getString(R.string.bio_subtitle))
            .setNegativeButton(getString(R.string.bio_negative), getMainExecutor(), (d, w) -> {
                prompting = false;
                gate.setText(getString(R.string.bio_failed));
            })
            .build();
        prompt.authenticate(new CancellationSignal(), getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
            @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult r) {
                prompting = false;
                unlocked = true;
                gate.setVisibility(View.GONE);
                web.setVisibility(View.VISIBLE);
                if (web.getUrl() == null) web.loadUrl(PANEL);
            }
            @Override public void onAuthenticationError(int code, CharSequence msg) {
                prompting = false;
                gate.setText(getString(R.string.bio_failed));
            }
        });
    }

    @Override public void onBackPressed() {
        if (unlocked && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}
