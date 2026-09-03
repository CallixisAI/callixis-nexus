-- Phase 3 (call-engine plan) — Supabase becomes the system of record for leads.
-- See docs/call-engine-plan/PHASE-3-supabase-system-of-record.md and
-- Plan-Checklist/call-engine/PHASE-3-CHECKLIST.md section A.
--
-- ⚠️ Pre-flight (checklist P.1): the hosted database reportedly already has a table literally
-- named `leads`, created by hand, with no migration and no code reference. This file uses
-- CREATE TABLE IF NOT EXISTS so it is a safe no-op if that table already exists — it will NOT
-- retrofit missing columns onto a differently-shaped existing table. Before pasting this into the
-- SQL Editor, run P.1: check the live columns of `leads` (and of `agents`, `call_logs`,
-- `invoices`, `scheduled_meetings` per P.2) and confirm this file still matches, or reconcile by
-- hand first. Do not assume this migration applied successfully just because it didn't error.

-- ── leads: the people, as opposed to call_records (the calls) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  campaign_id    UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  first_name     TEXT,
  last_name      TEXT,
  email          TEXT,
  phone          TEXT NOT NULL,
  country        TEXT,
  source         TEXT,                              -- 'airtable' | 'csv' | 'marketplace'
  external_ref   TEXT,                               -- Airtable record id, during migration
  call_status    TEXT NOT NULL DEFAULT 'pending',    -- pending | dialing | completed | failed
  outcome        TEXT,                               -- Qualified | Not Qualified | Requested Follow-up | Voicemail | Unreachable
  lead_score     INTEGER,
  retry_count    INTEGER NOT NULL DEFAULT 0,
  last_called_at TIMESTAMP WITH TIME ZONE,
  next_call_at   TIMESTAMP WITH TIME ZONE,
  do_not_call    BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own leads" ON public.leads;
CREATE POLICY "Users can view own leads" ON public.leads FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own leads" ON public.leads;
CREATE POLICY "Users can insert own leads" ON public.leads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own leads" ON public.leads;
CREATE POLICY "Users can update own leads" ON public.leads FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own leads" ON public.leads;
CREATE POLICY "Users can delete own leads" ON public.leads FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_leads_user_call_status ON public.leads(user_id, call_status);
CREATE INDEX IF NOT EXISTS idx_leads_campaign_id ON public.leads(campaign_id);
-- One person can't be loaded twice and called twice by the same user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_user_phone ON public.leads(user_id, phone);

DROP TRIGGER IF EXISTS set_updated_at_leads ON public.leads;
CREATE TRIGGER set_updated_at_leads
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── call_records: add the columns call-ingest needs to write ───────────────────────────
ALTER TABLE public.call_records
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vapi_call_id TEXT,
  ADD COLUMN IF NOT EXISTS ended_reason TEXT,
  ADD COLUMN IF NOT EXISTS lead_score INTEGER,
  ADD COLUMN IF NOT EXISTS transcript TEXT,
  ADD COLUMN IF NOT EXISTS cost NUMERIC;

-- Idempotency key for a replayed Vapi webhook (Phase 2). Plain UNIQUE, not a partial index —
-- Postgres already treats every NULL as distinct, so rows without a call yet are unaffected.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'call_records_vapi_call_id_key'
  ) THEN
    ALTER TABLE public.call_records ADD CONSTRAINT call_records_vapi_call_id_key UNIQUE (vapi_call_id);
  END IF;
END $$;
