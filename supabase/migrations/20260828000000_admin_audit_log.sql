-- Phase 7 admin-module-plan (docs/admin-module-plan/PHASE-7-audit-and-hardening.md §A) —
-- the audit log. Every write manage-users makes on an existing account, plus who invited whom
-- and who changed a role, becomes one row here — the "who granted this account access?"
-- question the phase doc opens with.
--
-- Writes come ONLY from manage-users' service-role client (supabase/functions/_shared/
-- audit-log.ts's writeAuditLog()) — see §A.1 below for why there is deliberately no INSERT
-- policy for anyone else, including admins.
--
-- 🔀 DEVIATION #1 from the phase doc's literal schema, recorded here rather than silently:
-- added a `success BOOLEAN NOT NULL DEFAULT true` column the doc's own sketch doesn't have.
-- §B.3 requires denied/failed actions to be logged too, and without an explicit column the
-- only way to represent "this was refused" is a magic key buried in the `after` JSONB — which
-- makes §C.2's "filter by action type" and a plain "show me only denied attempts" view both
-- harder than they need to be for no real benefit. `action` still names the ATTEMPTED action
-- (e.g. 'user.blocked') whether it succeeded or not; `success` is the outcome; `reason` carries
-- the denial message when `success = false`.
--
-- 🔀 DEVIATION #2: the phase doc's own §A.1 SQL gates SELECT with
-- `has_role(auth.uid(), 'admin')` — written before this plan's later phases moved every other
-- new admin surface (Roles tab, Security tab — 20260813000000_role_management_ui.sql,
-- 20260826000000_ip_whitelisting.sql) onto a permission-keyed gate via get_my_permissions().
-- This migration follows that newer, established convention instead: a new `admin.audit`
-- permission (seeded below), not a raw role check. Functionally similar (only super_admin and,
-- per this migration's own grant, admin can read it today) but it means a future role-matrix
-- edit can change who sees the audit log without a new migration — consistent with every other
-- admin.* surface in this project.
--
-- 🔀 DEVIATION #3 / recorded decision: `admin.audit` is NOT in the original
-- `CallixisPermissions by roles.xlsx` matrix (Phase 1) — the audit log didn't exist when that
-- sheet was made. Who should see it is therefore this migration's own call, not the sheet's:
-- granted `view` to `admin` (accountability — Phase 6 already gives `admin` real destructive
-- power: block/freeze/remove; being able to see what other admins have done with it is the
-- point of this whole phase) and implicitly `full` to `super_admin` via is_super's blanket
-- bypass in get_my_permissions() (the same "decorative, but seeded anyway for readability"
-- convention 20260812000000_roles_as_data.sql already established for admin.roles_invites /
-- admin.permission_overrides). No other role gets a row, so no other role gets it — same
-- "absence of a role_permissions row means None" convention as everywhere else in this schema.
-- Revisit if this turns out wrong; it's one DELETE + one seed row away from being narrowed to
-- super_admin only.

-- ─────────────────────────────────────────────────────────────────────────────────────
-- A. The table
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           BIGSERIAL PRIMARY KEY,
  actor_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email  TEXT,                    -- denormalised: survives the actor being deleted (§A)
  action       TEXT NOT NULL,           -- 'user.blocked', 'user.role_changed', ... — see
                                         -- supabase/functions/_shared/audit-log.ts's AuditAction
                                         -- union for the exact closed set this project writes.
  target_type  TEXT,                    -- 'user' today; left free-text for a future 'role'/
                                         -- 'ip_rule' rather than an ENUM this migration would
                                         -- need to widen later.
  target_id    TEXT,
  target_label TEXT,                    -- denormalised for the same reason as actor_email —
                                         -- an audit row reading "[deleted user] blocked
                                         -- [deleted user]" answers nothing (§A.2).
  before       JSONB,
  after        JSONB,
  reason       TEXT,
  success      BOOLEAN NOT NULL DEFAULT true,  -- Deviation #1 above.
  ip           INET,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_id_idx   ON public.admin_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx     ON public.admin_audit_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx     ON public.admin_audit_log (action);

COMMENT ON TABLE public.admin_audit_log IS
  'Append-only. No UPDATE/DELETE policy exists for any role, including admins — see §A.1. '
  'Writes come only from manage-users via the service role, which bypasses RLS entirely.';

-- ─────────────────────────────────────────────────────────────────────────────────────
-- A.1 🔒 Append-only, or it isn't an audit log.
-- ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Holders of admin.audit can read the audit log" ON public.admin_audit_log;
CREATE POLICY "Holders of admin.audit can read the audit log" ON public.admin_audit_log
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.get_my_permissions() gp WHERE gp.permission_key = 'admin.audit')
  );
-- Deliberately NO insert, update or delete policy for anyone, including admin/super_admin.
-- A log an admin can edit does not constrain an admin — do not add one on a future pass; see
-- this file's own "Notes and deviations" warning and PHASE-7-CHECKLIST.md's identical one.

-- 🔀 A.5 Retention: rows accumulate forever by default. No automatic deletion job exists —
-- this migration does not decide a retention policy, it leaves the decision open and
-- unenforced rather than guessing at a number (2 years? 7, for a regulated calling business?)
-- nobody has confirmed. Whoever answers it later needs the service role for the deletion job
-- too, for the same reason there's no admin-facing DELETE policy above.

-- ─────────────────────────────────────────────────────────────────────────────────────
-- B. Seed the `admin.audit` permission and grant it (Deviation #2/#3 above).
-- ─────────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.permissions (key, label, feature_group, sensitivity, sort_order)
VALUES ('admin.audit', 'Admin — Audit Log', 'Admin', 'high', 25)
ON CONFLICT (key) DO NOTHING;

-- ⚠️ Corrected 2026-08-30, on the first real apply against production. This INSERT originally
-- also carried ('super_admin', 'admin.audit', 'full'). That row is impossible to write: Phase 3's
-- enforce_role_permissions_super_lock trigger (20260813000000_role_management_ui.sql, applied live
-- 2026-08-26) raises `cannot edit the permission matrix for a super role` on ANY write touching a
-- role with is_super — which aborted this entire migration. Removing it costs nothing, because it
-- was already labelled decorative here for the right reason: get_permissions_for()'s own
-- `WHERE me.is_super` branch hands super roles every permission in the catalogue without consulting
-- role_permissions at all. super_admin therefore holds admin.audit the moment the row above exists.
INSERT INTO public.role_permissions (role_key, permission_key, level) VALUES
  ('admin', 'admin.audit', 'view')
ON CONFLICT (role_key, permission_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- D.2 (PHASE-7-CHECKLIST.md) — give user_invites a real primary key.
--
-- Already true live, just never reflected in a migration file: admin-module Phase 4's own
-- 2026-08-26 addendum (CLAUDE.md, "Admin module plan status" → Phase 4) ran
-- `pg_indexes` against the hosted table and found `user_invites_pkey` already exists, on
-- `email` — the live table has had a real PRIMARY KEY (not merely a UNIQUE index, which is
-- what 20260728120000_user_invites_permissions_fix.sql's `user_invites_id_key` and
-- 20260814000000_invite_activation.sql's `user_invites_email_key` both added) since before
-- this project's migration history exists, per this repo's already-documented "the hosted
-- database was never CLI-managed" pattern (CLAUDE.md). This block makes the migration FILES
-- match that live reality — a no-op on the live database (the guard below short-circuits),
-- but closes the gap for a fresh/rebuilt environment where no such hand-added PK exists yet.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_invites'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.user_invites ADD CONSTRAINT user_invites_pkey PRIMARY KEY (email);
  END IF;
END $$;
