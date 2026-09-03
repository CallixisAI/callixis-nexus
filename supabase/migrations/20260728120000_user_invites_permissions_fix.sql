-- user_permissions and user_invites already exist in the hosted database (created by hand,
-- outside the CLI migration history — see CLAUDE.md "known-broken baseline"). This migration
-- captures their real shape for reproducibility and fixes two live defects:
--   1. user_invites is missing `id` and `status`, which Admin.tsx already assumes exist
--      (Admin.tsx:100 filters status='pending'; Admin.tsx:122 reads invite.id).
--   2. user_invites has a public SELECT policy with qual `true` — an unauthenticated
--      email/phone/permissions enumeration leak. Replaced with a SECURITY DEFINER RPC
--      that returns only the three fields Signup.tsx actually needs.

-- ── user_permissions: capture existing shape (no-op if it already matches) ─────────────
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  permission_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, permission_key)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own permissions" ON public.user_permissions;
CREATE POLICY "Users can view own permissions" ON public.user_permissions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all permissions" ON public.user_permissions;
CREATE POLICY "Admins can manage all permissions" ON public.user_permissions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ── user_invites: add columns the app already assumes exist ────────────────────────────
ALTER TABLE public.user_invites
  ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_invites_id_key'
  ) THEN
    ALTER TABLE public.user_invites ADD CONSTRAINT user_invites_id_key UNIQUE (id);
  END IF;
END $$;

-- ── user_invites: close the anonymous enumeration leak ──────────────────────────────────
-- Signup.tsx only ever needs full_name/phone/role for a pending invite matching an email;
-- it does not need (and must not receive) the permissions array or a scannable table.
CREATE OR REPLACE FUNCTION public.check_invite(p_email TEXT)
RETURNS TABLE (full_name TEXT, phone TEXT, role TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT full_name, phone, role
  FROM public.user_invites
  WHERE email = lower(p_email)
    AND status = 'pending'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.check_invite(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.check_invite(TEXT) TO anon, authenticated;

DROP POLICY IF EXISTS "Public invite check" ON public.user_invites;

-- Admin-only direct table access (own policies below assume public.has_role exists,
-- as it already does — see the marketplace_auctions migration for prior usage).
DROP POLICY IF EXISTS "Admins can view invites" ON public.user_invites;
DROP POLICY IF EXISTS "Admins can manage invites" ON public.user_invites;
DROP POLICY IF EXISTS "Admins manage invites" ON public.user_invites;
CREATE POLICY "Admins can manage invites" ON public.user_invites
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
