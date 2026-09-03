// Phase 6 (admin-module-plan) — docs/admin-module-plan/PHASE-6-user-lifecycle.md.
// Pure decision logic behind the Actions menu and the edit-user dialog, kept side-effect-free
// and DB-free so it's unit testable the same way src/lib/roleMatrix.ts and src/lib/ipRules.ts
// are. Same split as those two files: the real enforcement is
// supabase/migrations/20260827000000_user_lifecycle.sql (is_account_active(), the
// last-active-super-admin trigger) and supabase/functions/manage-users/index.ts's rank/self
// checks — everything here is a pre-check / UX convenience that keeps the menu from ever
// offering a button that would just come back as a 403 or do nothing `[E11]`.

import type { PermissionLevel } from "./roleMatrix";

export type AccountStatus = "invited" | "active" | "frozen" | "blocked" | "removed";

// §B.1's own rule, mirrored (not shared — this runs in the browser, is_account_active() runs
// in Postgres, same reasoning src/lib/phone.ts already gives for not sharing code across a
// browser bundle / Deno function / this SQL boundary): a frozen account past its own
// frozen_until reads as active again WITHOUT the stored `status` column changing on its own —
// there is no cron sweep that flips it back. Used so the directory badge and the real access
// decision never visibly disagree, even though the column can lag until an admin next touches
// the row.
export function effectiveStatus(status: AccountStatus, frozenUntil: string | null, now: number = Date.now()): AccountStatus {
  if (status === "frozen" && frozenUntil && new Date(frozenUntil).getTime() <= now) {
    return "active";
  }
  return status;
}

export type ActionKey =
  | "edit"
  | "copy_link"
  | "resend_invite"
  | "cancel_invite"
  | "freeze"
  | "unfreeze"
  | "block"
  | "unblock"
  | "remove"
  | "restore"
  | "force_signout"
  | "reset_password";

export interface ActionDef {
  key: ActionKey;
  label: string;
  // §D.5: reason is mandatory for block/freeze/remove — goes to status_reason + (eventually,
  // Phase 7) the audit log.
  requiresReason: boolean;
  // §D.4: destructive actions require typed confirmation naming the user. Freeze requires a
  // reason but not a typed name — it's explicitly the *temporary* state (§A's own table),
  // deliberately a lighter-friction action than block/remove. 🔀 A reading of an ambiguous
  // instruction, recorded rather than silently chosen: the phase doc says "destructive actions"
  // without listing exactly which of the three reason-requiring actions also need typed
  // confirmation.
  requiresTypedConfirm: boolean;
  destructive: boolean;
}

const ACTION_DEFS: Record<ActionKey, ActionDef> = {
  edit:            { key: "edit",            label: "Edit role & permissions", requiresReason: false, requiresTypedConfirm: false, destructive: false },
  copy_link:       { key: "copy_link",       label: "Copy activation link",    requiresReason: false, requiresTypedConfirm: false, destructive: false },
  resend_invite:   { key: "resend_invite",   label: "Resend invite",           requiresReason: false, requiresTypedConfirm: false, destructive: false },
  cancel_invite:   { key: "cancel_invite",   label: "Cancel invite",           requiresReason: false, requiresTypedConfirm: true,  destructive: true },
  freeze:          { key: "freeze",          label: "Freeze",                  requiresReason: true,  requiresTypedConfirm: false, destructive: true },
  unfreeze:        { key: "unfreeze",        label: "Unfreeze",                requiresReason: false, requiresTypedConfirm: false, destructive: false },
  block:           { key: "block",           label: "Block",                   requiresReason: true,  requiresTypedConfirm: true,  destructive: true },
  unblock:         { key: "unblock",         label: "Unblock",                 requiresReason: false, requiresTypedConfirm: false, destructive: false },
  remove:          { key: "remove",          label: "Remove",                  requiresReason: true,  requiresTypedConfirm: true,  destructive: true },
  restore:         { key: "restore",         label: "Restore",                 requiresReason: false, requiresTypedConfirm: false, destructive: false },
  force_signout:   { key: "force_signout",   label: "Force sign-out",          requiresReason: false, requiresTypedConfirm: false, destructive: false },
  reset_password:  { key: "reset_password",  label: "Send password reset",     requiresReason: false, requiresTypedConfirm: false, destructive: false },
};

