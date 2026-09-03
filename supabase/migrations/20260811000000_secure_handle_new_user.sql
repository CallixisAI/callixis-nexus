-- Phase 0 §B.1 — stop trusting the browser for a new user's role.
--
-- Before this migration, handle_new_user() read the role straight out of
-- raw_user_meta_data, which the signing-up user controls completely:
--   INSERT INTO public.user_roles (user_id, role)
--   VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data ->> 'role')::app_role, 'affiliate'));
-- A single POST to /auth/v1/signup with "data":{"role":"admin"} produced a real admin
-- account. See docs/admin-module-plan/PHASE-0-foundation-security.md §B.1.
--
-- ⚠️ Apply by pasting this file verbatim into the Supabase SQL editor — `npx supabase db
-- push` is unsafe on this project (hosted tables were never CLI-managed; see CLAUDE.md).
--
-- ⚠️ Before applying: run §A's pg_trigger query first and record the live definition of
-- handle_new_user(). If it differs from the original migration
-- (20260325100841_4d417f0d-f4f2-4beb-a412-83794c8d962c.sql), this CREATE OR REPLACE
-- silently overwrites whatever that difference was doing. Rollback is that recorded
-- definition, re-applied — keep it somewhere before running this.
--
-- 🔀 Fallback role for a signup with no matching pending invite is 'brand', not the
-- previous 'affiliate' default — a guess pending D-1's permission matrix (PHASE-0 §B.3).
-- Revisit once that lands.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  );

  -- The invite is the only trustworthy source of a role — never raw_user_meta_data,
  -- which is attacker-controlled input on an otherwise-public endpoint.
  SELECT role INTO v_role
  FROM public.user_invites
  WHERE email = lower(NEW.email) AND status = 'pending'
  LIMIT 1;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    COALESCE(v_role, 'brand')::app_role
  );

  RETURN NEW;
END;
$$;

-- CREATE OR REPLACE keeps the existing trigger binding (on_auth_user_created) intact —
-- no need to touch the CREATE TRIGGER statement itself.
