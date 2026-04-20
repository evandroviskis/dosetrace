# DoseTrace - Claude Context Prompt

Copy and paste everything below into a new Claude conversation to continue working:

---

## Project Overview

DoseTrace is a Health & Fitness tracking app built with React Native / Expo. It helps users track medication doses, protocols, bloodwork, and vial usage. The app uses Supabase for authentication and cloud sync, SQLite for local storage, and supports 6 languages (EN, ES, PT, FR, DE, IT).

**Tech stack:** React Native, Expo SDK 54, Supabase, SQLite, RevenueCat (purchases), React Navigation (stack + bottom tabs)

**GitHub repo:** https://github.com/evandroviskis/dosetrace.git (private)

**Supabase project:** "dosesync" on EGSX development org (us-east-2, Nano plan)

**Bundle ID:** io.outcom.dosetrace

**EAS Project ID:** 4780e120-5f45-4482-8e95-b443929b6f8a

## Project Structure

```
dosetrace/
├── App.js                  # Main app entry, navigation setup
├── app.json                # Expo config (scheme: dosetrace)
├── eas.json                # EAS Build config
├── package.json            # Dependencies
├── screens/
│   ├── OnboardingScreen.js # 7-step onboarding wizard (signup/login)
│   ├── TodayScreen.js      # Main dashboard
│   ├── ProtocolsScreen.js  # Medication protocols
│   ├── LogScreen.js        # Dose logging
│   ├── BloodworkScreen.js  # Bloodwork tracking
│   ├── VialScreen.js       # Vial management
│   ├── SettingsScreen.js   # App settings
│   ├── PaywallScreen.js    # Subscription paywall
│   └── FAQScreen.js        # FAQ
├── lib/
│   ├── supabase.js         # Supabase client + Google OAuth + getCachedUser()
│   ├── database.js         # SQLite local database
│   ├── sync.js             # Cloud sync logic
│   ├── notifications.js    # Push notifications
│   ├── purchases.js        # RevenueCat integration
│   ├── analytics.js        # Analytics
│   ├── referrals.js        # Referral system
│   └── countries.js        # Country list
├── i18n/
│   ├── translations.js     # All translations (6 languages)
│   └── LanguageContext.js  # Language context provider
├── assets/                 # Icons, splash screen
├── supabase/               # Supabase edge functions
├── store_assets/           # Play Store screenshots
├── screenshots/            # App screenshots
└── website/                # Landing page
```

## Recent Changes (completed)

### 1. Onboarding Screen Redesign
- **Step 4/7** was redesigned from a features overview to a decision screen with:
  - Google Sign-In button (recommended)
  - "Create account" button (goes to step 5)
  - "Already have an account? Sign in" link (jumps to step 6)
- **Step 6/7 (login screen)** enhanced with:
  - Google Sign-In button at top
  - OR divider
  - "Forgot password?" link

### 2. Google OAuth Added
- `lib/supabase.js` now exports `signInWithGoogle()` using expo-auth-session + expo-web-browser
- `app.json` has `"scheme": "dosetrace"` for OAuth redirects
- New dependencies added to package.json: expo-auth-session, expo-web-browser, expo-crypto
- **NOTE: Google OAuth is NOT yet configured in Supabase Dashboard** (Authentication > Providers > Google needs Google Cloud OAuth credentials)

### 3. Password Recovery Added
- `handleForgotPassword()` function in OnboardingScreen.js uses `supabase.auth.resetPasswordForEmail()`
- Translation keys added in all 6 languages

### 4. App Icon Fixed
- Removed "DoseTrace" text from icon — now shows only the checkmark+wave symbol
- `assets/icon.png` — symbol on white background, minimal padding
- `assets/adaptive-icon.png` — symbol with 18% safe zone padding, transparent background

### 5. Git + GitHub Setup
- Repo: https://github.com/evandroviskis/dosetrace.git (private)
- GitHub user: evandroviskis
- All files committed and pushed

## Pending Tasks / Known Issues

### CRITICAL: Email not working
- **Supabase has "Confirm email" enabled** — users must verify email before signing in
- **Custom SMTP is configured** using GoDaddy: smtpout.secureserver.net:465, sender hello@dosetrace.io
- **BUT: MX records for dosetrace.io point to Google** (aspmx.l.google.com), NOT GoDaddy
- This means incoming emails go to Google Workspace, but the user checks email via GoDaddy/Outlook
- Outgoing emails from GoDaddy SMTP are likely being rejected due to SPF mismatch
- **Users "hello@dosetrace.io" and "testuser@example.com" are stuck "Waiting for verification"**
- **Plan was to switch SMTP to Resend** (resend.com) but haven't done it yet — need to:
  1. Create Resend account (free tier: 3,000 emails/month)
  2. Verify dosetrace.io domain in Resend (add DNS records)
  3. Get Resend SMTP credentials
  4. Update Supabase SMTP settings (Authentication > Email > SMTP Settings)
  5. Fix the MX record mismatch (either point MX to GoDaddy or set up Google Workspace)

### Google Play Store
- App submitted for closed testing, was rejected twice for Medical category requirements
- Fixed by: changing category to "Health & Fitness" AND changing health declaration from "Medication and treatment management" to "Nutrition and weight management"
- Third submission pending review
- Need 12+ testers opted in for 14 days before production release
- Currently 4 users in tester list, 0 opted in

### Still needs to be done on user's machine
- Run `npm install` to install new packages (expo-auth-session, expo-web-browser, expo-crypto)
- Run `eas build` to rebuild with new native packages
- Configure Google OAuth in Supabase Dashboard
- Fix email/DNS situation

## User Info
- Name: Evandro
- Email: jootaerre@gmail.com
- GitHub: evandroviskis
- Domain: dosetrace.io (registered on GoDaddy)
- Supabase org: EGSX development (Free plan)
