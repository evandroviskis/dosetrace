# extract-bloodwork v6 — provider-error logging (2026-08-28)

v5 + console.error at every failure point (provider status + Anthropic error body,
invalid-JSON head + stop_reason, unexpected shape, missing key, unhandled catch).
No behavior change; responses identical to v5.

Why: all extraction attempts since Aug 25 fail 502 provider_error in ~1s and v5
logs nothing, so we can't see WHICH Anthropic error it is (credit exhausted vs
disabled key vs PDF rejected). v6 makes the next failure self-explanatory in
Supabase function logs.

STATUS: DEPLOYED — live as remote version 10 (2026-09-04).
v10: VACCINE_PROMPT now returns structured manufacturer/batch_lot/dose_number/
provider/location fields (plus notes for anything else). Backward-compatible —
the function returns parsed.vaccines as-is, and the live v1.0 app ignores the
new keys; the 1.1 app captures them. Lab (EXTRACTION_PROMPT) path unchanged.
Earlier — v9:
v9 also sends the `anthropic-workspace-id` header (wrkspc_01TC6F8rtt7X3Rom3nLBqjbr,
workspace "dosetrace-prod") — REQUIRED by the new identity-linked API key type;
without it Anthropic rejects every call with 400. Falls back to env
ANTHROPIC_WORKSPACE_ID if that secret is ever set.
TODO on MacBook: copy this index.ts over supabase/functions/extract-bloodwork/index.ts
in the repo and commit, so the repo matches what is deployed.
