import { describe, it, expect } from "vitest";
import {
  buildMatrix,
  cloneMatrix,
  cycleLevel,
  diffMatrix,
  formatRoleDiffSummary,
  affectedUserCount,
  canEditRoleMatrixRow,
  canGrantPermission,
  wouldStripLastRolesInvitesHolder,
  canDeleteRole,
  canRenameRole,
  slugifyRoleKey,
  friendlyDbError,
  permissionsGrantedByRole,
  type RoleRow,
  type RolePermissionRow,
} from "./roleMatrix";

const role = (overrides: Partial<RoleRow> = {}): RoleRow => ({
  key: "sales_manager",
  label: "Sales Manager",
  description: null,
  is_system: false,
  is_super: false,
  rank: 30,
  ...overrides,
});

describe("buildMatrix / cloneMatrix", () => {
  const rows: RolePermissionRow[] = [
    { role_key: "admin", permission_key: "finance.budget", level: "full" },
    { role_key: "admin", permission_key: "reports.export", level: "view" },
    { role_key: "operator", permission_key: "reports.export", level: "view" },
  ];

  it("groups flat rows by role then permission", () => {
    const matrix = buildMatrix(rows);
    expect(matrix.admin["finance.budget"]).toBe("full");
    expect(matrix.admin["reports.export"]).toBe("view");
    expect(matrix.operator["reports.export"]).toBe("view");
  });

  it("clone produces an independent copy", () => {
    const matrix = buildMatrix(rows);
    const clone = cloneMatrix(matrix);
    clone.admin["finance.budget"] = "view";
    expect(matrix.admin["finance.budget"]).toBe("full");
  });
});

describe("cycleLevel", () => {
  it("cycles none -> view -> edit -> full -> none", () => {
    expect(cycleLevel(null)).toBe("view");
    expect(cycleLevel("view")).toBe("edit");
    expect(cycleLevel("edit")).toBe("full");
    expect(cycleLevel("full")).toBe(null);
  });
});

describe("diffMatrix", () => {
  it("omits roles with no change", () => {
    const original = buildMatrix([{ role_key: "admin", permission_key: "reports.export", level: "view" }]);
    const staged = cloneMatrix(original);
    expect(diffMatrix(original, staged)).toEqual([]);
  });

  it("detects an added grant", () => {
    const original = buildMatrix([]);
    const staged = buildMatrix([{ role_key: "sales_manager", permission_key: "finance.revenue_reports", level: "edit" }]);
    const diffs = diffMatrix(original, staged);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({
      roleKey: "sales_manager",
      added: [{ permissionKey: "finance.revenue_reports", from: null, to: "edit" }],
      removed: [],
      changed: [],
    });
  });

  it("detects a removed grant", () => {
    const original = buildMatrix([{ role_key: "sales_manager", permission_key: "calendar.schedule_sync", level: "full" }]);
    const staged = buildMatrix([]);
    const diffs = diffMatrix(original, staged);
    expect(diffs[0].removed).toEqual([{ permissionKey: "calendar.schedule_sync", from: "full", to: null }]);
  });

  it("detects a level change distinctly from add/remove", () => {
    const original = buildMatrix([{ role_key: "support_manager", permission_key: "reports.export", level: "view" }]);
    const staged = buildMatrix([{ role_key: "support_manager", permission_key: "reports.export", level: "full" }]);
    const diffs = diffMatrix(original, staged);
    expect(diffs[0].changed).toEqual([{ permissionKey: "reports.export", from: "view", to: "full" }]);
    expect(diffs[0].added).toEqual([]);
    expect(diffs[0].removed).toEqual([]);
  });

  it("handles multiple roles changing at once", () => {
    const original = buildMatrix([{ role_key: "admin", permission_key: "reports.export", level: "full" }]);
    const staged = buildMatrix([
      { role_key: "admin", permission_key: "reports.export", level: "full" },
      { role_key: "operator", permission_key: "reports.export", level: "view" },
    ]);
    const diffs = diffMatrix(original, staged);
    expect(diffs.map((d) => d.roleKey).sort()).toEqual(["operator"]);
  });
});

describe("formatRoleDiffSummary", () => {
  const labelFor = (key: string) => ({ finance: "Finance", calendar: "Calendar", reports: "Reports" }[key] ?? key);

  it("matches the phase doc's own example shape: +Finance, −Calendar", () => {
    const diff = {
      roleKey: "brand_manager",
      added: [{ permissionKey: "finance", from: null, to: "full" as const }],
      removed: [{ permissionKey: "calendar", from: "view" as const, to: null }],
      changed: [],
    };
    expect(formatRoleDiffSummary("Brand Manager", diff, labelFor)).toBe("Brand Manager: +Finance, −Calendar");
  });

  it("renders a level change as Before→After", () => {
    const diff = {
      roleKey: "x",
      added: [],
      removed: [],
      changed: [{ permissionKey: "reports", from: "view" as const, to: "full" as const }],
    };
    expect(formatRoleDiffSummary("X", diff, labelFor)).toBe("X: Reports (View→Full)");
  });
});

describe("affectedUserCount", () => {
  it("sums user counts only for roles that actually changed", () => {
    const diffs = [
      { roleKey: "admin", added: [], removed: [{ permissionKey: "x", from: "full" as const, to: null }], changed: [] },
      { roleKey: "operator", added: [{ permissionKey: "y", from: null, to: "view" as const }], removed: [], changed: [] },
    ];
    const counts = { admin: 3, operator: 5, untouched_role: 100 };
    expect(affectedUserCount(diffs, counts)).toBe(8);
  });

  it("is zero for no diffs", () => {
    expect(affectedUserCount([], { admin: 3 })).toBe(0);
  });
});

