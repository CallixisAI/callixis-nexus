-- Phase 4 — Invite & activation.
-- docs/admin-module-plan/PHASE-4-invite-and-activation.md §C · checklist: PHASE-4-CHECKLIST.md
--
-- ⚠️ Same caveat as every migration in this project since Phase 1: written from the model, not
-- run against a live database this session. Prove it live before trusting it — see the
-- checklist's §A pre-flight and §C.4 column probe.
--
-- 🔀 DEVIATION from the phase doc's literal §B flow, recorded here rather than silently:
-- PHASE-4-invite-and-activation.md §B says the auth user is created (email_confirm: false) and
-- `profiles.status = 'invited'` is set at INVITE time. This migration does NOT add
-- `profiles.status` — that column, with its full invited/active/frozen/blocked/removed lifecycle,
-- is Phase 6's own migration (PHASE-6-user-lifecycle.md §A), not started yet, and D-5 (block vs
-- freeze) isn't decided. Adding a two-value slice of it here would mean Phase 6 alters a column
-- Phase 4 created with a narrower CHECK constraint than it needs — silent scope creep into a
-- phase that isn't blocked by this one in the dependency graph (README.md's diagram has 4 and 6
-- as siblings under 0, not 4 → 6).
--
-- Built instead: the auth user is created at ACTIVATION time, not invite time. `user_invites`
-- already models "not a real user yet" perfectly (that's its current job for every invite before
-- this phase), so the token/code hashes just extend it — no new table, no profiles column, no
-- collision with Phase 6's plan. See supabase/functions/activate-invite/index.ts's header comment
-- for the full mechanics (handle_new_user() already resolves the new user's role from the
-- matching pending user_invites row, so activation doesn't even need to touch user_roles itself).
--
-- profiles.phone IS added below, though — that one's Phase 4's own exit criterion (S.7: "the
-- admin-entered phone number is on the user's record") and nothing else claims it.

-- ── user_invites: token/code hashes, expiry, attempt lock, who invited them ────────────────
-- Column names are token_hash/code_hash, NOT token/code — deliberate, see §D of the phase doc:
-- storing the plaintext would turn a readable /admin table into a set of account keys.
ALTER TABLE public.user_invites
  ADD COLUMN IF NOT EXISTS token_hash    TEXT,
  ADD COLUMN IF NOT EXISTS code_hash     TEXT,
  ADD COLUMN IF NOT EXISTS expires_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accepted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invited_by    UUID REFERENCES auth.users(id);

-- ── A.2 [E18]: Admin.tsx's (soon manage-users') upsert needs a unique index on email for
-- ON CONFLICT to work at all — Postgres raises 42P10 without one. The table was built by hand,
-- so it probably already has one, but that was never confirmed live (§A.2). Idempotent either
-- way: only adds the constraint if no unique index on (email) already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'user_invites'
      AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(email)%'
  ) THEN
    ALTER TABLE public.user_invites ADD CONSTRAINT user_invites_email_key UNIQUE (email);
  END IF;
END $$;

-- ── profiles.phone — Phase 4's own gap, not Phase 6's. [E12]: the invite dialog has always
-- collected a phone number; it had nowhere on the *user's own record* to land even once
-- Admin.tsx's upsert is fixed to send it to user_invites (which already has a phone column,
-- since 20260728120000_user_invites_permissions_fix.sql). activate-invite writes this once,
-- right after handle_new_user() creates the profile row.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- ── D.2: 5 wrong codes locks the invite. Documented here as a named constant would be nicer,
-- but Postgres has no shared-constant story worth the ceremony for one number used in exactly
-- one place (supabase/functions/activate-invite/index.ts's MAX_ATTEMPTS) — keep both in sync by
-- hand; the check ties this migration's checklist to that value, not because Postgres enforces
-- the lock itself (§D.3: verification is application-layer, in the edge function, on purpose,
-- so a wrong password on the *same* request as a correct code doesn't silently reset the count).
COMMENT ON COLUMN public.user_invites.attempt_count IS
  'Failed activation code attempts. Locked (generic error, no further comparison) at 5 — see supabase/functions/activate-invite/index.ts MAX_ATTEMPTS.';

-- Rollback: every column above is additive and nullable (attempt_count defaults to 0), so
-- dropping them is harmless to existing rows. Any invite issued between applying this and a
-- rollback becomes unactivatable — reissue or complete those first (checklist's own "Notes and
-- deviations" section is where to record any still-pending ones before rolling back).
