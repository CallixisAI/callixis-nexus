import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { message, agent_id, agent_name, user_id } = await req.json()

    // 1. Get the n8n config for this user
    const { data: plugin, error: pluginError } = await supabaseClient
      .from('user_plugins')
      .select('config')
      .eq('user_id', user_id)
      .eq('plugin_id', 'n8n')
      .single()

    if (pluginError || !plugin?.config?.webhookUrl) {
      throw new Error('n8n Webhook URL not configured')
    }

    // 2. Forward request to n8n
    const n8nResponse = await fetch(plugin.config.webhookUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        // Optional: Include API key if configured
        ...(plugin.config.apiKey ? { 'X-N8N-API-KEY': plugin.config.apiKey } : {})
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
