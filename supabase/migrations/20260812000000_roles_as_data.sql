-- Phase 1 — Roles become data.
-- docs/admin-module-plan/PHASE-1-roles-as-data.md §B/C/D/E · checklist: PHASE-1-CHECKLIST.md
--
-- 🔴 HIGHEST-RISK MIGRATION IN THIS PLAN. Drops a live enum (`app_role`) the database
-- currently depends on and rewrites live RLS policies. DROP TYPE cannot be undone by
-- re-running a migration.
--
-- ══════════════════════════════════════════════════════════════════════════════════════
-- STATUS as of 2026-08-12, after James resolved the two open questions below (§3/§4).
-- Everything blocking is now closed except #5/#6, which are known, accepted, documented
-- gaps rather than open questions — this file is ready to apply.
--
--   1. ✅ §A pre-flight run live 2026-08-12 (PHASE-1-CHECKLIST.md §A) — exact match to the
--      four policies dropped/recreated below, nothing extra. Safe to proceed on that front.
--   2. ✅ Full pg_dump backup taken 2026-08-12 (schema + data, via `supabase db dump
--      --linked`, Free plan has no dashboard snapshot feature) — see PHASE-1-CHECKLIST.md
--      §C.1 for exactly how and where it's stored. That's the rollback if this goes wrong.
--   3. ✅ RESOLVED — James, 2026-08-12: **everyone can see the 'plugins' page.** The real
--      matrix has no row for it at all (App.tsx's /plugins route, live
--      requirePermission="plugins") — not an oversight in this file, the source sheet
--      simply doesn't cover it. Implemented as a uniform 'view' grant to all 7 real roles
--      (step 7.5 below), which also reaches pending_role_review via step 8's copy-from-
--      operator. Existing per-user user_permissions rows granting 'plugins' directly are
--      untouched either way.
--   4. ✅ RESOLVED — James, 2026-08-12: **keep the Operator-level floor** for
--      pending_role_review (the 6 live non-super_admin/admin users — 2 'brand', 1
--      'affiliate', plus the disposable Phase 0 test account, all landing here since the
--      sheet has no "Brand Manager" and no role for any of them). No change needed — this
--      was already this file's default guess, now confirmed rather than just assumed.
--   5. ⚠️ ACCEPTED GAP, not fixed here: the "no upward edits" guardrail
--      (enforce_role_rank_guard below) only fires for writes made under an authenticated
--      client session (auth.uid() IS NOT NULL). The only live write path to user_roles
--      today is supabase/functions/manage-users/, which uses the service-role key —
--      auth.uid() is NULL there, so this trigger does NOT currently protect against a
--      compromised/buggy manage-users request granting a too-powerful role. manage-users
--      needs the equivalent rank check added in its own application code; not done in this
--      migration. Tracked as a PHASE-1-CHECKLIST.md gap, not blocking this apply.
--   6. ⚠️ get_my_permissions()'s level-collapsing logic (§D below) is written from the
--      model, same caveat the phase doc already puts on the simpler version it replaces:
--      treat it as a spec, prove it with §F's before/after diff right after applying,
--      before trusting it in Phase 2.
-- ══════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 1. Drop every policy that references has_role() — the four known from the migration
--    files [E5]. If §A's pre-flight query found more, add them here too before applying.
-- ─────────────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage all permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Admins can manage invites"         ON public.user_invites;
DROP POLICY IF EXISTS "Admins can view all profiles"      ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all roles"         ON public.user_roles;
-- Found live 2026-08-12, NOT in any migration file — an undocumented duplicate of the
-- first policy above, implemented as a raw subquery on user_roles.role instead of via
-- has_role(). This is what actually blocked the first apply attempt (0A000: cannot alter
-- type of a column used in a policy definition) — the original §A pre-flight query only
-- searched policy text for the literal string 'has_role', which this doesn't contain, so
-- it slipped through. Functionally redundant with "Admins can manage all permissions"
-- (same table, same ALL/admin intent) — dropped here, not recreated below.
DROP POLICY IF EXISTS "Admins manage all permissions"     ON public.user_permissions;

