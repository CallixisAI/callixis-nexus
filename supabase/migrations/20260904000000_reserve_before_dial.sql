-- Call reliability plan, §4 (D-1) — reserve-before-dial.
-- See docs/call-reliability-plan/README.md and Plan-Checklist/call-reliability/CHECKLIST.md
-- (section letters match: this file is E.1).
--
-- Why this exists: on 2026-09-03, three leads were dialled repeatedly and simultaneously — one
-- lead five times in ninety seconds, once mid-conversation. The mechanism: dispatch-batch's
-- ?action=due selects a lead as a *candidate* but does not mark it, and Report Claims (Supabase)
-- --> ?action=claim is the only thing that ever writes call_status='dialing'. If that claim call
-- fails for any reason (a code bug in the n8n node building its payload, a credential
-- misconfiguration, a network blip) the lead is left exactly as it was — 'pending', retry_count
-- unchanged — and the *next* dispatcher wake (as little as 2 minutes later, pg_cron) selects the
-- same lead again. Vapi had already answered; nothing stopped a second, third, fourth call.
--
-- The fix: flip the order. Reserve the lead (flip it to 'dialing', bump retry_count) BEFORE
-- placing the call, not after. Once reserved, ?action=due's own `.eq('call_status', 'pending')`
-- filter excludes it from every subsequent candidate pool automatically — double-dialling becomes
-- structurally impossible rather than merely repaired. Worst case if Report Claims itself then
-- fails is a lead stuck at 'dialing' with no active_call_id set, which the existing Sweeper
-- (?action=sweep, unchanged by this migration) already resets to 'pending' after
-- STUCK_CALL_MINUTES (30) — "one call delayed by up to 30 minutes", not "five calls in ninety
-- seconds".
--
-- Done in SQL rather than a plain PostgREST .update() for two reasons: (1) race safety — two
-- dispatcher wakes landing close together (pg_cron's 2-minute tick and an event trigger both
-- firing) must not both reserve the same lead, and `where call_status = 'pending'` inside a single
-- UPDATE statement is what makes that atomic, the same technique event-driven Phase 4's
-- dispatch_trigger_state debounce already uses; (2) `retry_count = retry_count + 1` cannot be
-- expressed by PostgREST's .update() at all — dispatch-batch/index.ts used to work around this by
-- reading the value first, then writing it back, which is itself a race window this migration
-- closes.

create or replace function public.reserve_leads(p_lead_ids uuid[])
returns table(id uuid)
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.leads
     set call_status    = 'dialing',
         last_called_at = now(),
         retry_count    = retry_count + 1,
         updated_at     = now()
   where leads.id = any(p_lead_ids)
     and call_status = 'pending'   -- only rows still unclaimed; this is the race guard
  returning leads.id;
$$;

-- Same reasoning as has_due_leads() (20260819000000_dispatch_clock.sql) — nothing in the browser
-- should be able to flip an arbitrary lead to 'dialing' and increment its retry_count. Only a
-- service-role connection (dispatch-batch) calls this.
revoke all on function public.reserve_leads(uuid[]) from public;
revoke execute on function public.reserve_leads(uuid[]) from anon, authenticated;

-- Reversal:
--   drop function public.reserve_leads(uuid[]);
-- Reverting this migration alone (without also reverting the dispatch-batch/index.ts changes in
-- the same plan) reintroduces the double-dial bug — do not revert one without the other.
