# Mac handoff: from the cloud design session to Claude on the Mac (2026-09-30)

Read this file first, then `docs/design/HANDOFF.md` §5b–5d, then the CLAUDE.md on **your local
`main`** (not the copy on `design/hybrid`, which is older).

## 0. The truth in three lines

1. **The whole design pass is approved.** Every screen, popup, the paywall, onboarding, the
   injection-site picker and the animations are approved by the founder, with every decision logged.
2. **None of it is in the app code yet.** It lives as a clickable prototype plus written build
   specs. A build made right now shows today's app, not the new design.
3. **Do not build or merge the app code on `design/hybrid`.** It is an older experiment from
   2026-09-27 (a "hybrid" restyle, commits up to c39c428), superseded by the approved design, and
   54+ commits behind `main`. Only `docs/design/` from that branch matters.

## 1. Keep everything: get the design work onto the Mac (do this first)

```bash
cd ~/dosetrace                      # the founder's local clone
git status                          # commit or stash local 1.2.5 work first; never lose it
git fetch origin
git switch main                     # the Mac's main is the source of truth for the app
git switch -c redesign/graduated    # new branch for the redesign build
git checkout origin/design/hybrid -- docs/design   # bring ONLY the design folder
git add docs/design && git commit -m "design: bring the approved Graduated design pass (docs/design from design/hybrid)"
```

Check: `ls docs/design` shows `prototype.html`, `DESIGN.md`, `HANDOFF.md`, `today-build-handoff.md`,
`MAC-HANDOFF.md` and `body/`. Don't merge `design/hybrid` and don't cherry-pick its app commits.

## 2. What everything is

| What | Where |
|---|---|
| Clickable prototype, every approved screen (the visual truth) | `docs/design/prototype.html` (open in a browser; side panel jumps to every state). Published: https://claude.ai/artifact/UgjFfJ7S5JBxZZ93REWhNJ |
| Every founder decision, dated, with the exact words | `docs/design/DESIGN.md` (approval log), `docs/design/HANDOFF.md` §5c |
| Build spec: numbered items 1–29 (what to build, how to test) | `docs/design/today-build-handoff.md` |
| Design system (tokens, type, rules, mapping to `lib/theme.js`) | `docs/design/DESIGN.md` §1–§10 |
| Body images for the injection-site picker | `docs/design/body/*.webp` (prototype crops, 768 x 960) and `docs/design/body/source/*.png` (the founder's originals, 1024 x 1536, made with ChatGPT; use these for @2x/@3x app assets). The female left side is the female right side mirrored. |

## 3. What to build, in this order

### A. Next main build: live-app fixes (founder: "always a priority"; don't wait for the redesign)

- **Item 23: App Store 3.1.2.** Add "Terms of Use (EULA)" (Apple's Standard EULA URL, as in ASC)
  and "Privacy Policy" (https://dosetrace.io/privacy-policy) links under Restore on the paywall, in
  6 languages and on both platforms. In ASC, rename the subscription group and products from
  "DoseTrace Pro" to "DoseTrace Premium". The RevenueCat entitlement id stays "DoseTrace Pro".
- **Item 24: scans.** Premium gets 20 scans a month, shared by lab reports, vaccine cards and vial
  labels; free stays at 3.
  - The server has to learn who is Premium: check RevenueCat from `extract-bloodwork`, including
    the App Review demo account.
  - **Needs the founder:** the RevenueCat secret API key, stored as a Supabase Edge Function secret.
  - Remove every "Unlimited scans" string. The FAQ must stop listing cloud sync as Premium.
  - This touches billing, so run Gate B.
- **Item 26: data loss.** BodyMapModal on main erases an older typed-in injection site (for
  example "left glute") when the picker is saved empty. Fix it and add a test.
- **Item 29: copy.**
  - Every "Unlock with Pro" becomes "Unlock with Premium".
  - Settings' `settings_premium_feat_3` becomes "AI food log, every day". The old text, "searchable
    tags", describes something that doesn't exist.
  - "PRO" tile badges become "Premium".
  - All 6 languages.

### B. The redesign build (founder process, HANDOFF §5b)

Implement screen by screen, in the order approved, with the prototype as the visual truth:

1. Today (`today-build-handoff.md` items 1–22)
2. My Protocols
3. Journey (5 parts)
4. My Body (3 parts)
5. Settings (3 parts)
6. Sign-in
7. Onboarding
8. Paywall
9. The injection-site picker (item 27)
10. The free-feature explainer animations (item 28)

After each screen, the founder looks at it in the simulator before the next one.

**Rebuild means replace:** delete the old screen in the same change (CLAUDE.md).

## 4. Getting the founder into the simulator

```bash
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"   # per CLAUDE.md
npm install
npx expo run:ios            # dev client (expo-dev-client is installed); or eas build --profile development-sim
```

The first run shows the **current** app. A redesigned screen shows up only after it's built (§3B).
Be explicit with the founder about which one he's looking at.

## 5. Rules that must hold (CLAUDE.md on main has the full text)

- **Checks before any EAS build:**
  - `npm test` green;
  - `npx expo export --platform ios` passes;
  - i18n parity across the 6 languages;
  - **both themes checked on every screen and popup**;
  - dt-council, then ship-check;
  - **the founder says go**.
- **Before calling a build delivered:** after `eas submit`, add the build to the TestFlight groups
  and verify with `/tf-status`.
- **Never lose user data.** Auth/sync/storage changes go through Gate B and a device test.
- **AI hard line:** transcribe and surface only; never recommend, diagnose or interpret. No emoji in
  the UI.
- **Approved means it ships in the next build**, unless the founder defers it out loud.
- **Commits:**
  - Commit as `evandroviskis <jootaerre@gmail.com>`.
  - No backticks in commit messages.
  - Never commit secrets. The EAS profiles already carry the public anon key; do not add service
    keys.

## 6. How the founder works with Claude (keep doing this)

- Plain English, blunt, with a recommendation. One screen at a time; stop and wait for his words.
- Every reply ends with a numbered **Grok note** (a short summary he pastes to Grok). **The last one
  was 102; the next is 103.**
- When something is only in the prototype, say so. Never call anything done or delivered without
  checking.

## 7. Open items and deferrals (so nothing is silently dropped)

- **Needs the founder:**
  - the RevenueCat secret key (item 24);
  - the ASC subscription rename (item 23).
- **Deferred by the founder:** adding injection sites for injections from before install.
- **Registry items the redesign touches:** A-29 (Share my progress card, 1.2.6) and A-54 (enter
  once, used everywhere). See `docs/review/features.md` on main.
- **Privacy policy:** the AI section doesn't mention the AI food log yet (DESIGN.md). Fix it on
  dosetrace.io.
