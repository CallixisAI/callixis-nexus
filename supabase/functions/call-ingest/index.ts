import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Phase 3 (call-engine plan) — the one door n8n writes finished-call outcomes through.
// n8n never gets a Supabase service-role key; it authenticates with a shared secret instead
// (same reasoning as rotating the hardcoded Vapi key out of the workflow — see CLAUDE.md).
//
// Payload is the Phase 2 canonical shape (see n8n-workflows/noxatech-v2.json's "Merge Analysis"
// node) plus campaign_id/user_id, which nothing in that shape currently populates — see
// Plan-Checklist/call-engine/PHASE-3-CHECKLIST.md section D for how the workflow is expected to
// supply them today (a fixed default campaign/user via n8n environment variables, since the
// Airtable base behind this workflow is single-tenant).
//
// Phase 4 added the retry classification below (section F) — this is also where a lead gets
// handed back to the dispatcher (call_status back to 'pending') on a busy/no-answer, or marked
// terminal after 3 attempts. See dispatch-batch/index.ts for the other half: it's what increments
// retry_count and marks a lead 'dialing' in the first place.
//
// Event-driven Phase 4 §B.3 added fireDispatchTrigger() below — the most valuable of the three
// real-event call sites (docs/event-driven-plan/PHASE-4-real-event-triggers.md): the instant a
// call ends, a Vapi concurrency slot has just freed, and the next lead can go out in seconds
// instead of waiting for the next tick. Called server-to-server (this function holds the
// service-role key, not a user session) against dispatch-trigger, which is verify_jwt:true —
// the service-role key is itself a valid signed JWT, so it passes that gateway check the same
// way a signed-in user's session token would.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-callixis-ingest-secret',
}

const ALLOWED_OUTCOMES = ['Qualified', 'Not Qualified', 'Requested Follow-up', 'Voicemail', 'Unreachable']

// Phase 4 (call-engine plan) retry rules — see Plan-Checklist/call-engine/PHASE-4-CHECKLIST.md
// section F. retry_count itself is incremented by dispatch-batch at dispatch time (checklist
// E.2), not here — this function only ever reads it, to decide whether another attempt is left.
const MAX_RETRY_COUNT = 3
const RETRY_DELAY_MS = 4 * 60 * 60 * 1000 // F.1 - 4 hours puts the retry at a different clock time, not just a later one
const NO_ANSWER_REASONS = ['customer-busy', 'customer-did-not-answer', 'no-answer']

