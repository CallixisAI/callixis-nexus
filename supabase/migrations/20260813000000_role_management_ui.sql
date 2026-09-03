-- Phase 3 — Role management UI (write path).
-- docs/admin-module-plan/PHASE-3-role-management-ui.md · checklist: PHASE-3-CHECKLIST.md
--
-- Phase 1 (20260812000000_roles_as_data.sql) created `roles`/`permissions`/`role_permissions`
-- world-readable to any authenticated user, but deliberately left them deny-all for writes
-- ("Writes happen via SQL editor for now") until this phase built a real UI with its own
-- gate. This migration is that gate: RLS write policies plus three new guard triggers that
-- mirror Phase 1 §E's user_roles/user_permissions guardrails, but for the role_permissions
-- matrix itself (§C.1 of the phase doc: "the trigger is the control, the tab is decoration").
--
-- ⚠️ Same caveat as every migration in this project since Phase 1: written from the model,
-- not run against a live database this session. Prove it live before trusting it — see
-- PHASE-3-CHECKLIST.md.
--
-- ⚠️ Same auth.uid() IS NULL gap Phase 1 documented for its own triggers: these three also
-- only fire for an authenticated client session. The only other write path to these tables
-- would be a future service-role caller (none exists yet — manage-users does not touch
-- roles/role_permissions), so this is a smaller version of a known, accepted gap rather than
-- a new one.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 1. Write policies on `roles`.
--    Gate: the caller must hold 'admin.roles_invites' per get_my_permissions() — the same
--    permission that gates the /admin route and, per D-2, is seeded to super_admin only.
--    This is deliberately the *only* gate at INSERT time; is_system/rename/delete rules are
--    enforced below by trigger rather than by a second policy, so the "why" (a readable
--    exception message, §C.1's own warning) survives instead of a bare RLS-denied 403.
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE POLICY "Holders of admin.roles_invites can create roles" ON public.roles
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.get_my_permissions() gp WHERE gp.permission_key = 'admin.roles_invites')
  );

CREATE POLICY "Holders of admin.roles_invites can update roles" ON public.roles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.get_my_permissions() gp WHERE gp.permission_key = 'admin.roles_invites')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.get_my_permissions() gp WHERE gp.permission_key = 'admin.roles_invites')
  );

CREATE POLICY "Holders of admin.roles_invites can delete roles" ON public.roles
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.get_my_permissions() gp WHERE gp.permission_key = 'admin.roles_invites')
  );

-- 1a. Defense in depth for D.5/S.3 ("a system role cannot be renamed or deleted") — RLS
--     above only checks who is asking, not what they're asking to do. A trigger renders a
--     readable message; leaving this to the bare `user_roles_role_fkey` FK for delete (which
--     already blocks a role-in-use, see 1b below) would still allow renaming a system role,
--     which the FK cannot prevent since it has no opinion on label/description.
CREATE OR REPLACE FUNCTION public.enforce_role_system_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_system THEN
      RAISE EXCEPTION 'cannot delete a system role (%)', OLD.key;
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: system roles may not be renamed, redescribed, or have is_system/is_super/rank
  -- changed out from under them. role_permissions edits for a system-but-not-super role
  -- (e.g. 'admin') go through role_permissions' own policies below, not this one.
  IF OLD.is_system AND (
    NEW.key IS DISTINCT FROM OLD.key OR
    NEW.label IS DISTINCT FROM OLD.label OR
    NEW.description IS DISTINCT FROM OLD.description OR
    NEW.is_system IS DISTINCT FROM OLD.is_system OR
    NEW.is_super IS DISTINCT FROM OLD.is_super OR
    NEW.rank IS DISTINCT FROM OLD.rank
  ) THEN
    RAISE EXCEPTION 'cannot rename or redefine a system role (%)', OLD.key;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS roles_system_lock ON public.roles;
CREATE TRIGGER roles_system_lock
  BEFORE UPDATE OR DELETE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_role_system_lock();

-- 1b. D.6/D.7 — ❓ confirmed, not changed. `user_roles.role` (added Phase 1 step 9) has no
--     ON DELETE clause, i.e. plain RESTRICT: deleting a role with any user_roles row still
--     pointing at it already fails at the database layer with 23503 (foreign_key_violation)
--     before this trigger even runs. That IS "block if users assigned" (D.2's chosen
--     option) — no schema change needed to get it, only a readable message for it (§C.1),
--     which is the app layer's job (see src/lib/roleMatrix.ts), not this migration's.
--     `role_permissions.role_key` (Phase 1 step 4) already reads
--     `REFERENCES public.roles(key) ON DELETE CASCADE` — confirmed correct, unchanged.

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 2. Write policies on `role_permissions` — same gate as `roles` above. Fine-grained rules
--    (rank, grant ceiling, super-role read-only, admin.roles_invites floor) are triggers,
--    same reasoning as §1a.
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE POLICY "Holders of admin.roles_invites can edit the matrix" ON public.role_permissions
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.get_my_permissions() gp WHERE gp.permission_key = 'admin.roles_invites')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.get_my_permissions() gp WHERE gp.permission_key = 'admin.roles_invites')
  );

