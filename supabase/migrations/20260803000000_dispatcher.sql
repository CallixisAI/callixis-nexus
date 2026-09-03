-- Phase 4 (call-engine plan) — the fast dispatcher.
-- See docs/call-engine-plan/PHASE-4-fast-dispatcher.md and
-- Plan-Checklist/call-engine/PHASE-4-CHECKLIST.md sections B and D.
--
-- Adds what the dispatch-batch edge function needs that Phase 3's leads.sql didn't create yet:
-- a work-hours timezone per campaign (and an optional per-lead override), a daily dial cap per
-- campaign (checklist B.5 — "build this before pointing the dispatcher at real data"), and a slot
-- to remember which Vapi call is currently in flight for a lead (so the stuck-call sweeper, E.4,
-- has something concrete to point at besides a timestamp).

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS daily_call_cap INTEGER NOT NULL DEFAULT 100;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  ADD COLUMN IF NOT EXISTS active_call_id TEXT;

-- The due-leads query (dispatch-batch, action=due) always filters on exactly these columns
-- together. do_not_call is checked separately in the WHERE clause below rather than folded into
-- the index predicate, because it's a near-constant true/false split, not a range condition.
CREATE INDEX IF NOT EXISTS idx_leads_dispatch_due
  ON public.leads (campaign_id, next_call_at)
  WHERE call_status = 'pending' AND do_not_call = false;

-- The stuck-call sweeper (action=sweep) scans for leads stuck in 'dialing'.
CREATE INDEX IF NOT EXISTS idx_leads_dialing
  ON public.leads (last_called_at)
  WHERE call_status = 'dialing';
