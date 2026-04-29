# LLM Council Transcript — DoseTrace Pressure Test

**Date:** 2026-04-29 18:55
**Subject:** Should DoseTrace continue as currently built, pivot, or stop?
**Founder:** Evandro (solo)

---

## Original question

> "I need to council the whole idea of this app"

## Framed question (sent to all 5 advisors)

> Is DoseTrace the right thing to be building? Pressure-test the entire premise — market positioning, audience, business model, regulatory strategy, technical complexity, founder capacity, and whether continuing is the right move or whether something fundamental needs to change.

**Context provided to advisors:** DoseTrace is a React Native + Expo SDK 54 app for tracking hormone replacement therapy (HRT), peptides (BPC-157 cited in V2 roadmap), and self-administered injection protocols. Public website headline: "DoseTrace — Hormone Therapy Tracker." Stack: RN, Supabase, SQLite, RevenueCat. 6 languages at launch. Pricing: $5.99/mo, $49.99/yr (50% promo → ~$25/yr), $119.99 lifetime. Free tier: 5 protocols + calculator + syringe guide + vial tracker + reminders + 1 bloodwork upload. Premium: unlimited protocols, unlimited bloodwork, planned serum curve visualizer. Audience: TRT users, peptide users, HRT patients, biohackers — overlap with grey-market peptide buyers. Regulatory posture: filed Health & Fitness (not Medical) on Play Store after two Medical-category rejections; health declaration repositioned to "Nutrition and weight management." Status: closed-testing third submission pending; iOS not yet submitted; 4 testers on list, 0 opted in. Email auth currently broken. Google OAuth client code added but Supabase provider not configured. EAS preview build running. Solo founder, two machines, no funding/team mentioned. V2 roadmap heavy and unbuilt: Apple Watch, family profiles, doctor PDF reports, gamification, health metrics integration, mood diary, persistent alarms, refill reminders, barcode scanning, drug interaction checking, offline-first, voice reminders.

---

## Anonymization mapping (for peer review)

| Letter | Advisor                  |
| ------ | ------------------------ |
| A      | The Outsider             |
| B      | The Expansionist         |
| C      | The Contrarian           |
| D      | The Executor             |
| E      | The First Principles Thinker |

---

## Advisor responses

### The Contrarian

The fundamental problem isn't the app — it's the regulatory trap you're walking into with eyes open.

You're building a medical application (bloodwork tracking, dose management, injection protocols, planned drug interaction checking) and disguising it as a fitness app. This works until it doesn't. Google Play rejection twice already signals they see through the repositioning. The moment someone dies or is harmed and DoseTrace's logs are discoverable, that "personal tracking tool" language becomes evidence of negligence, not protection. You've documented that you *know* this is medical software.

The regulatory risk compounds: FDA could eventually classify this as a clinical decision support system. The drug interaction checker you've road-mapped is a hard regulatory line. Once you cross it, you're a medical device. You're not building toward that — you're building toward a cliff.

Separate from that: your market has severe unit economics. $5.99/mo for tracking self-administered compounds is a low-trust, high-churn business. These users are price-sensitive (grey market context), privacy-paranoid, and episodic — they use the app intensely for 3 months, then ghost when they cycle off. Your lifetime LTV is probably $40–80. Your CAC in a niche this small (maybe 50k–100k addressable users globally, most untrackable) is probably $20–40 if you do paid acquisition, or $0 if you're betting on organic — which means you're betting on a subreddit and you'll never scale beyond 1–2k active users.

The technical debt is real but secondary: broken email, unfinished OAuth, zero live tester adoption, V2 scope that's 2–3 years of solo work. That's fixable.

What's not fixable: you're pre-committing to either operating in regulatory gray forever (venture cap killer, acquisition blocker, personal liability) or pivoting hard when enforcement comes. Neither position builds a business.

Pressure-test this differently: **What happens when the first medical board or state AG notices you?**

---

