-- Call-quality plan (docs/call-quality-plan/README.md) §E.3 — the structured half of D-3's
-- "both": parse the flat transcript string (works today, on every call already recorded) AND
-- capture Vapi's own structured `artifact.messages` (exact turns/timings, future calls only).
--
-- ⛔ FILE-SIDE ONLY as of this commit. Apply with
--   npx supabase db query --file supabase/migrations/20260910000000_transcript_messages.sql --linked
-- per this repo's "the hosted database was never CLI-managed" note in CLAUDE.md — `db push` is
-- unsafe here. This is Phase 2 of the plan's own §ORDER — gated behind O.5 (apply) → O.6 (deploy
-- call-ingest) → O.7 (paste the updated `Normalize Call` node into live n8n), each its own
-- explicit go-ahead.

-- A single nullable JSONB column, no default — an ADD COLUMN of this shape is catalog-only (a
-- brief lock, no table rewrite), and every existing call_records row simply has NULL here until
-- call-ingest starts writing it (E.4). RLS needs no change: a new column inherits every policy
-- already on call_records, and call-ingest writes with the service role, same as every other
-- column on this table.
ALTER TABLE public.call_records
  ADD COLUMN IF NOT EXISTS transcript_messages JSONB;

COMMENT ON COLUMN public.call_records.transcript_messages IS
  'Call-quality plan §E — Vapi''s artifact.messages, trimmed to {role, message, secondsFromStart} '
  'only and with role=''system'' stripped BEFORE storage (E14 — that entry is the full rendered '
  'system prompt, and separately artifact.variables can carry Twilio credential fields). NULL for '
  'every call recorded before this column existed, and for any call whose end-of-call report '
  'carried no artifact.messages — src/lib/transcript.ts''s resolveTranscriptTurns() falls back to '
  'parsing the flat transcript string in both cases. See src/lib/transcript.ts for the parser and '
  'docs/call-quality-plan/README.md §X.2 for a flagged, NOT-yet-fixed cost of this column: '
  'useAccountData.ts''s select("*") on call_records puts a growing JSON blob on the same query '
  'that backs both the dashboard and the campaigns page.';
