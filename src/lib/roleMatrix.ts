// Phase 3 (docs/admin-module-plan/PHASE-3-role-management-ui.md §C/§D) — the pure decision
// logic behind the role matrix editor, kept side-effect-free and DB-free so it's unit
// testable the same way src/lib/access.ts is (checklist F.2: "Tests for the staged-diff
// logic (pure function, no DB needed)"). Everything here is a *pre-check* / UX convenience —
// the real enforcement is the four triggers in
// supabase/migrations/20260813000000_role_management_ui.sql (role_permissions_super_lock,
// role_permissions_rank_guard, role_permissions_grant_ceiling, role_permissions_admin_floor)
// plus the roles_system_lock trigger and the plain FK on user_roles.role. §C.1's own warning
// applies here too: "if the trigger and the UI disagree, the trigger wins" — nothing in this
// file is a substitute for those, only a faster, friendlier first line.

export type PermissionLevel = "view" | "edit" | "full";

export interface RoleRow {
  key: string;
  label: string;
  description: string | null;
  is_system: boolean;
  is_super: boolean;
  rank: number;
}

export interface PermissionRow {
  key: string;
  label: string;
  category: string;
  feature_group: string | null;
  sensitivity: string;
  sort_order: number;
}

export interface RolePermissionRow {
  role_key: string;
  permission_key: string;
  level: string;
}

// role_key -> permission_key -> level. Absence of a key means "not granted."
export type MatrixState = Record<string, Record<string, PermissionLevel>>;

// The matrix editor's per-cell control cycles through these four states on click, in this
// order. Kept here (not in the component) so it's covered by the same unit tests as the
// rest of the staged-diff logic.
const LEVEL_CYCLE: (PermissionLevel | null)[] = [null, "view", "edit", "full"];

export function cycleLevel(level: PermissionLevel | null): PermissionLevel | null {
  const idx = LEVEL_CYCLE.indexOf(level);
  return LEVEL_CYCLE[(idx + 1) % LEVEL_CYCLE.length];
}

export function buildMatrix(rows: RolePermissionRow[]): MatrixState {
  const matrix: MatrixState = {};
  for (const row of rows) {
    if (!matrix[row.role_key]) matrix[row.role_key] = {};
    matrix[row.role_key][row.permission_key] = row.level as PermissionLevel;
  }
  return matrix;
}

// Deep-clone helper — the editor stages edits on a copy so "Save" (§C.3, no write-on-click)
// has something concrete to diff against and discard on cancel.
export function cloneMatrix(matrix: MatrixState): MatrixState {
  const out: MatrixState = {};
  for (const roleKey of Object.keys(matrix)) {
    out[roleKey] = { ...matrix[roleKey] };
  }
  return out;
}

export interface PermissionChange {
  permissionKey: string;
  from: PermissionLevel | null;
  to: PermissionLevel | null;
}

export interface RoleDiff {
  roleKey: string;
  added: PermissionChange[]; // null -> a level
  removed: PermissionChange[]; // a level -> null
  changed: PermissionChange[]; // level -> a different level
}

// §C.4: "Show a diff before saving." Compares two full matrices and returns one entry per
// role that actually changed — a role with no differences is omitted, not returned empty.
export function diffMatrix(original: MatrixState, staged: MatrixState): RoleDiff[] {
  const roleKeys = new Set([...Object.keys(original), ...Object.keys(staged)]);
  const diffs: RoleDiff[] = [];

  for (const roleKey of roleKeys) {
    const before = original[roleKey] ?? {};
    const after = staged[roleKey] ?? {};
    const permKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    const added: PermissionChange[] = [];
    const removed: PermissionChange[] = [];
    const changed: PermissionChange[] = [];

    for (const permissionKey of permKeys) {
      const from = before[permissionKey] ?? null;
      const to = after[permissionKey] ?? null;
      if (from === to) continue;
      if (from === null) added.push({ permissionKey, from, to });
      else if (to === null) removed.push({ permissionKey, from, to });
      else changed.push({ permissionKey, from, to });
    }

    if (added.length || removed.length || changed.length) {
      diffs.push({ roleKey, added, removed, changed });
    }
  }

  return diffs;
}

const LEVEL_LABEL: Record<PermissionLevel, string> = { view: "View", edit: "Edit", full: "Full" };

// §C.4's own example: "Brand Manager: +Finance, −Calendar". Takes a label lookup rather than
// assuming permission keys read nicely on their own.
export function formatRoleDiffSummary(
  roleLabel: string,
  diff: RoleDiff,
  labelFor: (permissionKey: string) => string
): string {
  const parts: string[] = [
    ...diff.added.map((c) => `+${labelFor(c.permissionKey)}`),
    ...diff.removed.map((c) => `−${labelFor(c.permissionKey)}`), // − (minus sign)
    ...diff.changed.map(
      (c) => `${labelFor(c.permissionKey)} (${LEVEL_LABEL[c.from as PermissionLevel]}→${LEVEL_LABEL[c.to as PermissionLevel]})`
    ),
  ];
  return `${roleLabel}: ${parts.join(", ")}`;
}

