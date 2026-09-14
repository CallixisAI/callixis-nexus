-- Phase 2 (retire-n8n-timers plan) — move the stuck-lead sweep into Postgres.
-- See docs/retire-n8n-timers-plan/README.md and
-- Plan-Checklist/retire-n8n-timers/CHECKLIST.md — section letters (§C) match exactly.
--
-- Why this exists: n8n Cloud bills per execution — one workflow run, work or no work. The n8n
-- `Sweeper` schedule trigger (30 min) is the ONLY thing that rescues leads stuck mid-call, so it
-- can't just be switched off like the redundant 15-min `Dispatcher` (event-driven Phase 5 §C, and
-- retire-n8n-timers §B). It has to be replaced first. The job it does is one UPDATE on `leads`
-- (dispatch-batch/index.ts:309-329, ?action=sweep) — the only reason it ever lived in n8n is that
-- n8n can't talk to Postgres directly and needs an HTTP door. pg_cron IS Postgres, so the door,
-- the shared secret (DISPATCH_SECRET), Vault and pg_net all drop out of the picture here.
--
-- Same cheap-gate shape as has_due_leads() (20260819000000_dispatch_clock.sql): a tick that finds
-- nothing runs one indexed EXISTS and returns. D-1 (James, 2026-09-04): tick every 5 minutes, not
-- 30 — ticks are free thanks to the gate, so worst-case stuck time drops from ~60 min to ~35 min
-- at no extra cost. A deliberate improvement on today's behaviour, not a like-for-like swap.
--
-- ⚠️ ACCEPTED DRIFT (§C.11): the 30-minute threshold and the "dialing + last_called_at old"
-- predicate now live in TWO places — this file and dispatch-batch/index.ts:309-329 (which stays
-- in place as the manual/emergency HTTP path, per the plan doc's "The simplification that makes
-- this small"). dispatch-batch/index.ts is the source of truth; if STUCK_CALL_MINUTES or the
-- predicate changes there, change has_stuck_leads() below in the same commit. This is the same
-- drift risk has_due_leads() already carries and documents against dispatch-batch/index.ts:126-135.
--
-- Ordering note: this must land BEFORE 20260904000000_reserve_before_dial.sql is applied live
-- (it currently isn't — call-reliability plan §5 gate). That migration flips leads to 'dialing'
-- *before* the dial, so anything breaking in between strands them — which makes this sweep more
-- load-bearing, not less. The two share no objects; the filenames just order.

-- ── A. Extension (idempotent no-op — 20260819000000_dispatch_clock.sql already enabled it) ────
create extension if not exists pg_cron;

-- ── B. The gate — mirrors dispatch-batch/index.ts:309-329's predicate exactly ────────────────
-- ?action=sweep filters: .eq('call_status', 'dialing').lt('last_called_at', now() - 30min).
-- PostgREST's .lt() excludes NULL last_called_at (NULL < x is unknown), and so does the SQL
-- comparison below — a lead reserved but never stamped with last_called_at is NOT swept by
-- either path. Verbatim match, on purpose.
create or replace function public.has_stuck_leads()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.leads l
    where l.call_status = 'dialing'
      and l.last_called_at < now() - interval '30 minutes'
    limit 1
  );
$$;

revoke all on function public.has_stuck_leads() from public;
revoke execute on function public.has_stuck_leads() from anon, authenticated;
-- Returns only a boolean regardless, but nothing in the browser should be able to call this at
-- all — pg_cron (via the postgres role) and service-role connections still can. Mirrors
-- has_due_leads()'s own revoke lines (20260819000000_dispatch_clock.sql:68-69).

-- ── C. The incident log ────────────────────────────────────────────────────────────────────
-- A row is written ONLY when reset_count > 0, so this table records real stuck-lead incidents,
-- not the 5-minute tick rate. Not user data and not RLS'd on a user_id — operational/ops data,
-- so RLS is enabled with zero policies (deny-everything), this project's documented convention
-- for "nobody in the browser touches this" (dispatch_tick_log / dispatch_trigger_state set the
-- precedent). Only the SECURITY DEFINER function below or a service-role connection reads it.
create table if not exists public.sweep_tick_log (
  id bigint generated always as identity primary key,
  swept_at timestamp with time zone not null default now(),
  reset_count integer not null
);

alter table public.sweep_tick_log enable row level security;
revoke all on public.sweep_tick_log from anon, authenticated;

-- ── D. The sweep itself — gate first, UPDATE only on true ───────────────────────────────────
-- The UPDATE is dispatch-batch/index.ts:322-326 verbatim: set call_status='pending',
-- active_call_id=null WHERE call_status='dialing' AND last_called_at old. retry_count is NOT
-- touched — a lead rescued here keeps the retry_count reserve_leads() already incremented at
-- reservation time (that function's own comment, and dispatch-batch/index.ts:315-320, explain
-- why the sweep deliberately can't tell "still genuinely dialing past 30 min" from "reservation
-- abandoned" and so fails safe by under-calling).
create or replace function public.sweep_stuck_leads()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reset_count integer;
begin
  if not public.has_stuck_leads() then
    return;
  end if;

  update public.leads
     set call_status   = 'pending',
         active_call_id = null
   where call_status = 'dialing'
     and last_called_at < now() - interval '30 minutes';

  get diagnostics v_reset_count = row_count;

  -- Only real incidents get a row — a tick that swept nothing writes nothing.
  if v_reset_count > 0 then
    insert into public.sweep_tick_log (reset_count) values (v_reset_count);
  end if;

  -- Keep the table bounded (§C.8). Cheap: this table only grows on real incidents.
  delete from public.sweep_tick_log where swept_at < now() - interval '30 days';
end;
$$;

revoke all on function public.sweep_stuck_leads() from public, anon, authenticated;

-- ── E. Schedule the tick ───────────────────────────────────────────────────────────────────
-- cron.schedule errors on a duplicate job name rather than upserting, so unschedule first if this
-- migration is ever re-run (e.g. after an edit) — same guard as
-- 20260819000000_dispatch_clock.sql:207-215.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'callixis-sweep-stuck-leads') then
    perform cron.unschedule('callixis-sweep-stuck-leads');
  end if;
end $$;

select cron.schedule('callixis-sweep-stuck-leads', '*/5 * * * *', $$select public.sweep_stuck_leads();$$);

-- ── Reversal ───────────────────────────────────────────────────────────────────────────────
-- Same convention as 20260819000000_dispatch_clock.sql:220-229.
--   select cron.unschedule('callixis-sweep-stuck-leads');
--   drop function public.sweep_stuck_leads();
--   drop table public.sweep_tick_log;
--   drop function public.has_stuck_leads();
-- The n8n `Sweeper` timer (retire-n8n-timers §E) is untouched by any of the above — reverting
-- this migration alone just means the sweep goes back to being n8n's job. Do NOT revert this
-- without first re-activating the n8n `Sweeper` node, or stuck leads stop being rescued entirely.
