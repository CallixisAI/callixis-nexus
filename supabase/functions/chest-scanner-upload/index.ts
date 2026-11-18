import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const key = authHeader.replace('Bearer ', '')
    
    // 1. Verify the scanner key
    const { data: keyData, error: keyError } = await supabase
      .from('scanner_keys')
      .select('id')
      .eq('key', key)
      .single()

    if (keyError || !keyData) {
      return new Response(JSON.stringify({ error: 'Invalid scanner key' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Parse the gifts
    const { gifts, source } = await req.json()
    console.log(`Received ${gifts.length} gifts from ${source}`)

    // 3. Insert gifts (simple implementation)
    const formattedGifts = gifts.map((g: any) => ({
      player_name: g.player_name || g.raw_text?.split(' ')[0] || 'Unknown',
      gift_name: g.gift_name || g.raw_text || 'Unknown Chest',
      amount: g.amount || 1,
      scanner_key_id: keyData.id,
      raw_data: g
    }))

    const { error: insertError } = await supabase
      .from('scanned_gifts')
      .insert(formattedGifts)

    if (insertError) throw insertError

    // Update last used time
    await supabase
      .from('scanner_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id)

    return new Response(JSON.stringify({ success: true, count: gifts.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
