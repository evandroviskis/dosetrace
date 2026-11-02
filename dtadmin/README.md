# DT Admin — the founder's private Android app for dosetrace.io/adm

Spec: `docs/specs/admin-panel.md` Phase 4 (founder 2026-11-02). Plain Java + WebView, no Expo, no Gradle,
never on Google Play: installed by cable on the founder's S25 and Fold only.

Build (Android SDK build-tools 36 + Homebrew JDK 17; no network needed):

    ./build.sh            # → build/dtadmin.apk, signed with ~/.dtadmin-release.keystore (local only, never in git)
    adb install -r build/dtadmin.apk

Signing key: `~/.dtadmin-release.keystore` is created on the first build and stays on this Mac. Losing it
means the next APK cannot update the installed one (uninstall + reinstall). Back it up with the other keys
(drive Arquivos › Trabalho › Dosetrace), never in git or in the Second Brain.

Status: proof of concept (biometrics on open, WebView of the panel). Next: device key in the Keystore +
JS bridge (`window.DTAdmin`) so the panel sends `X-DT-Device` and skips the authenticator (DA9–DA10).
