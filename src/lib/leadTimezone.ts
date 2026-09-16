// lead-enrichment plan §C.3/D-4 — US ZIP prefix -> IANA timezone, so `leads.timezone` (which
// already exists and already drives dispatch-batch's work-hours guard) is finally populated on
// upload instead of sitting NULL forever. D-4's own reasoning: `phone_region` is inconsistent in
// the source file (sometimes a state, sometimes "City, ST") and describes where the *number* was
// issued, not where the person lives — a clean 5-digit ZIP is the more reliable signal.
//
// This is a deliberately conservative, non-exhaustive table, not a licensed ZIP database. Most US
// states sit entirely in one timezone and are mapped with high confidence. A handful of states are
// genuinely split across two zones at the county level (FL panhandle, TN, IN, MI's western UP, KY,
// TX's El Paso pocket, ID's panhandle, NE/SD's western edge) — for those, only the sub-ranges this
// file is reasonably confident about are mapped; anything in between is deliberately left
// unmapped and returns null, per this plan's own C.5 rule: "do not invent a timezone when unknown
// — a wrong guess dials someone at 2am." A null result is not a bug, it's the safety net working;
// the caller falls back to the campaign's own timezone.
//
// Verified precisely for the one real, immediate use case (`docs/lead-enrichment-plan/README.md`'s
// 2000+ row Los Angeles list): the entire California range (900-961) maps to America/Los_Angeles.

interface Zip3Range {
  start: number; // inclusive
  end: number; // inclusive
  tz: string;
}

