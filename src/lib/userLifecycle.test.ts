import { describe, it, expect } from "vitest";
import {
  effectiveStatus,
  getRowActions,
  typedConfirmationMatches,
  diffOverrides,
  computeEffectivePermissions,
  overrideChoiceFor,
  cycleOverrideChoice,
} from "./userLifecycle";

describe("effectiveStatus", () => {
  it("returns the stored status when it isn't frozen", () => {
    expect(effectiveStatus("active", null)).toBe("active");
    expect(effectiveStatus("blocked", null)).toBe("blocked");
  });

  it("returns 'frozen' while frozen_until is still in the future", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(effectiveStatus("frozen", future)).toBe("frozen");
  });

  it("returns 'active' once frozen_until has passed — access returns automatically (S.2)", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(effectiveStatus("frozen", past)).toBe("active");
  });

  it("treats a frozen row with no frozen_until as still frozen (indefinite freeze)", () => {
    expect(effectiveStatus("frozen", null)).toBe("frozen");
  });
});

describe("getRowActions", () => {
  const ctx = (overrides: Partial<Parameters<typeof getRowActions>[0]> = {}) => ({
    status: "active" as const,
    frozenUntil: null,
    isSelf: false,
    actorRank: 10,
    targetRank: 30,
    ...overrides,
  });

  it("offers exactly §D's table for each status", () => {
    expect(getRowActions(ctx({ status: "invited" })).map((a) => a.key)).toEqual([
      "copy_link", "resend_invite", "cancel_invite", "edit",
    ]);
    expect(getRowActions(ctx({ status: "active" })).map((a) => a.key)).toEqual([
      "edit", "freeze", "block", "force_signout", "reset_password", "remove",
    ]);
    expect(getRowActions(ctx({ status: "frozen" })).map((a) => a.key)).toEqual([
      "unfreeze", "block", "remove", "edit",
    ]);
    expect(getRowActions(ctx({ status: "blocked" })).map((a) => a.key)).toEqual([
      "unblock", "remove", "edit",
    ]);
    expect(getRowActions(ctx({ status: "removed" })).map((a) => a.key)).toEqual(["restore"]);
  });

  it("never returns an item with no disabled flag at all — nothing inert, only offered or clearly disabled (D.3)", () => {
    for (const action of getRowActions(ctx())) {
      expect(typeof action.disabled).toBe("boolean");
    }
  });

  it("disables every action when the target outranks the actor", () => {
    const actions = getRowActions(ctx({ actorRank: 30, targetRank: 10 }));
    expect(actions.every((a) => a.disabled)).toBe(true);
    expect(actions[0].disabledReason).toMatch(/outranks/);
  });

  it("never disables for rank when targetRank is undefined (pending invite)", () => {
    const actions = getRowActions(ctx({ status: "invited", targetRank: undefined }));
    expect(actions.every((a) => !a.disabled)).toBe(true);
  });

  it("refuses self-block and self-remove (C.11) but leaves freeze/edit alone", () => {
    const actions = getRowActions(ctx({ isSelf: true, targetRank: 10 }));
    const byKey = Object.fromEntries(actions.map((a) => [a.key, a]));
    expect(byKey.block.disabled).toBe(true);
    expect(byKey.remove.disabled).toBe(true);
    expect(byKey.freeze.disabled).toBe(false);
    expect(byKey.edit.disabled).toBe(false);
  });

  it("marks block/remove destructive with typed confirmation, freeze destructive without it", () => {
    const actions = getRowActions(ctx());
    const byKey = Object.fromEntries(actions.map((a) => [a.key, a]));
    expect(byKey.block.requiresTypedConfirm).toBe(true);
    expect(byKey.remove.requiresTypedConfirm).toBe(true);
    expect(byKey.freeze.requiresTypedConfirm).toBe(false);
    expect(byKey.freeze.requiresReason).toBe(true);
  });
});

describe("typedConfirmationMatches", () => {
  it("matches the exact name", () => {
    expect(typedConfirmationMatches("Jane Doe", "Jane Doe")).toBe(true);
  });
  it("is case-sensitive", () => {
    expect(typedConfirmationMatches("jane doe", "Jane Doe")).toBe(false);
  });
  it("ignores surrounding whitespace only", () => {
    expect(typedConfirmationMatches("  Jane Doe  ", "Jane Doe")).toBe(true);
  });
  it("rejects an empty expected name outright", () => {
    expect(typedConfirmationMatches("", "")).toBe(false);
  });
});

describe("diffOverrides", () => {
  it("returns only keys that changed", () => {
    const before = { a: "inherit", b: "allow" } as const;
    const after = { a: "deny", b: "allow", c: "deny" } as const;
    expect(diffOverrides(before, after)).toEqual({ a: "deny", c: "deny" });
  });

  it("returns nothing when staged equals initial", () => {
    const before = { a: "allow" } as const;
    expect(diffOverrides(before, { ...before })).toEqual({});
  });

  it("treats a missing key as 'inherit' on both sides", () => {
    expect(diffOverrides({}, {})).toEqual({});
  });
});

describe("overrideChoiceFor", () => {
  it("returns 'inherit' when no override row exists", () => {
    expect(overrideChoiceFor("campaigns", [])).toBe("inherit");
  });
  it("returns the row's effect otherwise", () => {
    expect(overrideChoiceFor("campaigns", [{ permission_key: "campaigns", effect: "deny" }])).toBe("deny");
    expect(overrideChoiceFor("campaigns", [{ permission_key: "campaigns", effect: "allow" }])).toBe("allow");
  });
});

describe("cycleOverrideChoice", () => {
  it("cycles inherit -> allow -> deny -> inherit", () => {
    expect(cycleOverrideChoice("inherit")).toBe("allow");
    expect(cycleOverrideChoice("allow")).toBe("deny");
    expect(cycleOverrideChoice("deny")).toBe("inherit");
  });
});

describe("computeEffectivePermissions", () => {
  const rolePerms = [
    { permission_key: "campaigns", level: "edit" },
    { permission_key: "dashboard", level: "view" },
  ];

  it("grants exactly the role's levels with no overrides", () => {
    const result = computeEffectivePermissions(false, rolePerms, []);
    expect(result.get("campaigns")).toBe("edit");
    expect(result.get("dashboard")).toBe("view");
  });

  it("an 'allow' override is a blanket 'full' grant, even for a key the role didn't have", () => {
    const result = computeEffectivePermissions(false, rolePerms, [
      { permission_key: "finance.budget", effect: "allow" },
    ]);
    expect(result.get("finance.budget")).toBe("full");
  });

  it("a 'deny' override removes the key outright regardless of level", () => {
    const result = computeEffectivePermissions(false, rolePerms, [
      { permission_key: "campaigns", effect: "deny" },
    ]);
    expect(result.has("campaigns")).toBe(false);
    expect(result.get("dashboard")).toBe("view");
  });

  it("deny beats allow when both target the same key", () => {
    const result = computeEffectivePermissions(false, rolePerms, [
      { permission_key: "campaigns", effect: "allow" },
      { permission_key: "campaigns", effect: "deny" },
    ]);
    expect(result.has("campaigns")).toBe(false);
  });

  it("a super role's listed permissions all resolve to 'full'", () => {
    const result = computeEffectivePermissions(true, rolePerms, []);
    expect(result.get("campaigns")).toBe("full");
    expect(result.get("dashboard")).toBe("full");
  });
});
