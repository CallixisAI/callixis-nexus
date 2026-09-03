import { describe, it, expect } from "vitest";
import { APP_PERMISSIONS, getFirstAccessibleRoute } from "./permissions";

// Phase 2 (docs/admin-module-plan/PHASE-2-CHECKLIST.md §F.3) — Login landing-route selection.
// Pure logic, so it's tested directly rather than through Login.tsx/LandingRedirect.
describe("getFirstAccessibleRoute", () => {
  it("returns null for a user with no permissions and no super access — the role-not-yet-granted case", () => {
    expect(getFirstAccessibleRoute(false, [])).toBeNull();
  });

  it("picks the first catalogue entry the user has, in APP_PERMISSIONS order", () => {
    // Has both dashboard and finance — dashboard comes first in the catalogue and wins,
    // regardless of the order the permissions array happens to list them in.
    expect(getFirstAccessibleRoute(false, ["finance", "dashboard"])).toBe("/dashboard");
  });

  it("skips permissions the user doesn't have and lands on the first one they do", () => {
    expect(getFirstAccessibleRoute(false, ["finance"])).toBe("/finance");
  });

  it("a super user lands on the catalogue's first entry (dashboard), not /admin", () => {
    // isSuper bypasses every check, so the first APP_PERMISSIONS entry always matches —
    // this is exactly why admin.roles_invites is ordered last in the catalogue.
    expect(getFirstAccessibleRoute(true, [])).toBe(APP_PERMISSIONS[0].route);
    expect(getFirstAccessibleRoute(true, [])).toBe("/dashboard");
  });

  it("a user holding only admin.roles_invites lands on /admin, not nothing", () => {
    expect(getFirstAccessibleRoute(false, ["admin.roles_invites"])).toBe("/admin");
  });
});