// §C.5: "Show the affected user count next to Save." Sums the user count of every role that
// has at least one staged change — a role touched twice still counts its users once.
export function affectedUserCount(diffs: RoleDiff[], userCountByRole: Record<string, number>): number {
  return diffs.reduce((sum, d) => sum + (userCountByRole[d.roleKey] ?? 0), 0);
}

export interface GuardResult {
  allowed: boolean;
  reason?: string;
}

// §C.6/S.4: a super role's row renders read-only — is_super already implies every
// permission (Phase 1 §D), so editing its row would show controls that don't do anything.
export function canEditRoleMatrixRow(actorRank: number, role: RoleRow): GuardResult {
  if (role.is_super) {
    return { allowed: false, reason: `${role.label} is a super role — it already has every permission.` };
  }
  // §C.8: cannot edit a role whose rank is lower (more powerful) than the actor's own.
  if (role.rank < actorRank) {
    return { allowed: false, reason: `You cannot edit ${role.label} — it outranks your own role.` };
  }
  return { allowed: true };
}

// §C.9: cannot grant a permission the actor does not hold themselves. Downgrading or
// removing a grant is never checked here — only granting/upgrading is a potential
// escalation. `actorPermissionKeys` is whatever the actor's own get_my_permissions() result
// contains (any level counts as "holds it").
export function canGrantPermission(
  actorPermissionKeys: ReadonlySet<string>,
  permissionKey: string,
  fromLevel: PermissionLevel | null,
  toLevel: PermissionLevel | null
): GuardResult {
  const isEscalation = toLevel !== null && toLevel !== fromLevel;
  if (!isEscalation) return { allowed: true };
  if (!actorPermissionKeys.has(permissionKey)) {
    return { allowed: false, reason: `You cannot grant ${permissionKey} — you do not hold it yourself.` };
  }
  return { allowed: true };
}

// §C.7: refuse a staged save that would leave zero roles able to reach admin.roles_invites.
// is_super roles bypass role_permissions entirely (Phase 1 §D), so they always count as
// "holding" it regardless of what the matrix says.
const ADMIN_ROLES_INVITES_KEY = "admin.roles_invites";

export function wouldStripLastRolesInvitesHolder(staged: MatrixState, roles: RoleRow[]): boolean {
  const holders = roles.filter(
    (r) => r.is_super || !!staged[r.key]?.[ADMIN_ROLES_INVITES_KEY]
  );
  return holders.length === 0;
}

// §D.5/S.3: system roles cannot be renamed or deleted.
export function canDeleteRole(role: RoleRow, userCount: number): GuardResult {
  if (role.is_system) {
    return { allowed: false, reason: `${role.label} is a system role and cannot be deleted.` };
  }
  // §D.2/D.4: "Block if users assigned" — the chosen policy (also enforced by the plain FK
  // on user_roles.role, which has no ON DELETE CASCADE — see the migration's own D.6/D.7
  // note). Naming the count is the checklist's own requirement (S.2).
  if (userCount > 0) {
    return {
      allowed: false,
      reason: `${role.label} is still assigned to ${userCount} user${userCount === 1 ? "" : "s"}. Reassign them first.`,
    };
  }
  return { allowed: true };
}

export function canRenameRole(role: RoleRow): GuardResult {
  if (role.is_system) {
    return { allowed: false, reason: `${role.label} is a system role and cannot be renamed.` };
  }
  return { allowed: true };
}

// Permission-overrides plan (docs/permission-overrides-plan/README.md, Phase 1 §B.12) — "what
// does this role grant", extracted as a pure helper so the invite dialog's read-only preview
// (D-1: "shows a read-only list of the pages that role opens") and EditInviteDialog's own
// preview can both answer the same question without a third fetch. Reuses the EXISTING
// useRolePermissionMatrix()/usePermissionCatalogue() hooks (src/hooks/useRoles.ts) —
// EditUserDialog.tsx already answers this exact question from those two, this just gives that
// logic a name and a test. Returns every permission key the role holds a row for, at any
// level — "granted at all" is the question a preview needs, not which level.
export function permissionsGrantedByRole(roleKey: string, matrixRows: RolePermissionRow[]): string[] {
  return matrixRows.filter((r) => r.role_key === roleKey).map((r) => r.permission_key);
}

// §D.2: "Auto-generate `key` from label." Lowercase, spaces/punctuation to underscores,
// collapse repeats, trim leading/trailing underscores. "Support Agent" -> "support_agent".
export function slugifyRoleKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// §C.1's warning made concrete: "if the trigger and the UI disagree, the trigger wins and
// the user sees a raw Postgres error [unless caught]." Every trigger this phase adds raises
// a plain-English message (supabase/migrations/20260813000000_role_management_ui.sql), so
// surfacing `error.message` as-is is usually already readable — this only needs to catch the
// two cases that are NOT: a bare FK violation (23503, from the plain `user_roles.role` FK
// rather than one of our named triggers) and a totally unrecognized shape.
export function friendlyDbError(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return "Something went wrong. Please try again.";
  if (error.code === "23503") {
    return "This role is still in use and cannot be changed. Reassign or remove the users on it first.";
  }
  if (error.message && error.message.trim().length > 0) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
