import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.115.0"

// Plugins plan (docs/plugins-plan/README.md) §E.0 — this function used to take `user_id`
// straight out of the unauthenticated request body, then use the service-role key to fetch
// THAT user's saved n8n webhook URL and forward attacker-controlled content to it. Anyone who
// knew or guessed a valid user id (a UUID, not secret) could trigger a POST to a stranger's
// live calling-engine webhook. This was CLAUDE.md's own most-serious open finding, flagged
// 2026-08-28 and left unfixed until this change.
//
// Fix (§E.0 option (a), the recommended one): `user_id` is now derived from the caller's own
// verified session token, exactly the way session-guard/index.ts already does it — a second
// client, built with the anon key plus the caller's own Authorization header, calls
// auth.getUser() to prove who is actually asking. Any `user_id` in the request body is now
// read for logging only and is NEVER trusted for the lookup below.
//
// §E.0b — verified before relying on it: both callers (src/pages/AIAgents.tsx:187, :359) call
// this via `supabase.functions.invoke(...)`, which attaches the signed-in user's session token
// automatically. No client-side change was needed for this fix.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !caller) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { message, agent_id, agent_name } = await req.json()
    // §E.0: the request body's own `user_id`, if any, is discarded — the verified caller's id
    // is the only one ever used for the lookup below.
    const user_id = caller.id

    // 1. Get the n8n config for this user
    const { data: plugin, error: pluginError } = await supabaseClient
      .from('user_plugins')
      .select('config')
      .eq('user_id', user_id)
      .eq('plugin_id', 'n8n')
      .single()

    if (pluginError) {
      console.error('Database error:', pluginError);
      throw new Error(`Database error: ${pluginError.message}`);
    }

    if (!plugin?.config?.webhookUrl) {
      console.error('Config missing webhookUrl for user_id:', user_id);
      throw new Error('n8n Webhook URL not configured in Plugins tab');
    }

    console.log('Forwarding to n8n:', plugin.config.webhookUrl);

    // §E.5 step 1 — Vault first, falling back to the legacy plaintext config.apiKey. Until the
    // 20260922000000_plugin_secrets.sql migration is applied, get_plugin_secret() doesn't exist
    // yet, so this RPC is expected to fail and the catch below silently falls back to the old
    // behaviour — exactly the dual-read this step calls for, deliberately not gated on the
    // migration being live. Never removes the config.apiKey read itself — that's §E.5 step 5,
    // only after step 4 has proven Chat Test still works off the vault copy.
    let apiKey: string | undefined = plugin.config.apiKey
    try {
      const { data: vaultKey, error: vaultError } = await supabaseClient.rpc('get_plugin_secret', {
        p_user_id: user_id,
        p_plugin_id: 'n8n',
        p_field_key: 'apiKey',
      })
      if (!vaultError && typeof vaultKey === 'string' && vaultKey.length > 0) {
        apiKey = vaultKey
      }
    } catch (vaultLookupError) {
      console.warn('n8n-proxy: vault secret lookup unavailable, using config.apiKey fallback', vaultLookupError)
    }

    // 2. Forward request to n8n
    const n8nResponse = await fetch(plugin.config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Optional: Include API key if configured
        ...(apiKey ? { 'X-N8N-API-KEY': apiKey } : {})
      },
      body: JSON.stringify({
        message,
        agent_id,
        agent_name,
        source: 'Callixis Nexus Proxy',
        timestamp: new Date().toISOString()
      }),
    })

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text()
      console.error('n8n Error:', errorText)
      throw new Error('n8n workflow returned an error')
    }

    const result = await n8nResponse.json()

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
