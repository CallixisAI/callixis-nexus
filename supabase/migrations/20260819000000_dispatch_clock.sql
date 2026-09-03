-- Phase 3 (event-driven plan) — Supabase owns the clock.
-- See docs/event-driven-plan/PHASE-3-supabase-owns-the-clock.md and
-- Plan-Checklist/event-driven/PHASE-3-CHECKLIST.md — section letters match exactly.
--
-- Moves "is there anything to dial?" out of n8n (which costs a full execution just to ask) and
-- into Postgres, where it's free. pg_cron ticks every 2 minutes, asks public.has_due_leads(), and
-- only pokes event-driven Phase 2's /dispatch-now webhook when the answer is yes.
--
-- ⚠️ Gate confirmed 2026-08-18 (Plan-Checklist/event-driven/PHASE-0-CHECKLIST.md A.4): both
-- pg_cron (1.6.4) and pg_net (0.20.0) have a row in pg_available_extensions with
-- installed_version null — available, not yet enabled. This migration enables them (§A below).
--
-- ❓ NOT LIVE-VERIFIED — read before applying. This file was written with the Supabase CLI's
-- `db query --linked` available for read-only checks (confirmed pg_cron/pg_net availability and
-- that the `supabase_vault` extension is already installed, live, 2026-08-19), but the auto-mode
-- permission classifier blocked the one mutating call attempted this session
-- (`create extension if not exists pg_cron/pg_net;`) — so the exact installed signatures of
-- `net.http_post` and the column shape of `net._http_response` were never inspected live, only
-- asserted from pg_net's documented, stable-since-~0.8 shape. **Before running this file**, enable
-- the extensions first if they aren't already, then run:
--   select proname, pg_get_function_arguments(oid) from pg_proc where pronamespace = 'net'::regnamespace;
--   select column_name, data_type from information_schema.columns where table_schema = 'net' and table_name = '_http_response';
-- and confirm they match what §C below assumes. If they don't, fix §C before running the rest.
--
-- 🔒 The secret is deliberately NOT in this file, and never will be. dispatch_tick() below reads
-- it from Supabase Vault at call time (vault.decrypted_secrets, name = 'dispatch_trigger_secret').
-- See PHASE-3-CHECKLIST.md's Notes for the one-line command to create it — run separately, by
-- hand, so the literal value never lands in a committed file. C.2 rejects hardcoding outright;
-- CLAUDE.md records a real Twilio-credential leak of exactly this class from this same project.

-- ── A. Extensions ──────────────────────────────────────────────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── B. The gate function — the piece that saves the money ────────────────────────────────────
-- Mirrors dispatch-batch/index.ts:126-135's eligibility filter exactly, five conditions, no more
-- and no less. If that filter ever changes, this function must change with it in the same commit
-- — see CLAUDE.md's schema-change note next to this pairing. They drifting apart fails silently:
-- leads that exist and should be dialed, and never are, with no error anywhere.
--
-- Deliberately does NOT check work hours or the daily cap (phase doc §B.2) — that's 35 lines of
-- timezone handling in dispatch-batch/index.ts:40-75, including a midnight-crossing bug already
-- found live once on a real campaign. Duplicating it here in PL/pgSQL risks a second,
-- silently-drifting copy of exactly the logic that has already broken once. Accepted cost:
-- out-of-hours ticks can wake n8n for a genuinely-active campaign with genuinely-pending leads,
-- and dispatch-batch will correctly find nothing to dial — a wasted execution, bounded at ~1 per
-- 2-minute tick, never a wasted call.
create or replace function public.has_due_leads()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.leads l
    join public.campaigns c on c.id = l.campaign_id
    where l.call_status = 'pending'
      and l.do_not_call = false
      and l.retry_count < 3
      and c.status = 'active'
      and (l.next_call_at is null or l.next_call_at <= now())
    limit 1
  );
$$;

revoke all on function public.has_due_leads() from public;
revoke execute on function public.has_due_leads() from anon, authenticated;
-- B.3b: returns only a boolean regardless, but nothing in the browser should be able to call this
-- at all — pg_cron (via the postgres role) and service-role connections still can.

-- ── C. The tick job ────────────────────────────────────────────────────────────────────────

-- Bounded log of actual dispatch attempts. Rows are written only when has_due_leads() was true
-- and a POST was actually sent (or attempted) — a no-work tick writes nothing, so this table's
-- size tracks real dispatch activity, not the 2-minute tick rate. Not user data and not RLS'd on
-- a user_id; it's operational/ops data, so RLS is enabled with zero policies (deny-everything —
-- this project's own documented convention for "nobody in the browser touches this," see the
-- schema-change skill), and only the SECURITY DEFINER functions below or a service-role
-- connection ever read or write it.
create table if not exists public.dispatch_tick_log (
  id bigint generated always as identity primary key,
  ticked_at timestamp with time zone not null default now(),
  request_id bigint,
  status_code integer,
  error_msg text,
  checked boolean not null default false,
  checked_at timestamp with time zone
);

alter table public.dispatch_tick_log enable row level security;
revoke all on public.dispatch_tick_log from anon, authenticated;