### The First Principles Thinker

Evandro is not actually asking whether to build DoseTrace. He's asking whether he's spent the last N months solving a real problem or optimizing a mirage.

Strip away the feature list and regulatory gymnastics. What you're seeing is a solo founder who has:

1. **Built a solution before validating the problem exists at scale.** The target audience (self-administering HRT/peptides) is real, but how many of them actually *want* an app? How many know this app exists? Zero paying customers would tell you that. Closed testing with 4 users, 0 opted in, is not validation — it's a warning sign that even people you've explicitly asked won't engage.

2. **Chosen a regulatory minefield and then lied about it.** You're building medical tracking software, repositioning it as "nutrition," and hoping app stores won't notice. This isn't agile — it's fragile. One regulatory shift, one complaint, and the entire GTM collapses. You cannot build a sustainable business on deception.

3. **Inverted the roadmap.** You're planning Apple Watch, gamification, and serum curves when the core product isn't live anywhere and has zero market proof. You're optimizing for a future that may never arrive.

4. **Misunderstood your constraint.** You are one person. Your constraint is not feature scope or localization — it's whether you can acquire and retain paying users. Everything else is distraction.

The real question: **Does a paying market exist?** Not "is this a good product," but do 100+ people exist who will pay $5.99/month for this *before* you build Apple Watch? Can you reach them? Will they stay?

If the answer is "I don't know," ship the minimal thing live, measure, and decide in 30 days. If the answer is "no," stop and pick something else. The regulatory complications, the technical debt, the localization work — they all assume product-market fit exists. It might not.

That's the pressure test.

---

### The Expansionist

The real asset here isn't DoseTrace — it's the distribution and trust network you're building into one of the most loyal, engaged user bases in biotech: people managing their own biology across TRT, HRT, peptides, and experimental protocols.

You're sitting on a beachhead in the self-directed health movement that's exploding. DoseTrace is the wedge. The actual moat is becoming the operating system for people who don't trust conventional medicine enough to wait, but are disciplined enough to track obsessively.

Here's what you're massively undervaluing:

**The data layer.** Six months in, you'll have protocol adherence patterns, dosing outcomes, and bloodwork correlations no pharma company or health app has. That's worth millions to researchers, supplement vendors, clinics optimizing their own protocols, and eventually to legitimate manufacturers watching the grey market.

**The adjacent verticals.** Once you own TRT/peptide tracking, you're positioned to own supplement stacking (BPC-157 is the gateway — you've already named it), coaching marketplaces, telemedicine for the self-directed, even DTC labs and bloodwork aggregation. That's not a healthcare app; that's a health infrastructure play.

**The regulatory arbitrage.** Filing as Health & Fitness is smart. But you're also building legitimacy. Once adoption is real, you transition to clinical validation, get partnerships with actual clinics, maybe even facilitate real clinical data. You become the infrastructure layer that makes grey-market protocols defensible.

**Why this scales:** Your audience will pay premium pricing because they're already spending 10x on the protocols themselves. Retention is brutal because the behavior is already baked in. And they'll tell their friends obsessively — these aren't casual users.

The bottleneck isn't the app. It's getting the first 10,000 people in and proving the data story. Everything else cascades from there. Stop optimizing for feature parity with fitness apps. Optimize for protocol community and outcome visibility.

---

### The Outsider

I'd be genuinely confused about what problem this solves for me.

The tagline says "optimize your protocol" but I don't know what that means. Are you helping me follow a doctor's prescription more carefully? Or are you helping me self-experiment with compounds? Those are *very* different things, and the app seems to blur them intentionally.

The inclusion of BPC-157 — a research peptide that isn't FDA-approved for human use — tells me this isn't really for people taking prescribed HRT under medical supervision. Those people have their doctor managing their protocol. This is for people experimenting on themselves. But the app leans hard on "not medical advice" language, which feels like legal cover rather than genuine safety positioning.

