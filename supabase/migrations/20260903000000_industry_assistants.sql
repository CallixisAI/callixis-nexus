-- AI Agents plan (docs/AI-Agents-plan/README.md), Phase 4 — the industry → Vapi assistant map.
-- This is D-2's mechanism (industry selects the assistant) and D-12's scope decision
-- (Callixis-wide, not per-customer — E20 found this platform genuinely multi-tenant and
-- dispatch-batch's own `?action=due` query has no per-user filter at all, so a map keyed any
-- other way would silently mean "whoever wrote the row last wins" across every tenant).
--
-- ⛔ FILE-SIDE ONLY. Not applied to the hosted project by this change — see
-- Plan-Checklist/ai-agents/CHECKLIST.md §E.10, gated on explicit go-ahead, same "build first,
-- apply behind a separate confirmation" pattern admin-module Phases 6/7 used. Apply with
-- `supabase db query --file … --linked` per this repo's own "the hosted database was never
-- CLI-managed" note (CLAUDE.md) — `db push` is unsafe here.

-- ─────────────────────────────────────────────────────────────────────────────────────
-- A. The table (§E.1)
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.industry_assistants (
  -- §E.1b / D-12: `industry` alone is the primary key — deliberately no `user_id` column. One
  -- assistant per industry, shared by every customer in it; a customer's own personalisation
  -- rides along per call via assistantOverrides (D-13), never written back to the assistant, so
  -- two tenants sharing a row cannot collide (E20's own proof: this is exactly how
  -- {{first_name}} already works in production today). Should a single customer ever need a
  -- fully separate assistant, a compatible later change is a nullable `user_id` column with the
  -- lookup preferring the more specific (industry, user_id) row over the (industry, NULL) one —
  -- not a redesign of this table.
  industry           TEXT PRIMARY KEY,
  vapi_assistant_id  TEXT NOT NULL,
  label              TEXT,             -- optional human-readable name, e.g. "Noxatech — Medical"
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.industry_assistants IS
  'Callixis-wide (D-12): one Vapi assistant id per industry, shared by every customer in that '
  'industry. Not per-user by design — see the column comment above and docs/AI-Agents-plan/README.md E20.';

CREATE OR REPLACE FUNCTION public.touch_industry_assistants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS industry_assistants_touch_updated_at ON public.industry_assistants;
CREATE TRIGGER industry_assistants_touch_updated_at
  BEFORE UPDATE ON public.industry_assistants
  FOR EACH ROW EXECUTE FUNCTION public.touch_industry_assistants_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────────────
-- B. RLS (§E.2) — readable by any authenticated user (the dispatcher's per-lead read path,
-- and every agent-editing screen, needs this regardless of role); writable only by a holder of
-- the new `admin.vapi_assistants` permission (§C below).
-- ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.industry_assistants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view industry assistants" ON public.industry_assistants;
CREATE POLICY "Authenticated users can view industry assistants" ON public.industry_assistants
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Holders of admin.vapi_assistants can manage industry assistants" ON public.industry_assistants;
CREATE POLICY "Holders of admin.vapi_assistants can manage industry assistants" ON public.industry_assistants
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.get_my_permissions() gp WHERE gp.permission_key = 'admin.vapi_assistants')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.get_my_permissions() gp WHERE gp.permission_key = 'admin.vapi_assistants')
  );

-- ─────────────────────────────────────────────────────────────────────────────────────
-- C. Permission (§E.3-E.6) — D-5: super_admin only.
-- ─────────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.permissions (key, label, feature_group, sensitivity, sort_order)
VALUES ('admin.vapi_assistants', 'Admin — Vapi Assistant Map', 'Admin', 'high', 30)
ON CONFLICT (key) DO NOTHING;

-- 🔴 §E.4/E14 — DELIBERATELY no `('super_admin', 'admin.vapi_assistants', …)` row inserted into
-- role_permissions. E14 confirmed live (2026-09-02) that `role_permissions_super_lock` (from
-- 20260813000000_role_management_ui.sql) raises `cannot edit the permission matrix for a super
-- role` on ANY write touching a role with is_super — exactly what aborted admin-module Phase 7's
-- first apply (see that migration's own §B comment) when it made the identical mistake. §E.5:
-- it would also be redundant even if it worked — get_permissions_for()'s `WHERE me.is_super`
-- branch already hands every permission in the catalogue to a super role without consulting
-- role_permissions at all (E15). super_admin holds admin.vapi_assistants the moment the INSERT
-- above lands; nothing else is needed.
--
-- §E.6 — plain `admin` deliberately gets NO row here either (unlike admin.audit's `view` grant
-- to `admin` in 20260828000000_admin_audit_log.sql). That grant existed because Phase 6 already
-- gives `admin` real destructive power (block/freeze/remove) and audit visibility is
-- accountability for that. Pasting a live Vapi assistant id is a different kind of action — a
-- wrong paste silently redirects every call in an entire industry, platform-wide (D-12), for
-- every customer in it. D-5 said super_admin only; this migration follows that literally rather
-- than assuming the audit-log precedent extends here. Revisit only with an explicit new decision,
-- not by analogy.

-- ─────────────────────────────────────────────────────────────────────────────────────
-- D. Seed data (§E.7)
-- ─────────────────────────────────────────────────────────────────────────────────────
-- ⛔ Intentionally empty. D-9 (the real industry → Vapi assistant id pairs) was not supplied as
-- of this migration being written — Plan-Checklist/ai-agents/CHECKLIST.md §A.3/A.4 are open. Per
-- James's own choice (2026-09-03), this ships with an empty table and a super_admin pastes each
-- industry's assistant id in through the new /admin tab (§E.13-E.16) once ready. Phase 5 (wiring
-- the engine) already treats a missing row as "skip this lead, surface why" (D-4/F.3) rather than
-- silently falling back to the default assistant — the exact bug (Medical leads pitched
-- home-improvement) this whole plan exists to end — so an empty table here is safe, not a
-- half-finished migration.
