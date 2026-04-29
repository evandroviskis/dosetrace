# DoseTrace — Session Start Prompt

Copy everything below the divider into a new Cowork conversation to start fresh.

---

I'm Evandro, working on **DoseTrace** — a peptide / HRT / TRT / dose-tracking mobile app, owned by my company **Outcom**. Local code on this Mac: `~/Desktop/dosetrace`. GitHub (private): https://github.com/evandroviskis/dosetrace.git

## First thing to do (before anything else)

1. Connect to the project state file in Google Drive:
   ```
   /Users/evandrosantos/Library/CloudStorage/GoogleDrive-jootaerre@gmail.com/Other computers/My Mac/Drive Complete/dosetrace
   ```
   Use `request_cowork_directory` with that path. The file `STATE.md` inside is the rolling project state — read it first.

2. Connect to the code folder: `~/Desktop/dosetrace` (also via `request_cowork_directory`).

3. Run `cd ~/Desktop/dosetrace && git pull` to get the latest code from GitHub.

4. Run `eas build:list --limit 4` to see if the EAS preview build from 2026-04-29 finished, failed, or is still running.

5. Then — and only then — ask me which of the open paths I want to take.

## Project basics (don't ask, these don't change)

- React Native + Expo SDK 54, Health & Fitness category
- Supabase (auth + cloud sync), SQLite (local), RevenueCat (purchases)
- 6 languages at launch: EN, ES, PT, FR, DE, IT — **never strip languages without my explicit approval**
- Bundle ID: `io.outcom.dosetrace` · EAS Project ID: `4780e120-5f45-4482-8e95-b443929b6f8a`
- Expo account: `jootaerre` (hello@dosetrace.io) · Apple ID for builds: `jootaerre@yahoo.com.br`
- Domain: dosetrace.io (GoDaddy) · Supabase project: "dosesync" (EGSX dev org)
- Two Macs: this MacBook + a Mac Mini at the office. Code is git-synced. State is in Drive (the path above).

## Hard constraints (do not violate)

- **Never link DoseTrace to EvoxBiolabs** anywhere — not in app copy, not in the website, not in the repo, not in commits, not in support emails. EvoxBiolabs is my separate peptide-sales business; the two companies stay legally and visibly separate. Plan is to eventually exit peptide sales and run only Outcom apps.
- **Never add a drug interaction checker.** Regulatory cliff (FDA / ANVISA / EU MDR). Permanently killed by the council.
- **Never strip the 6 languages.** They map to the existing customer-nationality distribution and unlock 3.5–4.5× cheaper influencer marketing in BRL/EUR markets.
- **Never claim the app makes dosing safer or provides clinical guidance.** Liability boundary.

## Where the project is (snapshot — full state in Google Drive's STATE.md)

### Done in last session (2026-04-29)
- OAuth packages installed and upgraded to SDK 54 majors (`expo-auth-session 7.0.10`, `expo-crypto 15.0.8`, `expo-web-browser 15.0.10`).
- `expo-web-browser` added to plugins in `app.json`.
- `expo-doctor` clean (17/17).
- eas-cli v18.7.0 installed, logged in as jootaerre.
- EAS preview build queued for iOS + Android. iPhone (UDID `00008120-000211513682601E`) registered in ad-hoc provisioning. Distribution cert serial `2A4B81B6CB6165E63BE37489EF7F7E81`, expires 2027-04-07.
- Two LLM Council passes done. All saved in repo:
  - `council-report-2026-04-29-1855.html` (Round 1 — pressure-test the whole app)
  - `council-report-2026-04-29-1855-round2.html` (Round 2 — V1 scope + competitive sweep)
  - `council-amendment-2026-04-29-1855.html` (3 corrections to Round 2)
  - Two transcripts (`council-transcript-*.md`)

### Still open

