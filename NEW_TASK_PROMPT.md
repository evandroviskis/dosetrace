I'm Evandro, working on DoseTrace — a medication/protocol tracking mobile app.

PROJECT
- React Native + Expo SDK 54 app (Health & Fitness category)
- Supabase (auth + cloud sync), SQLite (local), RevenueCat (purchases)
- 6 languages: EN, ES, PT, FR, DE, IT
- Bundle ID: io.outcom.dosetrace
- EAS Project ID: 4780e120-5f45-4482-8e95-b443929b6f8a
- GitHub (private): https://github.com/evandroviskis/dosetrace.git
- Local path on this machine: ~/Desktop/dosetrace
- Domain: dosetrace.io (GoDaddy)
- Supabase project: "dosesync" (EGSX dev org)

KEY FILES
- App.js — main entry + navigation
- screens/ — OnboardingScreen, TodayScreen, ProtocolsScreen, LogScreen,
  BloodworkScreen, VialScreen, SettingsScreen, PaywallScreen, FAQScreen
- lib/ — supabase.js, database.js, sync.js, notifications.js, purchases.js,
  analytics.js, referrals.js, countries.js
- i18n/ — translations.js, LanguageContext.js

RECENTLY DONE
- Onboarding redesigned: step 4 = Google Sign-In + Create account + Sign in link;
  step 6 = login with Google button, OR divider, Forgot password
- Google OAuth code added (expo-auth-session, expo-web-browser, expo-crypto)
  — NOT yet configured in Supabase Dashboard
- Password recovery via supabase.auth.resetPasswordForEmail()
- App icon fixed (symbol only, no text; adaptive icon with safe zone)
- Repo pushed to GitHub

OPEN ITEMS (pick from these or I'll tell you what I want today)
1. EMAIL BROKEN — Supabase "Confirm email" is on; custom SMTP points to
   GoDaddy but MX records point to Google → outgoing mail failing.
   Plan: migrate SMTP to Resend, verify dosetrace.io, update Supabase SMTP
   settings, decide what to do with MX (GoDaddy vs Google Workspace).
2. Run `npm install` for the new OAuth packages; then `eas build` to rebuild
   with new native modules.
3. Configure Google OAuth in Supabase Dashboard (Auth > Providers > Google)
   with Google Cloud OAuth credentials.
4. Google Play Store — third closed-testing submission pending.
   Need 12+ testers opted in for 14 days. Currently 4 on list, 0 opted in.

MY WORKING STYLE
- I work across two machines (office + MacBook). Main is git-synced.
- I want direct, practical answers. Show me exact commands to run.
- When you need info from the repo, read the files — don't guess.

Please start by:
1. Requesting access to the dosetrace folder on my Desktop (use the
   request_cowork_directory tool with path ~/Desktop/dosetrace).
2. Running `git status` and `git log --oneline -5` so we both know the
   current state.
3. Asking me which of the open items I want to tackle first.