describe("canEditRoleMatrixRow", () => {
  it("refuses a super role regardless of actor rank", () => {
    const result = canEditRoleMatrixRow(0, role({ is_super: true, rank: 0 }));
    expect(result.allowed).toBe(false);
  });

  it("refuses a role that outranks the actor", () => {
    const result = canEditRoleMatrixRow(20, role({ rank: 10 }));
    expect(result.allowed).toBe(false);
  });

  it("allows a role at or below the actor's own rank", () => {
    expect(canEditRoleMatrixRow(10, role({ rank: 10 })).allowed).toBe(true);
    expect(canEditRoleMatrixRow(10, role({ rank: 30 })).allowed).toBe(true);
  });
});

describe("canGrantPermission", () => {
  it("allows granting a permission the actor holds", () => {
    const held = new Set(["finance.budget"]);
    expect(canGrantPermission(held, "finance.budget", null, "full").allowed).toBe(true);
  });

  it("refuses granting a permission the actor lacks", () => {
    const held = new Set<string>();
    expect(canGrantPermission(held, "finance.budget", null, "full").allowed).toBe(false);
  });

  it("never refuses a removal, even without holding the permission", () => {
    const held = new Set<string>();
    expect(canGrantPermission(held, "finance.budget", "full", null).allowed).toBe(true);
  });

  it("never refuses a downgrade to a level the actor doesn't separately hold", () => {
    // to !== from but to is "lower" isn't modeled here (levels aren't ordinal to this fn);
    // only escalation (to !== from, to !== null) is checked, which is intentional per the
    // migration's own enforce_role_permissions_grant_ceiling — it only gates INSERT/UPDATE.
    const held = new Set(["x"]);
    expect(canGrantPermission(held, "x", "full", "view").allowed).toBe(true);
  });
});

describe("wouldStripLastRolesInvitesHolder", () => {
  it("is false while a super role exists, even with no matrix grant", () => {
    const roles = [role({ key: "super_admin", is_super: true, is_system: true, rank: 0 })];
    expect(wouldStripLastRolesInvitesHolder({}, roles)).toBe(false);
  });

  it("is true when no role holds it and no super role exists", () => {
    const roles = [role({ key: "sales_manager" })];
    expect(wouldStripLastRolesInvitesHolder({}, roles)).toBe(true);
  });

  it("is false when a non-super role explicitly holds it", () => {
    const roles = [role({ key: "it_manager" })];
    const staged = { it_manager: { "admin.roles_invites": "full" as const } };
    expect(wouldStripLastRolesInvitesHolder(staged, roles)).toBe(false);
  });
});

describe("canDeleteRole", () => {
  it("refuses a system role", () => {
    expect(canDeleteRole(role({ is_system: true }), 0).allowed).toBe(false);
  });

  it("refuses a role with assigned users and names the count", () => {
    const result = canDeleteRole(role(), 4);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("4 users");
  });

  it("uses singular phrasing for exactly one user", () => {
    const result = canDeleteRole(role(), 1);
    expect(result.reason).toContain("1 user.");
  });

  it("allows deleting a non-system role with zero users", () => {
    expect(canDeleteRole(role(), 0).allowed).toBe(true);
  });
});

describe("canRenameRole", () => {
  it("refuses a system role", () => {
    expect(canRenameRole(role({ is_system: true })).allowed).toBe(false);
  });

  it("allows a non-system role", () => {
    expect(canRenameRole(role()).allowed).toBe(true);
  });
});

describe("slugifyRoleKey", () => {
  it("matches the phase doc's own example", () => {
    expect(slugifyRoleKey("Support Agent")).toBe("support_agent");
  });

  it("collapses punctuation and repeated separators", () => {
    expect(slugifyRoleKey("  IT / Ops -- Lead!! ")).toBe("it_ops_lead");
  });

  it("lowercases", () => {
    expect(slugifyRoleKey("SUPERVISOR")).toBe("supervisor");
  });
});

describe("friendlyDbError", () => {
  it("gives a specific message for a foreign key violation", () => {
    expect(friendlyDbError({ code: "23503" })).toMatch(/still in use/);
  });

  it("passes through a trigger's own RAISE EXCEPTION message", () => {
    expect(friendlyDbError({ message: "cannot grant a permission you do not hold yourself: finance.budget" })).toBe(
      "cannot grant a permission you do not hold yourself: finance.budget"
    );
  });

  it("falls back for a null/empty error", () => {
    expect(friendlyDbError(null)).toMatch(/went wrong/);
    expect(friendlyDbError({ message: "" })).toMatch(/went wrong/);
  });
});

// Permission-overrides plan (docs/permission-overrides-plan/README.md, Phase 1 §B.12/D.2) —
// the invite dialog's and EditInviteDialog's shared "what does this role grant" preview.
describe("permissionsGrantedByRole", () => {
  const rows: RolePermissionRow[] = [
    { role_key: "admin", permission_key: "dashboard", level: "view" },
    { role_key: "admin", permission_key: "campaigns", level: "view" },
    { role_key: "operator", permission_key: "dashboard", level: "view" },
  ];

  it("returns every permission key the role has a row for, at any level", () => {
    expect(permissionsGrantedByRole("admin", rows)).toEqual(["dashboard", "campaigns"]);
  });

  it("does not include another role's grants", () => {
    expect(permissionsGrantedByRole("operator", rows)).toEqual(["dashboard"]);
  });

  it("returns an empty list for a role with no rows at all", () => {
    expect(permissionsGrantedByRole("pending_role_review", rows)).toEqual([]);
  });

  it("returns an empty list for an empty matrix", () => {
    expect(permissionsGrantedByRole("admin", [])).toEqual([]);
  });
});
