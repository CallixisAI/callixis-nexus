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

    const { email, full_name, role, permissions } = await req.json()

    // 1. Invite the user
    const { data: authData, error: authError } = await supabaseClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name }
    })

    if (authError) throw authError

    const userId = authData.user.id

    // 2. Set the role
    const { error: roleError } = await supabaseClient
      .from('user_roles')
      .upsert({ user_id: userId, role })

    if (roleError) throw roleError

    // 3. Set permissions
    if (permissions && permissions.length > 0) {
      const permRows = permissions.map((p: string) => ({
        user_id: userId,
        permission_key: p
      }))
      const { error: permError } = await supabaseClient
        .from('user_permissions')
        .insert(permRows)
      
      if (permError) throw permError
    }

    return new Response(
      JSON.stringify({ success: true, user_id: userId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
