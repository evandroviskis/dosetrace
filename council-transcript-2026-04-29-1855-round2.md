# LLM Council Transcript — Round 2 (V1 Scope)

**Date:** 2026-04-29 (continuation of Round 1, same session)
**Subject:** Optimal V1 scope, deferral plan (V2/V3/V4), missing features, overthinking, competitive sweep
**Founder:** Evandro

---

## Founder's response to Round 1 (new context)

> "App was built and had zero installs on testers so far. I did not try to install to real customers. Only installed on family members devices to validate the appearance of the app. That's what the low conversion."
>
> "Distribution: I do have about 60 customers buying peptides weekly and a list with over 500 individuals that consume peptides that could potentially try the app. I also have a whatsapp channel with 150 members that I could send an introduction and invitation to download as soon as it's finally available in app store and google play. From there, I could use influencers that talk about peptides all the time and pay them to spread the word."
>
> "Before Shipping: Council what features, if any, are missing and what should be saved for a version 2, 3 and 4. Sweep the app stores to check what I am missing and what I am overthinking. The goal is income first and as I do not need the revenue, reinvest 100% into making it better."
>
> "Based on the total amount of peptide users worldwide and USA reevaluating banned peptides like epitalon and ghk-cu for example, a large field might open soon. Consider that."
>
> "Who is this for? This app should serve any peptide user that has doubts on how to seal with lyophilized powder peptides, reminder of dosages and quantity if using different peptides at the same time, people doing TRT and track of how they feel every once and a while and vitamin users on tracking if they are felling better today because of the vitamin C they took yesterday or maybe it was the MOTS-C? These are examples on where my mind went and if legal, I wanted to implement it."
>
> "Based on the amount of people I see daily that can't figure how to calculate the amount of diluent to dilute a tirzepatide and how to calculate the amount to draw to take the dose (ignorance of users), this could be worth a couple dollars a month. I am not looking to reach 20 million users out of the 500 million peptide worldwide users. I would be happy for now with a 20 to 50k users in 5 years."

---

## Reframed question for Round 2

> Given confirmed warm distribution (60 weekly buyers, 500-list, 150-member WhatsApp channel), founder-market fit (vendor + sees customer pain daily), and a 20-50k user / 5-year goal: what's the right V1 scope to ship NOW vs defer to V2/V3/V4? What's missing? What's overthought?

Plus: a competitive sweep of the App Store / Play Store to identify what existing peptide/HRT/TRT trackers already ship.

---

## Round 2 advisor responses

### The Contrarian (R2)

The Fatal Flaw: he's selling two incompatible products simultaneously.

Evandro is a peptide vendor trying to launch a health tracker for peptide users. This creates three converging disasters:

1. **Trust inversion.** Users downloading his app will assume (correctly) he's collecting their protocol data to optimize his sales pitch and upsell them. Every bloodwork upload, every protocol they log — it's now business intelligence for his vendor operation. Competitors will weaponize this. Regulators will notice.

2. **Liability nightmare.** The app currently tracks self-administered injections. If a user logs a protocol, gets injured, and sues — discovery reveals he's the vendor who sold them the peptide. He's now liable twice: as the seller AND as the tracker that didn't warn them. The app becomes a liability magnet.

3. **Realistic conversion is 3-5%, not 20%.** WhatsApp channels are notoriously low-intent. 10% opt-in × 30% paid conversion = 15 users from 500. That's a vanity metric.

4. **The tirzepatide example reveals the problem.** Tirzepatide is a prescription GLP-1. GLP-1 users are insurance-covered, supervised. His actual peptide audience (epitalon, GHK-Cu, BPC-157) is grey-market, price-sensitive, trust-paranoid — and he IS the vendor. These are irreconcilable.

What he's missing: a business model that doesn't require him to be trustworthy. Sell the app anonymously or through a partner. V1 should not ship from him. It should ship from someone else.

---

### The First Principles Thinker (R2)

Strip the noise: Evandro isn't building a health-tracking app. He's building a **customer lock-in tool for his peptide business.**

The question "should we add Apple Watch in V2?" is upside-down. The real question is "what's the minimum app that makes my 60 weekly buyers stickier and reduces support friction?"

Evandro sees a daily pain: customers ask "how do I reconstitute tirzepatide?" 50 times a month. That's not a feature gap — it's a support cost he can eliminate. The calculator isn't a feature; it's **a deflection mechanism that reduces his operational burden.**

The 20-50k user goal isn't about app virality. It's about converting his 500-person list and 150-member WhatsApp channel into app users. **Distribution is solved.**

**V1 should be:** a free tirzepatide (and common-stack) reconstitution calculator bundled with a simple dose log. That's it. Solves the named pain. Keeps users in the ecosystem. Minimal engineering. Ships in 2 weeks. 80% of the value at 5% of the scope.

The premium tier with "unlimited protocols" assumes he's selling to strangers. He's not. His margin is on peptide sales. The app is a loyalty mechanism. Multi-language? 500-person list. English first.

**The product is not a health app. It's a customer service chatbot you don't have to maintain.**

---

### The Expansionist (R2)

**Ship NOW:**

