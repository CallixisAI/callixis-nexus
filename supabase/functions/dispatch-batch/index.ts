import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.115.0"

// Phase 4 (call-engine plan) — the door the n8n dispatcher calls instead of holding a Supabase
// service-role key itself (same reasoning as call-ingest — see CLAUDE.md's "Secrets never go in
// the browser" convention, extended here to "never in an n8n node parameter" either).
//
// Four actions behind one function, selected by ?action= :
//   GET  ?action=due    -> which leads are safe to dial right now, already clamped to the number
//                          of free Vapi concurrency slots. n8n does not compute eligibility itself.
//                          Reserve-before-dial (call-reliability plan §4, D-1): every lead this
//                          returns has ALREADY been flipped to call_status='dialing' via
//                          reserve_leads() (20260904000000_reserve_before_dial.sql) before this
//                          response is even sent - not after Place Call (Vapi) succeeds. This is
//                          what makes double-dialling structurally impossible: a lead can only be
//                          selected once, ever, per reservation, regardless of how many times the
//                          dispatcher wakes while a call is still in flight.
//   POST ?action=claim  -> { claims: [{lead_id, vapi_call_id}], failures: [{lead_id, reason}] }
//                          the lead is already 'dialing' by this point (see above) - claim only
//                          attaches the real active_call_id once Vapi returns one; failures UNDO
//                          the reservation (back to 'pending', retry_count decremented) since our
//                          own API error means no call was actually placed (checklist F.4,
//                          doesn't count against retry_count).
//   POST ?action=sweep  -> resets leads stuck in 'dialing' for >30min back to 'pending'. Without
//                          this a dropped end-of-call webhook leaks a concurrency slot forever
//                          (checklist E.4 - "the most likely production failure"). Also the
//                          backstop for a reservation whose Place Call/claim never completed at
//                          all (call-reliability plan §4 E.6).
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
// setup this depends on. Reserve-before-dial additionally needs 20260904000000_reserve_before_dial.sql
// applied - see docs/call-reliability-plan/README.md §4 / Plan-Checklist/call-reliability/CHECKLIST.md.

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
        .select('id', { count: 'exact' })
        .eq('call_status', 'dialing')
        .limit(1) // count comes from the Content-Range header, not the rows
      if (occupiedError) return jsonError(500, 'failed to count occupied slots', occupiedError)

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
        // Client-feedback plan §E.9 — max_qualified_leads added to the embed; it was not fetched
        // at all before. §E.10 reads it below.
        // Call-quality plan §A.1a — `industry` and `agent_id` added, both plain columns on the
        // SAME `campaigns!inner(...)` embed that's already running in production. §A.1b —
        // deliberately NOT a nested `ai_agents(...)` embed: PostgREST can only join along a
        // foreign key it can see, and a missing/misdescribed hosted relationship would return
        // PGRST200 -> a 500 -> the dispatcher stops entirely. `types.ts` cannot confirm the FK is
        // there (`Relationships: []` for every table), so agents are fetched with a separate
        // plain SELECT below instead (§A.1f).
        // Call-quality plan §A.6 (2026-09-11 addendum) — `email` added: James tested a real call
        // and found the assistant never referenced the lead's email or phone number, on top of
        // the agent-name gap §A already targets. Plumbed through the same three-layer '' defence
        // as every other field here (see §A.5's comment on the response below).
        // lead-enrichment plan §D.1 — the six spoken enrichment fields (D-1) added to the select,
        // same three-layer '' defence as every field above (this function, n8n's Validate E164 &
        // Build Payload, and Place Call (Vapi)'s own `|| ""`).
        .select('id, user_id, campaign_id, first_name, phone, email, external_ref, timezone, next_call_at, address, city, zip, home_type, home_built, last_service, campaigns!inner(status, work_hours, timezone, daily_call_cap, max_qualified_leads, industry, agent_id)')
        .eq('call_status', 'pending')
        .eq('do_not_call', false)
        .lt('retry_count', MAX_RETRY_COUNT)
        .eq('campaigns.status', 'active')
        .or(`next_call_at.is.null,next_call_at.lte.${new Date().toISOString()}`)
        .order('next_call_at', { ascending: true, nullsFirst: true })
        .limit(candidatePoolSize)
      if (candidatesError) return jsonError(500, 'failed to fetch due leads', candidatesError.message)

      // §A.1c/§A.1d/§A.1e — the industry -> Vapi assistant map, fetched once per request (at
      // most 10 rows — src/lib/industries.ts has 10 values), NOT per candidate. The
      // `.not('vapi_assistant_id', 'is', null)` filter is mandatory, not tidiness: a row can
      // exist carrying only `starter_instructions` (client-feedback plan's own
      // 20260909000000_industry_starter_instructions.sql made `vapi_assistant_id` nullable). A
      // plain `map.has(industry)` would pass such a row, and the engine would then POST
      // `assistantId: null` to Vapi and get a 400 for every lead in that industry — AFTER those
      // leads had already been reserved. Skipping them as candidates costs nothing; a 400 after
      // reservation costs a stranded concurrency slot and a burned retry attempt.
      const normalizeIndustryKey = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
      const { data: industryAssistantRows, error: industryAssistantsError } = await supabase
        .from('industry_assistants')
        .select('industry, vapi_assistant_id')
        .not('vapi_assistant_id', 'is', null)
      if (industryAssistantsError) return jsonError(500, 'failed to fetch industry assistants', industryAssistantsError.message)
      const assistantIdByIndustry = new Map<string, string>()
      for (const row of industryAssistantRows ?? []) {
        if (row.vapi_assistant_id) assistantIdByIndustry.set(normalizeIndustryKey(row.industry), row.vapi_assistant_id)
      }

      const now = new Date()
      // "Daily" is approximated as a UTC calendar day, not each campaign's local day - a
      // deliberate simplification. This cap only has to stop a misconfiguration from dialing an
      // entire list overnight (checklist B.5); it doesn't need to be timezone-exact the way the
      // work-hours guard above does for compliance reasons.
      const startOfUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()

      const capRemaining = new Map<string, number>()
      // Client-feedback plan §E.10 — one entry per campaign: "is this campaign already at or over
      // its Max Qualified Leads cap". Lazily filled, mirroring capRemaining's own idiom — one
      // COUNT per campaign per request, never one per lead.
      const qualifiedCapReached = new Map<string, boolean>()
      const selected: typeof candidates = []

      // §A.3c/§A.3e — NOT optional polish. Without these, "the assistant table is empty so
      // nothing can dial" and "it's 3am so nothing is due" both produce an identical empty array
      // + HTTP 200, and n8n shows an all-green run either way. These are what let a total,
      // silent stoppage be told apart from a quiet night.
      let skippedUnmappedIndustry = 0
      let skippedOutsideHours = 0
      let skippedBadPhone = 0
      let skippedDailyCap = 0
      let skippedQualifiedCap = 0
      const unmappedIndustries = new Set<string>()

      for (const lead of candidates ?? []) {
        if (selected.length >= availableSlots) break
        const campaign = (lead as unknown as { campaigns: { status: string; work_hours: WorkHours; timezone: string; daily_call_cap: number; max_qualified_leads: number; industry: string | null; agent_id: string | null } }).campaigns
        if (!campaign) continue
        // Belt and suspenders: n8n's own Validate E164 & Build Payload node checks this too
        // (checklist D.6), but a malformed number shouldn't consume a candidate-pool slot or a
        // daily-cap count on its way to being rejected downstream.
        if (!E164.test(lead.phone ?? '')) {
          skippedBadPhone++
          continue
        }

        // §A.2 — THE single most important implementation detail in §A: this runs BEFORE
        // reserve_leads() ever sees this lead, as a candidate filter, never as a post-hoc filter
        // on the results. reserve_leads() flips a lead to call_status='dialing', increments
        // retry_count, and sets last_called_at — so filtering an unmapped lead out AFTER
        // reservation would (1) strand a concurrency slot with no call ever placed to release it
        // (occupied_slots counts 'dialing' rows), (2) sit stuck until the 30-minute sweep, and
        // (3) get reserved and incremented again next tick — permanently exhausting
        // MAX_RETRY_COUNT after 3 passes and killing the lead, all because someone simply hasn't
        // pasted an assistant id yet. Skipping as a CANDIDATE costs nothing. Placed before the
        // qualified-cap/daily-cap blocks below too, so an undialable lead can't burn a
        // daily-cap slot or spend either COUNT query on a budget it could never use.
        const industryKey = normalizeIndustryKey(campaign.industry)
        const assistantId = assistantIdByIndustry.get(industryKey)
        if (!assistantId) {
          skippedUnmappedIndustry++
          unmappedIndustries.add(campaign.industry?.trim() || '(none)')
          continue
        }

        const tz = lead.timezone || campaign.timezone || 'UTC'
        if (!isWithinWorkHours(now, tz, campaign.work_hours)) {
          skippedOutsideHours++
          continue
        }

        // §E.11 — Max Qualified Leads, checked BEFORE the daily-cap COUNT below, so a campaign
        // that's already capped out doesn't spend a query on a budget it can't use.
        //
        // §E.12 — what this catches that call-ingest's §E.6 cannot: a cap LOWERED after the fact,
        // below a qualified count already reached. §E.6 only fires on a *new* qualification, so it
        // never re-evaluates a campaign whose count was already past its (previously higher) cap.
        // This path deliberately only SKIPS the campaign — it does not flip status to 'completed'
        // the way §E.6 does. Lowering a cap under the current count is a deliberate admin action
        // (they know they're stopping it); §E.6 owns the "campaign finished on its own" status
        // transition. (predicate mirrors src/lib/callPipeline.ts's isQualifiedCapReached;
        // max_qualified_leads = 0 means unlimited.)
        const campaignId = lead.campaign_id as string
        if (!qualifiedCapReached.has(campaignId)) {
          const qualCap = campaign.max_qualified_leads ?? 0
          if (qualCap <= 0) {
            qualifiedCapReached.set(campaignId, false)
          } else {
            const { count: qualifiedSoFar, error: qualifiedError } = await supabase
              .from('call_records')
              .select('id', { count: 'exact' })
              .eq('campaign_id', campaignId)
              .eq('is_qualified', true)
              .limit(1) // count comes from the Content-Range header, not the rows
            if (qualifiedError) return jsonError(500, 'failed to compute qualified cap', qualifiedError)
            qualifiedCapReached.set(campaignId, (qualifiedSoFar ?? 0) >= qualCap)
          }
        }
        if (qualifiedCapReached.get(campaignId)) {
          skippedQualifiedCap++
          continue
        }

        if (!capRemaining.has(lead.campaign_id as string)) {
          const { count: dialedToday, error: dialedError } = await supabase
            .from('leads')
            .select('id', { count: 'exact' })
            .eq('campaign_id', lead.campaign_id as string)
            .gte('last_called_at', startOfUtcDay)
            .limit(1) // count comes from the Content-Range header, not the rows
          if (dialedError) return jsonError(500, 'failed to compute daily cap', dialedError)
          const cap = campaign.daily_call_cap ?? DEFAULT_DAILY_CAP
          capRemaining.set(lead.campaign_id as string, Math.max(0, cap - (dialedToday ?? 0)))
        }

        const remaining = capRemaining.get(lead.campaign_id as string) ?? 0
        if (remaining <= 0) {
          skippedDailyCap++
          continue
        }
        capRemaining.set(lead.campaign_id as string, remaining - 1)
        selected.push(lead)
      }

      // E.2/E.3 (call-reliability plan §4, D-1) — reserve every selected lead atomically BEFORE
      // returning it to n8n, not after Place Call (Vapi) succeeds. This is the change that fixed
      // the 2026-09-03 incident: once reserve_leads() flips a lead to call_status='dialing', this
      // same handler's own `.eq('call_status', 'pending')` filter above excludes it from every
      // future candidate pool - a second dispatcher wake, even one already in flight when this
      // request started, cannot select it again. Only rows reserve_leads() actually flipped are
      // returned; anything it lost to a concurrent reservation is silently dropped here rather
      // than being handed out twice.
      const selectedIds = selected.map((l) => l.id as string)
      let reservedIds = new Set<string>()
      if (selectedIds.length > 0) {
        const { data: reserved, error: reserveError } = await supabase.rpc('reserve_leads', {
          p_lead_ids: selectedIds,
        })
        if (reserveError) return jsonError(500, 'failed to reserve leads', reserveError.message)
        reservedIds = new Set(((reserved ?? []) as Array<{ id: string }>).map((r) => r.id))
      }
      const reservedLeads = selected.filter((l) => reservedIds.has(l.id as string))

      // §A.1f — batch-fetch agents for the reserved leads ONLY, not every candidate scanned
      // (most candidates never reach reservation at all).
      type ReservedCampaign = { industry: string | null; agent_id: string | null }
      const reservedCampaignOf = (l: (typeof reservedLeads)[number]) =>
        (l as unknown as { campaigns: ReservedCampaign }).campaigns
      const agentIds = new Set<string>()
      for (const l of reservedLeads) {
        const agentId = reservedCampaignOf(l)?.agent_id
        if (agentId) agentIds.add(agentId)
      }
      type AgentRow = { id: string; name: string | null; script: string | null; welcome_message: string | null; voice: string | null }
      const agentsById = new Map<string, AgentRow>()
      if (agentIds.size > 0) {
        const { data: agentRows, error: agentsError } = await supabase
          .from('ai_agents')
          .select('id, name, script, welcome_message, voice')
          .in('id', Array.from(agentIds))
        if (agentsError) return jsonError(500, 'failed to fetch agents', agentsError.message)
        for (const a of (agentRows ?? []) as AgentRow[]) agentsById.set(a.id, a)
      }

      // §A.1g — company names (E17): leads.user_id references auth.users, not profiles, so it
      // can't be embedded in the leads query above — a separate `.in()` call is required.
      const userIds = new Set<string>(reservedLeads.map((l) => l.user_id as string))
      const companyNameByUserId = new Map<string, string>()
      if (userIds.size > 0) {
        const { data: profileRows, error: profilesError } = await supabase
          .from('profiles')
          .select('id, company_name')
          .in('id', Array.from(userIds))
        if (profilesError) return jsonError(500, 'failed to fetch company names', profilesError.message)
        for (const p of (profileRows ?? []) as Array<{ id: string; company_name: string | null }>) {
          companyNameByUserId.set(p.id, p.company_name ?? '')
        }
      }

      return jsonOk({
        leads: reservedLeads.map((l) => {
          const campaign = reservedCampaignOf(l)
          const agent = campaign?.agent_id ? agentsById.get(campaign.agent_id) : undefined
          // §A.3b/§A.5 — every string coerced to '', NEVER left undefined. n8n's own Validate
          // node re-coerces with String(v ?? '') and Place Call's body has `|| ""` on each
          // variable too — three layers, because JSON.stringify DROPS keys whose value is
          // undefined entirely, turning "missing value" into "missing key", which is exactly
          // what makes Vapi read a literal "{{brace}}" placeholder aloud instead of substituting.
          return {
            lead_id: l.id,
            user_id: l.user_id,
            campaign_id: l.campaign_id,
            first_name: l.first_name ?? '',
            phone: l.phone,
            // §A.6 — spoken variables, not just the dialing target. `phone` above is also
            // reused for this (n8n's Place Call node passes it as both `customer.number` AND
            // the `phone_number` variableValue) — one field, two uses, deliberately not
            // duplicated here.
            email: l.email ?? '',
            external_ref: l.external_ref,
            // §A.3 — never null: every lead reaching this point already passed the "has a
            // mapped assistant" candidate check above (§A.2).
            assistant_id: assistantIdByIndustry.get(normalizeIndustryKey(campaign?.industry)) ?? '',
            industry: campaign?.industry ?? '',
            agent_name: agent?.name ?? '',
            extra_instructions: agent?.script ?? '',
            welcome_message: agent?.welcome_message ?? '',
            company_name: companyNameByUserId.get(l.user_id as string) ?? '',
            voice_id: agent?.voice ?? '',
            // lead-enrichment plan §D.1/D.2 — the six spoken enrichment fields (D-1). home_built
            // is the only non-text one (INTEGER) — stringified here so it reaches n8n/Vapi as a
            // plain string like every other variableValue, never as a bare number JSON would
            // otherwise serialize it as.
            address: (l as { address?: string | null }).address ?? '',
            city: (l as { city?: string | null }).city ?? '',
            zip: (l as { zip?: string | null }).zip ?? '',
            home_type: (l as { home_type?: string | null }).home_type ?? '',
            home_built: (l as { home_built?: number | null }).home_built != null ? String((l as { home_built?: number | null }).home_built) : '',
            last_service: (l as { last_service?: string | null }).last_service ?? '',
          }
        }),
        occupied_slots: occupiedSlots ?? 0,
        available_slots: availableSlots,
        // §A.3c/§A.3e — NOT optional polish (see the comment where these counters are
        // incremented, above). Without them, "the assistant table is empty" and "it's 3am" are
        // both an empty `leads: []` plus an HTTP 200 — indistinguishable, and n8n is green
        // either way.
        skipped: {
          unmapped_industry: skippedUnmappedIndustry,
          outside_hours: skippedOutsideHours,
          bad_phone: skippedBadPhone,
          daily_cap: skippedDailyCap,
          qualified_cap: skippedQualifiedCap,
        },
        unmapped_industries: Array.from(unmappedIndustries),
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
        // E.4 (call-reliability plan §4, D-1) - the lead is ALREADY 'dialing' with retry_count
        // already incremented and last_called_at already set, by reserve_leads() at ?action=due
        // time, before Place Call (Vapi) was ever attempted. Writing those fields again here
        // would double-count every attempt - the same bug call-engine Phase 4 §E.2 already fixed
        // once in call-ingest. This step only attaches the real Vapi call id.
        const { error } = await supabase
          .from('leads')
          .update({ active_call_id: vapiCallId })
          .eq('id', leadId)
        if (!error) claimed++
      }

      let failed = 0
      for (const f of failures) {
        const leadId = f.lead_id
        if (typeof leadId !== 'string' || !leadId) continue
        // E.5 (call-reliability plan §4, D-1) - the lead was already reserved by ?action=due
        // before Place Call (Vapi) was ever attempted, so a Vapi-side API error must UNDO that
        // reservation rather than merely reschedule it: put it back to 'pending' so a future wake
        // can pick it up, and decrement retry_count so this doesn't count toward the lead's
        // 3-attempt cap - it's our own error, not the lead's (preserves F.4's original intent).
        // retry_count is fetched-then-decremented, same PostgREST limitation reserve_leads()'s SQL
        // exists to avoid on the happy path - this is the unwind of a reservation that already
        // happened, not a second race-prone read-modify-write of a live counter.
        const { data: existing } = await supabase.from('leads').select('retry_count').eq('id', leadId).single()
        const { error } = await supabase
          .from('leads')
          .update({
            call_status: 'pending',
            next_call_at: new Date(Date.now() + FAILURE_RETRY_MINUTES * 60_000).toISOString(),
            retry_count: Math.max(0, (existing?.retry_count ?? 1) - 1),
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
      // E.6 (call-reliability plan §4) - deliberately unchanged. reserve_leads() now sets
      // last_called_at at RESERVATION time (before Place Call (Vapi) even runs) rather than at
      // claim time, so this sweep already covers "reserved but never actually dialled" - e.g.
      // ?action=claim's own request to Supabase failing after Place Call succeeded - with no
      // further change needed here.
      // Accepted, documented limitation: a lead rescued by this sweep keeps the retry_count
      // reserve_leads() already incremented at reservation time - unlike the failures branch
      // above (which knows for certain no call was placed at all), the sweep cannot tell "call
      // placed, still genuinely in progress past 30 minutes" apart from "reservation abandoned,
      // no call ever happened". Fixing this properly needs a separate reserved_at column;
      // deliberately out of scope here. Fails safe - under-calling a lead, never over-calling one.
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
