-- Permission-overrides plan Phase 4 §I (docs/permission-overrides-plan/README.md) — server-side
-- enforcement. docs/permission-overrides-plan/README.md's E19 is the reason this exists: no RLS
-- policy on campaigns/leads/call_records consults a permission at all today, so every
-- permission check the app makes is advisory — it decides what the UI offers, never what the
-- database allows. E20 reproduced this live: a role holding NONE of the campaigns.* sub-
-- functions, at any level, still created a real campaign row through the app.
--
-- ⚠️ Same caveat as every migration in this project: written from the model and the live
-- `pg_policies`/`pg_get_functiondef` output captured this session (2026-09-03), not applied to
-- production. §I.2's own pre-flight — compare every live policy name against what this drops —
-- was run for real via `npx supabase db query --linked` before writing a single DROP POLICY
-- line below; the exact live definitions are quoted in this session's own notes. A name
-- mismatch would leave the old permissive policy in place ALONGSIDE the new one (RLS ORs
-- policies for the same command), making the new restriction silently bypassable while
-- appearing installed — this is why the check happened first, not as an afterthought.
--
-- Scope, deliberately narrower than "the critical set" (E18's sensitivity ranking):
--   - Most `critical` keys (settings.*, finance.*, admin.permission_overrides) have NO backing
--     table RLS can gate — settings/finance are computed client-side or don't persist at all
--     (SettingsPage.tsx/Finance.tsx/Marketplace.tsx's own §H.2/§H.4 comments record this), and
--     admin.permission_overrides' real write path is `manage-users` (service-role, bypasses
--     RLS entirely) — enforced instead as an edge-function check, see that function's own
--     `handleUpdatePermissions` comment, not here.
--   - What DOES have a clean mapping, and is where E20's live-reproduced bug actually lives, is
--     `campaigns`/`leads`/`call_records` — all three already share the is_account_active()/
--     ip_allowed() baseline (admin-module Phases 5–6), so this migration follows their own
--     drop-and-recreate template exactly, adding one more AND clause rather than a parallel
--     mechanism.
--   - `ai_agents` is deliberately NOT touched here. Checked live this session
--     (`pg_policies` for ai_agents): it never received admin-module Phase 5/6's
--     is_account_active()/ip_allowed() baseline in the first place — a pre-existing gap,
--     unrelated to this plan, out of scope to fix in the same migration as a permission change.
--     Recorded, not silently absorbed.
--
-- What's covered, and the exact mutation each maps to (traced live in src/hooks/useCampaigns.ts
-- this session, not assumed):
--   campaigns INSERT           -> createMutation                  -> campaigns.create_delete (full)
--   campaigns UPDATE           -> updateMutation (status AND       -> campaigns.create_delete OR
--                                  settings — both share one row)     campaigns.start_pause_stop (full)
--   campaigns DELETE           -> deleteCampaignMutation           -> campaigns.create_delete (full)
--   leads      INSERT          -> addLeadsMutation                 -> campaigns.bulk_lead_upload (full)
--   leads      UPDATE          -> overrideOutcomeMutation          -> callcenter.outcome_tagging (full)
--   leads      DELETE          -> deleteLeadMutation                -> campaigns.lead_management (full)
--   call_records UPDATE        -> overrideOutcomeMutation          -> callcenter.outcome_tagging (full)
--   call_records DELETE        -> deleteCallRecordMutation          -> campaigns.lead_management (full)
--   call_records INSERT        -> not written from the client anywhere traced this session
--                                  (call-ingest writes via service role, bypassing RLS) — left
--                                  untouched rather than guessed at.
--
-- `campaigns.create_delete` and `campaigns.start_pause_stop` have identical holder sets in the
-- live matrix today (super_admin/admin/sales_manager, both always `full` — E21-style check, run
-- live this session) — requiring EITHER on UPDATE is not a widening, just acknowledging one row
-- serves two UI actions (status toggle AND the Settings dialog) that the spreadsheet never split
-- into two separate sub-functions.
--
-- campaigns.lead_management's "cannot edit a lead" language (the plan's own D-3 table) has no
-- matching UI action beyond delete — there is no generic "edit a lead's fields" mutation
-- anywhere in this codebase (checked: `leads` UPDATE is exclusively the outcome-override path,
-- which is a Call Center concept, not a Campaigns one) — so lead_management's UPDATE-level
-- meaning stays undefined here rather than invented.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- A. has_permission_at_least(key, min_level) — the RLS-callable sibling of
--    src/contexts/AuthContext.tsx's computeHasPermissionAtLeast, same view<edit<full ordering
--    (mirrored, not shared — cross-runtime, same reason src/lib/phone.ts documents for its own
--    mirror of scripts/import-leads.mjs). Built on get_my_permissions() (already
--    STABLE SECURITY DEFINER, already the one resolver RLS elsewhere and the client both read
--    through) rather than querying role_permissions/user_permissions directly a second time.
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_permission_at_least(p_key TEXT, p_min_level TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.get_my_permissions() gp
    WHERE gp.permission_key = p_key
      AND CASE gp.level  WHEN 'view' THEN 1 WHEN 'edit' THEN 2 WHEN 'full' THEN 3 ELSE 0 END
        >= CASE p_min_level WHEN 'view' THEN 1 WHEN 'edit' THEN 2 WHEN 'full' THEN 3 ELSE 0 END
  );
