-- Dashboard tiles plan (docs/dashboard-tiles-plan/README.md) §E — per-user, per-page tile layout
-- storage. D-4: page-keyed from day one so a future page (e.g. 'reports') needs no new migration,
-- just a new page_key value already permitted by the CHECK below. D-5: the user's own account is
-- the source of truth; a browser cache (src/hooks/usePageLayout.ts) exists purely to stop a
-- first-paint flash and is NEVER itself authoritative — the server row always wins on load.
--
-- ⛔ FILE-SIDE ONLY. Not applied to the hosted project by this change. Apply with:
--   npx supabase db query --file supabase/migrations/20260917000000_user_page_layouts.sql --linked
-- per CLAUDE.md's "the hosted database was never CLI-managed" note (`db push` is unsafe here).
-- Apply only on explicit go-ahead — see docs/dashboard-tiles-plan/README.md §H.

CREATE TABLE IF NOT EXISTS public.user_page_layouts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  page_key   TEXT NOT NULL,
  layout     JSONB NOT NULL DEFAULT '{"version":1,"tiles":[]}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, page_key),
  CONSTRAINT user_page_layouts_page_key_check CHECK (page_key IN ('dashboard', 'reports')),
  CONSTRAINT user_page_layouts_layout_object  CHECK (jsonb_typeof(layout) = 'object')
);

COMMENT ON TABLE public.user_page_layouts IS
  'Presentational only — which tiles a user shows/hides/resizes/reorders on a given page. Never a '
  'data gate: this table''s RLS deliberately uses the plain auth.uid() = user_id pattern (see '
  'below), not gen-3''s is_account_active()/ip_allowed(), because a denied SELECT here reads as '
  '"no row yet" and would make the client silently overwrite a real saved layout with the default '
  'on the next edit. See docs/dashboard-tiles-plan/README.md E11 / §E.3.';

-- ─────────────────────────────────────────────────────────────────────────────────────
-- RLS (§E.3/§E.4) — the plain `auth.uid() = user_id` pattern, deliberately NOT gen-3's
-- `is_account_active() + ip_allowed()`. Those guards were withheld from
-- profiles/user_roles/user_permissions/security_settings for the identical reason
-- (20260827000000_user_lifecycle.sql:113-119, E11) — account and presentation tables must stay
-- reachable even for an account an admin has frozen/blocked, or a session outside an approved IP
-- range. This table sits squarely in that family: its worst possible failure is "your boxes are
-- in the default order," never customer or call data, so there is nothing here worth risking a
-- self-destroying read gate for.
-- ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_page_layouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own page layouts" ON public.user_page_layouts;
CREATE POLICY "Users can view own page layouts" ON public.user_page_layouts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own page layouts" ON public.user_page_layouts;
CREATE POLICY "Users can insert own page layouts" ON public.user_page_layouts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- §E.4 — WITH CHECK as well as USING. user_plugins' own UPDATE policy has only USING
-- (20260331000000_user_plugins.sql:23-24, E9), which lets a row be updated to carry a DIFFERENT
-- user's user_id. Not copied forward here.
DROP POLICY IF EXISTS "Users can update own page layouts" ON public.user_page_layouts;
CREATE POLICY "Users can update own page layouts" ON public.user_page_layouts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own page layouts" ON public.user_page_layouts;
CREATE POLICY "Users can delete own page layouts" ON public.user_page_layouts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- No extra index (§E.5) — UNIQUE (user_id, page_key) already builds the only btree this table
-- serves, and is exactly the column pair the app's upsert targets via onConflict.

-- Reuse the existing trigger function (public.handle_updated_at(), defined in
-- 20260331000000_user_plugins.sql and already reused by 4 other tables, E10) — never
-- CREATE OR REPLACE it here, which would silently change every other table's behaviour too.
DROP TRIGGER IF EXISTS set_updated_at ON public.user_page_layouts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.user_page_layouts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