-- 2. Now the function is free to drop.
DROP FUNCTION IF EXISTS public.has_role(UUID, public.app_role);

-- 3. Roles become text (values stay 'admin'/'brand'/'affiliate' as text for now — remapped
--    in step 8, after the new roles exist to remap them onto).
ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE TEXT USING role::TEXT;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 4. The three new tables.
--    Beyond PHASE-1-roles-as-data.md §B.1's original sketch, `permissions` gains two
--    columns the real matrix needs that the placeholder didn't: `feature_group` (the
--    sheet's "Feature" column — Admin/Settings/Finance/… — so Phase 3's role editor can
--    render the matrix grouped, not as one flat list of 24 checkboxes) and `sensitivity`
--    (the sheet's own Critical/High/Medium/Low column, for the same UI to warn on
--    Critical grants). And `role_permissions` gains `level` — the plan's original design
--    only recorded yes/no; the real matrix grants Full/Edit/View/None, four levels, not
--    two, and collapsing that to a binary would have silently discarded real information
--    (e.g. Sales Manager gets Edit, not Full, on Revenue Reports).
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.roles (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  is_super    BOOLEAN NOT NULL DEFAULT false,
  rank        INT     NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Any authenticated user can read the role catalogue" ON public.roles
  FOR SELECT TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE policy yet — deny-all for writes until Phase 3 builds the real
-- role-editor UI with its own admin.roles_invites check. Writes happen via SQL editor for now.

CREATE TABLE public.permissions (
  key           TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'action' CHECK (category IN ('page','action')),
  feature_group TEXT,
  sensitivity   TEXT NOT NULL DEFAULT 'low' CHECK (sensitivity IN ('low','medium','high','critical')),
  route         TEXT,
  sort_order    INT  NOT NULL DEFAULT 100
);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Any authenticated user can read the permission catalogue" ON public.permissions
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.role_permissions (
  role_key       TEXT NOT NULL REFERENCES public.roles(key) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  level          TEXT NOT NULL DEFAULT 'full' CHECK (level IN ('view','edit','full')),
  PRIMARY KEY (role_key, permission_key)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Any authenticated user can read the role/permission matrix" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 5. Seed the 7 real roles from the matrix, plus one bridge role that is NOT in the
--    matrix — see guess #4 in the header comment above.
-- ─────────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.roles (key, label, description, is_system, is_super, rank) VALUES
  ('super_admin',       'SuperAdmin',        'Full access to everything, including the role matrix and IP allowlist.', true,  true,  0),
  ('admin',             'Admin',             'Full operational access. Cannot manage roles/invites, permission overrides, or budget.', true, false, 10),
  ('it_manager',        'IT Manager',        NULL, false, false, 20),
  ('sales_manager',     'Sales Manager',     NULL, false, false, 30),
  ('support_manager',   'Support Manager',   NULL, false, false, 40),
  ('affiliate_manager', 'Affiliate Manager', NULL, false, false, 50),
  ('operator',          'Operator',          NULL, false, false, 60),
  -- 🔀 GUESS, confirm before applying (header comment #4): parks the 2 live 'brand' +
  -- 1 live 'affiliate' (James's own account) users pending a real assignment into one of
  -- the 7 roles above. is_system=true so it can't be deleted from a future roles UI while
  -- anyone still holds it. rank is deliberately the least powerful of all nine roles here
  -- (weaker even than Operator) so the "no upward edits" guard never treats a parked user
  -- as senior to anyone.
  ('pending_role_review', 'Pending Role Review', 'Temporary holding role for accounts migrated 2026-08-12 with no matching role in the new matrix. Not a real business role — reassign and remove.', true, false, 1000);

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 6. The 24 granular permissions from the real matrix + the 10 permission keys already
--    live in App.tsx's ProtectedRoute today [E6]. Generated block (permissions +
--    role_permissions for the 24) is produced by scripts/generate-phase1-permissions.py
--    from roles/CallixisPermissions by roles.xlsx — do not hand-edit it; re-run the
--    script and replace the block if the source sheet changes. See that script's own
--    docstring for why (PHASE-1-CHECKLIST.md §B.6's transcription-risk warning).
-- ─────────────────────────────────────────────────────────────────────────────────────

-- The 10 keys already checked by App.tsx's <ProtectedRoute requirePermission="…">, kept
-- exactly as-is per PHASE-1-roles-as-data.md §4.6 — no live user_permissions row needs to
-- change. 'admin' itself isn't here: /admin is gated by requireRole="admin" today, not a
-- permission key (Phase 2's territory to convert, per the comment already in App.tsx).
INSERT INTO public.permissions (key, label, category, feature_group, sensitivity, route, sort_order) VALUES
  ('dashboard',    'Dashboard',    'page', 'Dashboard',    'low',      '/dashboard',    1),
  ('campaigns',    'Campaigns',    'page', 'Campaigns',    'medium',   '/campaigns',    2),
  ('ai-agents',    'AI Agents',    'page', 'AI Agents',    'high',     '/ai-agents',    3),
  ('plugins',      'Plugins',      'page', NULL,           'medium',  '/plugins',      4),
  ('call-center',  'Call Center',  'page', 'Call Center',  'medium',   '/call-center',  5),
  ('reports',      'Reports',      'page', 'Reports',      'low',      '/reports',      6),
  ('finance',      'Finance',      'page', 'Finance',      'critical', '/finance',      7),
  ('marketplace',  'Marketplace',  'page', 'Marketplace',  'medium',   '/marketplace',  8),
  ('calendar',     'Calendar',     'page', 'Calendar',     'low',      '/calendar',     9),
  ('settings',     'Settings',     'page', 'Settings',     'critical', '/settings',    10);

-- ── BEGIN GENERATED BLOCK — from `python3 scripts/generate-phase1-permissions.py` ──────
-- Generated by scripts/generate-phase1-permissions.py from
-- "roles/CallixisPermissions by roles.xlsx" -- do not hand-edit; re-run the script and replace this block instead.

INSERT INTO public.permissions (key, label, feature_group, sensitivity, sort_order) VALUES
  ('admin.roles_invites', 'Admin — User Roles & Invites', 'Admin', 'critical', 10),
  ('admin.permission_overrides', 'Admin — Permission Overrides', 'Admin', 'critical', 20),
  ('settings.system_configuration', 'Settings — System Configuration', 'Settings', 'critical', 30),
  ('settings.api_integrations', 'Settings — API & Integrations', 'Settings', 'critical', 40),
  ('finance.budget', 'Finance — Add/Withdraw Budget', 'Finance', 'critical', 50),
  ('finance.revenue_reports', 'Finance — Revenue Reports', 'Finance', 'critical', 60),
  ('finance.transaction_history', 'Finance — Transaction History', 'Finance', 'critical', 70),
  ('agents.deploy', 'AI Agents — Deploy New Agents', 'AI Agents', 'high', 80),
  ('agents.prompt_engineering', 'AI Agents — Prompt Engineering', 'AI Agents', 'high', 90),
  ('agents.voice_model_config', 'AI Agents — Voice/Model Config', 'AI Agents', 'high', 100),
  ('agents.chat_testing', 'AI Agents — Chat Testing', 'AI Agents', 'high', 110),
  ('campaigns.create_delete', 'Campaigns — Create/Delete Campaign', 'Campaigns', 'medium', 120),
  ('campaigns.start_pause_stop', 'Campaigns — Start/Pause/Stop', 'Campaigns', 'medium', 130),
  ('campaigns.bulk_lead_upload', 'Campaigns — Bulk Lead Upload', 'Campaigns', 'medium', 140),
  ('campaigns.lead_management', 'Campaigns — Lead Management', 'Campaigns', 'medium', 150),
  ('callcenter.live_dashboard', 'Call Center — Live Call Dashboard', 'Call Center', 'medium', 160),
  ('callcenter.recording_access', 'Call Center — Recording Access', 'Call Center', 'medium', 170),
  ('callcenter.outcome_tagging', 'Call Center — Outcome Tagging', 'Call Center', 'medium', 180),
  ('marketplace.approve_listings', 'Marketplace — Approve Listings', 'Marketplace', 'medium', 190),
  ('marketplace.purchase_plugins', 'Marketplace — Purchase Plugins', 'Marketplace', 'medium', 200),
  ('reports.export', 'Reports — Export CSV/Excel', 'Reports', 'low', 210),
  ('reports.analytics_dashboard', 'Reports — Analytics Dashboard', 'Reports', 'low', 220),
  ('dashboard.global_overview', 'Dashboard — Global Overview', 'Dashboard', 'low', 230),
  ('calendar.schedule_sync', 'Calendar — Schedule/Sync', 'Calendar', 'low', 240);

-- category isn't listed in the INSERT above — all 24 of these rows take the table's
-- DEFAULT 'action', which is correct for every one of them; only the 10 page keys above
-- override it to 'page' explicitly.

INSERT INTO public.role_permissions (role_key, permission_key, level) VALUES
  ('super_admin', 'admin.roles_invites', 'full'),
  ('super_admin', 'admin.permission_overrides', 'full'),
  ('super_admin', 'settings.system_configuration', 'full'),
  ('admin', 'settings.system_configuration', 'full'),
  ('it_manager', 'settings.system_configuration', 'full'),
  ('super_admin', 'settings.api_integrations', 'full'),
  ('admin', 'settings.api_integrations', 'full'),
  ('it_manager', 'settings.api_integrations', 'full'),
  ('super_admin', 'finance.budget', 'full'),
  ('super_admin', 'finance.revenue_reports', 'full'),
  ('admin', 'finance.revenue_reports', 'full'),
  ('sales_manager', 'finance.revenue_reports', 'edit'),
  ('support_manager', 'finance.revenue_reports', 'view'),
  ('affiliate_manager', 'finance.revenue_reports', 'view'),
  ('super_admin', 'finance.transaction_history', 'full'),
  ('admin', 'finance.transaction_history', 'full'),
  ('sales_manager', 'finance.transaction_history', 'view'),
  ('support_manager', 'finance.transaction_history', 'view'),
  ('affiliate_manager', 'finance.transaction_history', 'view'),
  ('super_admin', 'agents.deploy', 'full'),
  ('admin', 'agents.deploy', 'full'),
  ('it_manager', 'agents.deploy', 'full'),
  ('sales_manager', 'agents.deploy', 'full'),
  ('super_admin', 'agents.prompt_engineering', 'full'),
  ('admin', 'agents.prompt_engineering', 'full'),
  ('it_manager', 'agents.prompt_engineering', 'full'),
  ('super_admin', 'agents.voice_model_config', 'full'),
  ('admin', 'agents.voice_model_config', 'full'),
  ('it_manager', 'agents.voice_model_config', 'full'),
  ('super_admin', 'agents.chat_testing', 'full'),
  ('admin', 'agents.chat_testing', 'full'),
  ('it_manager', 'agents.chat_testing', 'full'),
  ('sales_manager', 'agents.chat_testing', 'full'),
  ('support_manager', 'agents.chat_testing', 'view'),
  ('affiliate_manager', 'agents.chat_testing', 'view'),
  ('operator', 'agents.chat_testing', 'view'),
  ('super_admin', 'campaigns.create_delete', 'full'),
  ('admin', 'campaigns.create_delete', 'full'),
  ('sales_manager', 'campaigns.create_delete', 'full'),
  ('super_admin', 'campaigns.start_pause_stop', 'full'),
  ('admin', 'campaigns.start_pause_stop', 'full'),
  ('sales_manager', 'campaigns.start_pause_stop', 'full'),
  ('super_admin', 'campaigns.bulk_lead_upload', 'full'),
  ('admin', 'campaigns.bulk_lead_upload', 'full'),
  ('sales_manager', 'campaigns.bulk_lead_upload', 'full'),
  ('affiliate_manager', 'campaigns.bulk_lead_upload', 'full'),
  ('super_admin', 'campaigns.lead_management', 'full'),
  ('admin', 'campaigns.lead_management', 'full'),
  ('sales_manager', 'campaigns.lead_management', 'full'),
  ('support_manager', 'campaigns.lead_management', 'view'),
  ('affiliate_manager', 'campaigns.lead_management', 'full'),
  ('super_admin', 'callcenter.live_dashboard', 'full'),
  ('admin', 'callcenter.live_dashboard', 'full'),
  ('it_manager', 'callcenter.live_dashboard', 'view'),
  ('sales_manager', 'callcenter.live_dashboard', 'full'),
  ('support_manager', 'callcenter.live_dashboard', 'view'),
  ('affiliate_manager', 'callcenter.live_dashboard', 'view'),
  ('operator', 'callcenter.live_dashboard', 'full'),
  ('super_admin', 'callcenter.recording_access', 'full'),
  ('admin', 'callcenter.recording_access', 'full'),
  ('sales_manager', 'callcenter.recording_access', 'full'),
  ('support_manager', 'callcenter.recording_access', 'view'),
  ('affiliate_manager', 'callcenter.recording_access', 'view'),
  ('super_admin', 'callcenter.outcome_tagging', 'full'),
  ('admin', 'callcenter.outcome_tagging', 'full'),
  ('sales_manager', 'callcenter.outcome_tagging', 'full'),
  ('support_manager', 'callcenter.outcome_tagging', 'full'),
  ('affiliate_manager', 'callcenter.outcome_tagging', 'full'),
  ('operator', 'callcenter.outcome_tagging', 'full'),
  ('super_admin', 'marketplace.approve_listings', 'full'),
  ('admin', 'marketplace.approve_listings', 'full'),
  ('support_manager', 'marketplace.approve_listings', 'full'),
  ('affiliate_manager', 'marketplace.approve_listings', 'full'),
  ('super_admin', 'marketplace.purchase_plugins', 'full'),
  ('admin', 'marketplace.purchase_plugins', 'full'),
  ('it_manager', 'marketplace.purchase_plugins', 'view'),
  ('sales_manager', 'marketplace.purchase_plugins', 'full'),
  ('support_manager', 'marketplace.purchase_plugins', 'view'),
  ('affiliate_manager', 'marketplace.purchase_plugins', 'full'),
  ('super_admin', 'reports.export', 'full'),
  ('admin', 'reports.export', 'full'),
  ('it_manager', 'reports.export', 'view'),
  ('sales_manager', 'reports.export', 'full'),
  ('support_manager', 'reports.export', 'view'),
  ('affiliate_manager', 'reports.export', 'full'),
  ('super_admin', 'reports.analytics_dashboard', 'full'),
  ('admin', 'reports.analytics_dashboard', 'full'),
  ('it_manager', 'reports.analytics_dashboard', 'full'),
  ('sales_manager', 'reports.analytics_dashboard', 'full'),
  ('support_manager', 'reports.analytics_dashboard', 'full'),
  ('affiliate_manager', 'reports.analytics_dashboard', 'full'),
  ('operator', 'reports.analytics_dashboard', 'full'),
  ('super_admin', 'dashboard.global_overview', 'full'),
  ('admin', 'dashboard.global_overview', 'full'),
  ('it_manager', 'dashboard.global_overview', 'full'),
  ('sales_manager', 'dashboard.global_overview', 'full'),
  ('support_manager', 'dashboard.global_overview', 'full'),
  ('affiliate_manager', 'dashboard.global_overview', 'full'),
  ('operator', 'dashboard.global_overview', 'view'),
  ('super_admin', 'calendar.schedule_sync', 'full'),
  ('admin', 'calendar.schedule_sync', 'full'),
  ('it_manager', 'calendar.schedule_sync', 'view'),
  ('sales_manager', 'calendar.schedule_sync', 'full'),
  ('support_manager', 'calendar.schedule_sync', 'view'),
  ('affiliate_manager', 'calendar.schedule_sync', 'full'),
  ('operator', 'calendar.schedule_sync', 'full');

-- 106 grants generated (out of 168 possible role×permission cells at 24 permissions × 7 roles).
-- ── END GENERATED BLOCK ─────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 7. Synthesize page-level access from the granular grants: a role can see a page if it
--    has at least one non-'none' grant on a sub-function under that page's feature group.
--    This is a derivation, not a business decision — the real matrix doesn't state page
--    visibility directly, only the 24 sub-functions, so "can do something here → can see
--    the page" is the only reading that doesn't invent access nobody granted. 'plugins'
--    isn't covered by this derivation (no feature group for it in the matrix) — see step
--    7.5 immediately below for how it's actually handled, decided directly by James rather
--    than derived.
-- ─────────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.role_permissions (role_key, permission_key, level)
SELECT DISTINCT rp.role_key, page.page_key, 'view'
FROM public.role_permissions rp
JOIN public.permissions p ON p.key = rp.permission_key
JOIN (VALUES
  ('AI Agents',   'ai-agents'),
  ('Call Center', 'call-center'),
  ('Calendar',    'calendar'),
  ('Campaigns',   'campaigns'),
  ('Dashboard',   'dashboard'),
  ('Finance',     'finance'),
  ('Marketplace', 'marketplace'),
  ('Reports',     'reports'),
  ('Settings',    'settings')
) AS page(feature_group, page_key) ON page.feature_group = p.feature_group
ON CONFLICT (role_key, permission_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 7.5. 'plugins' — James, 2026-08-12: everyone can see it. Not a derivation like step 7
--      (the matrix has no row to derive it from at all) — a direct decision, applied
--      uniformly. Same 'view' level as every other page-gate key above, for consistency.
--      Deliberately only the 7 real roles here, not pending_role_review — that role gets
--      it anyway via step 8's copy-from-operator immediately below, same as every other
--      grant operator holds, so "everyone" ends up true without a special case for it.
-- ─────────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.role_permissions (role_key, permission_key, level)
SELECT r.key, 'plugins', 'view'
FROM public.roles r
WHERE r.key <> 'pending_role_review';

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 8. Park the 6 live non-admin users, per James (2026-08-12) — see guess #4 above for the
--    permission floor this gives them. Copies whatever 'operator' ended up with above
--    (both the 24 granular grants and the page-level synthesis from step 7) rather than
--    hand-listing it a second time, so it can't drift from operator's real grants.
-- ─────────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.role_permissions (role_key, permission_key, level)
SELECT 'pending_role_review', permission_key, level
FROM public.role_permissions
WHERE role_key = 'operator';

-- 9. Remap the live enum values onto the new role keys. MUST run before the FK below —
--    every existing user_roles row must resolve to a roles.key or the FK rejects it and
--    the whole transaction aborts (this is §C step 4's ordering trap from the phase doc).
UPDATE public.user_roles SET role = 'super_admin'          WHERE role = 'admin';
UPDATE public.user_roles SET role = 'pending_role_review'  WHERE role IN ('brand', 'affiliate');

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_fkey
  FOREIGN KEY (role) REFERENCES public.roles(key);

-- 10. has_role, same name and behaviour, TEXT parameter instead of the enum.
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- 11. Recreate the four policies — NOT verbatim, unlike the phase doc's §C originally
--     assumed ("no policy text changes"). That assumption held for the has_role() ->
--     TEXT signature change, but not for what step 9 just did: the 3 real admins are now
--     'super_admin', not 'admin'. A verbatim has_role(auth.uid(),'admin') would then match
--     nobody live — locking out every real admin from all four of these the instant this
--     transaction commits, which breaks Phase 1's own exit criterion #7 ("the app must
--     keep working"). Fixed here instead of discovered after applying:
--
--     - user_permissions / user_invites ("manage all permissions" / "manage invites"):
--       restricted to super_admin ONLY. This isn't a workaround, it's D-2's actual finding
--       (checklist §B.2) — the real matrix has Admin at None on exactly Permission
--       Overrides and User Roles & Invites. A plain 'admin' role losing DB-level access to
--       these two is the correct, intended behaviour now that super_admin exists to hold it.
--     - profiles / user_roles ("view all profiles" / "view all roles"): broadened to admin
--       OR super_admin. Not one of D-2's three named exceptions, and viewing the user list
--       is baseline functionality /admin needs to work for a plain admin at all.
CREATE POLICY "Admins can manage all permissions" ON public.user_permissions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins can manage invites" ON public.user_invites
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')
  );

-- ⚠️ Live-only policies §A's pre-flight turns up (guess #1) go here too, verbatim from
-- whatever §A recorded — none are known from the migration files beyond the four above.

-- 12. Close the anonymous-callable hole noted in ADMIN-RBAC-PLAN.md (verified live,
--     Plan/ADMIN-CLEANUP.md §A3: unauthenticated callers got `false`, HTTP 200, not a
--     permission error). RLS policies keep working — they run under has_role's own
--     SECURITY DEFINER privileges when Postgres evaluates them, not the querying role's.
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, TEXT) FROM anon, authenticated;

-- 13. Only now is the type unused anywhere.
DROP TYPE public.app_role;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 14. Per-user overrides need a `deny`, not just an `allow` — see §B.2. Defaulting to
--     'allow' means every existing user_permissions row keeps its current meaning; no
--     data migration needed for this column.
-- ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS effect TEXT NOT NULL DEFAULT 'allow'
    CHECK (effect IN ('allow','deny'));

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 15. handle_new_user — MUST change in this same migration (Phase 0 §B.1 deliberately
--     left the `::app_role` cast and a 'brand' fallback in place; step 13 above just
--     dropped both the type and the role they referred to. Skipping this breaks every new
--     signup the moment this transaction commits — see PHASE-1-roles-as-data.md's "Risks"
--     table, last row). Same trigger binding (on_auth_user_created), same source-of-truth
--     rule (user_invites.role, never raw_user_meta_data, per Phase 0 §B.1) — only the cast
--     and the fallback role change.
--     🔀 Fallback changes from 'brand' to 'pending_role_review': there is no real role left
--     to safely default an unmatched signup into, and public signup is off (Phase 0 §B.5,
--     confirmed live), so this path should now only ever fire for an admin-invited user
--     whose user_invites row went missing — an error condition, not a normal one. Parking
--     it rather than guessing a real role means it fails safe instead of silently wrong.
-- ─────────────────────────────────────────────────────────────────────────────────────
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

  SELECT role INTO v_role
  FROM public.user_invites
  WHERE email = lower(NEW.email) AND status = 'pending'
  LIMIT 1;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    COALESCE(v_role, 'pending_role_review')
  );

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 16. One resolver, used by everything (§D). Extends the phase doc's original sketch to
--     return a level per permission, not just the key, to carry the Full/Edit/View
--     distinction through instead of collapsing it. A per-user 'allow' override is treated
--     as a blanket 'full' grant on that key (an override is an exception mechanism, not a
--     second dial to tune) — 'deny' removes the key outright regardless of level.
--     ❓ Written from the model, not tested against a database — same caveat the phase doc
--     puts on its own simpler version. Prove it with §F's before/after diff.
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE (permission_key TEXT, level TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT ur.role AS role_key, r.is_super
    FROM public.user_roles ur
    JOIN public.roles r ON r.key = ur.role
    WHERE ur.user_id = auth.uid()
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
    WHERE up.user_id = auth.uid() AND up.effect = 'allow' AND NOT COALESCE(me.is_super, false)
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
    WHERE up.user_id = auth.uid() AND up.permission_key = b.permission_key
      AND up.effect = 'deny' AND NOT COALESCE(me.is_super, false)
  );
$$;

REVOKE ALL ON FUNCTION public.get_my_permissions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_permissions() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 17. Guardrail — last super admin (§E). Unconditional: applies even to a service-role or
--     SQL-editor write, unlike the rank guard below, because there's no "actor" concept
--     needed to know a system is about to have zero super admins.
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_last_super_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  was_super BOOLEAN;
  still_super BOOLEAN;
  remaining INT;
BEGIN
  SELECT r.is_super INTO was_super FROM public.roles r WHERE r.key = OLD.role;
  IF NOT COALESCE(was_super, false) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    still_super := false;
  ELSE
    SELECT r.is_super INTO still_super FROM public.roles r WHERE r.key = NEW.role;
  END IF;

  IF COALESCE(still_super, false) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT count(*) INTO remaining
  FROM public.user_roles ur
  JOIN public.roles r ON r.key = ur.role
  WHERE r.is_super AND ur.user_id <> OLD.user_id;

  IF remaining = 0 THEN
    RAISE EXCEPTION 'refusing to remove the last super_admin (user %)', OLD.user_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS user_roles_last_super_admin_guard ON public.user_roles;
CREATE TRIGGER user_roles_last_super_admin_guard
  BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_last_super_admin();

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 18. Guardrail — no upward edits (§E). See guess #5 in the header comment: this only
--     fires for an authenticated caller (auth.uid() IS NOT NULL). manage-users writes via
--     the service-role key and is NOT covered — needs its own equivalent check, separately.
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_role_rank_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_rank INT;
  old_target_rank INT;
  new_target_rank INT;
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

  IF TG_OP IN ('UPDATE','DELETE') THEN
    SELECT r.rank INTO old_target_rank FROM public.roles r WHERE r.key = OLD.role;
    IF old_target_rank IS NOT NULL AND old_target_rank < actor_rank THEN
      RAISE EXCEPTION 'cannot modify a user whose current role outranks your own';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') THEN
    SELECT r.rank INTO new_target_rank FROM public.roles r WHERE r.key = NEW.role;
    IF new_target_rank IS NOT NULL AND new_target_rank < actor_rank THEN
      RAISE EXCEPTION 'cannot grant a role that outranks your own';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS user_roles_rank_guard ON public.user_roles;
CREATE TRIGGER user_roles_rank_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_role_rank_guard();

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 19. Guardrail — no granting what you don't hold (§E, checklist E.4 — distinct from #18
--     above: that one guards *role* changes, this one guards *permission override* grants).
--     Without this, admin (who cannot itself touch finance.budget) could still write a
--     user_permissions row granting someone else finance.budget directly, since that table
--     has no rank concept of its own. Same auth.uid() IS NULL caveat as #18: does not cover
--     manage-users' service-role writes.
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_grant_ceiling()
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

  IF NEW.effect <> 'allow' THEN
    RETURN NEW; -- denying someone a permission is never a privilege escalation
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

DROP TRIGGER IF EXISTS user_permissions_grant_ceiling ON public.user_permissions;
CREATE TRIGGER user_permissions_grant_ceiling
  BEFORE INSERT OR UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_grant_ceiling();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- Rollback note: this cannot be undone by re-running a migration once COMMIT succeeds —
-- DROP TYPE public.app_role is irreversible from SQL alone. The only rollback is the full
-- database snapshot required by guess #2 in the header comment, restored from the
-- Supabase dashboard.
-- ─────────────────────────────────────────────────────────────────────────────────────