-- 2a. C.6/S.4 — a super role's grid is read-only, backed at the DB layer too, not just by
--     the UI disabling the checkboxes (a disabled checkbox is not a control, same principle
--     as A.4). is_super already implies every permission via get_my_permissions() itself
--     (Phase 1 §D) — role_permissions rows for a super role are decorative, so refusing to
--     write them loses nothing real.
CREATE OR REPLACE FUNCTION public.enforce_role_permissions_super_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_key TEXT := COALESCE(NEW.role_key, OLD.role_key);
  is_super_role BOOLEAN;
BEGIN
  SELECT r.is_super INTO is_super_role FROM public.roles r WHERE r.key = target_key;
  IF COALESCE(is_super_role, false) THEN
    RAISE EXCEPTION 'cannot edit the permission matrix for a super role (%) — is_super already grants everything', target_key;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS role_permissions_super_lock ON public.role_permissions;
CREATE TRIGGER role_permissions_super_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_role_permissions_super_lock();

-- 2b. C.8 — "UI refuses editing a role of lower rank than the actor's." Mirrors
--     enforce_role_rank_guard (Phase 1 §E) but keyed off role_permissions.role_key instead
--     of user_roles.user_id: an actor may not touch the matrix row of a role more powerful
--     (numerically lower rank) than their own.
CREATE OR REPLACE FUNCTION public.enforce_role_permissions_rank_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_rank INT;
  target_rank INT;
  target_key TEXT := COALESCE(NEW.role_key, OLD.role_key);
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT r.rank INTO actor_rank
  FROM public.user_roles ur JOIN public.roles r ON r.key = ur.role
  WHERE ur.user_id = auth.uid();

  IF actor_rank IS NULL THEN
    RAISE EXCEPTION 'acting user has no role';
  END IF;

  SELECT r.rank INTO target_rank FROM public.roles r WHERE r.key = target_key;

  IF target_rank IS NOT NULL AND target_rank < actor_rank THEN
    RAISE EXCEPTION 'cannot edit permissions for a role that outranks your own (%)', target_key;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS role_permissions_rank_guard ON public.role_permissions;
CREATE TRIGGER role_permissions_rank_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_role_permissions_rank_guard();

-- 2c. C.9 — "UI refuses granting a permission the actor lacks." Mirrors enforce_grant_ceiling
--     (Phase 1 §E, which guards user_permissions overrides) for the matrix itself: granting
--     ('view'/'edit'/'full') a permission_key to some role is only allowed if the actor
--     currently holds that permission_key themselves (any level). Removing a grant, or a
--     DELETE, is never an escalation and is not checked here.
CREATE OR REPLACE FUNCTION public.enforce_role_permissions_grant_ceiling()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_has_it BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.get_my_permissions() gp WHERE gp.permission_key = NEW.permission_key
  ) INTO actor_has_it;

  IF NOT actor_has_it THEN
    RAISE EXCEPTION 'cannot grant a permission you do not hold yourself: %', NEW.permission_key;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS role_permissions_grant_ceiling ON public.role_permissions;
CREATE TRIGGER role_permissions_grant_ceiling
  BEFORE INSERT OR UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_role_permissions_grant_ceiling();

-- 2d. C.7 — "UI refuses removing admin.roles_invites from the last role holding it." Because
--     is_super roles bypass role_permissions entirely (Phase 1 §D: is_super grants every
--     permission regardless of what this table says), a row granting admin.roles_invites to
--     an is_super role is decorative — 2a already forbids editing it anyway. The real
--     invariant this protects is a future world where a non-super role is the only thing
--     standing between "someone" and the role-management screen: refuse a DELETE/downgrade
--     that would leave zero roles (super or explicitly granted) able to reach it.
CREATE OR REPLACE FUNCTION public.enforce_role_admin_floor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining INT;
BEGIN
  IF OLD.permission_key <> 'admin.roles_invites' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.permission_key = 'admin.roles_invites' THEN
    RETURN NEW; -- still granted, just a level change — nothing lost
  END IF;

  SELECT count(*) INTO remaining
  FROM public.roles r
  WHERE r.is_super
     OR EXISTS (
       SELECT 1 FROM public.role_permissions rp
       WHERE rp.permission_key = 'admin.roles_invites' AND rp.role_key <> OLD.role_key
     );

  IF remaining = 0 THEN
    RAISE EXCEPTION 'refusing to remove admin.roles_invites from the last role that holds it';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS role_permissions_admin_floor ON public.role_permissions;
CREATE TRIGGER role_permissions_admin_floor
  BEFORE UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_role_admin_floor();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- Rollback note: pure additive (new policies + new triggers on existing tables, no column
-- or data changes). `DROP TRIGGER … ; DROP POLICY … ; DROP FUNCTION …` for everything named
-- above reverts it cleanly — unlike Phase 1's migration, nothing here is irreversible.
-- ─────────────────────────────────────────────────────────────────────────────────────
