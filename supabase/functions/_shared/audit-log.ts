// Phase 7 admin-module-plan (docs/admin-module-plan/PHASE-7-audit-and-hardening.md §A/§B) —
// the one write path to admin_audit_log. manage-users calls writeAuditLog() exactly once per
// action, whether it succeeded or was denied (§B.1/B.3), immediately after attempting its own
// state change.
//
// 🔀 Deviation, recorded rather than silent: §B.2 asks for "the same transaction as the
// change." This is NOT that — it's a second, separate INSERT issued right after the first
// write from the same service-role client. Same best-effort shape this file (manage-users)
// already uses for setGoTrueBan/revokeSessions: "a failure here must not abort the action that
// triggered it." A crash between the two statements would leave a real change with no audit
// row. Closing that fully needs every one of the 11 actions below rewritten as a single
// SECURITY DEFINER Postgres function doing both writes in one statement — out of scope for
// this pass (no live DB access this session to verify a rewrite that size against the real
// schema); flagged here and in PHASE-7-CHECKLIST.md's Notes rather than silently claimed done.
//
// This file mirrors (does not literally share — Deno edge functions can't import from src/,
// same reasoning src/lib/phone.ts already documents for scripts/import-leads.mjs) the
// AuditAction union and AUDIT_ACTION_META catalogue in src/lib/auditLog.ts. Keep the two in
// sync by hand if a new action is ever added to manage-users.

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
  | "user.password_reset_sent"

export interface AuditLogInput {
  actorId: string
  actorEmail: string | null
  action: AuditAction
  targetType?: string | null
  targetId?: string | null
  targetLabel?: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  reason?: string | null
  success: boolean
  ip?: string | null
}

// 🔒 §B.4 — defense in depth, not the only guard: no caller below should ever pass a token,
// code, or password in `before`/`after` in the first place (none of the 11 actions currently
// do). This strips any key whose name looks like one, recursively, so a future call site that
// forgets can't leak a secret into a table with no DELETE/UPDATE policy to fix it afterward.
const SECRET_KEY_PATTERN = /token|code|password|secret/i

export function redactSecrets<T>(value: T): T {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v)) as unknown as T
  if (typeof value !== "object") return value
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY_PATTERN.test(key) ? "[redacted]" : redactSecrets(val)
  }
  return out as T
}

// supabaseClient is deliberately left unannotated — same reasoning as manage-users/index.ts's
// own handleSetRole: eslint's @typescript-eslint/no-explicit-any covers this file too, and
// there is no <Database> generic on the client this project's edge functions create.
export async function writeAuditLog(supabaseClient, input: AuditLogInput): Promise<void> {
  const row = {
    actor_id: input.actorId,
    actor_email: input.actorEmail,
    action: input.action,
    target_type: input.targetType ?? "user",
    target_id: input.targetId ?? null,
    target_label: input.targetLabel ?? null,
    before: redactSecrets(input.before ?? null),
    after: redactSecrets(input.after ?? null),
    reason: input.reason ?? null,
    success: input.success,
    ip: input.ip ?? null,
  }
  const { error } = await supabaseClient.from("admin_audit_log").insert(row)
  if (error) {
    // §B.1/B.3: never throw — a broken audit log must not block, or unwind, an action that has
    // already happened (or already been correctly refused). Visible in function logs only;
    // this is the exact known gap the header comment above describes.
    console.error("manage-users: audit log write failed:", error.message, JSON.stringify(row))
  }
}

// §A (session-guard's own precedent, PHASE-5-ip-whitelisting.md §A) — cf-connecting-ip only,
// set by Cloudflare at the network edge and not forgeable by the client. Deliberately does NOT
// fall back to x-forwarded-for, same reasoning session-guard/index.ts already documents.
export function getClientIp(req: Request): string | null {
  return req.headers.get("cf-connecting-ip")
}
