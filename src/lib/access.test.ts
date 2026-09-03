import { describe, it, expect } from "vitest";
import { canAccess } from "./access";

// Phase 2 (docs/admin-module-plan/PHASE-2-CHECKLIST.md §F.2): canAccess's requirement shrank
// to just `requirePermission` — `requireRole` is gone along with the role-based /admin
// stopgap it existed for (see access.ts's own comment). isSuper (real data) replaces the old
// role === "admin" bypass computeHasPermission used to hardcode.
describe("canAccess", () => {
  it("is pending while the profile hasn't loaded yet, regardless of requirement", () => {
    expect(canAccess({ profileLoaded: false, isSuper: false, permissions: [] })).toBe("pending");
    expect(
      canAccess(
        { profileLoaded: false, isSuper: true, permissions: [] },
        { requirePermission: "admin.roles_invites" }
      )
    ).toBe("pending");
  });

  it("allows a loaded user when no requirement is set", () => {
    expect(canAccess({ profileLoaded: true, isSuper: false, permissions: [] })).toBe("allowed");
  });

  it("enforces requirePermission via computeHasPermission (isSuper bypasses)", () => {
    expect(
      canAccess(
        { profileLoaded: true, isSuper: false, permissions: ["campaigns"] },
        { requirePermission: "campaigns" }
      )
    ).toBe("allowed");
    expect(
      canAccess({ profileLoaded: true, isSuper: false, permissions: [] }, { requirePermission: "campaigns" })
    ).toBe("denied");
    expect(
      canAccess({ profileLoaded: true, isSuper: true, permissions: [] }, { requirePermission: "finance" })
    ).toBe("allowed");
  });

  it("gates /admin on the admin.roles_invites permission, not a role string", () => {
    // Phase 2 §D.3: /admin's real gate. A plain, non-super role with no explicit grant on
    // this key is denied — this is the source matrix's decision (Phase 1 D-2), not a bug.
    expect(
      canAccess(
        { profileLoaded: true, isSuper: false, permissions: ["dashboard"] },
        { requirePermission: "admin.roles_invites" }
      )
    ).toBe("denied");
    expect(
      canAccess(
        { profileLoaded: true, isSuper: false, permissions: ["admin.roles_invites"] },
        { requirePermission: "admin.roles_invites" }
      )
    ).toBe("allowed");
    expect(
      canAccess(
        { profileLoaded: true, isSuper: true, permissions: [] },
        { requirePermission: "admin.roles_invites" }
      )
    ).toBe("allowed");
  });
});