1. **Reconstitution calculator as a free, standalone web tool** — calc.dosetrace.io. Becomes your SEO moat and top-of-funnel. Every peptide user Googling "tirzepatide reconstitution" lands here. Free, frictionless, category-defining.

2. **Sharing protocol recipes** — Users export/share exact stacks (5mg BPC-157 + 10mg TB-500 + X syringe) as QR or link. Sharable, viral. V1 with 5+ ready-made templates from your vendor network.

3. **Community + vendor integration from day 1** — Don't hide that you're a vendor. Lean into it. Users see "Suggested by [vendor]" for common stacks. Builds trust AND creates a network effect where other vendors want their stacks featured.

4. **Bloodwork correlation dashboard** — Skip AI hype for V1. Ship a visual: "You increased TB-500 on Week 4, your WBC climbed 2 weeks later." Dead simple, no ML.

5. **Intentionally sparse feature set** — Lose FAQ and blog aspirations. One screen each: protocols, today's doses, bloodwork/correlations.

**Defer to V2/V3:** Causal inference / AI · Vitamin tracking (separate app) · 6-language i18n · RevenueCat · Sync and offline-first.

**The real opportunity:** 20-50k users at $25-50 ARPU = $500k-$2.5M ARR — a great bootstrapped business. Your vendor relationships + user data = the infrastructure layer. The app is the Trojan horse; the data network is the moat.

---

### The Outsider (R2)

You've built something more coherent than you know. The tirzepatide reconstitution pain point is real. But three concerning misdirections:

**The vendor-as-tracker play is weirder than it needs to be.** To a stranger, you're asking people to put dose logs into an app built by the guy selling them the raw peptide powder. Not inherently disqualifying — actually a powerful distribution moat — but you're not leaning into it. You're pretending it's just a wellness app. **Own the ecosystem angle.** Right now it reads like you're embarrassed about the source.

**The grey-market context is invisible to the app.** Tirzepatide from powder reconstitution is legally murky. Your 60-customer base knows this; your future 50k user base won't. The app needs to whisper "we know what you're really doing" without saying it. Your FAQ doesn't address this at all. It should.

**Vitamins + peptides in one app is a feature tax, not a feature.** A vitamin taker tracks "did I remember? do I feel better?" A tirzepatide user tracks "is my math right? how much is left?" Different UX problems. You've conflated distribution (your list has both) with product. Ship V1 as **the peptide tracker.** Vitamins are 2027.

**Six languages on day 1 is theatre.** Your 60 core customers are English speakers. Launch in English. Add Spanish in month 3.

