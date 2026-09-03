-- Phase 5 (admin-module-plan) — IP whitelisting.
-- docs/admin-module-plan/PHASE-5-ip-whitelisting.md · checklist: PHASE-5-CHECKLIST.md
--
-- Delivers "each user will provide also IPs list to whitelist before he can login" — as far as
-- that brief is actually enforceable. See the phase doc's own "Read this before promising the
-- feature": GoTrue (Supabase's login service) has no hook exposing the caller's IP, so
-- enforcement is two layers *after* the auth call itself succeeds, not a literal login gate —
-- a post-login edge-function check (session-guard, this session, file-side) plus this
-- migration's RLS layer, which is the one that survives someone skipping the app and calling
-- the REST API directly with a stolen JWT.
--
-- §A (E19) — the pre-flight gate that decides whether the RLS layer is even possible — was run
-- LIVE 2026-08-26 against production (create debug_request_ip(), curl it with the anon key,
-- drop it) before this file was written, not guessed at:
--   - request.headers IS populated.
--   - `cf-connecting-ip` is present — Cloudflare sets this at the edge; a client cannot forge
--     it (unlike `x-forwarded-for`, which is also present here but is the client-forwardable
--     one the phase doc warns about). This migration reads `cf-connecting-ip` exclusively.
--   - IPv6 arrival format was NOT separately confirmed (the test request was IPv4/PH) — flagged
--     as still-open in the checklist, not assumed here.
-- §A therefore PASSED: the RLS layer below is real enforcement, not decorative.
--
-- Decisions recorded (were ⛔ blocking, both answered by James 2026-08-26):
--   D-7 (who manages the list): self-declared, admin-approved. A user may INSERT a row for
--     themselves; it lands with approved_by = NULL and grants no access until an
--     admin.roles_invites holder approves it (§C.2).
--   D-8 (existing users with no rules): unrestricted until they opt in. ip_allowed() below
--     returns true when a user has zero active+approved rules — enforcement only bites once a
--     rule exists for that user, so flipping the mode to 'enforce' does not instantly lock out
--     every existing user with no rules configured (§F.4's stated recommendation).
--
-- E.4 (which tables get the RLS check) — applied to leads, campaigns, call_records: the tables
-- holding customer/call data, per the phase doc's own "start with the tables holding call data
-- and customer information" guidance. Deliberately NOT applied to profiles/user_roles/etc. —
-- an admin locked out of their own network must still be able to reach account/security tables
-- to fix things (consistent with §F.3's break-glass requirement existing at all).
--
-- ⚠️ Same caveat as every migration in this project: written from the model and from a live §A
-- probe, but the RLS branches (§E.3: mode off / audit / no rules / matching rule / non-matching
-- rule) have not themselves been exercised live yet. Prove each branch before trusting it — see
-- PHASE-5-CHECKLIST.md.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- B. Data model
-- ─────────────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.user_ip_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cidr        INET NOT NULL,
  label       TEXT,                                    -- 'Manila office', 'Home'
  is_active   BOOLEAN NOT NULL DEFAULT true,
  approved_by UUID REFERENCES auth.users(id),           -- NULL = self-declared, not yet approved
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, cidr)
);

-- §B.1 🔒 "A whitelist that can contain everything is not a control" — rejected in a CHECK
-- constraint, not client-side validation, so inserting 0.0.0.0/0 or ::/0 fails at the database
-- regardless of what the form allowed through (§B.6/S.4's own proof requirement).
-- 🔀 B.5 — thresholds taken as-is from the phase doc (/24 v4, /48 v6) rather than made
-- configurable; nobody has flagged a real office range wider than a /24 yet. Revisit if one
-- shows up — this is the one place in this migration where the phase doc's own "confirm this
-- suits the real network" was not separately re-confirmed with James, only inherited.
ALTER TABLE public.user_ip_rules ADD CONSTRAINT user_ip_rules_not_too_broad CHECK (
  (family(cidr) = 4 AND masklen(cidr) >= 24) OR
  (family(cidr) = 6 AND masklen(cidr) >= 48)
);

-- Single-row global switch. §F depends on this existing. Starts 'off' (nothing changes until
-- someone deliberately turns it on) — F.1's "ship in audit mode" is a conscious follow-up
-- action once session-guard/ip_allowed() are deployed and confirmed working, not something
-- this migration flips silently on apply.
CREATE TABLE public.security_settings (
  id             BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  ip_enforcement TEXT NOT NULL DEFAULT 'off'
    CHECK (ip_enforcement IN ('off','audit','enforce'))
);
INSERT INTO public.security_settings (id, ip_enforcement) VALUES (true, 'off');

CREATE TABLE public.ip_access_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip          INET,
  allowed     BOOLEAN NOT NULL,
  mode        TEXT NOT NULL,                            -- which mode was active at the time
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────────────
-- RLS — user_ip_rules
-- §B.7: users read their own rules; only the permitted admin role writes (refined by D-7:
-- users may also self-declare a new, unapproved row for themselves — "writing" in the sense
-- that matters, i.e. setting approved_by, stays admin-only).
-- ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_ip_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own IP rules" ON public.user_ip_rules
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- D-7 self-declare: a user may insert a rule for themselves, but never with approved_by set —
-- that would let a user hand-craft their own approval by guessing/knowing an admin's UUID.
-- Approval is the admin policy below, exclusively.
CREATE POLICY "Users can self-declare their own IP rules" ON public.user_ip_rules
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND approved_by IS NULL);