// No structured "the lead asked to be removed" field exists anywhere upstream (Vapi's outcome
// vocabulary above doesn't have one, and n8n's Validate Status node doesn't produce one either).
// This is a heuristic over free text until a real signal exists — expect false negatives before
// false positives; do not treat a miss here as proof nobody asked to stop being called.
const REFUSAL_PATTERN = /\b(do\s*not\s*call|don'?t\s*call|remove\s*me|stop\s*calling|opt(ed)?[\s-]?out|no\s*longer\s*(interested|wish))\b/i

function mapOutcomeToCallRecordStatus(outcome: string | null | undefined, isNoAnswer: boolean): string {
  if (outcome === 'Voicemail') return 'no-answer'
  if (outcome === 'Unreachable') return 'failed'
  // A busy signal or no-answer never reaches AI analysis, so `outcome` is null here — without
  // this check it would fall through to 'completed', which is wrong for a call nobody picked up.
  if (isNoAnswer) return 'no-answer'
  return 'completed'
}

function looksLikeRefusal(summary: string | null | undefined, disqualReason: string | null | undefined): boolean {
  const text = `${summary ?? ''} ${disqualReason ?? ''}`
  return REFUSAL_PATTERN.test(text)
}

// §B.3b 🔒 — a trigger failure must NEVER fail the ingest. Losing a call record is real data
// loss; a missed trigger is a few minutes of latency (the pre-Phase-4 behaviour). Every path
// here catches and logs rather than throwing, and the call site below never awaits this longer
// than the timeout — call-ingest's own response is not held hostage by dispatch-trigger's.
async function fireDispatchTrigger(campaignId: string): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) return

    await fetch(`${supabaseUrl}/functions/v1/dispatch-trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
      },
      body: JSON.stringify({ reason: 'call_completed', campaign_id: campaignId }),
      signal: AbortSignal.timeout(3000),
    })
  } catch (err) {
    console.error('call-ingest: fireDispatchTrigger failed (non-fatal)', err instanceof Error ? err.message : String(err))
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const jsonError = (status: number, error: string, detail?: unknown) =>
    new Response(JSON.stringify({ error, detail: detail ?? null }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const expectedSecret = Deno.env.get('CALL_INGEST_SECRET')
    const providedSecret = req.headers.get('x-callixis-ingest-secret')
    if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
      return jsonError(401, 'unauthorized')
    }

    // n8n-workflows/noxatech-v2-no-airtable.json's "Check Call Status" node calls this before the
    // AI Agent step, replacing what Search records1 + Idempotency Gate used to read from Airtable:
    // (a) has this call_id already been ingested — call_records rows are only ever created below,
    // keyed on vapi_call_id via the upsert's onConflict, so existence alone means "already
    // processed", no separate status field needed; (b) this lead's contact info, found via the
    // active_call_id dispatch-batch sets when it places the call (see dispatch-batch/index.ts's
    // "Report Claims" action) and that this function itself clears back to null once ingested
    // below — so this lookup only ever finds a lead on the *first* delivery for a given call_id,
    // which is exactly the case where there's contact info worth returning.
    const url = new URL(req.url)
    if (url.searchParams.get('action') === 'lookup') {
      const lookupCallId = url.searchParams.get('call_id')
      if (!lookupCallId) {
        return jsonError(400, 'call_id is required')
      }

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      const { data: existingRecord } = await supabase
        .from('call_records')
        .select('id')
        .eq('vapi_call_id', lookupCallId)
        .maybeSingle()

      if (existingRecord) {
        return new Response(
          JSON.stringify({ already_processed: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: lead } = await supabase
        .from('leads')
        .select('id, first_name, last_name, email, phone, country')
        .eq('active_call_id', lookupCallId)
        .maybeSingle()

      if (!lead) {
        return new Response(
          JSON.stringify({ already_processed: false, found: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({
          already_processed: false,
          found: true,
          lead_id: lead.id,
          contact_name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || null,
          contact_email: lead.email,
          phone: lead.phone,
          country: lead.country,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonError(400, 'invalid JSON body')
    }

    const {
      call_id,
      user_id: payloadUserId,
      campaign_id: payloadCampaignId,
      lead_ref,
      phone,
      contact_name,
      contact_email,
      country,
      started_at,
      ended_at,
      duration_sec,
      ended_reason,
      recording_url,
      transcript,
      cost,
      outcome,
      is_qualified,
      lead_score,
      summary,
      disqual_reason,
      needs_review,
    } = body as Record<string, unknown>

    if (!call_id || typeof call_id !== 'string') {
      return jsonError(400, 'call_id is required')
    }
    // call_records.campaign_id is NOT NULL (predates this phase) — a campaign_id must be
    // supplied regardless of how user_id gets resolved.
    if (!payloadCampaignId || typeof payloadCampaignId !== 'string') {
      return jsonError(400, 'campaign_id is required')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Resolve user_id — reject rather than guess. An orphaned row is invisible under RLS and
    // therefore invisible forever.
    let userId: string
    if (typeof payloadUserId === 'string' && payloadUserId) {
      userId = payloadUserId
    } else {
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('user_id')
        .eq('id', payloadCampaignId)
        .single()

      if (campaignError || !campaign) {
        return jsonError(400, 'could not resolve user_id from campaign_id', campaignError?.message)
      }
      userId = campaign.user_id
    }

    const normalizedPhone = typeof phone === 'string' && phone ? phone : null
    const validOutcome = typeof outcome === 'string' && ALLOWED_OUTCOMES.includes(outcome) ? outcome : null
    const refusal = looksLikeRefusal(summary as string | undefined, disqual_reason as string | undefined)
    const reasonStr = typeof ended_reason === 'string' ? ended_reason : ''
    const isNoAnswer = NO_ANSWER_REASONS.includes(reasonStr) || validOutcome === 'Voicemail'

    // F.1/F.2/F.5 - a busy signal or no answer gets another attempt (at a different clock time,
    // since the retry lands 4h later) up to the 3-attempt cap; a call that actually connected and
    // ended (customer-ended-call, or any real analysis outcome) never retries regardless of
    // attemptsSoFar. F.3 (explicit refusal) is handled separately via do_not_call, below.
    function classifyRetry(attemptsSoFar: number): { call_status: string; next_call_at: string | null; outcomeOverride: string | null } {
      if (isNoAnswer && attemptsSoFar < MAX_RETRY_COUNT) {
        return { call_status: 'pending', next_call_at: new Date(Date.now() + RETRY_DELAY_MS).toISOString(), outcomeOverride: null }
      }
      if (isNoAnswer) {
        return { call_status: 'completed', next_call_at: null, outcomeOverride: 'Unreachable' } // cap reached, terminal
      }
      return { call_status: 'completed', next_call_at: null, outcomeOverride: null }
    }

    // Find the matching lead: by the Airtable record id first (set during the Phase 3 §E
    // import), then by phone. If neither matches — e.g. a test call placed before §E has run —
    // create a minimal lead rather than silently dropping the association; a real call is real
    // signal about a real person even if the bulk import hasn't happened yet.
    let leadId: string | null = null
    if (typeof lead_ref === 'string' && lead_ref) {
      const { data } = await supabase
        .from('leads')
        .select('id')
        .eq('user_id', userId)
        .eq('external_ref', lead_ref)
        .maybeSingle()
      leadId = data?.id ?? null
    }
    if (!leadId && normalizedPhone) {
      const { data } = await supabase
        .from('leads')
        .select('id')
        .eq('user_id', userId)
        .eq('phone', normalizedPhone)
        .maybeSingle()
      leadId = data?.id ?? null
    }

    if (leadId) {
      // retry_count was already incremented by dispatch-batch when this call was placed
      // (checklist E.2) — read it, don't bump it again here, or every lead's count doubles.
      const { data: existingLead } = await supabase
        .from('leads')
        .select('retry_count')
        .eq('id', leadId)
        .single()

      const disposition = refusal
        ? { call_status: 'completed', next_call_at: null, outcomeOverride: null } // F.3 - never retry a refusal
        : classifyRetry(existingLead?.retry_count ?? 0)

      const { error: leadUpdateError } = await supabase
        .from('leads')
        .update({
          call_status: disposition.call_status,
          outcome: disposition.outcomeOverride ?? validOutcome,
          lead_score: typeof lead_score === 'number' ? lead_score : null,
          last_called_at: (ended_at as string) ?? (started_at as string) ?? new Date().toISOString(),
          next_call_at: disposition.next_call_at,
          active_call_id: null, // the call this row was tracking has now ended, one way or another
          do_not_call: refusal || undefined, // only ever flips true; never clears an existing flag
        })
        .eq('id', leadId)

      if (leadUpdateError) {
        return jsonError(500, 'failed to update lead', leadUpdateError.message)
      }
    } else if (normalizedPhone) {
      // No prior lead — e.g. a test call placed before the Phase 3 import ran. There is no
      // dispatch-time attempt to read, so treat this as attempt 1 for retry purposes.
      const disposition = refusal
        ? { call_status: 'completed', next_call_at: null, outcomeOverride: null }
        : classifyRetry(1)

      const { data: newLead, error: leadInsertError } = await supabase
        .from('leads')
        .insert({
          user_id: userId,
          campaign_id: payloadCampaignId,
          first_name: (contact_name as string) || null,
          phone: normalizedPhone,
          email: (contact_email as string) || null,
          country: (country as string) || null,
          source: 'vapi',
          retry_count: 1,
          call_status: disposition.call_status,
          outcome: disposition.outcomeOverride ?? validOutcome,
          lead_score: typeof lead_score === 'number' ? lead_score : null,
          last_called_at: (ended_at as string) ?? (started_at as string) ?? new Date().toISOString(),
          next_call_at: disposition.next_call_at,
          do_not_call: refusal || undefined,
        })
        .select('id')
        .single()

      if (leadInsertError) {
        return jsonError(500, 'failed to create lead', leadInsertError.message)
      }
      leadId = newLead.id
    }

    const { error: upsertError } = await supabase
      .from('call_records')
      .upsert(
        {
          vapi_call_id: call_id,
          campaign_id: payloadCampaignId,
          user_id: userId,
          lead_id: leadId,
          contact_name: (contact_name as string) || null,
          contact_phone: normalizedPhone,
          contact_email: (contact_email as string) || null,
          status: mapOutcomeToCallRecordStatus(validOutcome, isNoAnswer),
          duration: typeof duration_sec === 'number' ? duration_sec : 0,
          call_date: (ended_at as string) ?? (started_at as string) ?? new Date().toISOString(),
          notes: (summary as string) || null,
          recording_url: (recording_url as string) || null,
          is_qualified: is_qualified === true,
          ended_reason: (ended_reason as string) || null,
          lead_score: typeof lead_score === 'number' ? lead_score : null,
          transcript: (transcript as string) || null,
          cost: typeof cost === 'number' ? cost : null,
          disqual_reason: (disqual_reason as string) || null,
          // Phase 2 §C.5 forces an unrecognized verdict to needs_review in n8n; this is the first
          // place that flag has ever had a column to land in, so a payload without it is treated
          // as "not flagged", not "unknown" — there is no prior behavior to preserve here.
          needs_review: needs_review === true,
        },
        { onConflict: 'vapi_call_id' }
      )

    if (upsertError) {
      return jsonError(500, 'failed to write call_records', upsertError.message)
    }

    // §B.3a — after the write, not before. The freed concurrency slot only exists once this
    // lead's call_status is no longer 'dialing' (dispatch-batch:111-115 counts 'dialing' leads
    // to compute free slots), and that update has already landed by this point in the function.
    await fireDispatchTrigger(payloadCampaignId)

    return new Response(
      JSON.stringify({ ok: true, lead_id: leadId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return jsonError(500, error instanceof Error ? error.message : 'unknown error')
  }
})
