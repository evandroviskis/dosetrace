# LLM Council Transcript — Compound Data Foundation

**Date:** 2026-07-03 21:40
**Topic:** How should DoseTrace build its compound-selection data foundation now to serve a future B2B (trainer/medical-provider) direction and near-term PDF export — without over-building or prematurely committing to a regulated model?

---

## Framed question

DoseTrace is a pre-launch React Native app: a personal peptide/protocol tracker + reconstitution calculator, positioned as a "personal log, not medical advice" wellness tool. 6 languages, distribution via a ~700-person peptide-user network.

Today a protocol stores the **localized display name** of the compound ("Retatrutide" EN vs "Retatrutida" PT), and the compound field allows **free typing** — dirty data (mistypes like "Blow" for the blend "Klow"; same compound as different strings per language). Lists are hardcoded: 94 lyophilized + 28 ready-to-use.

Owner wants an exhaustive list including blends (Glow, KLOW…) so no user is blocked, and clean canonical data so downstream (PDF to clinicians, future B2B protocol-sourcing) starts right.

Proposed approach to critique: (a) canonical compound record — stable id/slug + canonical name + aliases + category + blend components; (b) store id, not display name; (c) select-only picker with alias search; (d) static data file now → server registry later.

Tensions: right foundation vs over-engineering pre-launch; "select-only clean data" vs "never block a user whose compound isn't listed"; minimum viable no-regret version; how the looming B2B/medical regulatory reframe should shape today's data model.

---

## Advisor responses

### The Contrarian
Store the id, not the display name — correct and cheap. Everything else is where the flaw is. "Select-only, no free text" directly contradicts "never block a user." You can't have both. In a 700-person network, underground blends not in your list will appear weekly; a select-only picker becomes a wall, and you've guaranteed it by forbidding the escape hatch. Answer: allow a "custom compound" that writes a real record with `source:user`, `canonical:false` — dirty but attributed and mergeable later. Don't pretend you can enumerate an adversarial, ever-changing gray-market catalog. The harder question you're avoiding: the B2B/medical reframe isn't a data-model problem, it's a liability problem. The instant a provider "sources protocols and follows doses," you're no longer a personal log — you're dosing infrastructure for controlled/unapproved substances across 6 jurisdictions. A cleaner component list makes your data more useful as evidence, not less. Minimum viable, no regret: canonical id + display name + aliases. Skip component-lists, categories, server-registry scaffolding until B2B is validated and legally cleared. The regret isn't under-structuring — it's spending launch runway architecting for a pivot regulation may forbid.

### The First Principles Thinker
Store the id, kill the free-text field — not over-engineering; it's the only irreversible decision, because dirty free-text can't be un-mixed later. But the question smuggles a false framing. "Select-only clean data" vs "never block" isn't a real tension — "not in our list" is two problems: (1) compound exists, uncatalogued → a coverage bug on YOUR side; (2) user genuinely has something novel. Case 1 is 99% of a 700-person network sharing ~120 compounds. The answer isn't free text — it's a fast "request/add compound" path that mints a canonical record; the user picks from a growing list, you never lose the string to a display name. Sharper cut: you're building B2B regulatory infrastructure to solve a launch-week autocomplete problem. Component lists, provider metadata — answering a question no user has asked. Minimum viable: canonical record { id, canonicalName, aliases[], category }; store id on protocol (non-negotiable); localization is a display layer over the id, never stored; leave components[] nullable, populate never until a real B2B requirement defines the shape. The regret you're avoiding isn't "we didn't model components" — it's "we stored 'Retatrutida' as a string."

### The Expansionist
Build the canonical registry — but framing this as "clean data foundation" is thinking too small. The registry is the actual asset that makes the B2B pivot defensible. A curated, alias-mapped, multilingual, blend-decomposed compound database is itself a product; nobody in the peptide space has clean canonical data with component breakdowns (KLOW → its constituents at real ratios). Trainers/clinicians will pay for that structure. Go further: add a components model with per-component dose ratios (makes a blend PDF useful to a doctor; seeds a per-component reconstitution calculator); version the registry from day one (schema_version + per-record updated_at) so a server registry can push new compounds to 700 users without an app release — a distribution edge over competitors' hardcoded lists; capture user free-text as signal, not dirt — route unmatched entries to an "unmapped" queue that becomes your roadmap. Resolve the tension: select-only for matched compounds, "request/add new" for the rest. The medical direction shouldn't just shape the model — the model should become the thing you sell.