Here's what I can't figure out: Who is your actual customer? A trans person on prescribed estrogen/testosterone? A bodybuilder microdosing research peptides? A postmenopausal woman experimenting with bio-identical hormones? These people have completely different needs, risks, and whether they'd trust you. Right now, you're trying to serve everyone and being vague about all of them.

The pricing feels arbitrary. Why $5.99/month for dose logging? I could do that in Apple Health or a spreadsheet. What am I paying for that's worth $25–120 per year?

And the regulatory positioning worries me. You're in a space where people could genuinely harm themselves. Saying "we're not medical advice" doesn't shield you if someone tracks their doses wrong and it causes problems. You're either a medical device (regulated, expensive, slow) or you're a lifestyle app in a very high-stakes domain. You can't be both.

The one-person founding team is the biggest red flag. This isn't a side project — hormone tracking has liability, user safety, regulatory complexity. One person can't carry that weight.

I'd ask: Are you solving for a real audience, or are you building something that *feels* useful while avoiding the hard work of being actually responsible?

---

### The Executor

The app isn't live and can't get live. That's your only problem right now, and it's blocking everything.

Email auth is broken. Google OAuth isn't wired. Google Play rejected you twice and the third submission is pending into void — you have zero test users opted in, which means zero feedback and zero sense of whether anyone wants this. iOS isn't even submitted. You're building in the dark.

Here's what's actually happening: you're a solo founder with two machines trying to ship a feature-complete product across two platforms in six languages. That's not a V1. That's a V3. And because it's so feature-complete, every bug — like broken email auth — becomes a total blocker instead of a minor friction point you can route around.

Cut the six languages. Cut them now. Ship English only. You need one paying user in the next two weeks, not six localized markets. Six languages is marketing theater. One user is validation.

Fix email auth this week. It's a Supabase config issue, probably 30 minutes of reading docs. Then get Google OAuth working — another hour. Then submit the Play Store build again with the working auth. Don't wait for approval. Submit it this week.

Meanwhile, the V2 roadmap (Watch app, doctor reports, voice reminders, drug interaction checking, barcode scanning, offline-first architecture, serum curves) doesn't exist. Pretend it doesn't exist. It's noise that's making you feel like you're behind when you're actually just paralyzed. Delete the roadmap from your head.

Your one job this week: auth works, Play Store submission is live, and you have a path to one paying user. That's it. Everything else — including the iOS build — waits until you know someone will pay you.

The real question isn't whether DoseTrace is right. It's whether you can focus enough to ship it. Right now you can't, because you're building V3 instead of getting V1 in someone's hands.

---

## Peer reviews (anonymized advisor labels A–E used; mapping above)

### Reviewer 1

**1. Strongest:** E — cuts through the noise. Identifies that the founder hasn't validated PMF; zero opted-in testers and zero paying customers are disqualifying facts, not minor friction. Reframes the entire conversation. Uniquely calls out the inversion of priorities and the core constraint (one person can only acquire/retain users, not build features).

**2. Biggest blind spot:** A — correctly diagnoses audience ambiguity but misses economics entirely. Fixates on "who is this for?" without asking whether anyone in those segments will actually pay or can be reached. Pricing criticism ignores that the target user (already spending 10x on protocols) has different willingness-to-pay than fitness app users. A overstates regulatory risk for a pre-launch H&F app, conflating eventual liability with current viability.

**3. What ALL missed:** Customer acquisition. B assumes organic growth from Reddit. C dismisses addressable market without data. D/E focus on fixing app or validating demand but don't ask: how does this founder *reach* even 100 people in this niche? Distribution may be harder than the product problem. No one questions whether a solo founder with broken auth can credibly execute a pivot if validation requires one.

### Reviewer 2