// §D's table, verbatim.
const ACTIONS_BY_STATUS: Record<AccountStatus, ActionKey[]> = {
  invited: ["copy_link", "resend_invite", "cancel_invite", "edit"],
  active:  ["edit", "freeze", "block", "force_signout", "reset_password", "remove"],
  frozen:  ["unfreeze", "block", "remove", "edit"],
  blocked: ["unblock", "remove", "edit"],
  removed: ["restore"],
};

export interface RowActionContext {
  status: AccountStatus;
  frozenUntil: string | null;
  isSelf: boolean;
  // Infinity if the actor's rank is unknown — treated as "cannot act on anyone", the fail-closed
  // reading, same convention useRoles.ts's useActorRoleInfo() already uses.
  actorRank: number;
  // undefined for a pending invite (no user_roles row yet) — never treated as "outranks me".
  targetRank: number | undefined;
}

export interface ResolvedAction extends ActionDef {
  disabled: boolean;
  disabledReason?: string;
}

// §D.3 🔴 "Nothing inert. Unavailable actions are omitted, or disabled with a tooltip saying
// why." This is the one function the Actions menu component calls — it decides both *which*
// keys are offered for this row's status (via ACTIONS_BY_STATUS, already keyed to the row's
// EFFECTIVE status, i.e. the caller should pass effectiveStatus()'s result, not the raw column)
// and whether each one is currently clickable.
export function getRowActions(ctx: RowActionContext): ResolvedAction[] {
  const keys = ACTIONS_BY_STATUS[ctx.status];
  const outranked = ctx.targetRank !== undefined && ctx.targetRank < ctx.actorRank;

  return keys.map((key) => {
    const def = ACTION_DEFS[key];

    if (outranked) {
      return { ...def, disabled: true, disabledReason: "This user's role outranks your own." };
    }

    // §C.11: refuse self-block and self-remove. Self-demotion is the edit dialog's own job
    // (§E) — a role change, not a row action here.
    if (ctx.isSelf && (key === "block" || key === "remove")) {
      return { ...def, disabled: true, disabledReason: "You cannot do this to your own account. Ask another admin." };
    }

    return { ...def, disabled: false };
  });
}

// §D.4: the button that confirms a destructive action only enables once the typed text
// matches the target's name exactly (case-sensitive — a near-miss should not be treated as
// confirmation). Trimmed so trailing whitespace from a copy-paste doesn't block it.
export function typedConfirmationMatches(typed: string, expectedName: string): boolean {
  return typed.trim() === expectedName.trim() && expectedName.trim().length > 0;
}

// §E.2: three states, not two — collapsing to a checkbox would silently turn "not overridden"
// into "explicitly denied" for every permission an admin didn't tick, which is not what a
// blank checkbox means anywhere else in this app's permission model (Phase 1 §B.2).
export type OverrideChoice = "inherit" | "allow" | "deny";

// The tri-state control's click-to-cycle order — mirrors src/lib/roleMatrix.ts's cycleLevel()
// shape for the same reason (kept here, not in the component, so it shares this file's tests).
const OVERRIDE_CYCLE: OverrideChoice[] = ["inherit", "allow", "deny"];

export function cycleOverrideChoice(choice: OverrideChoice): OverrideChoice {
  const idx = OVERRIDE_CYCLE.indexOf(choice);
  return OVERRIDE_CYCLE[(idx + 1) % OVERRIDE_CYCLE.length];
}

