-- lead-enrichment plan §B — a lead list James has (2000+ rows, LA homeowners) carries an address,
-- a ZIP, and a full picture of the house; `leads` has nowhere to put any of it. Thirteen new
-- nullable columns — nullable and default-free on purpose (§B.1): every existing lead, and every
-- future non-enriched upload, has none of these, and a lead with no ZIP must stay dialable — the
-- AI asks instead of asserting (docs/06-CALL-QUALITY-TUNING.md's fix #2), it doesn't need this
-- data to function.
--
-- ⛔ FILE-SIDE ONLY as of this commit. Apply with
--   npx supabase db query --file supabase/migrations/20260915000000_lead_enrichment.sql --linked
-- per this repo's "the hosted database was never CLI-managed" note in CLAUDE.md — `db push` is
-- unsafe here. Verify afterward via information_schema.columns (all 13 present) and
-- pg_constraint (leads_home_built_range exists).

-- Spoken on the call (D-1).
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS zip TEXT, -- US-centric name, matching the source file and the {{zip}} variable
  ADD COLUMN IF NOT EXISTS home_type TEXT, -- 'Single Family' | 'Duplex' | 'Multi-Family' | …
  ADD COLUMN IF NOT EXISTS home_built INTEGER,
  ADD COLUMN IF NOT EXISTS last_service TEXT; -- 'HVAC' | 'Solar' | 'Roofing' | 'Windows' | 'Gutter' | 'Kitchen' | 'Bath'

-- Stored for filtering, never spoken (D-2/D-4).
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS stories INTEGER,
  ADD COLUMN IF NOT EXISTS bedrooms INTEGER,
  ADD COLUMN IF NOT EXISTS bathrooms INTEGER,
  ADD COLUMN IF NOT EXISTS phone_type TEXT, -- 'mobile' | 'fixed_line' | 'voip'
  ADD COLUMN IF NOT EXISTS phone_region TEXT,
  ADD COLUMN IF NOT EXISTS lead_posted_at DATE; -- the source file's `datepost`

-- home_built is the single strongest pitch signal in the file (D-1) — worth guarding against
-- garbage at the database level too, not just client-side (src/lib/leadCsv.ts's parseYearOrNull
-- already clamps to null before insert, so this should never actually fire on app-uploaded data;
-- it's the backstop for any other write path, e.g. a future direct import script).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_home_built_range'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_home_built_range CHECK (home_built IS NULL OR home_built BETWEEN 1800 AND 2100);
  END IF;
END $$;

COMMENT ON COLUMN public.leads.zip IS
  'lead-enrichment plan §D-1 — spoken as {{zip}} once the engine (§D) is live. Also the input to '
  'src/lib/leadTimezone.ts''s timezoneForZip(), which populates leads.timezone on upload (D-4).';
COMMENT ON COLUMN public.leads.gender IS
  'lead-enrichment plan §D-2 — stored for future campaign targeting, never spoken on a call.';
