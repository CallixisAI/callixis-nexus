import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Event-driven Phase 4 — docs/event-driven-plan/PHASE-4-real-event-triggers.md §A.
// The one shared door-knocker: every real event (campaign started, leads uploaded, a call
// ended) POSTs here instead of duplicating "read the secret, hit the n8n webhook" three times.
//
// | Aspect | Decision |
// |---|---|
// | Auth   | verify_jwt: true — callers are signed-in users (Campaigns.tsx, UploadLeadsDialog.tsx)
// |        | or another edge function using the service-role key as its bearer token
// |        | (call-ingest — see §B.3). Same shape as manage-users; opposite of
// |        | call-ingest/activate-invite, which have no user session to check.
// | Deploy | verify_jwt: true (the default — do NOT pass --no-verify-jwt for this one)
//
// §A.2 🔀 decided: Supabase secrets, not user_plugins.config. That column holds the *chat*
// webhook, is per-user, and is browser-writable — a user could point the dialing trigger
// anywhere. DISPATCH_TRIGGER_SECRET already exists as a Supabase secret (created live
// 2026-08-19 for Phase 3's pg_cron job — see 20260819000000_dispatch_clock.sql), so this reuses
// it rather than minting a second one; both callers hitting the same n8n webhook with the same
// secret is the point, not a coincidence.
//
// The webhook URL itself is hardcoded to match the one pg_cron already POSTs to
// (20260819000000_dispatch_clock.sql line ~129) rather than introducing a second place it could
// drift from — override with DISPATCH_TRIGGER_URL only if that ever needs to differ.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DISPATCH_WEBHOOK_URL = Deno.env.get('DISPATCH_TRIGGER_URL') ?? 'https://godofmedia.app.n8n.cloud/webhook/dispatch-now'
const DISPATCH_WEBHOOK_HEADER = 'x-callixis-dispatch-trigger-secret' // same header name pg_cron's dispatch_tick() sends
const VALID_REASONS = new Set(['campaign_started', 'leads_uploaded', 'call_completed'])

// §C.3 — within Phase 0 D-3's 15–30s recommendation. Long enough to collapse a burst of
// simultaneous call-endings (§B.3c's feedback-loop case), short enough nobody perceives a delay.
const COOLDOWN_SECONDS = 20

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const jsonResponse = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  // §A.3 🔒 — this function must never break the caller's own action. Every path below returns
  // a normal 200 with {triggered:false} on any internal failure rather than a 4xx/5xx, so a
  // caller that (against A.3's own advice) forgot to wrap the invoke in try/catch still doesn't
  // see an error. verify_jwt:true already rejected an unauthenticated/malformed-JWT request
  // before this code ever runs, so failing open here doesn't open an auth hole — it only ever
  // widens "should n8n be poked right now", never "who is allowed to ask".
  try {
    const body = await req.json().catch(() => ({}))
    const reason = typeof (body as Record<string, unknown>)?.reason === 'string' ? (body as Record<string, unknown>).reason as string : null
    const campaignId = typeof (body as Record<string, unknown>)?.campaign_id === 'string' ? (body as Record<string, unknown>).campaign_id as string : undefined

    if (!reason || !VALID_REASONS.has(reason)) {
      return jsonResponse({ triggered: false })
    }

    const secret = Deno.env.get('DISPATCH_TRIGGER_SECRET')
    if (!secret) {
      console.error('dispatch-trigger: DISPATCH_TRIGGER_SECRET is not set — degrading to timer-speed dialing')
      return jsonResponse({ triggered: false })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // §C — one atomic claim. A plain read-then-write would race under concurrent callers (the
    // exact §B.3c scenario this cooldown exists for); a single UPDATE...WHERE relies on
    // Postgres's row lock to serialize competing claims instead, so at most one caller per
    // cooldown window ever proceeds to POST. See the migration's own comment for why.
    const cutoff = new Date(Date.now() - COOLDOWN_SECONDS * 1000).toISOString()
    const { data: claimed, error: claimError } = await supabase
      .from('dispatch_trigger_state')
      .update({ last_triggered_at: new Date().toISOString() })
      .eq('id', 1)
      .or(`last_triggered_at.is.null,last_triggered_at.lte.${cutoff}`)
      .select('last_triggered_at')

    if (claimError) {
      console.error('dispatch-trigger: cooldown claim failed', claimError.message)
      return jsonResponse({ triggered: false })
    }
    if (!claimed || claimed.length === 0) {
      // Debounced — another trigger already fired within the cooldown window. Not an error:
      // this is §C doing its job.
      return jsonResponse({ triggered: false })
    }

    const res = await fetch(DISPATCH_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [DISPATCH_WEBHOOK_HEADER]: secret,
      },
      body: JSON.stringify({ source: 'app', reason, campaign_id: campaignId }),
      signal: AbortSignal.timeout(5000),
    }).catch((err) => {
      console.error('dispatch-trigger: POST to n8n failed', err instanceof Error ? err.message : String(err))
      return null
    })

    if (!res || !res.ok) {
      console.error('dispatch-trigger: n8n responded', res ? res.status : 'no response')
      return jsonResponse({ triggered: false })
    }

    return jsonResponse({ triggered: true })
  } catch (error) {
    console.error('dispatch-trigger: unexpected error', error instanceof Error ? error.message : String(error))
    return jsonResponse({ triggered: false })
  }
})
