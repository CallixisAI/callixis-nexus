import { describe, it, expect } from "vitest";
import { mergeUserDirectory } from "./userDirectory";
import type { Database } from "@/integrations/supabase/types";

// PHASE-7-CHECKLIST.md E.1: "Extract the invite-list merge from fetchUsers and test it."

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type UserRoleRow = Database["public"]["Tables"]["user_roles"]["Row"];
type UserPermissionRow = Database["public"]["Tables"]["user_permissions"]["Row"];
type UserInviteRow = Database["public"]["Tables"]["user_invites"]["Row"];

function makeProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "user-1",
    email: "user1@example.com",
    full_name: "User One",
    phone: null,
    avatar_url: null,
    company_name: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    status: "active",
    status_reason: null,
    frozen_until: null,
    status_changed_at: null,
    status_changed_by: null,
    ...overrides,
  };
}

function makeInvite(overrides: Partial<UserInviteRow> = {}): UserInviteRow {
  return {
    id: "invite-1",
    email: "invite1@example.com",
    full_name: "Invite One",
    phone: null,
    role: "operator",
    // Permission-overrides plan (docs/permission-overrides-plan/README.md, Phase 1, D-1) —
    // `[]` is the new-shape default: every invite created after that phase carries no
    // personal permission list at all. Tests that need to exercise a stale pre-fix row
    // (D-2's 4 leftover invites) override this explicitly.
    permissions: [],
    status: "pending",
    token_hash: null,
    code_hash: null,
    expires_at: null,
    attempt_count: 0,
    accepted_at: null,
    invited_by: null,
    ...overrides,
  } as UserInviteRow;
}

describe("mergeUserDirectory", () => {
  it("maps a profile with a role and permissions into a UserDisplay row", () => {
    const profiles = [makeProfile()];
    const roles: UserRoleRow[] = [{ id: "r1", user_id: "user-1", role: "admin" } as UserRoleRow];
    const perms: UserPermissionRow[] = [
      { id: "p1", user_id: "user-1", permission_key: "campaigns", effect: "allow", created_at: null } as UserPermissionRow,
      { id: "p2", user_id: "user-1", permission_key: "dashboard", effect: "allow", created_at: null } as UserPermissionRow,
    ];

    const result = mergeUserDirectory(profiles, roles, perms, []);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "user-1",
      userId: "user-1",
      inviteId: null,
      name: "User One",
      email: "user1@example.com",
      role: "admin",
      status: "active",
      permissions: ["campaigns", "dashboard"],
      denyOverrides: [],
    });
  });

  // Permission-overrides plan (docs/permission-overrides-plan/README.md, Phase 3 §D.1 — pins
  // E6 so it cannot return): a `deny` override must never render as if the user has that
  // permission, and must show up in `denyOverrides` instead of being silently dropped.
  it("does not report a deny override as granted, and surfaces it in denyOverrides", () => {
    const profiles = [makeProfile()];
    const perms: UserPermissionRow[] = [
      { id: "p1", user_id: "user-1", permission_key: "campaigns", effect: "allow", created_at: null } as UserPermissionRow,
      { id: "p2", user_id: "user-1", permission_key: "finance", effect: "deny", created_at: null } as UserPermissionRow,
    ];

    const result = mergeUserDirectory(profiles, [], perms, []);

    expect(result[0].permissions).toEqual(["campaigns"]);
    expect(result[0].permissions).not.toContain("finance");
    expect(result[0].denyOverrides).toEqual(["finance"]);
  });

  it("falls back to pending_role_review when a profile has no user_roles row", () => {
    const result = mergeUserDirectory([makeProfile()], [], [], []);
    expect(result[0].role).toBe("pending_role_review");
  });

  it("falls back to 'Unknown' when full_name is null", () => {
    const result = mergeUserDirectory([makeProfile({ full_name: null })], [], [], []);
    expect(result[0].name).toBe("Unknown");
  });

  it("defaults a null status to 'active'", () => {
    const result = mergeUserDirectory([makeProfile({ status: null as unknown as string })], [], [], []);
    expect(result[0].status).toBe("active");
  });

  it("includes a pending invite as a separate row with status 'invited'", () => {
    const result = mergeUserDirectory([], [], [], [makeInvite()]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "invite-1",
      userId: null,
      inviteId: "invite-1",
      name: "Invite One",
      role: "operator",
      status: "invited",
      permissions: [],
      denyOverrides: [],
    });
  });

  // Permission-overrides plan §Out of scope (D-2): the 4 stale pending invites predate the
  // fix and still carry a non-empty `permissions` list. Confirms that legacy shape still
  // renders (as the invite's own flat list, not personal overrides — pending invites have no
  // user_permissions row to filter by effect) rather than being silently dropped.
  it("still renders a stale pre-fix invite's non-empty permissions list", () => {
    const result = mergeUserDirectory([], [], [], [makeInvite({ permissions: ["dashboard"] })]);
    expect(result[0].permissions).toEqual(["dashboard"]);
    expect(result[0].denyOverrides).toEqual([]);
  });

  it("excludes an invite whose email already has an active profile (belt-and-braces dedupe)", () => {
    const profiles = [makeProfile({ email: "same@example.com" })];
    const invites = [makeInvite({ email: "SAME@example.com" })]; // case-insensitive match
    const result = mergeUserDirectory(profiles, [], [], invites);
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe("user-1");
  });

  it("keeps an invite whose email does NOT match any active profile", () => {
    const profiles = [makeProfile({ email: "someone-else@example.com" })];
    const invites = [makeInvite({ email: "invite1@example.com" })];
    const result = mergeUserDirectory(profiles, [], [], invites);
    expect(result).toHaveLength(2);
  });

  it("handles all four inputs being null/undefined without throwing", () => {
    expect(mergeUserDirectory(null, null, null, null)).toEqual([]);
    expect(mergeUserDirectory(undefined, undefined, undefined, undefined)).toEqual([]);
  });

  it("only attaches permissions belonging to the matching user_id", () => {
    const profiles = [makeProfile({ id: "user-1" }), makeProfile({ id: "user-2", email: "user2@example.com" })];
    const perms: UserPermissionRow[] = [
      { id: "p1", user_id: "user-1", permission_key: "campaigns", effect: "allow", created_at: null } as UserPermissionRow,
      { id: "p2", user_id: "user-2", permission_key: "finance", effect: "allow", created_at: null } as UserPermissionRow,
    ];
    const result = mergeUserDirectory(profiles, [], perms, []);
    const user1 = result.find((r) => r.id === "user-1");
    const user2 = result.find((r) => r.id === "user-2");
    expect(user1?.permissions).toEqual(["campaigns"]);
    expect(user2?.permissions).toEqual(["finance"]);
  });
});
