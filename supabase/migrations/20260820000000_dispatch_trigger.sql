-- Event-driven Phase 4 — real event triggers.
-- See docs/event-driven-plan/PHASE-4-real-event-triggers.md and
-- Plan-Checklist/event-driven/PHASE-4-CHECKLIST.md — section letters match exactly.
--
-- This migration only adds the debounce table §C asks for. dispatch-trigger/index.ts is the
-- function that reads and writes it; nothing here is a database trigger despite the name.
--
-- ── C. Debounce state ──────────────────────────────────────────────────────────────────────
-- A singleton row holding the last time dispatch-trigger actually POSTed to n8n. A table, not
-- in-memory (§C.4 — edge function instances are not guaranteed to be warm/shared between
-- invocations, so an in-memory cooldown may silently do nothing). The claim in
-- dispatch-trigger/index.ts is one atomic `UPDATE ... WHERE id = 1 AND (last_triggered_at IS
-- NULL OR last_triggered_at <= cutoff)`, so concurrent callers (§B.3c's feedback-loop case: ten
-- calls ending within the same second, each hitting the call-ingest call site) can't all win the
-- race and each fire their own POST — Postgres's row lock serializes the competing UPDATEs, and
-- only the first to commit sees a WHERE clause that still matches.
create table if not exists public.dispatch_trigger_state (
  id smallint primary key default 1,
  last_triggered_at timestamp with time zone,
  constraint dispatch_trigger_state_singleton check (id = 1)
);

insert into public.dispatch_trigger_state (id, last_triggered_at)
values (1, null)
on conflict (id) do nothing;

alter table public.dispatch_trigger_state enable row level security;
revoke all on public.dispatch_trigger_state from anon, authenticated;
-- Same "deny-everything, only a service-role connection touches it" convention as
-- dispatch_tick_log (20260819000000_dispatch_clock.sql) — nothing in the browser reads or
-- writes this table directly; only dispatch-trigger's own service-role Supabase client does.

-- Reversal:
--   drop table public.dispatch_trigger_state;
