import { describe, it, expect } from "vitest";
import { computeHasPermission, computeHasPermissionAtLeast, LEVEL_RANK } from "./AuthContext";

// Phase 2 (docs/admin-module-plan/PHASE-2-CHECKLIST.md §B.4/§F.1): computeHasPermission's
// signature changed from (role, permissions, permission) to (isSuper, permissions,
// permission) — the admin/super_admin string short-circuit is gone, replaced by
// roles.is_super (real data). These expectations are reviewed against §B's actual rule
// (isSuper bypasses everything, everyone else is exactly their permissions list), not
// rewritten just to turn the suite green.
describe("computeHasPermission", () => {
  it("short-circuits to true for a super role regardless of its permissions list", () => {
    expect(computeHasPermission(true, [], "campaigns")).toBe(true);
    expect(computeHasPermission(true, ["dashboard"], "finance")).toBe(true);
  });

  it("checks the permissions list for a non-super role, even one named 'admin'", () => {
    expect(computeHasPermission(false, ["dashboard", "campaigns"], "campaigns")).toBe(true);
    expect(computeHasPermission(false, ["dashboard"], "finance")).toBe(false);
    // The whole point of §B: a role called "admin" is no longer special by name. Only
    // isSuper (real data, roles.is_super) grants a bypass now.
    expect(computeHasPermission(false, [], "finance")).toBe(false);
  });

  it("denies everything when isSuper is false and there are no permissions", () => {
    expect(computeHasPermission(false, [], "dashboard")).toBe(false);
  });
});

// Permission-overrides plan Phase 4 §G/§J (docs/permission-overrides-plan/README.md) —
// computeHasPermissionAtLeast is the level-aware sibling of computeHasPermission, added so §H's
// action-gates can require more than mere presence (e.g. agents.chat_testing needs `full`, not
// just any grant, before a test can actually run — E20's own lesson).
describe("LEVEL_RANK", () => {
  it("orders view < edit < full, matching roleMatrix.ts's LEVEL_CYCLE", () => {
    expect(LEVEL_RANK.view).toBeLessThan(LEVEL_RANK.edit);
    expect(LEVEL_RANK.edit).toBeLessThan(LEVEL_RANK.full);
  });
});

describe("computeHasPermissionAtLeast", () => {
  it("short-circuits to true for a super role regardless of levels held", () => {
    expect(computeHasPermissionAtLeast(true, {}, "agents.chat_testing", "full")).toBe(true);
    expect(computeHasPermissionAtLeast(true, { "agents.chat_testing": "view" }, "agents.chat_testing", "full")).toBe(true);
  });

  it("denies a key held at a level below the required minimum", () => {
    // §H.3's own motivating case: support_manager holds agents.chat_testing at 'view', which
    // must not be enough to run a test (D-3: "view: See the panel. Cannot run a test").
    expect(computeHasPermissionAtLeast(false, { "agents.chat_testing": "view" }, "agents.chat_testing", "full")).toBe(false);
  });

  it("allows a key held at or above the required minimum", () => {
    expect(computeHasPermissionAtLeast(false, { "agents.chat_testing": "full" }, "agents.chat_testing", "full")).toBe(true);
    expect(computeHasPermissionAtLeast(false, { "campaigns.lead_management": "full" }, "campaigns.lead_management", "view")).toBe(true);
  });

  it("denies a key not held at all", () => {
    expect(computeHasPermissionAtLeast(false, {}, "campaigns.lead_management", "view")).toBe(false);
  });
});