**1. Strongest:** E — cuts through the noise to the fundamental question: does validated market demand exist? Correctly identifies DoseTrace as a symptom, not the problem. "Building V3 before V1 ships" diagnosis explains why 4 testers / 0 conversions aren't random — they're predictive. Catches the regulatory self-deception. Unlike D (right but tactical), E asks whether the *premise* is viable before fixing auth bugs.

**2. Biggest blind spot:** B — romanticizes the "OS for self-directed health" narrative without confronting unit economics or actual bottleneck. Assumes distribution, trust, and willingness-to-pay exist because the audience is "loyal" and spends heavily — but E's 4 testers / 0 conversions is direct evidence they don't. B confuses *aspirational positioning* with *market reality*.

**3. What ALL missed:** Why are the 4 testers unengaged? No response interrogates *what feedback they gave* (or what silence means). A/E suggest validation gap; C/D address execution/regulatory. But nobody asks: did users churn because the app is broken, or because the problem doesn't resonate? That distinction determines whether to ship faster (D) or pivot (E). Without that data, all advice is theoretical.

### Reviewer 3

**1. Strongest:** E — cuts through positioning theater to the core issue: validation gap. Correctly identifies that 4 testers/0 conversions is a red flag masquerading as early-stage progress, not a feature problem. Uniquely diagnoses the founder's decision-making pattern (solution before problem validation, inverted roadmap priorities) and prescribes the only move that generates real information: ship minimal and measure. E avoids both unfounded optimism (B) and regulatory doom-mongering (C) by grounding the decision in a 30-day data point that's actually measurable.

**2. Biggest blind spot:** B — assumes the hardest part (user acquisition + retention into a paid recurring behavior) will solve itself once you hit 10k users. Romanticizes "self-directed health" as an audience with proven purchasing power but ignores that the addressable market for *paid* HRT tracking is vanishingly small compared to free alternatives (Apple Health, spreadsheets, Discord communities). The data layer only has value if you can retain enough users to aggregate it — B skips that chicken-and-egg problem entirely.

**3. What ALL missed:** Whether Evandro has personal capacity/motivation to debug a broken auth system and grind through Play Store resubmissions on solo timeline. E gestures at focus; none ask the harder question: is the founder experiencing sunk-cost bias that's preventing honest assessment of whether 6 months → 0 paying users should trigger a fundamental pivot, not a feature sprint?

### Reviewer 4

**1. Strongest:** E — correctly identifies the inversion: Evandro built before validating. The 4 testers / 0 opted-in is the actual signal — not a launch problem, a market problem. E cuts through positioning debates by asking the only question that matters: does a paying market of 100+ users exist? The specificity (100+ at $5.99/mo) creates a testable hypothesis and a 30-day decision gate.

**2. Biggest blind spot:** A — dismisses the idea ("confused what problem this solves") without engaging the actual customer: self-experimenters doing rigorous tracking. A treats vagueness as evidence the problem doesn't exist, not as evidence of poor articulation. A's conclusion — "can't be both medical and lifestyle" — is legally true but misses that HRT/peptide users *are* hybrid customers. A offers no path forward.

**3. What ALL missed:** Founder-market fit. Does Evandro *want* to serve obsessive biohackers, or did he pick this because it seemed like a quick build? E hints at this but doesn't press it. B assumes high retention without evidence Evandro can retain anything. D assumes focus as fixable. C and A assume the regulatory problem is fatal without asking if repositioning (non-US markets, plain tracking, drop interaction checker) survives it. Responses debate the app; none debate whether Evandro should be building it.

### Reviewer 5

**1. Strongest:** E — cuts through fog directly: DoseTrace fails on validation (4 testers, 0 conversions), not execution. The insight that Evandro built before validating — and chose a regulatory minefield while lying about positioning — is the crux. E's ultimatum (ship live, measure in 30 days, or stop) forces real market signal in weeks, not months. All other responses assume the premise is salvageable; E questions whether the premise exists at all.

