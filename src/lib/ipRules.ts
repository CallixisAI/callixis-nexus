// Phase 5 admin-module-plan (docs/admin-module-plan/PHASE-5-ip-whitelisting.md §B.1/B.4) —
// pure logic, no DB, unit-tested. Mirrors src/lib/roleMatrix.ts's "the real control is a DB
// constraint/trigger; this is the client-side convenience that avoids a confusing error" split.
//
// The real control is the migration's CHECK constraint (user_ip_rules_not_too_broad — rejects
// anything broader than /24 for IPv4 or /48 for IPv6). This function exists only so a user
// typing a bare "203.0.113.9" gets "203.0.113.9/32" instead of a raw Postgres error about
// `inet` parsing.
export function normalizeCidrInput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes("/")) return trimmed;
  return trimmed.includes(":") ? `${trimmed}/128` : `${trimmed}/32`;
}
