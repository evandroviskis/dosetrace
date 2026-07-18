import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ~15MB of base64 (the client pre-checks at 10MB of raw file; this is a hard server cap)
const MAX_BASE64_LENGTH = 15 * 1024 * 1024;

// IMPORTANT: this prompt is deliberately regulatory-safe (no interpretation,
// classification, or clinical assessment). Do not alter its instructions.
const EXTRACTION_PROMPT = `Extract all lab values from this report. Return ONLY a JSON object with this exact structure, no other text:
{
  "report_date": "YYYY-MM-DD",
  "markers": [
    {
      "marker": "Marker name",
      "value": numeric_value,
      "unit": "unit string"
    }
  ]
}
If you cannot determine the report date, use today's date. Include every lab value you can find. Do not interpret, classify, or judge any values. Do not include reference ranges, status, or any clinical assessment. Do not include any explanation or markdown.`;

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

    // Parse and validate the request body
    let body: { pdf_base64?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body', code: 'bad_request' }, 400);
    }

    const pdfBase64 = body?.pdf_base64;
    if (typeof pdfBase64 !== 'string' || pdfBase64.length === 0) {
      return jsonResponse({ error: 'Missing pdf_base64', code: 'bad_request' }, 400);
    }
    if (pdfBase64.length > MAX_BASE64_LENGTH) {
      return jsonResponse({ error: 'File too large', code: 'file_too_large' }, 413);
    }

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
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: pdfBase64,
                },
              },
              {
                type: 'text',
                text: EXTRACTION_PROMPT,
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      return jsonResponse(
        { error: 'Extraction provider returned an error', code: 'provider_error', provider_status: anthropicResponse.status },
        502,
      );
    }

    const anthropicData = await anthropicResponse.json();
    const text = anthropicData?.content?.[0]?.text ?? '';
    const clean = String(text).replace(/```json|```/g, '').trim();

    let parsed: { report_date?: unknown; markers?: unknown };
    try {
      parsed = JSON.parse(clean);
    } catch {
      return jsonResponse({ error: 'Extraction output was not valid JSON', code: 'invalid_extraction' }, 502);
    }

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.markers)) {
      return jsonResponse({ error: 'Extraction output had unexpected shape', code: 'invalid_extraction' }, 502);
    }

    return jsonResponse({ report_date: parsed.report_date ?? null, markers: parsed.markers }, 200);
  } catch (err) {
    return jsonResponse({ error: err.message, code: 'internal_error' }, 500);
  }
});
