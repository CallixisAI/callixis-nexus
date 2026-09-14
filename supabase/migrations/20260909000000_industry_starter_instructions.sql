-- Client-feedback plan §B.2 / D-1 — the admin-editable half of the per-industry starter text.
--
-- D-1 splits the feature: src/lib/industryStarters.ts is the code default (ships working on day
-- one), this column is the override an admin can edit without a developer. The wizard's resolver
-- (resolveIndustryStarter) prefers this column when it's set, else falls back to the code default.
--
-- ⛔ FILE-SIDE ONLY as of this commit. Apply with
--   npx supabase db query --file supabase/migrations/20260909000000_industry_starter_instructions.sql --linked
-- per this repo's "the hosted database was never CLI-managed" note in CLAUDE.md — `db push` is
-- unsafe here. Verify afterward via information_schema.columns (starter_instructions present,
-- vapi_assistant_id now nullable) and pg_constraint (industry_assistants_not_empty exists).

-- The override text itself.
ALTER TABLE public.industry_assistants
  ADD COLUMN IF NOT EXISTS starter_instructions TEXT;

-- Why DROP NOT NULL is necessary, not gratuitous: vapi_assistant_id is currently NOT NULL and the
-- table SHIPS EMPTY (AI-Agents plan D-9's real assistant ids were never supplied). Without this,
-- an admin could not save starter text for ANY industry — there'd be no row to hang it on — which
-- makes the override half of D-1 dead on arrival.
ALTER TABLE public.industry_assistants
  ALTER COLUMN vapi_assistant_id DROP NOT NULL;

-- ...but a row that is entirely blank (no assistant id AND no starter text) is meaningless. The
-- CHECK keeps at least one of the two populated. Dropped-then-recreated so re-applying this file
-- is a no-op rather than a "constraint already exists" error.
ALTER TABLE public.industry_assistants
  DROP CONSTRAINT IF EXISTS industry_assistants_not_empty;
ALTER TABLE public.industry_assistants
  ADD CONSTRAINT industry_assistants_not_empty
  CHECK (vapi_assistant_id IS NOT NULL OR starter_instructions IS NOT NULL);

COMMENT ON COLUMN public.industry_assistants.starter_instructions IS
  'Client-feedback plan §B — admin override for the per-industry agent-wizard starter text. '
  'NULL means "use the code default in src/lib/industryStarters.ts".';
