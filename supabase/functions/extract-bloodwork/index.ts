import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ~15MB of base64 (the client pre-checks at 10MB of raw file; this is a hard server cap)
const MAX_BASE64_LENGTH = 15 * 1024 * 1024;

// Monthly AI-scan budget per user. Lab, vaccine, and vial scans share this one
// cap — it protects against uncapped spend on the shared Anthropic key and is
// the product limit for the scan features. One place to change it.
const MONTHLY_SCAN_LIMIT = 3;

// IMPORTANT: this prompt is deliberately regulatory-safe (no interpretation,
// classification, or clinical assessment). Do not alter its instructions.
const EXTRACTION_PROMPT = `You are extracting numeric lab values from a laboratory report.
The report may be in any language (English, Portuguese, Spanish, French, German, Italian,
Chinese, Japanese, Arabic, or others). It may come from any laboratory in any country,
in any layout — tables, columnar reports, prose paragraphs, single or multi-page, digital
PDFs or scans. Handle all of them.

Return ONLY a single JSON object with this exact structure, and nothing else — no markdown
fences, no prose, no explanations before or after:

{
  "report_date": "YYYY-MM-DD",
  "markers": [
    { "marker": "Marker name", "value": numeric_value, "unit": "unit string" }
  ]
}

Rules:
- Include every lab value you can find in the document. Do not skip any.
- "marker" is the name of the test/analyte in ENGLISH when a widely-recognized English
  translation exists (e.g., "Glicose" -> "Glucose"; "Colesterol total" -> "Total
  Cholesterol"; "Testosterona total" -> "Testosterone, Total"). Otherwise keep the
  original name from the report.
- "value" is a number (not a string). Convert decimal comma to decimal point
  (e.g., "5,4" -> 5.4). If the value is a non-numeric qualitative result
  ("Negative", "Positive", "Reactive"), skip that marker entirely.
- "unit" is a string exactly as printed on the report, preserving case
  (e.g., "mg/dL", "ng/dL", "mmol/L", "pg/mL", "IU/L", "%"). If no unit is printed
  for a value, use an empty string.
- "report_date" is the collection date if present, otherwise the report date, in
  ISO-8601 (YYYY-MM-DD). Interpret local date formats correctly:
  DD/MM/YYYY (Brazil, EU) vs MM/DD/YYYY (US). See the DATE ORDER note below.
  Use today's date ONLY when no date at all is printed on the document.
- Do NOT include reference ranges, normal ranges, flags (H/L), status labels,
  interpretations, or any clinical assessment. Extract raw values only.
- Do NOT include patient identifiers, physician names, addresses, or any information
  that is not a lab measurement.
- Do NOT wrap the JSON in code fences or add any commentary.
`;

// Vaccine-record extraction (vaccine card, immunization record, or a doctor's
// sheet). Same regulatory stance: extract what is printed, never advise.
const VACCINE_PROMPT = `You are extracting vaccination records from a document — a vaccine card,
an immunization record, or a doctor's sheet. It may be in any language and any layout
(tables, columns, handwritten cards, single or multi-page, photos or PDFs). Handle all of them.

Return ONLY a single JSON object with this exact structure, and nothing else — no markdown
fences, no prose, no explanations:

{
  "vaccines": [
    { "name": "Vaccine name", "date_given": "YYYY-MM-DD", "next_due": "YYYY-MM-DD or null", "notes": "string" }
  ]
}

Rules:
- One entry per dose listed. Boosters and repeat doses are separate entries.
- "name" is the vaccine in ENGLISH when a widely-recognized English name exists
  (e.g., "Tétano" -> "Tetanus"; "Gripe"/"Influenza" -> "Influenza (flu)";
  "Hepatite B" -> "Hepatitis B"; "Febre amarela" -> "Yellow fever"). Otherwise keep
  the original name from the document.
- "date_given" is the date that dose was administered, in ISO-8601 (YYYY-MM-DD).
  Interpret local date formats correctly: DD/MM/YYYY (Brazil, EU) vs MM/DD/YYYY (US).
  If a dose has no readable administration date, omit that entry entirely.
- "next_due" is the next-dose or booster-due date ONLY if it is explicitly printed;
  otherwise null. Never infer, schedule, or recommend a date.
- "notes" holds brief printed extras for that dose (lot/batch number, manufacturer or
  brand, dose number, injection site). Empty string if none.
- Do NOT include patient identifiers, physician names, or addresses.
- Do NOT wrap the JSON in code fences or add any commentary.
`;