// Only the entries that actually changed — mirrors src/lib/roleMatrix.ts's diffMatrix() "stage
// everything, save only the diff" shape, and keeps manage-users' update_permissions payload
// small regardless of how many permissions the dialog renders. (That count was written as "34"
// when Phase 6 landed; it is 36 live as of 2026-09-03 — admin.audit and admin.vapi_assistants were
// seeded since. Re-check rather than trusting a number here:
//   npx supabase db query --linked "select count(*) from public.permissions;")
export function diffOverrides(
  initial: Record<string, OverrideChoice>,
  staged: Record<string, OverrideChoice>
): Record<string, OverrideChoice> {
  const changed: Record<string, OverrideChoice> = {};
  const keys = new Set([...Object.keys(initial), ...Object.keys(staged)]);
  for (const key of keys) {
    const before = initial[key] ?? "inherit";
    const after = staged[key] ?? "inherit";
    if (before !== after) changed[key] = after;
  }
  return changed;
}

export interface RolePermissionLike {
  permission_key: string;
  level: string;
}

export interface UserPermissionOverrideLike {
  permission_key: string;
  effect: string; // 'allow' | 'deny'
}

// §E.3: "show the effective result next to the overrides." Mirrors
// get_permissions_for()/get_my_permissions()'s SQL exactly (20260827000000_user_lifecycle.sql
// §B) — same three inputs (is the role super, what the role grants, what's overridden), same
// precedence (deny beats allow beats role, an 'allow' override is a blanket 'full' grant). A
// mirror, not a shared import, for the same cross-runtime reason as effectiveStatus() above;
// prove the two agree with a real account before trusting this for anything beyond display —
// same caveat this project attaches to every SQL-logic mirror.
export function computeEffectivePermissions(
  isSuperRole: boolean,
  rolePermissions: RolePermissionLike[],
  overrides: UserPermissionOverrideLike[]
): Map<string, PermissionLevel> {
  const result = new Map<string, PermissionLevel>();

  if (isSuperRole) {
    for (const rp of rolePermissions) result.set(rp.permission_key, "full");
    // is_super grants every permission, not just the ones role_permissions happens to list for
    // it (Phase 1 §D) — but this function only receives permission keys the caller passed in,
    // so it cannot invent keys it was never told about. Callers displaying a super role's
    // effective set should show "Full" for every key in the catalogue directly, same as
    // RolesTab.tsx already does, rather than relying on this return value for that case.
  } else {
    for (const rp of rolePermissions) result.set(rp.permission_key, rp.level as PermissionLevel);
    for (const ov of overrides) {
      if (ov.effect === "allow") result.set(ov.permission_key, "full");
    }
  }

  for (const ov of overrides) {
    if (ov.effect === "deny") result.delete(ov.permission_key);
  }

  return result;
}

// The tri-state control's initial value for a permission key: an override row's effect if one
// exists, else 'inherit'.
export function overrideChoiceFor(permissionKey: string, overrides: UserPermissionOverrideLike[]): OverrideChoice {
  const row = overrides.find((o) => o.permission_key === permissionKey);
  if (!row) return "inherit";
  return row.effect === "deny" ? "deny" : "allow";
}

// Human-readable status labels/descriptions for the directory badge and filter — kept here so
// the copy for the five states lives in exactly one place.
export const STATUS_LABEL: Record<AccountStatus, string> = {
  invited: "Invited",
  active: "Active",
  frozen: "Frozen",
  blocked: "Blocked",
  removed: "Removed",
};

// §F — Admin.tsx's one combined directory row shape, real users and pending invites alike.
// 'invited' rows have inviteId set and userId null; every other status has userId set and
// inviteId null — the two are mutually exclusive, matching D.1's "same icon, two entirely
// different code paths" split.
export interface UserDisplay {
  id: string; // profiles.id for a real user, user_invites.id for a pending invite — React key
  userId: string | null;
  inviteId: string | null;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: AccountStatus;
  statusReason: string | null;
  frozenUntil: string | null;
  permissions: string[]; // flat allow-list, same badge shape this table already rendered pre-Phase-6
  // Permission-overrides plan (docs/permission-overrides-plan/README.md, Phase 2 §C.2 — E6):
  // the deny half of this user's personal overrides, kept out of `permissions` above so a
  // `deny` row can never again render as if it were granted. `[]` for a pending invite — see
  // userDirectory.ts's own comment on that branch.
  denyOverrides: string[];
}