-- A user may remove their own rule (approved or not) — this only ever narrows their own
-- access, never an escalation, so it doesn't need admin gating.
CREATE POLICY "Users can delete their own IP rules" ON public.user_ip_rules
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Holders of admin.roles_invites can view all IP rules" ON public.user_ip_rules
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.get_my_permissions() gp WHERE gp.permission_key = 'admin.roles_invites'));

-- Covers approval (setting approved_by), deactivation, and admin-authored rules in one policy —
-- same "FOR ALL, fine-grained rules live elsewhere" shape as role_management_ui.sql's
-- role_permissions policy. No extra trigger needed here: approving your own self-declared row
-- would require holding admin.roles_invites yourself, at which point you are, by definition,
-- someone this project already trusts to manage the whole list.
CREATE POLICY "Holders of admin.roles_invites can manage all IP rules" ON public.user_ip_rules
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.get_my_permissions() gp WHERE gp.permission_key = 'admin.roles_invites'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.get_my_permissions() gp WHERE gp.permission_key = 'admin.roles_invites'));

-- ─────────────────────────────────────────────────────────────────────────────────────
-- RLS — security_settings
-- §B.8 🔒 "writable by nobody through the API" — deliberately NO insert/update/delete policy
-- at all, for anyone, admin included. A user who can flip ip_enforcement off has defeated the
-- feature (§E's own warning) — even an admin changes this only through set_ip_enforcement()
-- below, which re-checks the caller's permission itself rather than relying on this table's
-- (nonexistent) write policy as the only gate. Read is similarly not opened via a SELECT
-- policy — get_security_settings() (below) is the one read path, also permission-checked
-- in-function, so the current mode is never exposed to a caller who can't act on it anyway.
-- ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;
-- No policies. RLS enabled + zero policies = deny-all via PostgREST for every role except the
-- service key. Only SECURITY DEFINER functions (which run as the function owner, bypassing
-- RLS) and the service-role key (session-guard, dispatch-batch-style functions) can touch it.

-- ─────────────────────────────────────────────────────────────────────────────────────
-- RLS — ip_access_log
-- System-only inserts (session-guard uses the service-role key, which bypasses RLS). Admins
-- read it for F.5/F.6's mandatory audit-period review; nobody else can, including the user the
-- row is about — these are login-network records, not something to hand back to a browser.
-- ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ip_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Holders of admin.roles_invites can view the access log" ON public.ip_access_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.get_my_permissions() gp WHERE gp.permission_key = 'admin.roles_invites'));

-- ─────────────────────────────────────────────────────────────────────────────────────
-- Admin-facing RPCs for security_settings, since the table itself has no policies at all.
-- Both re-check admin.roles_invites internally rather than trusting the caller — same
-- "the trigger/function is the control, the UI is decoration" principle role_management_ui.sql
-- already established for roles/role_permissions.
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_security_settings()
RETURNS TABLE(ip_enforcement TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.ip_enforcement FROM public.security_settings s
  WHERE EXISTS (SELECT 1 FROM public.get_my_permissions() gp WHERE gp.permission_key = 'admin.roles_invites');
$$;

CREATE OR REPLACE FUNCTION public.set_ip_enforcement(p_mode TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.get_my_permissions() gp WHERE gp.permission_key = 'admin.roles_invites') THEN
    RAISE EXCEPTION 'not authorized to change IP enforcement mode';
  END IF;
  IF p_mode NOT IN ('off', 'audit', 'enforce') THEN
    RAISE EXCEPTION 'invalid enforcement mode: %', p_mode;
  END IF;
  UPDATE public.security_settings SET ip_enforcement = p_mode WHERE id = true;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- E. The RLS layer itself — only buildable because §A passed (see the header note).
-- Written from the model AND from a live §A probe, but §E.3's five branches (off / audit /
-- no rules / matching rule / non-matching rule) are not yet exercised live — see the checklist.
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ip_allowed()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mode TEXT;
  v_client_ip INET;
BEGIN
  SELECT ip_enforcement INTO v_mode FROM public.security_settings WHERE id = true;

  -- 'off' and 'audit' never block a query — 'audit' only logs what WOULD happen, via
  -- session-guard's own log write, not by restricting real reads here. Only 'enforce' reaches
  -- the checks below.
  IF v_mode IS DISTINCT FROM 'enforce' THEN
    RETURN true;
  END IF;

  -- D-8: a user with zero active+approved rules is unrestricted, not locked out — enforcement
  -- only bites once a rule genuinely exists for that user.
  IF NOT EXISTS (
    SELECT 1 FROM public.user_ip_rules
    WHERE user_id = auth.uid() AND is_active AND approved_by IS NOT NULL
  ) THEN
    RETURN true;
  END IF;

  -- §A's finding: cf-connecting-ip is the authoritative, non-forwardable header on this
  -- project. A malformed/missing value here (headers not populated the way §A found them —
  -- e.g. a direct psql session, or an infra change) fails CLOSED rather than silently open,
  -- since by this point the caller is in 'enforce' mode with real rules on file — this branch
  -- is an actual security boundary, not a convenience.
  BEGIN
    v_client_ip := (current_setting('request.headers', true)::jsonb ->> 'cf-connecting-ip')::inet;
  EXCEPTION WHEN OTHERS THEN
    v_client_ip := NULL;
  END;

  IF v_client_ip IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_ip_rules r
    WHERE r.user_id = auth.uid() AND r.is_active AND r.approved_by IS NOT NULL
      AND v_client_ip <<= r.cidr
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- E.4/E.5 — fold ip_allowed() into the policies for the tables holding customer/call data.
-- DROP + CREATE rather than ALTER POLICY, matching this project's own established idiom for
-- redefining a policy (see role_management_ui.sql / admin_read_policies.sql).
-- ─────────────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view own leads" ON public.leads;
CREATE POLICY "Users can view own leads" ON public.leads
  FOR SELECT TO authenticated USING (auth.uid() = user_id AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can insert own leads" ON public.leads;
CREATE POLICY "Users can insert own leads" ON public.leads
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can update own leads" ON public.leads;
CREATE POLICY "Users can update own leads" ON public.leads
  FOR UPDATE TO authenticated USING (auth.uid() = user_id AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can delete own leads" ON public.leads;
CREATE POLICY "Users can delete own leads" ON public.leads
  FOR DELETE TO authenticated USING (auth.uid() = user_id AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can view own campaigns" ON public.campaigns;
CREATE POLICY "Users can view own campaigns" ON public.campaigns
  FOR SELECT TO authenticated USING (auth.uid() = user_id AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can insert own campaigns" ON public.campaigns;
CREATE POLICY "Users can insert own campaigns" ON public.campaigns
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can update own campaigns" ON public.campaigns;
CREATE POLICY "Users can update own campaigns" ON public.campaigns
  FOR UPDATE TO authenticated USING (auth.uid() = user_id AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can delete own campaigns" ON public.campaigns;
CREATE POLICY "Users can delete own campaigns" ON public.campaigns
  FOR DELETE TO authenticated USING (auth.uid() = user_id AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can view own call records" ON public.call_records;
CREATE POLICY "Users can view own call records" ON public.call_records
  FOR SELECT TO authenticated USING (auth.uid() = user_id AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can insert own call records" ON public.call_records;
CREATE POLICY "Users can insert own call records" ON public.call_records
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can update own call records" ON public.call_records;
CREATE POLICY "Users can update own call records" ON public.call_records
  FOR UPDATE TO authenticated USING (auth.uid() = user_id AND public.ip_allowed());

DROP POLICY IF EXISTS "Users can delete own call records" ON public.call_records;
CREATE POLICY "Users can delete own call records" ON public.call_records
  FOR DELETE TO authenticated USING (auth.uid() = user_id AND public.ip_allowed());

-- ⚠️ call-ingest/dispatch-batch/dispatch-trigger all write leads/call_records/campaigns using
-- the SERVICE ROLE key, which bypasses RLS entirely — none of the n8n calling engine's writes
-- are affected by ip_allowed() at all. This only ever gates a browser session reading/writing
-- through the anon/authenticated REST path, which is the intended scope (§E's own "blocks
-- direct API calls that skip the app entirely").

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- Rollback note: `UPDATE public.security_settings SET ip_enforcement = 'off'` disables the
-- RLS check (and the edge gate, once session-guard reads this same table) instantly, without a
-- deploy — this IS the F.3 break-glass / rollback path, and the whole reason the mode lives in
-- a table instead of a code constant. A full schema rollback (dropping the three new tables,
-- the four new functions, and re-running the four original DROP POLICY/CREATE POLICY pairs
-- without the "AND public.ip_allowed()" clause) is also clean — nothing here is irreversible.
-- ─────────────────────────────────────────────────────────────────────────────────────