**2. Biggest blind spot:** B — sees distribution and data moat but misses that B's entire thesis depends on solving E's core problem first: proving paying users exist. B conflates "loyal biotech users exist" with "they'll use this app." The 0 opt-ins and 4 testers aren't a traction problem B can overcome with narrative — they're evidence the positioning doesn't resonate. B's vision is venture-scale thinking applied to a product that hasn't demonstrated PMF in a single cohort.

**3. What ALL missed:** **Founder psychology.** Every response analyzes the product/market/regulatory layer but ignores that Evandro has spent N months building something with zero traction and is now asking a council if it's worth continuing. That's sunk-cost trap territory. None address: Why does Evandro believe in this? What will he do when forced to choose between shipping broken (D's path) or killing it (E's conclusion)? The real constraint isn't Play Store rejections — it's whether the founder can pivot or quit.

---

## Peer review tally

| Question                          | Result                                                         |
| --------------------------------- | -------------------------------------------------------------- |
| Strongest response                | E (First Principles) — 5/5 reviewers                            |
| Biggest blind spot — Expansionist | 3/5 reviewers (B romanticizes without unit economics or chicken-and-egg traction) |
| Biggest blind spot — Outsider     | 2/5 reviewers (A treats vagueness as proof, offers no path)    |
| Universal blind spots             | Distribution; founder psychology / sunk cost; ungathered tester signal; survivable repositionings |

---

## Chairman's Verdict

### Where the Council Agrees
- **Validation is the actual problem, not features.** 4 testers / 0 opted in is the loudest signal. C, D, and E independently converged on this.
- **The roadmap is inverted.** Apple Watch, gamification, doctor PDF reports — multiple advisors flagged this as the founder doing the comfortable work instead of the hard work (acquisition + retention).
- **Solo founder + scope is mismatched.** Cross-platform + 6 languages + heavy V2 + regulatory dance does not fit one person's bandwidth.
- **Regulatory positioning is fragile.** Outsider felt it as legal cover; Contrarian called it a cliff; First Principles called it a lie. Different intensities, same direction.

### Where the Council Clashes
- **Goldmine vs graveyard:** Expansionist sees a high-LTV evangelizing tribe spending 10x on protocols; Contrarian sees a 50k–100k global niche with $40–80 LTV and 1–2k organic ceiling. Both can't be right; neither is proven.
- **Ship, validate, or stop:** Executor says ship this week. First Principles says ship minimal, measure 30 days. Contrarian implies the premise may be unsalvageable.

### Blind Spots the Council Caught
- Distribution unaddressed by all advisors.
- Founder psychology / sunk cost — flagged by multiple reviewers as the meta-question nobody asked.
- The 4 existing testers are an unmined data signal.
- Survivable repositionings (drop interaction checker, drop peptide examples, target non-US first) weren't explored.

### The Recommendation

Don't kill DoseTrace, but stop building it the way you have been. The disease is treating PMF as assumed and execution as the only variable. PMF here is unproven and the right move is the cheapest possible experiment that produces real signal.

1. **Ship the minimum viable thing live in 14 days.** English only. Email auth working. No Google OAuth (defer). No iOS submission. No Apple Watch. Play Store closed → open beta with the bugs fixed.
2. **Talk to your 4 existing testers.** 5-min calls or DMs. Why haven't they opted in? Friction or apathy?
3. **Set a 30-day decision gate.** ≥10 unprompted active users by day 30, or a clear specific reason why and a precise next experiment. Otherwise pause.
4. **Pick a lane on regulatory + ambition.** Either bootstrap-niche openly ($10–50k/mo, choose your subreddit, build trust) or go for medical platform with proper compliance (different game, timeline, capital). Can't be both.

### The One Thing to Do First

Today, before another line of code: write a one-sentence answer to "Who is this for, in 10 words or less, in a way they would say it themselves?" Then send that sentence to all 4 testers individually with a single yes/no question. If they don't reply, that's your data. If they do, that's your audience. Either way, actionable signal in 48 hours.

---

*End of transcript.*
