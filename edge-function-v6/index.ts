import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ~15MB of base64 (the client pre-checks at 10MB of raw file; this is a hard server cap)
const MAX_BASE64_LENGTH = 15 * 1024 * 1024;

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
    {
      "name": "Vaccine name",
      "date_given": "YYYY-MM-DD",
      "next_due": "YYYY-MM-DD or null",
      "manufacturer": "string or null",
      "batch_lot": "string or null",
      "dose_number": integer or null,
      "provider": "string or null",
      "location": "string or null",
      "notes": "string"
    }
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
- "manufacturer" is the vaccine's maker or brand if printed (e.g., "Pfizer",
  "Moderna", "Butantan", "Fiocruz", "GSK"); otherwise null.
- "batch_lot" is the lot/batch number exactly as printed (preserve case and
  characters); otherwise null.
- "dose_number" is the position in the series as a plain integer when printed or
  clearly stated ("1ª dose"/"1st dose" -> 1, "2nd" -> 2, "3rd"/"booster 3" -> 3);
  otherwise null. Never guess a number that is not indicated.
- "provider" is the clinic, pharmacy, health unit, or professional that
  administered the dose, if printed; otherwise null.
- "location" is the anatomical injection site if printed (e.g., "left deltoid",
  "right arm"); otherwise null.
- "notes" holds only OTHER printed detail for that dose not captured by the fields
  above (e.g., a reaction noted, a series/campaign label). Do NOT repeat the
  manufacturer, lot, dose number, provider, or site here. Empty string if none.
- Do NOT include patient identifiers, physician personal names as free text, or
  home addresses.
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

    // Parse and validate the request body. Accepts either a PDF (pdf_base64)
    // or a photo of a report (image_base64 + media_type) — the "snap a report"
    // path. Claude's vision handles both.
    let body: { pdf_base64?: unknown; image_base64?: unknown; media_type?: unknown; kind?: unknown; lang?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body', code: 'bad_request' }, 400);
    }

    const isVaccines = body?.kind === 'vaccines';

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
      console.error('extract-bloodwork: ANTHROPIC_API_KEY is not set');
      return jsonResponse({ error: 'Extraction service not configured', code: 'not_configured' }, 500);
    }

    // Identity-linked API keys (the current key type) require the workspace id
    // on every request. Not a secret — it's the "dosetrace-prod" workspace.
    const anthropicWorkspaceId = Deno.env.get('ANTHROPIC_WORKSPACE_ID') ?? 'wrkspc_01TC6F8rtt7X3Rom3nLBqjbr';

    // Call the Anthropic API server-side — the key never ships to the device
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-workspace-id': anthropicWorkspaceId,
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
                text: (isVaccines ? VACCINE_PROMPT : EXTRACTION_PROMPT) + dateNote,
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      // Log the provider's error so failures are diagnosable from function logs.
      // The body is an Anthropic error object (type/message), never document content.
      let providerBody = '';
      try {
        providerBody = (await anthropicResponse.text()).slice(0, 600);
      } catch (_) { /* body unavailable */ }
      console.error(`extract-bloodwork: provider error ${anthropicResponse.status}: ${providerBody}`);
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
      console.error(`extract-bloodwork: output not valid JSON (stop_reason=${anthropicData?.stop_reason}, len=${clean.length}, head=${clean.slice(0, 120)})`);
      return jsonResponse({ error: 'Extraction output was not valid JSON', code: 'invalid_extraction' }, 502);
    }

    if (isVaccines) {
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.vaccines)) {
        console.error('extract-bloodwork: vaccines output had unexpected shape');
        return jsonResponse({ error: 'Extraction output had unexpected shape', code: 'invalid_extraction' }, 502);
      }
      return jsonResponse({ vaccines: parsed.vaccines }, 200);
    }

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.markers)) {
      console.error('extract-bloodwork: markers output had unexpected shape');
      return jsonResponse({ error: 'Extraction output had unexpected shape', code: 'invalid_extraction' }, 502);
    }

    return jsonResponse({ report_date: parsed.report_date ?? null, markers: parsed.markers }, 200);
  } catch (err) {
    console.error(`extract-bloodwork: unhandled error: ${err?.message ?? err}`);
    return jsonResponse({ error: err.message, code: 'internal_error' }, 500);
  }
});
