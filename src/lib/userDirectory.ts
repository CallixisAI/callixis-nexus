import type { Database } from "@/integrations/supabase/types";
import type { AccountStatus, UserDisplay } from "@/lib/userLifecycle";

// Phase 7 admin-module-plan (docs/admin-module-plan/PHASE-7-audit-and-hardening.md §E.1) —
// "extract the invite-list merge from fetchUsers and test it." Pure, no DB, unit-tested —
// Admin.tsx's fetchUsers now calls this instead of inlining the merge, same "the real
// enforcement is the DB/edge function, this is testable client-side logic" split every other
// src/lib/*.ts pure module in this project already follows.

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type UserRoleRow = Database["public"]["Tables"]["user_roles"]["Row"];
type UserPermissionRow = Database["public"]["Tables"]["user_permissions"]["Row"];
type UserInviteRow = Database["public"]["Tables"]["user_invites"]["Row"];

/**
 * Combines the four queries Admin.tsx's fetchUsers fires in parallel into one directory list —
 * real accounts (from `profiles`) plus pending invites (from `user_invites`), each row typed as
 * the UI's shared `UserDisplay` shape (src/lib/userLifecycle.ts §F).
 */
export function mergeUserDirectory(
  profiles: ProfileRow[] | null | undefined,
  roles: UserRoleRow[] | null | undefined,
  permissions: UserPermissionRow[] | null | undefined,
  invites: UserInviteRow[] | null | undefined
): UserDisplay[] {
  const combined: UserDisplay[] = [];

  (profiles ?? []).forEach((profile) => {
    // Phase 1 (20260812000000_roles_as_data.sql) retired 'brand' along with the rest of the
    // old app_role enum — falling back to it here would hand AssignRoleSelect a role key that
    // no longer exists in `roles`. 'pending_role_review' is the real fallback handle_new_user()
    // itself now uses for exactly this "no role row" case.
    const userRole = (roles ?? []).find((r) => r.user_id === profile.id)?.role || "pending_role_review";
    // Permission-overrides plan (docs/permission-overrides-plan/README.md, Phase 2 §C.1 — E6)
    // — the bug this fixes: the old `.map()` below took every override row regardless of
    // `effect`, so a `deny` row rendered in this directory as if the user HAD that
    // permission. `permissions` is now allow-effect only, matching what this badge has always
    // been read as meaning; `denyOverrides` is the same rows' deny half, surfaced separately
    // (§C.2) rather than silently dropped.
    const userOverrides = (permissions ?? []).filter((p) => p.user_id === profile.id);
    const userPerms = userOverrides.filter((p) => p.effect === "allow").map((p) => p.permission_key);
    const userDenyOverrides = userOverrides.filter((p) => p.effect === "deny").map((p) => p.permission_key);

    combined.push({
      id: profile.id,
      userId: profile.id,
      inviteId: null,
      name: profile.full_name || "Unknown",
      email: profile.email,
      phone: profile.phone,
      role: userRole,
      status: (profile.status ?? "active") as AccountStatus,
      statusReason: profile.status_reason ?? null,
      frozenUntil: profile.frozen_until ?? null,
      permissions: userPerms,
      denyOverrides: userDenyOverrides,
    });
  });

  // activate-invite (supabase/functions/activate-invite) flips a completed invite's status to
  // 'accepted' the moment it succeeds, so the caller's own `.eq('status', 'pending')` filter
  // should already keep an activated user from showing up here a second time as "Pending"
  // [E9's twin bug]. Re-checking against profiles.email is the second half of that belt —
  // catches a lagging client or a status write that failed, rather than trusting the filter alone.
  const activeEmails = new Set((profiles ?? []).map((p) => p.email?.toLowerCase()).filter(Boolean));

  (invites ?? []).forEach((invite) => {
    if (invite.email && activeEmails.has(invite.email.toLowerCase())) return;
    combined.push({
      id: invite.id,
      userId: null,
      inviteId: invite.id,
      name: invite.full_name,
      email: invite.email,
      phone: invite.phone,
      role: invite.role,
      status: "invited",
      statusReason: null,
      frozenUntil: null,
      // A pending invite has no personal `user_permissions` row yet — nothing to deny.
      // `invite.permissions` itself is Phase 1's target-zero column (permission-overrides
      // plan §B): new invites always carry `[]`; a non-empty value here means a stale row
      // predating that fix (see the plan's §Out of scope on the 4 stale pending invites).
      permissions: invite.permissions,
      denyOverrides: [],
    });
  });

  return combined;
}
