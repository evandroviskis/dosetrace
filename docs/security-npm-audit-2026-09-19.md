# npm audit triage — DoseTrace

**Date:** 2026-09-19 · **Author:** Claude Code (Grok security handoff P2)
**Totals:** 38 findings — 2 critical, 17 high, 18 moderate, 1 low.

## Bottom line

**No shipped mobile-runtime dependency is affected.** Every high/critical is a
**build-toolchain or dev-server** package (Metro bundler, Expo CLI, prebuild
tooling, the RN dev middleware). None of these are compiled into the `.ipa` /
`.aab` — they run on the developer's machine during `expo export` / `eas build`,
so the attack surface is the build host, not end users.

They are **pinned by Expo SDK 54's dependency tree**. Running `npm audit fix`
(even without `--force`) can bump Metro/Expo transitives out of sync with the SDK
and break bundling/prebuild — a real regression risk for zero end-user benefit.
The correct remediation is the **next Expo SDK upgrade**, which is explicitly a
follow-up (out of scope for this handoff). No `npm audit fix` was run.

## High / critical — all toolchain, not shipped

| Severity | Package | Role | Shipped in app? |
|---|---|---|---|
| CRITICAL | shell-quote | Metro / Expo CLI build tooling | No |
| CRITICAL | tar | install / build tooling | No |
| HIGH | metro, metro-config, metro-transform-worker | JS bundler | No |
| HIGH | @expo/cli, @expo/metro, @expo/metro-config | Expo build CLI | No |
| HIGH | expo (via bundled @expo/cli) | CLI, not the runtime module | No |
| HIGH | ws | `@react-native/dev-middleware` dev server | No (dev only) |
| HIGH | undici | build/tooling fetch | No |
| HIGH | postcss, browserslist | web/CSS build tooling | No |
| HIGH | js-yaml (@expo/xcpretty) | iOS build log formatter | No |
| HIGH | nanoid, image-size, fast-uri, brace-expansion, @xmldom/xmldom | transitive build utils | No |

The 18 moderate findings are the same class (build/dev tooling).

## Action taken

- **Triaged and classified** (this doc). Confirmed via `npm audit --json` cross-
  referenced against `package.json` `dependencies`: no vulnerable package is a
  direct shipped runtime dependency.
- **Did NOT run `npm audit fix`** — unsafe on an Expo-managed tree (desync risk),
  and there is no end-user exposure to justify it.

## Recommended follow-up (separate ticket)

- Bump **Expo SDK** (54 → next) via `npx expo install --fix` / the Expo upgrade
  guide, which moves Metro/CLI/tooling to patched versions as a coherent set.
  Run `expo-doctor` after. This is a major-upgrade task, deliberately not bundled
  into this security handoff (per the handoff's out-of-scope note).
- Keep the build host trusted (these CVEs require running the tooling against
  hostile input on the dev machine).