### The Outsider
Store the ID, not the typed text — right, do it before launch. Everything else is heavier than the problem. A normal user opens the app and wants to log what they injected in under ten seconds. The scary failure isn't duplicate spelling — it's "my compound isn't listed, so the app won't let me log it, so I stop using the app." A logbook that blocks you is broken. Never make the list a wall: always offer "can't find it? add your own," store as free-text flagged "unverified," merge into a real ID later. Assumptions a stranger wouldn't make: (1) that people know the "main name" — many know only the supplier's nickname ("Klow"); search-by-nickname is the PRIMARY way people find things, build it first. (2) "Blow" vs "Klow" may be an ordering/mis-tap problem in fuzzy search, not spelling — confirm the choice with a second detail (category / what's in the mix) before saving. (3) the PDF-for-a-doctor goal quietly strains "not medical advice" — get it reviewed before it ships. Simplest non-regret: pick-from-list with nickname search, permanent IDs, always-available "add unlisted." Skip the trainer/doctor platform for now.

### The Executor
MVP that avoids regret: do canonical-record + store-id + select-only picker. Defer the "exhaustive" ambition. The regret-proof core is stable IDs on protocols — the one thing you can't retrofit cheaply. Sequence: (1) schema for one record { id, slug, canonicalName, category, aliases[], components[]? }; ship compounds.json with the ~122 you already have — you're not researching, you're transcribing existing arrays into IDs (one afternoon). (2) Add compound_id column alongside the existing name field; write both — kills migration risk. (3) Rebuild picker as select-only over the JSON, search matching canonicalName + aliases; free text goes behind a "Can't find it? Request" button that logs the string (backlog, not blocker). (4) Ship; backfill compound_id on the few pre-launch rows, retire name field later. Defer: blend components, server registry, exhaustive 100+ research pass, full 6-language names. The real trap: translations. Canonical names mostly don't need translating (Retatrutide is Retatrutide) — store ONE canonical name, make search alias-aware, treat "Retatrutida" as an alias, NOT a 6th translation block. Tying compounds to the 6-language-block pattern rebuilds the mess you're escaping.

---

## Peer reviews (anonymization: A=Expansionist, B=Outsider, C=Contrarian, D=Executor, E=First Principles)

**Reviewer 1:** Strongest = C (names the real irreversible decision, reframes B2B as a liability problem across 6 jurisdictions, resolves select-vs-block with an attributed mergeable record). D = best execution answer. Biggest blind spot = A (gold-plating + publishing gray-market blend ratios is the most legally exposed move and A never notices). All missed: **data authorship/ownership** — who owns a user-minted compound, how one user's "unverified" entry propagates/contaminates once B2B sharing begins; the merge model needs a dedup/authority policy before dirty records accumulate.

**Reviewer 2:** Strongest = C (only one naming the liability stakes; resolves the false tension cleanly; warns launch runway shouldn't fund a pivot regulation may forbid). Biggest blind spot = A (registry-as-sellable-asset maximizes the risk C identifies). All missed: **merge/relabel rewrites history** — re-mapping a custom record to a canonical id silently changes the user's historical dose log (data-integrity + evidentiary problem if exported to a doctor); no one specified offline/local-first sync of a growing registry across 700 users; a PDF stating doses may need jurisdiction-specific disclaiming, not one global "not medical advice."

**Reviewer 3:** Strongest = C (buried lede: liability across 6 jurisdictions; exposes select-only vs never-block as logically incompatible; attributed mergeable record). D = best execution. Biggest blind spot = A (curated gray-market dosing database with per-component ratios is potential evidence of facilitating unapproved-substance dosing). All missed: **who curates and is accountable for the canonical record** — replacing a user's typed string with an authoritative id + component ratios means *the app* asserts "this is what KLOW contains," a factual claim about unregulated products you can't verify. Free text is the user's word; a canonical registry is yours. That shift of authorship is the real regulatory hinge.

---

## Chairman verdict

### Where the council agrees
1. **Store a stable, language-independent compound `id` on the protocol — not the display name.** Unanimous, and named repeatedly as the *only irreversible* decision. Dirty free-text strings can't be un-mixed later.
2. **Localization is a display layer over the id.** "Retatrutida" is an *alias*, not a stored value and not a sixth translation block. Tying compounds to the 6-language pattern rebuilds the mess.
3. **"Select-only vs never-block" is a false dichotomy.** Resolve with an always-available "can't find it? add it" path that mints an *attributed, unverified* record (`source:user`, `canonical:false`) — never free text into the name field. The user is never blocked; the canonical namespace stays clean.
4. **Alias / nickname search is the primary find path, not a nice-to-have.** People know the supplier's nickname ("Klow"), not the canonical name. This is what actually kills the "Blow vs Klow" problem.
5. **Do not over-build for B2B pre-launch.** Defer component-ratio models, the server registry, provider metadata, and the exhaustive 100+ research pass.
6. **The B2B/medical + PDF-to-doctor direction needs legal review before it ships** — it strains "not medical advice."

### Where the council clashes
**The Expansionist vs everyone else (on timing and on component ratios).** The Expansionist argues the registry *is* the sellable asset — build blend-component ratios and versioning now, make the data the product. All four other advisors and all three reviewers push back hard: pre-launch that's gold-plating, and worse, a curated database asserting gray-market blend ratios is legal *exposure*, not just an asset. Reasonable disagreement, because the Expansionist is genuinely right that clean canonical data is a real moat — but the resolution is decisively about **sequence**: the moat is worth building *later, after legal clearance*, not now. The one Expansionist idea everyone can adopt cheaply today: capture unmatched/added entries as a roadmap signal queue.

### Blind spots the council caught (only surfaced in peer review)
- **Authorship is the real regulatory hinge.** Free text is the *user's* claim about what they took. A canonical record with component ratios is *your* claim — the app now asserts "this is what KLOW contains," a factual statement about unverified products across 6 jurisdictions. Keeping the "added" compound framed as the user's own label preserves user authorship and sidesteps this until legal review.
- **Merge/relabel silently rewrites history.** Re-mapping a user's custom entry to a canonical id later changes their *historical dose log* — a data-integrity and (if exported to a doctor) evidentiary problem. Needs a dedup/authority policy before dirty records accumulate.
- Jurisdiction-specific disclaiming on the PDF (one global "not medical advice" may be insufficient).
- Offline/local-first sync behavior of a growing registry across 700 users (a later concern, but real).

### The recommendation
Build the **minimal canonical layer** now; defer the asset/B2B ambitions.
- Compound record: `{ id, slug, canonicalName, category, aliases[] }`. A `components[]` field may exist but stays **empty** — do not publish blend ratios.
- Store `compound_id` on the protocol (dual-write alongside the existing name during the pre-launch transition; trivial backfill).
- Picker = **select-first with alias search** + an always-available "Can't find it? Add it" that mints an attributed, unverified record framed as *the user's own label* (never blocks, never dirties the canonical namespace, preserves user authorship).
- Log unmatched/added entries as a roadmap queue (the Expansionist's one cheap gem).
- Explicitly **do not**: model component ratios, build the server registry, run the exhaustive research pass, or build any provider/B2B features. Get legal eyes on the doctor-facing PDF and the B2B direction before either ships.

This *refines* the owner's plan rather than replacing it: their instinct to store the id was correct; the council pulls back the component-lists / registry / exhaustive-research as premature and legally hot, resolves select-only with an attributed escape hatch, and flags authorship as the thing to clear legally before the B2B pivot.

### The one thing to do first
Define the compound record schema and **store `compound_id` on the protocol (dual-write)**. Concretely: transcribe the existing 122 compounds into a `compounds.js` registry with ids + aliases, add the `compound_id` field, and switch the picker to write the id. Everything else can grow around that one irreversible move.
