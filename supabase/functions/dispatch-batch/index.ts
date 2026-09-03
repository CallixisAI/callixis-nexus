import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Phase 4 (call-engine plan) — the door the n8n dispatcher calls instead of holding a Supabase
// service-role key itself (same reasoning as call-ingest — see CLAUDE.md's "Secrets never go in
// the browser" convention, extended here to "never in an n8n node parameter" either).
//
// Four actions behind one function, selected by ?action= :
//   GET  ?action=due    -> which leads are safe to dial right now, already clamped to the number
//                          of free Vapi concurrency slots. n8n does not compute eligibility itself.
//   POST ?action=claim  -> { claims: [{lead_id, vapi_call_id}], failures: [{lead_id, reason}] }
//                          marks leads 'dialing' (a real call is now in flight) or reschedules ones
//                          Vapi's API itself rejected (our error, not the lead's - see PHASE-4
//                          checklist F.4, doesn't count against retry_count).
//   POST ?action=sweep  -> resets leads stuck in 'dialing' for >30min back to 'pending'. Without
//                          this a dropped end-of-call webhook leaks a concurrency slot forever
//                          (checklist E.4 - "the most likely production failure").
//   GET  ?action=health -> event-driven Phase 5 §A, the dead-man's switch. Reuses Phase 3's
//                          has_due_leads() (supabase/migrations/20260819000000_dispatch_clock.sql)
//                          for "is there work waiting", and MAX(leads.last_called_at) for "did a
//                          dispatch actually happen" - per Phase 5 doc's own A.1c recommendation,
//                          deliberately not dispatch_tick_log, so this reads as healthy regardless
//                          of which mechanism (pg_cron tick, an event trigger, or the old n8n
//                          timer) produced the last real claim. Read-only; never mutates.
//
// NOT live: needs the 20260803000000_dispatcher.sql migration applied, this function deployed,
// and DISPATCH_SECRET set - see n8n-workflows/noxatech-v2.json's Sticky Note5 for the n8n-side
// setup this depends on.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-callixis-dispatch-secret',
}

const MAX_RETRY_COUNT = 3
const STUCK_CALL_MINUTES = 30
const FAILURE_RETRY_MINUTES = 15
const DEFAULT_DAILY_CAP = 100

const E164 = /^\+[1-9]\d{6,14}$/

type WorkHours = { days?: string[]; startTime?: string; endTime?: string }

