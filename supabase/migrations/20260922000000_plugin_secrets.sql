-- Plugins plan (docs/plugins-plan/README.md) §E — secrets stop being readable from the browser.
--
-- ⛔ FILE-SIDE ONLY. NOT applied to the hosted project by this change. Apply with:
--   npx supabase db query --file supabase/migrations/20260922000000_plugin_secrets.sql --linked
-- per CLAUDE.md's "the hosted database was never CLI-managed" note (`db push` is unsafe here).
-- Apply only on explicit go-ahead, and only AFTER §E.0 is deployed (the n8n-proxy auth fix in
-- this same change set) and §E.16-E.20's five-step key migration is followed in order — see
-- docs/plugins-plan/README.md §ORDER and §E.5.
--
-- §E.1 — smoke-tested live 2026-09-22 in an explicit BEGIN … ROLLBACK before writing a single
-- line below (per this section's own warning: "do not write the migration from documentation").
-- Confirmed live signature: vault.create_secret(new_secret text, new_name text DEFAULT NULL,
-- new_description text DEFAULT '', new_key_id uuid DEFAULT NULL) RETURNS uuid. Confirmed
-- vault.decrypted_secrets columns: id, name, description, secret, decrypted_secret, key_id,
-- nonce, created_at, updated_at. A real create + read-back round-trip was proven inside the
-- rolled-back transaction, then confirmed zero rows persisted afterward. pgsodium is genuinely
-- absent (§0.5) and irrelevant here — 0.3.1's create_secret/update_secret pair needs it for
-- nothing this migration uses. vault has no delete_secret() function in this version, so the
-- functions below DELETE directly from vault.secrets, confirmed to exist with columns id, name,
-- description, secret, key_id, nonce, created_at, updated_at, and confirmed the migration role
-- (postgres) can reach it.

-- ─────────────────────────────────────────────────────────────────────────────────────
-- §E.3 — metadata only. No secret value is ever stored in this table; the real value lives in
-- Vault, referenced by vault_secret_id.
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_plugin_secrets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plugin_id        TEXT NOT NULL,
  field_key        TEXT NOT NULL,
  vault_secret_id  UUID NOT NULL,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, plugin_id, field_key)
);

COMMENT ON TABLE public.user_plugin_secrets IS
  'Metadata only ("is a secret set, and when") — never the secret value itself. The value lives '
  'in Vault (vault.secrets), referenced by vault_secret_id. Written only by '
  'set_plugin_secret()/clear_plugin_secret() below, called only from the plugin-secrets edge '
  'function (verify_jwt: true, user_id derived from the caller''s own JWT — see that function''s '
  'header comment). See docs/plugins-plan/README.md §E.3.';

ALTER TABLE public.user_plugin_secrets ENABLE ROW LEVEL SECURITY;

