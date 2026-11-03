# DT Admin — the founder's private Android app for dosetrace.io/adm

Spec: `docs/specs/admin-panel.md` Phase 4 (founder 2026-11-02). Plain Java + WebView, no Expo, no Gradle,
never on Google Play: installed by cable on the founder's S25 and Fold only.

Build (Android SDK build-tools 36 + Homebrew JDK 17; no network needed):

    ./build.sh            # → build/dtadmin.apk, signed with ~/.dtadmin-release.keystore (local only, never in git)
    adb install -r build/dtadmin.apk

Signing key: `~/.dtadmin-release.keystore` is created on the first build and stays on this Mac. Losing it
means the next APK cannot update the installed one (uninstall + reinstall). Back it up with the other keys
(drive Arquivos › Trabalho › Dosetrace), never in git or in the Second Brain.

Status: 0.8 (2026-11-03). Biometrics on open, the device key in the Keystore + JS bridge (`window.DTAdmin`),
and the system alerts (spec Phase 5, SA12–SA18): after biometrics the panel page asks the server once for an
alerts-only token (`POST /api/adm-health {action:"alerts_token"}`, device path) and hands it to the bridge;
`AlertJob` (framework JobScheduler, every 15 min, network required, persisted across reboots) reads
`GET /api/adm-health?since=<last id>` with `X-DT-Alerts` and posts one notification per new alert on the
channel "Alertas do sistema". The token reads alert rows only; revoking the device stops it.

Check on the phone after an install: `adb shell dumpsys jobscheduler io.outcom.dtadmin` (job 4108, periodic 15 min,
persisted).
