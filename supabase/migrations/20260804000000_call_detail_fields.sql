-- Phase 5 (call-engine plan) — call detail view, §D.
-- See docs/call-engine-plan/PHASE-5-wire-the-app.md and
-- Plan-Checklist/call-engine/PHASE-5-CHECKLIST.md sections D.2, D.5, D.6.
--
-- Adds what the call detail panel needs that Phase 2/3 didn't create yet: the disqualification
-- reason (Phase 2's "Merge Analysis" node produces it, but call-ingest never had a column to put
-- it in), a needs_review flag for the questionable-verdict case Phase 2 §C.5 already forces in
-- n8n but nothing downstream persisted, and who/when a human manually overrode an AI verdict.

ALTER TABLE public.call_records
  ADD COLUMN IF NOT EXISTS disqual_reason TEXT,
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;
