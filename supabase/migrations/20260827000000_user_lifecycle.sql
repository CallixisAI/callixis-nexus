-- Phase 6 (admin-module-plan) — User lifecycle & the actions menu.
-- docs/admin-module-plan/PHASE-6-user-lifecycle.md · checklist: PHASE-6-CHECKLIST.md
--
-- Delivers "as Admin, we should always have option to add/remove/block/freeze users" and "the
-- action sector here should have all options after new user is set". §A/§B below.
--
-- Decisions recorded (were ⛔ blocking, both answered by James 2026-08-27):
--   D-5 (block vs freeze): accepted the phase doc's proposed model as-is — frozen = temporary,
--     expected to end, optional auto-expiry via frozen_until; blocked = indefinite, a deliberate
--     security decision, explicit unblock only. Both keep all data; both prevent login.
--   D-6 (remove = soft or hard): soft delete ONLY. No hard-delete action exists anywhere in this
--     migration or the UI built on top of it — see §A.1 below for why that's not just caution.
--
-- §A.1 🔴 CONFIRMED LIVE, not assumed, before writing this migration: `campaigns.user_id`,
-- `leads.user_id`, and `call_records.user_id` are ALL `REFERENCES auth.users(id) ON DELETE
-- CASCADE` (20260328000000_core_tables.sql / 20260328000001_fix_tables.sql /
-- 20260731000000_leads.sql). `call_records.campaign_id` is additionally `ON DELETE CASCADE`
-- from campaigns. So `auth.admin.deleteUser()` on any real user would cascade-delete every
-- campaign, call record, and lead they own — the recordings, outcomes, and costs the whole
-- product exists to produce. "Remove" in this phase means `profiles.status = 'removed'` and
-- NOTHING ELSE at the data layer. Restorable, always.
--
-- ⚠️ Same caveat as every migration in this project since Phase 1: written from the model, not
-- run against a live database this session (2026-08-27 — file-side build only, by explicit
-- choice; see PHASE-6-CHECKLIST.md's dated note for why the live §C.1 GoTrue ban_duration test
-- and the actual `supabase db query --linked` apply were both deliberately deferred). Prove it
-- live before trusting it.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- A. The five states.
-- `status` intentionally allows 'invited' for schema completeness / future-proofing, but as
-- things stand today NO profiles row is ever created in that state: Phase 4's own architecture
-- deviation (20260814000000_invite_activation.sql) creates the auth user — and therefore the
-- profiles row, via handle_new_user() — only at activation time, by which point the account is
-- already 'active'. A pending invite lives entirely in `user_invites`, which has its own
-- `status` column ('pending'/'accepted') already. Documented here rather than silently
-- discovered later: don't expect to find a profiles row with status='invited' in this schema.
-- ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited','active','frozen','blocked','removed')),
  ADD COLUMN IF NOT EXISTS status_reason     TEXT,
  ADD COLUMN IF NOT EXISTS frozen_until      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
  -- ON DELETE SET NULL, not CASCADE: if the admin who last changed someone's status is later
  -- themselves removed/deleted, that must not erase the record of what they did to this row.
  ADD COLUMN IF NOT EXISTS status_changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- §D.6 — a refactor, not new logic: get_my_permissions() (20260812000000_roles_as_data.sql
-- §16) becomes a thin wrapper over this, parameterized version so manage-users' new
-- update_permissions action (§C.4) can ask "what does THIS caller hold" without a service-role
-- connection's auth.uid() being NULL. Same SQL, same result set for get_my_permissions()'s own
-- callers (AuthContext.tsx, every RLS policy using it) — only the entry point changed, so
-- nothing about Phase 1/2/3's existing behaviour is at risk from this edit. Restricted to
-- service_role: this is a targeted-lookup tool for server-side checks, not a general
-- "look up anyone's permissions" RPC for the browser (get_my_permissions() itself stays the
-- only browser-reachable resolver, unchanged, scoped to the caller's own auth.uid()).
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_permissions_for(p_user_id UUID)
RETURNS TABLE (permission_key TEXT, level TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT ur.role AS role_key, r.is_super
    FROM public.user_roles ur
    JOIN public.roles r ON r.key = ur.role
    WHERE ur.user_id = p_user_id
  ),
  granted AS (
    SELECT p.key AS permission_key, 'full'::text AS level
    FROM public.permissions p, me
    WHERE me.is_super
    UNION ALL
    SELECT rp.permission_key, rp.level
    FROM public.role_permissions rp, me
    WHERE rp.role_key = me.role_key AND NOT COALESCE(me.is_super, false)
    UNION ALL
    SELECT up.permission_key, 'full'::text AS level
    FROM public.user_permissions up, me
    WHERE up.user_id = p_user_id AND up.effect = 'allow' AND NOT COALESCE(me.is_super, false)
  ),
  ranked AS (
    SELECT permission_key, level,
           CASE level WHEN 'full' THEN 3 WHEN 'edit' THEN 2 WHEN 'view' THEN 1 ELSE 0 END AS weight
    FROM granted
  ),
  best AS (
    SELECT DISTINCT ON (permission_key) permission_key, level
    FROM ranked
    ORDER BY permission_key, weight DESC
  )
  SELECT b.permission_key, b.level
  FROM best b
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_permissions up, me
    WHERE up.user_id = p_user_id AND up.permission_key = b.permission_key
      AND up.effect = 'deny' AND NOT COALESCE(me.is_super, false)
  );