// Vial-label extraction (a photo of a single peptide/hormone vial's printed
// label) — to pre-fill the reconstitution / ready-to-use calculator. Same
// regulatory stance: transcribe what is printed, never advise, never calculate.
const VIAL_PROMPT = `You are reading the printed label of a single medication or peptide vial to help a user pre-fill a dosing calculator. The label may be in any language and any layout, printed or handwritten, and may be a lyophilized (freeze-dried powder) vial that will be reconstituted, or a ready-to-use liquid/oil vial.

Return ONLY a single JSON object with this exact structure, and nothing else — no markdown fences, no prose, no explanations:

{
  "compound_name": "string or null",
  "form": "powder" | "solution" | null,
  "amount": number or null,
  "amount_unit": "mg" | "mcg" | "IU" | "",
  "concentration": number or null,
  "concentration_unit": "string",
  "volume_ml": number or null
}

Rules:
- "compound_name" is the active ingredient's name EXACTLY as printed (e.g. "BPC-157", "Semaglutide", "Testosterone Enanthate"). Keep the printed spelling; do not translate, expand, or normalize it. If several ingredients are listed (a blend), join them with " + ". Null if no name is legible.
- "form": "powder" if the label indicates a lyophilized powder / freeze-dried / "for reconstitution"; "solution" if it is a ready-to-use liquid, oil, or already-dissolved solution; null if unclear.
- "amount" + "amount_unit": the TOTAL quantity of active ingredient in the vial (e.g. "10 mg" -> 10 / "mg"; "5000 IU" -> 5000 / "IU"; "1500 mcg" -> 1500 / "mcg"). Use the unit as printed. Null if not printed.
- "concentration" + "concentration_unit": ONLY if a per-volume strength is printed (e.g. "250 mg/mL" -> 250 / "mg/mL"). Common on ready-to-use oils/solutions. Null / "" if not printed.
- "volume_ml": the liquid fill volume in millilitres if printed (e.g. "10 mL" -> 10) — the diluent/solution volume, NOT the amount. Null if not printed.
- Convert decimal comma to decimal point ("0,5" -> 0.5). Never output thousands separators or grouping.
- Extract ONLY what is printed on the label. Never guess, infer, calculate, or fill in a "typical" value. Never suggest a dose, a reconstitution volume, or any medical guidance — you only transcribe what is on the label.
- Do NOT wrap the JSON in code fences or add any commentary.
`;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify the calling user's JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header', code: 'unauthorized' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: 'Invalid session', code: 'unauthorized' }, 401);
    }

    // ---- Monthly usage cap (spend protection + product limit) ----
    // Lab, vaccine, and vial scans share one budget. Counted/written with the
    // service role so a client cannot read or delete its own usage rows to
    // bypass the cap. Fails OPEN on an infra error — a real, JWT-authenticated
    // user should not lose a paid-for feature over a transient count failure;
    // abuse is still bounded to real accounts.
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    let adminClient: ReturnType<typeof createClient> | null = null;
    if (serviceKey) {
      adminClient = createClient(supabaseUrl, serviceKey);
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const { count, error: countErr } = await adminClient
        .from('ai_scan_usage')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', monthStart);
      if (countErr) {
        console.error('[extract] quota count failed:', countErr.code, countErr.message);
      } else if (typeof count === 'number' && count >= MONTHLY_SCAN_LIMIT) {
        return jsonResponse(
          { error: 'Monthly scan limit reached', code: 'quota_exceeded', limit: MONTHLY_SCAN_LIMIT },
          429,
        );
      }
    }

    // Parse and validate the request body. Accepts either a PDF (pdf_base64)
    // or a photo of a report (image_base64 + media_type) — the "snap a report"
    // path. Claude's vision handles both.
    let body: { pdf_base64?: unknown; image_base64?: unknown; media_type?: unknown; kind?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body', code: 'bad_request' }, 400);
    }

    const kind: 'bloodwork' | 'vaccines' | 'vial' =
      body?.kind === 'vaccines' ? 'vaccines' : body?.kind === 'vial' ? 'vial' : 'bloodwork';

    // Date-order disambiguation. The correct order depends on the DOCUMENT's
    // origin, so the model must read the document first; the app user's region
    // is only a last-resort tiebreaker for genuinely ambiguous dates (e.g.
    // 03/04/2026 with no other clues). en → month-first; everyone else → day-first.
    const DATE_CONVENTION: Record<string, string> = {
      en: 'MM/DD/YYYY (month first)',
      es: 'DD/MM/YYYY (day first)', pt: 'DD/MM/YYYY (day first)',
      fr: 'DD/MM/YYYY (day first)', de: 'DD/MM/YYYY (day first)',
      it: 'DD/MM/YYYY (day first)',
    };
    const lang = typeof body?.lang === 'string' ? body.lang.slice(0, 2).toLowerCase() : 'en';
    const userConvention = DATE_CONVENTION[lang] || 'MM/DD/YYYY (month first)';
    const dateNote = `\n\nDATE ORDER: To decide DD/MM vs MM/DD, use evidence from the ` +
      `document itself FIRST — the report's language/country, any day number greater ` +
      `than 12, and spelled-out month names all reveal the true order. Only if a date ` +
      `is still genuinely ambiguous, assume the app user's regional convention: ` +
      `${userConvention}. Never fall back to today's date just because the order is ` +
      `ambiguous — always output the printed date in that best-guess order.`;

    const pdfBase64 = body?.pdf_base64;
    const imageBase64 = body?.image_base64;
    const isPdf = typeof pdfBase64 === 'string' && pdfBase64.length > 0;
    const isImage = typeof imageBase64 === 'string' && imageBase64.length > 0;

    if (!isPdf && !isImage) {
      return jsonResponse({ error: 'Missing pdf_base64 or image_base64', code: 'bad_request' }, 400);
    }

    const dataB64 = isImage ? (imageBase64 as string) : (pdfBase64 as string);
    if (dataB64.length > MAX_BASE64_LENGTH) {
      return jsonResponse({ error: 'File too large', code: 'file_too_large' }, 413);
    }

    // Whitelist image media types; default to JPEG for anything unexpected.
    const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    const imageMediaType = ALLOWED_IMAGE.includes(String(body?.media_type)) ? String(body?.media_type) : 'image/jpeg';

    const sourceBlock = isImage
      ? { type: 'image', source: { type: 'base64', media_type: imageMediaType, data: dataB64 } }
      : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: dataB64 } };

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      return jsonResponse({ error: 'Extraction service not configured', code: 'not_configured' }, 500);
    }

    // Call the Anthropic API server-side — the key never ships to the device
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: [
              sourceBlock,
              {
                type: 'text',
                text: kind === 'vial'
                  ? VIAL_PROMPT
                  : (kind === 'vaccines' ? VACCINE_PROMPT : EXTRACTION_PROMPT) + dateNote,
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      // Log the provider status + body so an outage is diagnosable from function
      // logs in minutes (the Aug-2026 lesson — never swallow the provider error).
      let providerBody = '';
      try { providerBody = await anthropicResponse.text(); } catch { /* body unavailable */ }
      console.error('[extract] provider_error', kind, anthropicResponse.status, providerBody.slice(0, 600));
      return jsonResponse(
        { error: 'Extraction provider returned an error', code: 'provider_error', provider_status: anthropicResponse.status },
        502,
      );
    }

    const anthropicData = await anthropicResponse.json();
    const text = anthropicData?.content?.[0]?.text ?? '';
    const clean = String(text).replace(/```json|```/g, '').trim();

    let parsed: { report_date?: unknown; markers?: unknown; vaccines?: unknown };
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.error('[extract] non_json_output', kind, clean.slice(0, 400));
      return jsonResponse({ error: 'Extraction output was not valid JSON', code: 'invalid_extraction' }, 502);
    }

    const badShape = () =>
      jsonResponse({ error: 'Extraction output had unexpected shape', code: 'invalid_extraction' }, 502);

    let payload: Record<string, unknown>;
    if (kind === 'vaccines') {
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.vaccines)) return badShape();
      payload = { vaccines: parsed.vaccines };
    } else if (kind === 'vial') {
      if (!parsed || typeof parsed !== 'object') return badShape();
      const v = parsed as Record<string, unknown>;
      payload = {
        vial: {
          compound_name: typeof v.compound_name === 'string' ? v.compound_name : null,
          form: v.form === 'powder' || v.form === 'solution' ? v.form : null,
          amount: typeof v.amount === 'number' ? v.amount : null,
          amount_unit: typeof v.amount_unit === 'string' ? v.amount_unit : '',
          concentration: typeof v.concentration === 'number' ? v.concentration : null,
          concentration_unit: typeof v.concentration_unit === 'string' ? v.concentration_unit : '',
          volume_ml: typeof v.volume_ml === 'number' ? v.volume_ml : null,
        },
      };
    } else {
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.markers)) return badShape();
      payload = { report_date: parsed.report_date ?? null, markers: parsed.markers };
    }

    // Count this successful extraction against the user's monthly budget.
    if (adminClient) {
      const { error: usageErr } = await adminClient
        .from('ai_scan_usage')
        .insert({ user_id: user.id, kind });
      if (usageErr) console.error('[extract] usage insert failed:', usageErr.code, usageErr.message);
    }

    return jsonResponse(payload, 200);
  } catch (err) {
    return jsonResponse({ error: err.message, code: 'internal_error' }, 500);
  }
});
