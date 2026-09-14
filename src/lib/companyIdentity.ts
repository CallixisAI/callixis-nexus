// Why this file exists: `profiles.company_name` is substituted into the Vapi assistant's own
// opening line as `{{company_name}}` (resolved in supabase/functions/dispatch-batch/index.ts,
// the `companyNameByUserId` map). Left blank it resolves to an EMPTY STRING, not an error — so
// the assistant reads its greeting with a hole in it and nothing anywhere reports a problem.
//
// Confirmed live on a real test call, 2026-09-11 (`call_records` row 08:30:56 UTC, 121s,
// ended_reason 'silence-timed-out'). The stored transcript opens:
//
//   "Hi, James. My name is Jim calling on behalf of We Help Los Angeles homeowners get free
//    consultations with vetted local experts..."
//
// — "on behalf of" running straight into the next sentence, because every one of the 10 live
// `profiles` rows had `company_name` NULL at the time. The field and its save path were both
// already correct (SettingsPage.tsx -> Settings > Company, RLS "Users can update own profile");
// it had simply never been filled in, and nothing told anyone it mattered.
//
// Mirrors `needsTimezoneAttention()` in ./timezones.ts deliberately — same shape, same job: one
// narrow "this config is silently wrong" predicate, named and unit-tested once, so the
// campaign-card banner and the start-campaign gate can never drift on what counts as missing.

/**
 * True when the account has no company name for the AI to say out loud on a call.
 *
 * Whitespace-only counts as missing: " " substitutes into the greeting exactly as badly as ""
 * does, and a user who typed a space into the field has not set a company name.
 */
export function needsCompanyName(companyName: string | null | undefined): boolean {
  return !companyName || companyName.trim().length === 0;
}