-- §E.4 — own-row SELECT only. No INSERT/UPDATE/DELETE policy for anyone, including the row's
-- own owner — the only writer is the service role, through the two SECURITY DEFINER functions
-- below. Same append-only-by-construction technique admin_audit_log already uses, proven there
-- by a real anon-key INSERT rejected with 42501 (docs/plugins-plan/README.md §S.6 asks for the
-- same proof here once this is live).
DROP POLICY IF EXISTS "Users can view own plugin secret metadata" ON public.user_plugin_secrets;
CREATE POLICY "Users can view own plugin secret metadata" ON public.user_plugin_secrets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- §E.5 — reuse the existing trigger function (public.handle_updated_at(), defined in
-- 20260331000000_user_plugins.sql and already reused by user_page_layouts and 4 other tables),
-- never CREATE OR REPLACE it here.
DROP TRIGGER IF EXISTS set_updated_at ON public.user_plugin_secrets;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.user_plugin_secrets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────────────
-- The only two functions allowed to touch Vault for a plugin secret. Both SECURITY DEFINER,
-- both granted to service_role only — PostgREST never exposes the vault schema itself, and
-- these are the sole door onto it for this feature. Called from the plugin-secrets edge
-- function AFTER it has already verified the caller's own JWT (§E.8) — p_user_id here is that
-- verified id, passed explicitly rather than re-derived from auth.uid(), because the edge
-- function calls these with the service-role client, under which auth.uid() is NULL (the same
-- known limitation admin-module Phase 1's trigger guardrails already documented).
-- ─────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_plugin_secret(
  p_user_id UUID,
  p_plugin_id TEXT,
  p_field_key TEXT,
  p_secret TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_old_secret_id UUID;
  v_new_secret_id UUID;
BEGIN
  IF p_secret IS NULL OR btrim(p_secret) = '' THEN
    RAISE EXCEPTION 'p_secret must be a non-empty value';
  END IF;

  -- Serialize concurrent saves of the SAME (user, plugin, field) slot — caught by self-review
  -- before this ever shipped: without this, two overlapping calls (a double-click, two tabs)
  -- could each read the same v_old_secret_id, each create their own new vault.secrets row, and
  -- only one of those rows would ever end up referenced by user_plugin_secrets — the other
  -- becomes a permanently orphaned row still holding a real secret value, deleted by nothing.
  -- Transaction-scoped (auto-released at commit/rollback), so it can't leak across calls.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_plugin_id || ':' || p_field_key, 0));

  SELECT vault_secret_id INTO v_old_secret_id
  FROM public.user_plugin_secrets
  WHERE user_id = p_user_id AND plugin_id = p_plugin_id AND field_key = p_field_key;

  v_new_secret_id := vault.create_secret(
    p_secret,
    NULL,
    p_plugin_id || '/' || p_field_key || ' (user ' || p_user_id || ')'
  );

  INSERT INTO public.user_plugin_secrets (user_id, plugin_id, field_key, vault_secret_id)
  VALUES (p_user_id, p_plugin_id, p_field_key, v_new_secret_id)
  ON CONFLICT (user_id, plugin_id, field_key)
  DO UPDATE SET vault_secret_id = excluded.vault_secret_id, updated_at = now();

  -- Delete the OLD vault row only after the new one is safely referenced, and only if this was
  -- a re-save — never leaves an orphaned vault secret behind, and never risks losing the new
  -- value if the delete step were to fail first.
  IF v_old_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_old_secret_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_plugin_secret(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_plugin_secret(UUID, TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.clear_plugin_secret(
  p_user_id UUID,
  p_plugin_id TEXT,
  p_field_key TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id UUID;
BEGIN
  -- Same slot-level lock as set_plugin_secret() above, so a clear racing a concurrent set on
  -- the same (user, plugin, field) can't delete the vault row a save just created.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_plugin_id || ':' || p_field_key, 0));

  DELETE FROM public.user_plugin_secrets
  WHERE user_id = p_user_id AND plugin_id = p_plugin_id AND field_key = p_field_key
  RETURNING vault_secret_id INTO v_secret_id;

  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_plugin_secret(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_plugin_secret(UUID, TEXT, TEXT) TO service_role;

-- Read-side, for a future consumer (e.g. a redeployed n8n-proxy, §E.16-E.20) to fetch the
-- decrypted value server-side, in its own function — never through plugin-secrets itself (§E.9:
-- that function exposes no `get`). Not wired to any caller by this change; §E.16 does that, in
-- the five-step order §E.5's header describes, only after this migration is live.
CREATE OR REPLACE FUNCTION public.get_plugin_secret(
  p_user_id UUID,
  p_plugin_id TEXT,
  p_field_key TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id UUID;
  v_value TEXT;
BEGIN
  SELECT vault_secret_id INTO v_secret_id
  FROM public.user_plugin_secrets
  WHERE user_id = p_user_id AND plugin_id = p_plugin_id AND field_key = p_field_key;

  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_value FROM vault.decrypted_secrets WHERE id = v_secret_id;
  RETURN v_value;
END;
$$;

REVOKE ALL ON FUNCTION public.get_plugin_secret(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_plugin_secret(UUID, TEXT, TEXT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- §E.6/§E.11/§E.12 — two one-line hardenings to the EXISTING user_plugins table, folded into
-- this migration since they were found while designing this feature (docs/plugins-plan/
-- README.md §E.6), not because they're new tables.
-- ─────────────────────────────────────────────────────────────────────────────────────

-- §E.11 — user_plugins' UPDATE policy (20260331000000_user_plugins.sql:23-24) has USING but no
-- WITH CHECK, so a row can today be updated to carry a DIFFERENT user's user_id. With plugin
-- secrets keyed on (user_id, plugin_id, field_key) this stops being theoretical: move your own
-- user_plugins row onto someone else's user_id and their plugin-secret metadata becomes visible
-- under it. Closed exactly the way 20260917000000_user_page_layouts.sql:51-56 already closed
-- the identical hole for a different table.
DROP POLICY IF EXISTS "Users can update own plugins" ON public.user_plugins;
CREATE POLICY "Users can update own plugins" ON public.user_plugins
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- §E.12 — a status CHECK. plugin_id is deliberately NOT constrained here — a DB constraint on a
-- list that lives in TypeScript (src/lib/plugins.ts) is a deployment-ordering trap; F.2/F.3 in
-- src/lib/plugins.test.ts cover that ground safely instead, and adding a plugin never needs a
-- migration this way. Both live values were confirmed 2026-09-22 before writing this (3 rows
-- 'active', 2 rows 'available' — docs/plugins-plan/README.md §0.6), so this CHECK does not
-- reject anything that exists today.
ALTER TABLE public.user_plugins DROP CONSTRAINT IF EXISTS user_plugins_status_check;
ALTER TABLE public.user_plugins ADD CONSTRAINT user_plugins_status_check
  CHECK (status IN ('available', 'active'));
