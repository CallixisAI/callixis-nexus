import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.115.0"

// Plugins plan (docs/plugins-plan/README.md) §E.4 — the only door a browser can use to write a
// plugin's secret field. Deployed verify_jwt: true.
//
// §E.8 — `user_id` is ALWAYS derived from the caller's own verified session token (the same
// callerClient.auth.getUser() pattern n8n-proxy/index.ts and session-guard/index.ts already
// use), never trusted from the request body. This is the deliberate opposite of the bug
// n8n-proxy had before this same plan fixed it — see that function's own header comment.
//
// §E.9 — there is NO `get` action anywhere in this file, and no response this function ever
// sends contains a secret value (`set`/`clear` both return only `{ ok, updated_at? }`). A
// consumer reads Vault server-side, in its OWN function, via public.get_plugin_secret() (see
// the migration) — never through this one.
//
// §E.10/F.5 — KNOWN_PLUGIN_IDS and KNOWN_SECRET_FIELDS below are MIRRORED, not imported, from
// src/lib/plugins.ts's PLUGIN_REGISTRY (Deno cannot import from src/ — the same Deno/Vite
// boundary src/lib/phone.ts and src/lib/leadTimezone.ts already document, and the same
// technique supabase/functions/dispatch-batch/index.ts's KNOWN_VOICE_IDS already uses). Kept in
// sync by src/lib/plugins.test.ts's "plugin-secrets mirror" describe block, which reads this
// file's own source as text and compares it against the real registry.
const KNOWN_PLUGIN_IDS = [
  "n8n",
  "voice",
  "sms",
  "email",
  "lead-scoring",
  "crm-sync",
  "whatsapp",
  "calendar",
  "chatbot",
  "multi-language",
  "fraud-shield",
  "stripe",
] as const

// Only fields the registry marks `secret: true` may ever be written here — D-5 restricts
// secret-typed fields to `readiness: "live"` plugins, which today is exactly `n8n`. A plugin id
// with no entry here has no valid field_key at all.
const KNOWN_SECRET_FIELDS: Record<string, readonly string[]> = {
  n8n: ["apiKey"],
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const jsonResponse = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401)

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !caller) return jsonResponse({ error: 'Invalid or expired session' }, 401)

    const body = await req.json()
    const { action, plugin_id, field_key } = body as { action?: string; plugin_id?: string; field_key?: string }

    if (!plugin_id || !(KNOWN_PLUGIN_IDS as readonly string[]).includes(plugin_id)) {
      return jsonResponse({ error: `Unknown plugin_id: ${String(plugin_id)}` }, 400)
    }
    if (!field_key || !KNOWN_SECRET_FIELDS[plugin_id]?.includes(field_key)) {
      return jsonResponse({ error: `${plugin_id} has no secret field named ${String(field_key)}` }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    if (action === 'set') {
      const { value } = body as { value?: unknown }
      if (typeof value !== 'string' || value.trim().length === 0) {
        return jsonResponse({ error: 'value must be a non-empty string' }, 400)
      }

      const { error } = await supabase.rpc('set_plugin_secret', {
        p_user_id: caller.id,
        p_plugin_id: plugin_id,
        p_field_key: field_key,
        p_secret: value,
      })
      if (error) throw new Error(`Database error: ${error.message}`)

      return jsonResponse({ ok: true, updated_at: new Date().toISOString() })
    }

    if (action === 'clear') {
      const { error } = await supabase.rpc('clear_plugin_secret', {
        p_user_id: caller.id,
        p_plugin_id: plugin_id,
        p_field_key: field_key,
      })
      if (error) throw new Error(`Database error: ${error.message}`)

      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: `Unknown action: ${String(action)}` }, 400)
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})