// Ordered by start; timezoneForZip does a linear scan, which is plenty fast for a table this size
// and keeps the data readable as plain ranges rather than a 1000-entry lookup object.
const ZIP3_RANGES: Zip3Range[] = [
  // ── Puerto Rico (Atlantic, no DST) ──────────────────────────────────────────────
  { start: 6, end: 9, tz: "America/Puerto_Rico" },

  // ── Eastern ──────────────────────────────────────────────────────────────────────
  { start: 10, end: 27, tz: "America/New_York" }, // MA
  { start: 28, end: 29, tz: "America/New_York" }, // RI
  { start: 30, end: 38, tz: "America/New_York" }, // NH
  { start: 39, end: 49, tz: "America/New_York" }, // ME
  { start: 50, end: 59, tz: "America/New_York" }, // VT
  { start: 60, end: 69, tz: "America/New_York" }, // CT
  { start: 70, end: 89, tz: "America/New_York" }, // NJ
  { start: 100, end: 149, tz: "America/New_York" }, // NY
  { start: 150, end: 196, tz: "America/New_York" }, // PA
  { start: 197, end: 199, tz: "America/New_York" }, // DE
  { start: 200, end: 205, tz: "America/New_York" }, // DC
  { start: 206, end: 219, tz: "America/New_York" }, // MD
  { start: 220, end: 246, tz: "America/New_York" }, // VA
  { start: 247, end: 268, tz: "America/New_York" }, // WV
  { start: 270, end: 289, tz: "America/New_York" }, // NC
  { start: 290, end: 299, tz: "America/New_York" }, // SC
  { start: 300, end: 319, tz: "America/New_York" }, // GA
  { start: 398, end: 399, tz: "America/New_York" }, // GA (Savannah-area zip3s)
  // FL: mapped conservatively — Tallahassee (323) is Eastern; the Pensacola/Panama City/Fort
  // Walton panhandle (324-325) is Central. Everything else in FL's 320-349 range is Eastern.
  { start: 320, end: 322, tz: "America/New_York" },
  { start: 326, end: 349, tz: "America/New_York" },
  // OH
  { start: 430, end: 459, tz: "America/New_York" },
  // MI — all Eastern except the far-western Upper Peninsula (499), carved out below as Central.
  { start: 480, end: 498, tz: "America/New_York" },
  // IN — all Eastern except the Gary/Hammond (463-464) and Evansville (477) pockets, Central below.
  { start: 460, end: 462, tz: "America/New_York" },
  { start: 465, end: 474, tz: "America/New_York" },
  { start: 478, end: 479, tz: "America/New_York" },
  // KY — all Eastern except the western strip (420-427: Paducah, Bowling Green), Central below.
  { start: 400, end: 419, tz: "America/New_York" },

  // ── Central ──────────────────────────────────────────────────────────────────────
  { start: 323, end: 325, tz: "America/Chicago" }, // FL panhandle (Pensacola/Panama City)
  { start: 463, end: 464, tz: "America/Chicago" }, // IN — Gary/Hammond
  { start: 477, end: 477, tz: "America/Chicago" }, // IN — Evansville
  { start: 420, end: 427, tz: "America/Chicago" }, // KY — Paducah/Bowling Green
  { start: 499, end: 499, tz: "America/Chicago" }, // MI — far-western Upper Peninsula
  { start: 350, end: 369, tz: "America/Chicago" }, // AL
  { start: 386, end: 397, tz: "America/Chicago" }, // MS
  // TN — only the high-confidence Nashville/Memphis chunks; the rest is left unmapped (see the
  // file header) rather than guessed, since a Central/Eastern flip is exactly the wrong-hour bug
  // this plan exists to prevent.
  { start: 370, end: 372, tz: "America/Chicago" },
  { start: 380, end: 381, tz: "America/Chicago" },
  { start: 600, end: 629, tz: "America/Chicago" }, // IL
  { start: 530, end: 549, tz: "America/Chicago" }, // WI
  { start: 550, end: 567, tz: "America/Chicago" }, // MN
  { start: 500, end: 528, tz: "America/Chicago" }, // IA
  { start: 630, end: 658, tz: "America/Chicago" }, // MO
  { start: 660, end: 679, tz: "America/Chicago" }, // KS (state law puts all of KS on Central)
  { start: 680, end: 692, tz: "America/Chicago" }, // NE (excl. 693 panhandle, Mountain below)
  { start: 570, end: 576, tz: "America/Chicago" }, // SD (excl. 577 west-river, Mountain below)
  { start: 580, end: 588, tz: "America/Chicago" }, // ND
  { start: 716, end: 729, tz: "America/Chicago" }, // AR
  { start: 700, end: 714, tz: "America/Chicago" }, // LA
  { start: 730, end: 749, tz: "America/Chicago" }, // OK
  { start: 750, end: 797, tz: "America/Chicago" }, // TX (excl. 798-799 El Paso, Mountain below)

  // ── Mountain ─────────────────────────────────────────────────────────────────────
  { start: 693, end: 693, tz: "America/Denver" }, // NE panhandle (Scottsbluff)
  { start: 577, end: 577, tz: "America/Denver" }, // SD west-river (Rapid City)
  { start: 798, end: 799, tz: "America/Denver" }, // TX — El Paso
  { start: 590, end: 599, tz: "America/Denver" }, // MT
  { start: 820, end: 831, tz: "America/Denver" }, // WY
  { start: 800, end: 816, tz: "America/Denver" }, // CO
  { start: 870, end: 884, tz: "America/Denver" }, // NM
  { start: 840, end: 847, tz: "America/Denver" }, // UT
  // ID — the panhandle (838: Coeur d'Alene/Moscow area) observes Pacific time; the rest of the
  // state is Mountain.
  { start: 832, end: 837, tz: "America/Denver" },
  { start: 839, end: 839, tz: "America/Denver" },
  { start: 838, end: 838, tz: "America/Los_Angeles" }, // ID panhandle
  // AZ does not observe DST, so it needs its own IANA zone rather than America/Denver even though
  // the offset matches Mountain Standard Time year-round.
  { start: 850, end: 865, tz: "America/Phoenix" },

  // ── Pacific ──────────────────────────────────────────────────────────────────────
  // CA — the one range this plan's real data actually needs, and the one verified most carefully.
  { start: 900, end: 961, tz: "America/Los_Angeles" },
  { start: 889, end: 898, tz: "America/Los_Angeles" }, // NV
  { start: 970, end: 979, tz: "America/Los_Angeles" }, // OR
  { start: 980, end: 994, tz: "America/Los_Angeles" }, // WA

  // ── Alaska / Hawaii ──────────────────────────────────────────────────────────────
  { start: 995, end: 999, tz: "America/Anchorage" }, // AK
  { start: 967, end: 968, tz: "Pacific/Honolulu" }, // HI
];

/**
 * `zip` -> IANA timezone, or `null` when the ZIP is malformed, out of range, or falls in a
 * deliberately-unmapped (ambiguous) chunk. Never guesses — see the file header for why.
 */
export function timezoneForZip(zip: string | null | undefined): string | null {
  if (!zip) return null;
  const digits = String(zip).trim().replace(/[^\d]/g, "");
  if (digits.length < 3) return null;
  const zip3 = parseInt(digits.slice(0, 3), 10);
  if (!Number.isFinite(zip3)) return null;

  for (const range of ZIP3_RANGES) {
    if (zip3 >= range.start && zip3 <= range.end) return range.tz;
  }
  return null;
}
