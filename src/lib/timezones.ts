// Call-quality plan (docs/call-quality-plan/README.md) §C.1 — timezone handling, following the
// src/lib/voices.ts / src/lib/industries.ts precedent: a curated list, not a browser API this
// project's TS target doesn't have.
//
// 🔴 Not `Intl.supportedValuesOf('timeZone')` — `tsconfig.app.json` pins `"target": "ES2020"`
// (`"lib": ["ES2020","DOM","DOM.Iterable"]`), and that method isn't in the TS lib types at that
// target (E10 — `grep -rn "resolvedOptions" src/` was zero matches before this file, confirming
// nothing here has ever touched the modern API either). Bumping `lib` to fix one dropdown is a
// change with a much wider blast radius than this file — ship a curated list instead.

export const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Moscow",
  "Africa/Lagos",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Manila",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Perth",
  "Pacific/Auckland",
] as const;

export type CuratedTimezone = (typeof TIMEZONES)[number];

// Mirrors — does not share — `isWithinWorkHours()`'s own try/catch in
// supabase/functions/dispatch-batch/index.ts (Deno can't import from src/, the same cross-runtime
// boundary src/lib/phone.ts already documents), so the two can never disagree about what counts
// as a recognised IANA zone. A genuine typo (`Asia/Manilla`) throws here exactly as it does there
// — this is what lets §C.4 catch the same mistake at save time that today only surfaces later,
// silently, as a campaign that never dials anyone (E9).
//
// 🔴 Verified against the real runtime, not assumed: `Intl.DateTimeFormat`'s timezone
// canonicalization is case-INsensitive per ECMA-402, so a wrong-case zone (`ASIA/MANILA`) does
// NOT throw here, or in the dispatcher's identical check — both correctly resolve it. E9's
// "wrong case" example turns out not to be a real instance of the bug it was grouped with; only
// a genuine typo is. See timezones.test.ts's own note on this.
export function isValidIanaZone(tz: string | null | undefined): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Falls back to "UTC" on anything that throws (a locked-down environment, an old browser, a test
// runner with a stripped-down Intl) rather than ever propagating an error up to a form that just
// wants a sensible default. Also falls back to "UTC" if the browser somehow reports a zone this
// project's own validator rejects — better a known-safe default than an unvalidated string
// reaching an insert.
export function detectBrowserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidIanaZone(tz) ? tz : "UTC";
  } catch {
    return "UTC";
  }
}

// §C.5 — deliberately narrow. Fires ONLY for the one case this plan actually knows is a bug: a
// campaign that landed on the database default because the insert never set a value at all (E8),
// viewed from a browser that isn't itself in UTC. See the plan doc's own §C.5a for the three
// false-positive classes a general "does this differ from my browser" check would produce
// instead — a legitimate US campaign run from Manila, `Asia/Calcutta` vs `Asia/Kolkata` reading
// as different strings for the same zone, and the banner disagreeing between teammates on the
// same campaign. This predicate can't produce any of those: it only ever fires when the stored
// value is the literal string `"UTC"`.
export function needsTimezoneAttention(campaignTz: string | null | undefined, browserTz: string): boolean {
  return campaignTz === "UTC" && browserTz !== "UTC";
}