**For V1 right now:** Core dose logger + vial tracker + reconstitution math (don't touch). Keep simple streak/consistency view. Cut bloodwork PDFs, doctor PDFs, drug interaction, voice reminders, barcode scanning, Apple Watch, family profiles.

Stop building for the 20-50k user you hope exists in 5 years. **Build for the 60 you have right now.**

---

### The Executor (R2)

**Hero feature:** the reconstitution syringe guide — already baked in, animated, working. Ship it unchanged.

**Kill to ship fast (14 days):**
- Six languages → rip out, English + Spanish only (~8 days saved).
- Bloodwork upload → defer. Sexy, zero MVP demand. Delete the tab.
- Streaks/fire → keep. Ultra-cheap, psychological hook. Already coded.
- Email auth → fix. Google OAuth client code is in; Supabase provider config is missing. One-line fix in Supabase Dashboard.

**Install funnel:** WhatsApp link → install → onboarding (~2 min) → first log (~10 sec) → add protocol (~1 min) → free tier 5 protocols, paywall on 6th. Revenue gate at creation, not login.

**Platform priority:** Android first. Audience skews Pixel/Samsung. iOS second once 2k users justify Apple's cut. Ship both in 14 days but feature parity on Android.

**V2 trigger:** Apple Watch unlocks at 2,000 active users + 40% DAU dose compliance. Drug interaction checker = V3+, regulatory nightmare, defer indefinitely.

**30-day plan:**
- Days 1-3: fix Supabase Google provider, disable 6-lang UI, remove bloodwork tab.
- Days 4-7: EAS build, TestFlight + Play Internal.
- Days 8-10: closed beta with 10 testers + 2 real customers.
- Days 11-14: ship Android Public, iOS App Store review, WhatsApp link to 60-customer batch.
- Days 15-30: monitor DAU, install→first-dose, protocol creation, revenue. Patch bugs. Plan V2.

You're not building, you're tuning and shipping. **Monday: ship to 2 real customers via WhatsApp. By Day 14, App Store. By Day 30, you'll know.**

---

## Competitive sweep (Chairman addition, App Store / Play Store)

Found 15+ direct competitors:

**Peptide-specific:**
- PepCalc — peptide calculator, iOS+Android
- PeptIQ — peptide & injection tracker, native iOS/Android/web
- PeptideCalc.io — calculator, scheduling, iCloud sync, multi-peptide blends
- PeptideKit — calculator + journaling
- Peptide Tracker & Calculator (App Store)
- Pep Pal — calculator, multi-peptide
- PeptideFox — FoxAI calculator

**TRT/HRT-specific:**
- OptiPin · TRT Peptide Tracker — 100+ medications, hormones, bloodwork, custom trackers, injection site rotation
- TRT Plus (Android) — 80+ pre-configured compounds, **compound half-life charting w/ peak/steady-state/clearance** (= DoseTrace's V2 hero feature, already shipped)
- InjectionMate — "Hormone Therapy Tracker" tagline (same as DoseTrace), TRT/HCG/Clomid/HRT, female estrogen tracking
- MyTRT — 25+ biomarkers, free + Pro
- TRT Tracker — visual body map, biomarker monitoring
- Anabolic Steroid & TRT Tracker
- InjectionLog — TRT + peptides + weight loss
- Done Dose — HRT-focused

**Critical findings:**
- TRT Plus already ships the planned "serum curve visualizer" → DoseTrace will not differentiate on it
- Most competitors are English-only (DoseTrace's 6-lang code is differentiator if reduced sensibly)
- **None are simultaneously a peptide vendor with 60 weekly buyers** — that moat is uniquely Evandro's
- **Injection site rotation + body map** is standard across competitors but missing in DoseTrace
- **Compound presets / one-tap setup** is standard (TRT Plus 80+) but missing in DoseTrace

---

## Chairman's Verdict — Round 2

### Where the Council Agrees (R2)

- **Cut the six languages.** Three of five advisors said it independently. Outsider was sharpest: "i18n on day 1 is theatre." Ship English only. Add Spanish at V2 trigger.
- **The reconstitution calculator is the hero, not a side feature.** First Principles called it "the entire product." Build the launch around it.
- **Cut bloodwork uploads, vitamins, and most of the V2 list from V1.** Outsider, First Principles, and Executor converged.
- **The vendor + app combo is the wedge — but cannot be hidden.** Outsider and Expansionist both said: own it. First Principles said it's a customer-retention tool.
- **Ship in 14-30 days using existing distribution.**

### Where the Council Clashes (R2)

**Is the vendor + tracker combo an asset or a liability?** Contrarian sees liability — recommends shipping from a separate entity. Other four see it as a moat. Resolution: real but mitigable risk. Don't cross-promote your peptide sales inside the app. Disclose the vendor relationship in About/legal. Don't claim the app makes dosing safer.

**Public virality vs captive audience for V1?** Expansionist wants protocol-sharing QR codes. Outsider says build for the 60. Resolution: ship V1 to captive audience. Add protocol-sharing as V1.5.

### Blind Spots Revealed by the Competitive Sweep

- TRT Plus already ships the planned "serum curve visualizer" — DoseTrace will not differentiate on it. Drop or de-prioritize.
- 15+ direct competitors exist; the space is more crowded than Evandro's framing suggested.
- DoseTrace is missing two features that are standard across competitors: injection site rotation + body map; one-tap compound presets.

### V1 / V1.5 / V2 / V3 / V4 plan

**V1 (14 days):** Reconstitution calculator (hero) · Dose log + reminders · Vial tracker · ~20 compound presets (BPC-157, TB-500, semaglutide, tirzepatide, retatrutide, ipamorelin, CJC-1295, sermorelin, MOTS-c, NAD+, GHK-Cu, epitalon, testosterone enanthate/cypionate, HCG, T3, T4, B12) · Streaks · Free 5 protocols / paid unlimited · English only · Email auth working · Android first, iOS within 7 days · Vendor disclosure in About.

**V1.5 (30 days post-launch, if V1 ships clean):** Injection site rotation + body map · Custom symptom tracking · Protocol sharing via link/QR.

**V2 (1,000 active users OR 100 paid subs):** Spanish + Portuguese · Bloodwork PDF upload · Apple Watch (only if iOS users specifically request) · Doctor-shareable PDF report.

**V3 (5,000 active OR $5k MRR):** Apple Health / Google Fit · Mood diary · Persistent escalating alarms · Barcode scanning.

**V4 (probably never, or only with legal counsel):** Family / dependent profiles · Voice reminders · Serum curve visualizer (only build if 10× better than competitors).

**KILL outright:** Drug interaction checker (regulatory cliff) · Six-language launch · Vitamin causal-correlation in this app.

### What's MISSING

- Compound presets / one-tap setup for the 20 most-asked peptides
- Injection site rotation with body map
- Custom symptom tracking
- Clear public vendor disclosure (turn it into a trust feature)

### What's OVERTHOUGHT

- Six-language launch
- Bloodwork upload in V1
- Drug interaction checking (kill forever)
- Apple Watch app (V2 trigger)
- Serum curve visualizer (competitors have it)
- Vitamins + peptides in one app
- Concern about scaling to millions

### The One Thing to Do First

**Today, before anything else:** list the 20 most-asked compounds in your peptide vendor business. Tomorrow, build them as one-tap presets in the Protocols screen. That single feature will move install→active conversion more than anything else for your existing 60 customers, and it's the biggest visible gap vs your competitors. Everything else is noise compared to "tirzepatide preset, BPC-157 preset, semaglutide preset — tap once, start tracking."

---

*End of Round 2 transcript.*
