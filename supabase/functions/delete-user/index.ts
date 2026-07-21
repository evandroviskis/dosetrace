import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify the calling user's JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create a client with the user's JWT to identify who's calling
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Delete all of the user's health/app data BEFORE deleting the auth user,
    // as promised by the in-app privacy policy ("deletion of your account and
    // all associated data"). Ordered children-first to respect foreign keys:
    // dose_logs and vials reference protocols; everything references auth.users.
    const userDataTables = [
      'dose_logs',
      'vials',
      'protocols',
      'biomarkers',
      'vaccines',
      'notification_preferences',
      'analytics_events',
      'referral_codes',
    ];

    for (const table of userDataTables) {
      const { error: rowError } = await adminClient.from(table).delete().eq('user_id', user.id);
      // 42P01 = relation does not exist — tolerate tables that were never created
      if (rowError && rowError.code !== '42P01') {
        return new Response(
          JSON.stringify({ error: `Failed to delete ${table}: ${rowError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // referrals uses referrer_id/referred_id instead of user_id
    const { error: referralsError } = await adminClient
      .from('referrals')
      .delete()
      .or(`referrer_id.eq.${user.id},referred_id.eq.${user.id}`);
    if (referralsError && referralsError.code !== '42P01') {
      return new Response(
        JSON.stringify({ error: `Failed to delete referrals: ${referralsError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Finally, delete the auth user itself
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