$$;

REVOKE ALL ON FUNCTION public.get_permissions_for(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_permissions_for(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE (permission_key TEXT, level TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.get_permissions_for(auth.uid());
$$;
-- Grants unchanged from 20260812000000_roles_as_data.sql — REVOKE ALL FROM PUBLIC/anon,
-- GRANT EXECUTE TO authenticated already in place and still correct; CREATE OR REPLACE does
-- not reset a function's grants.

-- ─────────────────────────────────────────────────────────────────────────────────────
-- B. Making a block actually block.
-- is_account_active(uuid) — §B.1. Frozen accounts past their own frozen_until read as active
-- again here (the "access returns automatically" exit criterion, §S.2) WITHOUT anything
-- rewriting profiles.status back to 'active' on its own — this project has no cron job that
-- would do that sweep (unlike event-driven-plan's dispatch_tick, which is a different
-- subsystem), so a frozen-and-expired row can display a stale "Frozen" badge in the directory
-- until an admin next touches it. The UI computes the same "is it actually still in force"
-- check for display (src/lib/userLifecycle.ts's effectiveStatus(), mirrors this function's
-- logic — see that file's own header for why it's a mirror and not a shared import) so the
-- badge and the real access decision cannot visibly disagree, even though the stored column
-- can lag. Restricted to authenticated (not anon) because it takes an arbitrary uuid — a mild,
-- accepted information disclosure (a boolean, only useful if you already know a real user id),
-- same risk class this project already accepts for has_role()'s pre-Phase-1 equivalent.
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_account_active(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT
       p.status = 'active'
       OR (p.status = 'frozen' AND p.frozen_until IS NOT NULL AND p.frozen_until <= now())
     FROM public.profiles p
     WHERE p.id = p_user_id),
    false -- no profile row at all (shouldn't happen for a real session) fails closed
  );
$$;

REVOKE ALL ON FUNCTION public.is_account_active(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_account_active(UUID) TO authenticated;

-- §B item 3 / checklist C.9 (force_signout) — the documented community workaround for "revoke
-- every session belonging to an arbitrary user id server-side": neither supabase-js's
-- auth.admin.signOut() (needs the session's OWN JWT, not a user id — useless for an admin
-- acting on someone else) nor a dedicated GoTrue REST endpoint for this exists as of this
-- writing (checked, not assumed — see PHASE-6-CHECKLIST.md's C.9 note). auth.sessions has an
-- ON DELETE CASCADE relationship to auth.refresh_tokens in GoTrue's own schema, so deleting the
-- session rows here is enough to invalidate every refresh token tied to them. Already-issued
-- ACCESS tokens (short-lived, stateless JWTs, never stored server-side) are NOT affected by
-- this — they keep working until their own expiry regardless. That gap is exactly what
-- is_account_active() above (folded into RLS below) exists to close in the meantime.
-- SECURITY DEFINER, owned by the migration-running role (which has rights on the auth schema)
-- — the function runs with ITS privileges, not the caller's, which is what lets a service-role
-- caller reach into `auth` at all despite `auth` not being exposed through PostgREST.
-- service_role only: this is exactly the kind of action that must never be reachable from a
-- plain authenticated session, even one that somehow guessed another user's id.
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_user_sessions(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  removed INT;
BEGIN
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_user_sessions(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- §B.2 — fold is_account_active() into RLS on the same three "holds customer/call data"
-- tables admin-module Phase 5's ip_allowed() already targets (20260826000000_ip_whitelisting.sql
-- §E.4), for the identical reason: this is the backstop for a JWT issued before the block that
-- hasn't expired yet, not the primary control (GoTrue's ban_duration + revoke_user_sessions()
-- above are). DROP + CREATE, matching this project's established idiom for redefining a policy
-- (role_management_ui.sql / admin_read_policies.sql / ip_whitelisting.sql). Deliberately NOT
-- applied to profiles/user_roles/user_permissions/security_settings — same reasoning
-- ip_whitelisting.sql already recorded: an admin acting on their OWN account, or investigating
-- someone else's, must still be able to reach account/security tables regardless of their own
-- status. A blocked/removed/frozen user reaching THOSE tables at all requires a still-valid
-- JWT in the first place, which is exactly the narrow, time-limited gap this whole section
-- exists to shrink, not eliminate — GoTrue's own ban is what closes it for good.
-- ─────────────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view own leads" ON public.leads;
CREATE POLICY "Users can view own leads" ON public.leads
  FOR SELECT TO authenticated USING (auth.uid() = user_id AND public.is_account_active(auth.uid()) AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can insert own leads" ON public.leads;
CREATE POLICY "Users can insert own leads" ON public.leads
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND public.is_account_active(auth.uid()) AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can update own leads" ON public.leads;
CREATE POLICY "Users can update own leads" ON public.leads
  FOR UPDATE TO authenticated USING (auth.uid() = user_id AND public.is_account_active(auth.uid()) AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can delete own leads" ON public.leads;
CREATE POLICY "Users can delete own leads" ON public.leads
  FOR DELETE TO authenticated USING (auth.uid() = user_id AND public.is_account_active(auth.uid()) AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can view own campaigns" ON public.campaigns;
CREATE POLICY "Users can view own campaigns" ON public.campaigns
  FOR SELECT TO authenticated USING (auth.uid() = user_id AND public.is_account_active(auth.uid()) AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can insert own campaigns" ON public.campaigns;
CREATE POLICY "Users can insert own campaigns" ON public.campaigns
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND public.is_account_active(auth.uid()) AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can update own campaigns" ON public.campaigns;
CREATE POLICY "Users can update own campaigns" ON public.campaigns
  FOR UPDATE TO authenticated USING (auth.uid() = user_id AND public.is_account_active(auth.uid()) AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can delete own campaigns" ON public.campaigns;
CREATE POLICY "Users can delete own campaigns" ON public.campaigns
  FOR DELETE TO authenticated USING (auth.uid() = user_id AND public.is_account_active(auth.uid()) AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can view own call records" ON public.call_records;
CREATE POLICY "Users can view own call records" ON public.call_records
  FOR SELECT TO authenticated USING (auth.uid() = user_id AND public.is_account_active(auth.uid()) AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can insert own call records" ON public.call_records;
CREATE POLICY "Users can insert own call records" ON public.call_records
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND public.is_account_active(auth.uid()) AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can update own call records" ON public.call_records;
CREATE POLICY "Users can update own call records" ON public.call_records
  FOR UPDATE TO authenticated USING (auth.uid() = user_id AND public.is_account_active(auth.uid()) AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can delete own call records" ON public.call_records;
CREATE POLICY "Users can delete own call records" ON public.call_records
  FOR DELETE TO authenticated USING (auth.uid() = user_id AND public.is_account_active(auth.uid()) AND public.ip_allowed());

-- ⚠️ Same note ip_whitelisting.sql already recorded: call-ingest/dispatch-batch/dispatch-trigger
-- write leads/call_records/campaigns using the SERVICE ROLE key, which bypasses RLS entirely —
-- none of the n8n calling engine's writes are affected by is_account_active() either. A blocked
-- USER cannot use the app; a blocked user's existing campaigns keep being dialled by the engine
-- regardless, exactly as they would if the browser tab were simply closed. Pausing/stopping a
-- blocked user's live campaigns, if that's ever wanted, is a separate, not-yet-asked-for action.

-- ─────────────────────────────────────────────────────────────────────────────────────
-- Risk table ("An admin blocks the last super admin") — extends Phase 1 §E's
-- enforce_last_super_admin (which only ever protected user_roles row changes) to cover
-- profiles.status transitions too. Unconditional, like its Phase 1 twin: applies even to a
-- service-role write (manage-users), unlike the rank-guard triggers, because there's no
-- "actor" concept needed to know a system is about to have zero USABLE super admins. Only
-- fires on a transition INTO a non-login-capable status ('blocked'/'frozen'/'removed') for a
-- role holding is_super — becoming 'active' (unblock/unfreeze/restore) is never the dangerous
-- direction and always passes through untouched.
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_last_active_super_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_is_super BOOLEAN;
  remaining INT;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('blocked', 'frozen', 'removed') THEN
    RETURN NEW;
  END IF;

  SELECT r.is_super INTO target_is_super
  FROM public.user_roles ur JOIN public.roles r ON r.key = ur.role
  WHERE ur.user_id = OLD.id;

  IF NOT COALESCE(target_is_super, false) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO remaining
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  JOIN public.roles r ON r.key = ur.role
  WHERE r.is_super
    AND p.id <> OLD.id
    AND p.status = 'active';

  IF remaining = 0 THEN
    RAISE EXCEPTION 'refusing to set the last active super_admin (user %) to status %', OLD.id, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_last_super_admin_guard ON public.profiles;
CREATE TRIGGER profiles_last_super_admin_guard
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_last_active_super_admin();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- Rollback note: the five new profiles columns are additive and nullable-or-defaulted — safe
-- to leave in place even if the rest of this phase is reverted. `DROP TRIGGER …; DROP POLICY
-- …; CREATE POLICY … (without "AND public.is_account_active(...)"); DROP FUNCTION …` for
-- everything named above reverts the RLS/guard half cleanly, same as ip_whitelisting.sql.
-- ⚠️ Unlike that migration, this one also swaps get_my_permissions()'s body to delegate to the
-- new get_permissions_for() — reverting that specific piece means restoring
-- 20260812000000_roles_as_data.sql step 16's original CREATE OR REPLACE verbatim, not just
-- dropping something added here.
-- ⚠️ Same GoTrue caveat this file's header already states: any user banned at the GoTrue level
-- via this phase's manage-users actions (block/freeze) STAYS banned after a rollback — the ban
-- lives in auth.users, not in the reverted schema. Unban via the Supabase dashboard or
-- `auth.admin.updateUserById(id, { ban_duration: 'none' })` before or after rolling back.
-- ─────────────────────────────────────────────────────────────────────────────────────