// Whether `now` falls inside `workHours`, evaluated in `tz`. Fails closed (returns false) on any
// unrecognized timezone rather than guessing - calling someone at the wrong local hour is a
// compliance problem, not just a UX one (checklist B.4).
function isWithinWorkHours(now: Date, tz: string, workHours: WorkHours | null): boolean {
  const wh = workHours || { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], startTime: '09:00', endTime: '17:00' }
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now)
  } catch {
    return false // unrecognized IANA zone - don't guess
  }
  const weekday = parts.find((p) => p.type === 'weekday')?.value
  const hour = parts.find((p) => p.type === 'hour')?.value
  const minute = parts.find((p) => p.type === 'minute')?.value
  if (!weekday || hour === undefined || minute === undefined) return false
  const days = wh.days ?? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  if (!days.includes(weekday)) return false

  const minutesNow = Number(hour) * 60 + Number(minute)
  const [startH, startM] = String(wh.startTime ?? '09:00').split(':').map(Number)
  const [endH, endM] = String(wh.endTime ?? '17:00').split(':').map(Number)
  const startMinutes = startH * 60 + (startM || 0)
  const endMinutes = endH * 60 + (endM || 0)

  // A window whose end is at or before its start crosses midnight — "09:00 to 00:00" means
  // 9am until the end of the day, not an empty window. The naive `now >= start && now < end`
  // evaluates to false at every minute of every day for those, which silently makes the whole
  // campaign undialable with no error anywhere. Found in production 2026-08-06 on a campaign
  // saved with endTime "00:00".
  if (endMinutes === startMinutes) return false // zero-length window — treat as closed, don't guess
  if (endMinutes > startMinutes) return minutesNow >= startMinutes && minutesNow < endMinutes
  return minutesNow >= startMinutes || minutesNow < endMinutes
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

  const jsonOk = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const expectedSecret = Deno.env.get('DISPATCH_SECRET')
    const providedSecret = req.headers.get('x-callixis-dispatch-secret')
    if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
      return jsonError(401, 'unauthorized')
    }

    const url = new URL(req.url)
    const action = url.searchParams.get('action')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    if (req.method === 'GET' && action === 'due') {
      const concurrencyLimit = Math.max(0, Number(url.searchParams.get('concurrency_limit')) || 10)
      const maxBatch = Math.max(0, Number(url.searchParams.get('max_batch')) || 25)

      // C.3 - trust a fresh count of leads actually mid-call over any cached number from a
      // previous dispatch's response, which could be stale or wrong if a run partially failed.
      const { count: occupiedSlots, error: occupiedError } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('call_status', 'dialing')
      if (occupiedError) return jsonError(500, 'failed to count occupied slots', occupiedError.message)

      const availableSlots = Math.max(0, Math.min(concurrencyLimit, maxBatch) - (occupiedSlots ?? 0))
      if (availableSlots === 0) {
        return jsonOk({ leads: [], occupied_slots: occupiedSlots ?? 0, available_slots: 0 })
      }

      // Candidate pool is wider than availableSlots because some candidates will be filtered out
      // by the per-lead work-hours check below (a per-row check, not expressible as a single SQL
      // WHERE clause once every lead can have its own timezone).
      const candidatePoolSize = Math.min(Math.max(availableSlots * 5, 25), 200)
      const { data: candidates, error: candidatesError } = await supabase
        .from('leads')
        .select('id, user_id, campaign_id, first_name, phone, external_ref, timezone, next_call_at, campaigns!inner(status, work_hours, timezone, daily_call_cap)')
        .eq('call_status', 'pending')
        .eq('do_not_call', false)
        .lt('retry_count', MAX_RETRY_COUNT)
        .eq('campaigns.status', 'active')
        .or(`next_call_at.is.null,next_call_at.lte.${new Date().toISOString()}`)
        .order('next_call_at', { ascending: true, nullsFirst: true })
        .limit(candidatePoolSize)
      if (candidatesError) return jsonError(500, 'failed to fetch due leads', candidatesError.message)

      const now = new Date()
      // "Daily" is approximated as a UTC calendar day, not each campaign's local day - a
      // deliberate simplification. This cap only has to stop a misconfiguration from dialing an
      // entire list overnight (checklist B.5); it doesn't need to be timezone-exact the way the
      // work-hours guard above does for compliance reasons.
      const startOfUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()

      const capRemaining = new Map<string, number>()
      const selected: typeof candidates = []

      for (const lead of candidates ?? []) {
        if (selected.length >= availableSlots) break
        const campaign = (lead as unknown as { campaigns: { status: string; work_hours: WorkHours; timezone: string; daily_call_cap: number } }).campaigns
        if (!campaign) continue
        // Belt and suspenders: n8n's own Validate E164 & Build Payload node checks this too
        // (checklist D.6), but a malformed number shouldn't consume a candidate-pool slot or a
        // daily-cap count on its way to being rejected downstream.
        if (!E164.test(lead.phone ?? '')) continue

        const tz = lead.timezone || campaign.timezone || 'UTC'
        if (!isWithinWorkHours(now, tz, campaign.work_hours)) continue

        if (!capRemaining.has(lead.campaign_id as string)) {
          const { count: dialedToday, error: dialedError } = await supabase
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', lead.campaign_id as string)
            .gte('last_called_at', startOfUtcDay)
          if (dialedError) return jsonError(500, 'failed to compute daily cap', dialedError.message)
          const cap = campaign.daily_call_cap ?? DEFAULT_DAILY_CAP
          capRemaining.set(lead.campaign_id as string, Math.max(0, cap - (dialedToday ?? 0)))
        }

        const remaining = capRemaining.get(lead.campaign_id as string) ?? 0
        if (remaining <= 0) continue
        capRemaining.set(lead.campaign_id as string, remaining - 1)
        selected.push(lead)
      }

      return jsonOk({
        leads: selected.map((l) => ({
          lead_id: l.id,
          user_id: l.user_id,
          campaign_id: l.campaign_id,
          first_name: l.first_name,
          phone: l.phone,
          external_ref: l.external_ref,
        })),
        occupied_slots: occupiedSlots ?? 0,
        available_slots: availableSlots,
      })
    }

    if (req.method === 'POST' && action === 'claim') {
      const body = await req.json().catch(() => null)
      if (!body || typeof body !== 'object') return jsonError(400, 'invalid JSON body')
      const claims = Array.isArray((body as Record<string, unknown>).claims) ? (body as Record<string, unknown>).claims as Array<Record<string, unknown>> : []
      const failures = Array.isArray((body as Record<string, unknown>).failures) ? (body as Record<string, unknown>).failures as Array<Record<string, unknown>> : []

      let claimed = 0
      for (const c of claims) {
        const leadId = c.lead_id
        if (typeof leadId !== 'string' || !leadId) continue
        const vapiCallId = typeof c.vapi_call_id === 'string' ? c.vapi_call_id : null
        // E.1 - this is what stops the next run, two minutes later, dialling the same person
        // again. retry_count is fetched-then-incremented rather than done in SQL because
        // PostgREST's .update() can't express `retry_count = retry_count + 1` directly.
        const { data: existing } = await supabase.from('leads').select('retry_count').eq('id', leadId).single()
        const { error } = await supabase
          .from('leads')
          .update({
            call_status: 'dialing',
            last_called_at: new Date().toISOString(),
            active_call_id: vapiCallId,
            retry_count: (existing?.retry_count ?? 0) + 1,
          })
          .eq('id', leadId)
        if (!error) claimed++
      }

      let failed = 0
      for (const f of failures) {
        const leadId = f.lead_id
        if (typeof leadId !== 'string' || !leadId) continue
        // F.4 - our own error, not the lead's. Retry soon, and retry_count is deliberately left
        // untouched so this doesn't count toward the 3-attempt cap.
        const { error } = await supabase
          .from('leads')
          .update({
            call_status: 'pending',
            next_call_at: new Date(Date.now() + FAILURE_RETRY_MINUTES * 60_000).toISOString(),
          })
          .eq('id', leadId)
        if (!error) failed++
      }

      return jsonOk({ claimed, failed })
    }

    if (req.method === 'GET' && action === 'health') {
      // Phase 3's comment next to has_due_leads() records that a service-role connection can
      // call it despite the revoke-from-anon/authenticated below it - this client uses the same
      // SUPABASE_SERVICE_ROLE_KEY every other action in this function already does.
      const { data: due, error: dueError } = await supabase.rpc('has_due_leads')
      if (dueError) return jsonError(500, 'failed to check has_due_leads', dueError.message)

      const { data: lastCalled, error: lastCalledError } = await supabase
        .from('leads')
        .select('last_called_at')
        .not('last_called_at', 'is', null)
        .order('last_called_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (lastCalledError) return jsonError(500, 'failed to read last_called_at', lastCalledError.message)

      const lastDispatchAt = lastCalled?.last_called_at ?? null
      const minutesSinceLastDispatch = lastDispatchAt
        ? (Date.now() - new Date(lastDispatchAt).getTime()) / 60_000
        : null

      return jsonOk({
        due: Boolean(due),
        last_dispatch_at: lastDispatchAt,
        // null means "no dispatch has ever succeeded" - treated as infinitely stale by the
        // caller (n8n's Dispatch Stalled? node), not as "healthy because there's no data yet".
        minutes_since_last_dispatch: minutesSinceLastDispatch,
      })
    }

    if (req.method === 'POST' && action === 'sweep') {
      const threshold = new Date(Date.now() - STUCK_CALL_MINUTES * 60_000).toISOString()
      const { data, error } = await supabase
        .from('leads')
        .update({ call_status: 'pending', active_call_id: null })
        .eq('call_status', 'dialing')
        .lt('last_called_at', threshold)
        .select('id')
      if (error) return jsonError(500, 'sweep failed', error.message)
      return jsonOk({ reset: data?.length ?? 0 })
    }

    return jsonError(400, `unknown action "${action}" for ${req.method}`)
  } catch (error) {
    return jsonError(500, error instanceof Error ? error.message : 'unknown error')
  }
})