$$;

REVOKE ALL ON FUNCTION public.has_permission_at_least(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission_at_least(TEXT, TEXT) TO authenticated;

-- ⚠️ I.5 (unmeasured, flagged not assumed): get_my_permissions() is already STABLE SECURITY
-- DEFINER and already runs once per row-check on `campaigns`/`leads`/`call_records`'s existing
-- is_account_active()/ip_allowed() policies (admin-module Phases 5–6). This function adds one
-- more such call, on the same three tables, for the four commands listed above only (not
-- SELECT). Whether that's measurably worse than the two calls already there was NOT tested this
-- session — run `EXPLAIN ANALYZE` on a representative `SELECT`/`UPDATE` against `leads` and
-- `call_records` (the two highest-row-count tables) before treating this as free.

-- ─────────────────────────────────────────────────────────────────────────────────────
-- B. campaigns — INSERT/UPDATE/DELETE only. SELECT is deliberately untouched: this plan gates
--    actions, not visibility of a user's own rows (D-3's "view" level already means "can see
--    it"), and over-restricting SELECT risks breaking ordinary page loads for no benefit.
-- ─────────────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can insert own campaigns" ON public.campaigns;
CREATE POLICY "Users can insert own campaigns" ON public.campaigns
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND public.is_account_active(auth.uid())
    AND public.ip_allowed()
    AND public.has_permission_at_least('campaigns.create_delete', 'full')
  );

DROP POLICY IF EXISTS "Users can update own campaigns" ON public.campaigns;
CREATE POLICY "Users can update own campaigns" ON public.campaigns
  FOR UPDATE TO authenticated USING (
    auth.uid() = user_id
    AND public.is_account_active(auth.uid())
    AND public.ip_allowed()
    AND (
      public.has_permission_at_least('campaigns.create_delete', 'full')
      OR public.has_permission_at_least('campaigns.start_pause_stop', 'full')
    )
  );

DROP POLICY IF EXISTS "Users can delete own campaigns" ON public.campaigns;
CREATE POLICY "Users can delete own campaigns" ON public.campaigns
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id
    AND public.is_account_active(auth.uid())
    AND public.ip_allowed()
    AND public.has_permission_at_least('campaigns.create_delete', 'full')
  );

-- ─────────────────────────────────────────────────────────────────────────────────────
-- C. leads — INSERT (bulk upload)/UPDATE (outcome override)/DELETE (remove a lead). SELECT
--    untouched, same reasoning as B.
-- ─────────────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can insert own leads" ON public.leads;
CREATE POLICY "Users can insert own leads" ON public.leads
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND public.is_account_active(auth.uid())
    AND public.ip_allowed()
    AND public.has_permission_at_least('campaigns.bulk_lead_upload', 'full')
  );

DROP POLICY IF EXISTS "Users can update own leads" ON public.leads;
CREATE POLICY "Users can update own leads" ON public.leads
  FOR UPDATE TO authenticated USING (
    auth.uid() = user_id
    AND public.is_account_active(auth.uid())
    AND public.ip_allowed()
    AND public.has_permission_at_least('callcenter.outcome_tagging', 'full')
  );

DROP POLICY IF EXISTS "Users can delete own leads" ON public.leads;
CREATE POLICY "Users can delete own leads" ON public.leads
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id
    AND public.is_account_active(auth.uid())
    AND public.ip_allowed()
    AND public.has_permission_at_least('campaigns.lead_management', 'full')
  );

-- ─────────────────────────────────────────────────────────────────────────────────────
-- D. call_records — UPDATE (outcome override)/DELETE (remove a debris/unattributed row).
--    INSERT and SELECT untouched — see the file header on why INSERT is left alone.
-- ─────────────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can update own call records" ON public.call_records;
CREATE POLICY "Users can update own call records" ON public.call_records
  FOR UPDATE TO authenticated USING (
    auth.uid() = user_id
    AND public.is_account_active(auth.uid())
    AND public.ip_allowed()
    AND public.has_permission_at_least('callcenter.outcome_tagging', 'full')
  );

DROP POLICY IF EXISTS "Users can delete own call records" ON public.call_records;
CREATE POLICY "Users can delete own call records" ON public.call_records
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id
    AND public.is_account_active(auth.uid())
    AND public.ip_allowed()
    AND public.has_permission_at_least('campaigns.lead_management', 'full')
  );

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- Not done here, deliberately — see checklist §I for the full list:
--   - I.4's own proof requirement (a direct curl to /rest/v1/campaigns with a real session
--     token for a user lacking campaigns.create_delete, expecting 42501) needs a live login;
--     not run this session.
--   - I.5 (RLS cost) is flagged above, not measured.
--   - `ai_agents` has no is_account_active()/ip_allowed() baseline at all yet — a separate,
--     pre-existing gap this migration does not fix.
--   - Every server-side edge function that writes these tables via the service-role key
--     (call-ingest, dispatch-batch) is UNAFFECTED by this migration — RLS does not apply to the
--     service role. That's correct: those are the engine's own writes, not a user's.
-- ─────────────────────────────────────────────────────────────────────────────────────
