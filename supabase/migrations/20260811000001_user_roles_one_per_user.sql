-- Phase 0 §D.2 — one role per user.
--
-- user_roles' only constraint today is UNIQUE (user_id, role), which permits a user to
-- hold several roles at once. Every line of app code assumes exactly one
-- (AuthContext.tsx's .maybeSingle() query, computeHasPermission's role check). Holding two
-- rows breaks that silently — see PHASE-0-foundation-security.md §D.2/§D.3.
--
-- 🛑 DO NOT RUN THIS until §A.3's duplicate-role query has been run and returns zero rows:
--
--   SELECT user_id, count(*) FROM public.user_roles GROUP BY user_id HAVING count(*) > 1;
--
-- If it returns any rows, decide which role each of those users keeps and delete the
-- others first — this ALTER TABLE fails the whole statement otherwise, which is the safe
-- outcome, but it means this file is not yet safe to paste into the SQL editor.
--
-- ⚠️ Apply by pasting into the Supabase SQL editor, same as every other migration here —
-- `npx supabase db push` is unsafe on this project.

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);

-- Rollback: ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_user_id_key;
-- (restores the original UNIQUE (user_id, role) shape by re-adding it, if ever needed).
