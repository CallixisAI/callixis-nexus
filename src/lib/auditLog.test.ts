import { describe, it, expect } from "vitest";
import { AUDIT_ACTIONS, describeAuditRow, redactSecrets, type AuditLogRow } from "./auditLog";

// PHASE-7-CHECKLIST.md E.2: "Test the audit-row shape per action type."

function makeRow(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
    id: 1,
    actor_id: "actor-id",
    actor_email: "james@callixis.ai",
    action: "user.blocked",
    target_type: "user",
    target_id: "target-id",
    target_label: "sarah@example.com",
    before: null,
    after: null,
    reason: null,
    success: true,
    ip: "203.0.113.9",
    created_at: "2026-08-28T00:00:00.000Z",
    ...overrides,
  };
}

describe("describeAuditRow", () => {
  it("matches the phase doc's own example verbatim", () => {
    // docs/admin-module-plan/PHASE-7-audit-and-hardening.md §C: "James blocked
    // sarah@example.com — reason: left the company"
    const row = makeRow({
      actor_email: "James",
      target_label: "sarah@example.com",
      action: "user.blocked",
      reason: "left the company",
    });
    expect(describeAuditRow(row)).toBe("James blocked sarah@example.com — reason: left the company");
  });

  it("omits the reason clause when no reason was given", () => {
    const row = makeRow({ actor_email: "James", action: "user.unblocked", reason: null });
    expect(describeAuditRow(row)).toBe("James unblocked sarah@example.com");
  });

  it("renders a denied attempt distinctly from a successful one", () => {
    const row = makeRow({
      actor_email: "James",
      action: "user.blocked",
      success: false,
      reason: "Cannot act on a user whose role outranks your own",
    });
    const description = describeAuditRow(row);
    expect(description).toContain("attempted to block");
    expect(description).toContain("denied");
    expect(description).toContain("Cannot act on a user whose role outranks your own");
  });

  it("falls back to a generic sentence for an action outside the known catalogue", () => {
    const row = makeRow({ action: "role.permissions_changed" });
    expect(() => describeAuditRow(row)).not.toThrow();
    expect(describeAuditRow(row)).toContain("role.permissions_changed");
  });

  it("falls back to 'Someone' / 'an unknown user' when denormalised fields are missing", () => {
    const row = makeRow({ actor_email: null, target_label: null });
    const description = describeAuditRow(row);
    expect(description).toContain("Someone");
    expect(description).toContain("an unknown user");
  });

  it("includes the granted role for an invite", () => {
    const row = makeRow({
      actor_email: "James",
      action: "user.invited",
      target_label: "new.hire@example.com",
      after: { role: "sales_manager" },
    });
    expect(describeAuditRow(row)).toBe("James invited new.hire@example.com as sales_manager");
  });

  // §A.2/S.3 — a deleted actor/target must still read as a legible sentence, not blow up or
  // silently disappear. The denormalised text fields are exactly what survives that FK's
  // ON DELETE SET NULL (actor) — target has no FK at all, by design (target_id is TEXT).
  it("stays legible after the actor is deleted (actor_id null, actor_email survives)", () => {
    const row = makeRow({ actor_id: null, actor_email: "former-admin@example.com" });
    expect(describeAuditRow(row)).toContain("former-admin@example.com");
  });

  it.each(AUDIT_ACTIONS)("produces a non-empty sentence for every known action: %s", (action) => {
    const successRow = makeRow({ action, reason: null });
    const deniedRow = makeRow({ action, success: false, reason: "denied for a test" });

    const successSentence = describeAuditRow(successRow);
    const deniedSentence = describeAuditRow(deniedRow);

    expect(successSentence.length).toBeGreaterThan(0);
    expect(successSentence).toContain(successRow.actor_email);
    expect(deniedSentence).toContain("denied");
    expect(deniedSentence).toContain("denied for a test");
  });
});

describe("redactSecrets", () => {
  it("redacts top-level keys matching token/code/password/secret, case-insensitively", () => {
    const input = { token_hash: "abc", CODE: "1234", password: "hunter2", secretValue: "x", role: "admin" };
    expect(redactSecrets(input)).toEqual({
      token_hash: "[redacted]",
      CODE: "[redacted]",
      password: "[redacted]",
      secretValue: "[redacted]",
      role: "admin",
    });
  });

  it("redacts nested objects and arrays recursively", () => {
    const input = { overrides: [{ permission_key: "campaigns", effect: "allow" }], meta: { access_token: "abc" } };
    expect(redactSecrets(input)).toEqual({
      overrides: [{ permission_key: "campaigns", effect: "allow" }],
      meta: { access_token: "[redacted]" },
    });
  });

  it("passes through null and non-object values unchanged", () => {
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets(undefined)).toBeUndefined();
    expect(redactSecrets("plain string")).toBe("plain string");
    expect(redactSecrets(42)).toBe(42);
  });
});