create index if not exists idx_dispatch_tick_log_unchecked
  on public.dispatch_tick_log (request_id)
  where checked = false and request_id is not null;

-- The tick itself: gate first, POST only on true. Reads the secret from Vault — never from this
-- file, never from cron.job.command (C.2a: `select command from cron.job;` must not contain it).
create or replace function public.dispatch_tick()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  if not public.has_due_leads() then
    return;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'dispatch_trigger_secret'
  limit 1;

  if v_secret is null then
    -- Work exists but nothing was sent — the loud failure mode (missing config), as opposed to
    -- C.4's quiet one (sent but the response was bad). Both land in the same log table.
    insert into public.dispatch_tick_log (request_id, error_msg, checked, checked_at)
    values (null, 'dispatch_trigger_secret not found in vault — see PHASE-3-CHECKLIST.md runbook', true, now());
    return;
  end if;

  select net.http_post(
    url := 'https://godofmedia.app.n8n.cloud/webhook/dispatch-now',
    body := jsonb_build_object('source', 'pg_cron', 'reason', 'due_leads_exist'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-callixis-dispatch-trigger-secret', v_secret
    ),
    timeout_milliseconds := 5000
  ) into v_request_id;

  insert into public.dispatch_tick_log (request_id)
  values (v_request_id);
end;
$$;

revoke all on function public.dispatch_tick() from public, anon, authenticated;

-- ── C.4 — detect a silently-failing tick ──────────────────────────────────────────────────
-- pg_net is fire-and-forget: http_post returns a request id, not a status; the answer lands later
-- in net._http_response. Left alone, a rotated-but-not-updated secret fails every tick with a 401
-- and nothing anywhere says so. This reconciles recent request ids against net._http_response,
-- marks stale unanswered rows as lost rather than leaving them pending forever, and keeps the log
-- table bounded. This is this phase's own required "at least one of C.4a/C.4b" — Phase 5's
-- dead-man's switch (C.4b) is still the recommended long-term form, not a replacement for this.
create or replace function public.check_dispatch_tick_health()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.dispatch_tick_log t
  set status_code = r.status_code,
      error_msg = coalesce(r.error_msg, t.error_msg),
      checked = true,
      checked_at = now()
  from net._http_response r
  where t.request_id = r.id
    and t.checked = false
    and t.request_id is not null;

  -- A request that never got a response at all (pg_net gave up, DNS failed, whatever) is marked
  -- checked with an explicit note after an hour, rather than left "unchecked" forever.
  update public.dispatch_tick_log t
  set checked = true,
      checked_at = now(),
      error_msg = coalesce(t.error_msg, 'no response after 1h — request lost or timed out')
  where t.checked = false
    and t.request_id is not null
    and t.ticked_at <= now() - interval '1 hour';

  delete from public.dispatch_tick_log where ticked_at < now() - interval '7 days';
end;
$$;

revoke all on function public.check_dispatch_tick_health() from public, anon, authenticated;

-- Human/Phase-5-facing summary. Not reachable from the browser (RLS denies all on the underlying
-- table), but queryable from the SQL editor or a service-role connection as a manual "is this
-- healthy" check pending Phase 5's real dead-man's switch. This is what E.5 (a deliberately broken
-- secret) should show turning unhealthy.
create or replace view public.dispatch_tick_health as
select
  count(*) filter (where ticked_at > now() - interval '24 hours') as ticks_last_24h,
  count(*) filter (
    where ticked_at > now() - interval '24 hours'
      and checked and (status_code is null or status_code not between 200 and 299)
  ) as failures_last_24h,
  max(ticked_at) filter (where status_code between 200 and 299) as last_success_at,
  max(ticked_at) filter (
    where checked and (status_code is null or status_code not between 200 and 299)
  ) as last_failure_at
from public.dispatch_tick_log;

revoke all on public.dispatch_tick_health from anon, authenticated;

-- ── Schedule both jobs ─────────────────────────────────────────────────────────────────────
-- cron.schedule errors on a duplicate job name rather than upserting, so unschedule first if this
-- migration is ever re-run (e.g. after an edit).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'callixis-dispatch-tick') then
    perform cron.unschedule('callixis-dispatch-tick');
  end if;
  if exists (select 1 from cron.job where jobname = 'callixis-dispatch-tick-monitor') then
    perform cron.unschedule('callixis-dispatch-tick-monitor');
  end if;
end $$;

select cron.schedule('callixis-dispatch-tick', '*/2 * * * *', $$select public.dispatch_tick();$$);
select cron.schedule('callixis-dispatch-tick-monitor', '*/15 * * * *', $$select public.check_dispatch_tick_health();$$);

-- Reversal (phase doc's own one-liner, extended to this file's two jobs and supporting objects):
--   select cron.unschedule('callixis-dispatch-tick');
--   select cron.unschedule('callixis-dispatch-tick-monitor');
--   drop view public.dispatch_tick_health;
--   drop function public.check_dispatch_tick_health();
--   drop function public.dispatch_tick();
--   drop table public.dispatch_tick_log;
--   drop function public.has_due_leads();
-- The n8n Dispatcher timer (§D) is untouched by any of the above and keeps working as the
-- backstop either way.
