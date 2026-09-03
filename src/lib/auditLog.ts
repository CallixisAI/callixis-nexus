// Phase 7 admin-module-plan (docs/admin-module-plan/PHASE-7-audit-and-hardening.md §C) — pure,
// no DB, unit-tested. Two jobs:
//
// 1. AuditAction/AUDIT_ACTIONS mirrors supabase/functions/_shared/audit-log.ts's own union.
//    Deno edge functions can't import from src/, and this project's Vitest suite deliberately
//    doesn't reach into supabase/functions (same cross-runtime boundary src/lib/phone.ts
//    already documents for scripts/import-leads.mjs) — so this is a hand-kept-in-sync
//    duplicate, not a shared import. Keep the two lists identical if a new action is added.
//
// 2. describeAuditRow() is §C.3's "plain language, not raw JSON" renderer the audit viewer
//    (AuditTab.tsx) calls per row, and redactSecrets() is the same defense-in-depth guard the
//    write side already applies, duplicated here so the viewer never renders a secret even if
//    one somehow reached the table.

export type AuditAction =
  | "user.invited"
  | "user.role_changed"
  | "user.permissions_changed"
  | "user.blocked"
  | "user.unblocked"
  | "user.frozen"
  | "user.unfrozen"
  | "user.removed"
  | "user.restored"
  | "user.force_signout"
  | "user.password_reset_sent";

export interface AuditLogRow {
  id: number;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  success: boolean;
  ip: string | null;
  created_at: string;
}

interface ActionVerbs {
  /** §C.2's filter dropdown. */
  label: string;
  /** Success phrasing: "James {past}". */
  past: string;
  /** Denial phrasing: "James attempted to {infinitive} — denied". */
  infinitive: string;
}

const TARGET_FALLBACK = "an unknown user";

function target(row: AuditLogRow): string {
  return row.target_label || TARGET_FALLBACK;
}

function actor(row: AuditLogRow): string {
  return row.actor_email || "Someone";
}

export const AUDIT_ACTION_VERBS: Record<AuditAction, (row: AuditLogRow) => ActionVerbs> = {
  "user.invited": (row) => ({
    label: "Invited user",
    past: `invited ${target(row)}${row.after?.role ? ` as ${row.after.role}` : ""}`,
    infinitive: `invite ${target(row)}`,
  }),
  "user.role_changed": (row) => ({
    label: "Changed role",
    past: `changed ${target(row)}'s role${row.after?.role ? ` to ${row.after.role}` : ""}`,
    infinitive: `change ${target(row)}'s role`,
  }),
  "user.permissions_changed": (row) => ({
    label: "Changed permissions",
    past: `changed ${target(row)}'s permission overrides`,
    infinitive: `change ${target(row)}'s permission overrides`,
  }),
  "user.blocked": (row) => ({
    label: "Blocked user",
    past: `blocked ${target(row)}`,
    infinitive: `block ${target(row)}`,
  }),
  "user.unblocked": (row) => ({
    label: "Unblocked user",
    past: `unblocked ${target(row)}`,
    infinitive: `unblock ${target(row)}`,
  }),
  "user.frozen": (row) => ({
    label: "Froze user",
    past: `froze ${target(row)}`,
    infinitive: `freeze ${target(row)}`,
  }),
  "user.unfrozen": (row) => ({
    label: "Unfroze user",
    past: `unfroze ${target(row)}`,
    infinitive: `unfreeze ${target(row)}`,
  }),
  "user.removed": (row) => ({
    label: "Removed user",
    past: `removed ${target(row)}`,
    infinitive: `remove ${target(row)}`,
  }),
  "user.restored": (row) => ({
    label: "Restored user",
    past: `restored ${target(row)}`,
    infinitive: `restore ${target(row)}`,
  }),
  "user.force_signout": (row) => ({
    label: "Forced sign-out",
    past: `force-signed-out ${target(row)}`,
    infinitive: `force-sign-out ${target(row)}`,
  }),
  "user.password_reset_sent": (row) => ({
    label: "Sent password reset",
    past: `sent a password reset to ${target(row)}`,
    infinitive: `send a password reset to ${target(row)}`,
  }),
};

export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_VERBS) as AuditAction[];

// §C.3 — the phase doc's own example is "James blocked sarah@example.com — reason: left the
// company"; success + a reason on 'user.blocked' produces that sentence verbatim (see
// auditLog.test.ts). Falls back to a generic sentence for any action this catalogue doesn't
// recognise (e.g. a future action added to manage-users before this file's mirror is updated)
// rather than throwing — a viewer rendering historical rows must never crash on one.
export function describeAuditRow(row: AuditLogRow): string {
  const verbs = AUDIT_ACTION_VERBS[row.action as AuditAction]?.(row);

  if (!verbs) {
    const base = row.success
      ? `${actor(row)} performed "${row.action}" on ${target(row)}`
      : `${actor(row)} attempted "${row.action}" on ${target(row)} — denied`;
    if (!row.reason) return base;
    return row.success ? `${base} — reason: ${row.reason}` : `${base}: ${row.reason}`;
  }

  if (row.success) {
    const sentence = `${actor(row)} ${verbs.past}`;
    return row.reason ? `${sentence} — reason: ${row.reason}` : sentence;
  }

  const sentence = `${actor(row)} attempted to ${verbs.infinitive} — denied`;
  return row.reason ? `${sentence}: ${row.reason}` : sentence;
}

const SECRET_KEY_PATTERN = /token|code|password|secret/i;

// 🔒 §B.4/S.4 — mirrors supabase/functions/_shared/audit-log.ts's own redactSecrets(). Defense
// in depth on the read side too: the viewer never renders a secret even if one somehow reached
// the table despite the write-side guard.
export function redactSecrets<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v)) as unknown as T;
  if (typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY_PATTERN.test(key) ? "[redacted]" : redactSecrets(val);
  }
  return out as T;
}
