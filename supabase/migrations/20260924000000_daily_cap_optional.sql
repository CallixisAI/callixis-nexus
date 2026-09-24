-- 2026-09-24 (James) — remove the per-campaign daily call limit.
--
-- WHY: a campaign should work through its whole lead list and stop for exactly two reasons —
-- the leads run out, or Max Qualified Leads is reached. The 100/day default was a runaway-dialing
-- brake from call-engine Phase 4, not a product requirement, and on a 1,000-lead list it silently
-- turned a two-day campaign into a ten-day one with nothing on screen explaining why.
--
-- HOW: 0 now means "no daily limit". That is deliberately the SAME convention campaigns.
-- max_qualified_leads already uses (dispatch-batch/index.ts treats `qualCap <= 0` as "no cap"),
-- so there is one rule to remember rather than two opposite ones. A positive number still caps,
-- so anyone who wants a limit on a specific campaign can still set one in Campaign Settings.
--
-- The matching enforcement change is in supabase/functions/dispatch-batch/index.ts (`?action=due`,
-- the `cap <= 0` branch). Applying this migration WITHOUT deploying that function would set every
-- campaign's cap to 0 and the old code would read that as "dial nobody" — all calling would stop.
-- Deploy the function first, or in the same sitting.
--
-- NOT touched, on purpose — these still stop a campaign and are unaffected by this change:
--   * work_hours / timezone (a campaign still only dials inside its own window)
--   * max_qualified_leads   (the intended stopping condition)
--   * leads.retry_count vs MAX_RETRY_COUNT = 3
--   * the dispatcher's concurrency limit (10 calls at a time, 25 per tick)
--
-- REVERSAL:
--   alter table public.campaigns alter column daily_call_cap set default 100;
--   update public.campaigns set daily_call_cap = 100 where daily_call_cap = 0;

alter table public.campaigns
  alter column daily_call_cap set default 0;

comment on column public.campaigns.daily_call_cap is
  'Max leads dialled per UTC day for this campaign. 0 = no daily limit (same 0-means-unlimited '
  'convention as max_qualified_leads). Enforced in supabase/functions/dispatch-batch/index.ts, '
  '?action=due — not in n8n.';

-- Every existing campaign moves to "no daily limit" too (James, 2026-09-24). All 7 were on the
-- old default of 100 except US_Los Angeles_092426, which was on 1,000.
update public.campaigns
   set daily_call_cap = 0
 where daily_call_cap <> 0;