1. **Verify EAS build status.** Both builds were queued; result not confirmed. URLs:
   - Android: https://expo.dev/accounts/jootaerre/projects/dosetrace/builds/44304c85-e140-43a6-9f72-dea67253a381
   - iOS: https://expo.dev/accounts/jootaerre/projects/dosetrace/builds/e6d7f29e-56b9-4646-9be4-cb0a749f893b

2. **Env vars decision unresolved.** The preview build went out without `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` baked in (only `production` profile has them). Two options:
   - **A)** Patch `eas.json` — add `env` block to `preview` profile matching `production`. In git, fastest.
   - **B)** `eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value "..." --visibility plaintext` (and same for ANON_KEY). Server-side, cleaner.

3. **Email auth broken (pre-existing).** Custom SMTP via GoDaddy, but MX records point to Google → outgoing mail rejected. Plan was to migrate to Resend, verify dosetrace.io DNS, update Supabase SMTP settings. Not started.

4. **Google OAuth — code in but Supabase Dashboard provider not configured.** `lib/supabase.js` has `signInWithGoogle()` using `expo-auth-session`. Needs Google Cloud OAuth credentials and Supabase Auth → Providers → Google config.

5. **Play Store closed-testing third submission pending.** Need 12+ testers opted in for 14 days. Currently 4 on list, 0 opted in. iOS not yet submitted.

## V1 plan from the council (after the amendment)

### V1 — ship in 14-21 days
- Reconstitution calculator (hero feature)
- Dose log + reminders
- Vial tracker
- **~20 compound one-tap presets** (highest-leverage missing feature — competitors have 80+)
- Streaks
- Free 5 protocols / paid unlimited
- All 6 languages
- Email auth working
- Android first, iOS within 7 days
- No EvoxBiolabs mention anywhere

**Suggested 20 compounds for presets:** BPC-157, TB-500, semaglutide, tirzepatide, retatrutide, ipamorelin, CJC-1295, sermorelin, MOTS-c, NAD+, GHK-Cu, epitalon, testosterone enanthate, testosterone cypionate, HCG, T3, T4, B12. Add 2 more from my top-asked list at EvoxBiolabs.

### V1.5 — 30 days post-launch
- Injection site rotation + visual body map (verify FDA/ANVISA/EU MDR first)
- Custom symptom tracking
- Protocol sharing via link/QR

### V2 — at 1k active users OR 100 paid subs
- Bloodwork PDF upload
- **Personalized PK curve from bloodwork** (premium hero — overlays actual bloodwork values on the user's own dosing timeline; differentiated from generic half-life charts)
- Apple Watch (only if iOS users specifically request)
- Doctor-shareable PDF report

### V3 — at 5k active OR $5k MRR
- Apple Health / Google Fit integration
- Mood diary
- Persistent escalating alarms
- Barcode scanning

### V4 — probably never, requires legal counsel
- Family / dependent profiles
- Voice reminders

### KILL — do not build
- Drug interaction checker
- Vitamin causal-correlation in this app (different audience, different mental model — possible separate product later)

## Distribution context (private — never publicly link to EvoxBiolabs)

- ~60 weekly peptide-buying customers (private network at EvoxBiolabs)
- 500-person consumer list of peptide users
- 150-member WhatsApp channel of peptide users
- Plan: paid peptide-niche influencers post-launch
- Goal: 20–50k users in 5 years. No revenue pressure; reinvest 100% into the product.

## Working style

- Direct, practical answers. Show exact commands I can run.
- Read repo files instead of guessing.
- Use TodoList / TaskCreate for any multi-step work so I can see progress.
- Trust the council outputs in the repo — don't re-litigate decisions already made (especially: keep 6 languages, keep the personalized PK curve as V2 hero, never add drug interactions, never link to EvoxBiolabs).

## End-of-session protocol

Before I switch off this Mac, update `STATE.md` in the Drive folder above (it's the rolling state file — overwrite it each session). Then commit + push the code repo. The Mac Mini reads the same `STATE.md` via Drive, and pulls the same code via git.
