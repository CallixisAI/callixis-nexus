import { Fragment, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Save, Undo2, Lock, Crown } from "lucide-react";
import {
  cycleLevel,
  canEditRoleMatrixRow,
  canGrantPermission,
  type MatrixState,
  type PermissionLevel,
  type RoleRow,
  type PermissionRow,
  type RoleDiff,
} from "@/lib/roleMatrix";

// Phase 3 §C — the matrix editor. A grid: permissions down the rows (grouped by
// `feature_group`, ordered by `sort_order` — §C.2), roles across the columns, generated
// entirely from the `permissions`/`roles` props rather than any hardcoded list (§C.1/[E14]).
// Purely presentational plus the two fast client-side pre-checks (§C.8/§C.9) — the four
// database triggers in 20260813000000_role_management_ui.sql are the real enforcement;
// this only saves a round trip for the common case and gives an immediate reason.

interface PermissionMatrixGridProps {
  roles: RoleRow[];
  permissions: PermissionRow[];
  staged: MatrixState;
  onChange: (next: MatrixState) => void;
  actorRank: number;
  actorPermissionKeys: ReadonlySet<string>;
  userCountByRole: Record<string, number>;
  diffs: RoleDiff[];
  affectedUsers: number;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  labelFor: (permissionKey: string) => string;
}

const LEVEL_STYLE: Record<PermissionLevel, string> = {
  full: "bg-primary/15 text-primary border-primary/40",
  edit: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/40",
  view: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/40",
};

const LEVEL_LABEL: Record<PermissionLevel, string> = { view: "View", edit: "Edit", full: "Full" };

export function PermissionMatrixGrid({
  roles,
  permissions,
  staged,
  onChange,
  actorRank,
  actorPermissionKeys,
  userCountByRole,
  diffs,
  affectedUsers,
  dirty,
  saving,
  onSave,
  onDiscard,
  labelFor,
}: PermissionMatrixGridProps) {
  const groups = useMemo(() => {
    const map = new Map<string, PermissionRow[]>();
    for (const p of permissions) {
      const label = p.feature_group ?? (p.category === "page" ? "Pages" : "General");
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(p);
    }
    return Array.from(map.entries());
  }, [permissions]);

  const handleCellClick = (role: RoleRow, permission: PermissionRow) => {
    const rowGuard = canEditRoleMatrixRow(actorRank, role);
    if (!rowGuard.allowed) {
      toast.error(rowGuard.reason);
      return;
    }

    const current = staged[role.key]?.[permission.key] ?? null;
    const next = cycleLevel(current);

    const grantGuard = canGrantPermission(actorPermissionKeys, permission.key, current, next);
    if (!grantGuard.allowed) {
      toast.error(grantGuard.reason);
      return;
    }

    const nextMatrix: MatrixState = { ...staged, [role.key]: { ...(staged[role.key] ?? {}) } };
    if (next === null) delete nextMatrix[role.key][permission.key];
    else nextMatrix[role.key][permission.key] = next;
    onChange(nextMatrix);
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/50 p-3">
          <div className="text-sm">
            {dirty ? (
              <div className="space-y-1">
                <p className="font-medium text-foreground">
                  {diffs.length} role{diffs.length === 1 ? "" : "s"} changed — {affectedUsers} user
                  {affectedUsers === 1 ? "" : "s"} affected
                </p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {diffs.map((d) => (
                    <li key={d.roleKey}>
                      {roles.find((r) => r.key === d.roleKey)?.label ?? d.roleKey}:{" "}
                      {[
                        ...d.added.map((c) => `+${labelFor(c.permissionKey)}`),
                        ...d.removed.map((c) => `−${labelFor(c.permissionKey)}`),
                        ...d.changed.map(
                          (c) =>
                            `${labelFor(c.permissionKey)} (${LEVEL_LABEL[c.from as PermissionLevel]}→${LEVEL_LABEL[c.to as PermissionLevel]})`
                        ),
                      ].join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-muted-foreground">Click a cell to cycle None → View → Edit → Full. No changes are saved until you press Save.</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={onDiscard} disabled={!dirty || saving}>
              <Undo2 className="h-3.5 w-3.5 mr-1.5" /> Discard
            </Button>
            <Button size="sm" onClick={onSave} disabled={!dirty || saving}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border">
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider sticky left-0 bg-card">
                  Permission
                </th>
                {roles.map((role) => (
                  <th key={role.key} className="p-3 text-xs font-semibold text-muted-foreground text-center min-w-[110px]">
                    <div className="flex flex-col items-center gap-1">
                      <span className="flex items-center gap-1 normal-case text-foreground font-medium">
                        {role.is_super && <Crown className="h-3 w-3 text-primary" />}
                        {role.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {userCountByRole[role.key] ?? 0} user{(userCountByRole[role.key] ?? 0) === 1 ? "" : "s"}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(([groupLabel, groupPermissions]) => (
                <Fragment key={groupLabel}>
                  <tr className="bg-muted/30">
                    <td
                      colSpan={roles.length + 1}
                      className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sticky left-0"
                    >
                      {groupLabel}
                    </td>
                  </tr>
                  {groupPermissions.map((permission) => (
                    <tr key={permission.key} className="border-b border-border/60 hover:bg-secondary/10">
                      <td className="p-3 text-sm text-foreground sticky left-0 bg-background">
                        <div className="flex items-center gap-2">
                          <span>{permission.label}</span>
                          {permission.sensitivity === "critical" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-[9px] h-4 px-1 border-destructive/40 text-destructive">
                                  critical
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>Sensitive — review who has this before granting it.</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                      {roles.map((role) => {
                        if (role.is_super) {
                          return (
                            <td key={role.key} className="p-2 text-center">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center justify-center h-7 w-16 rounded-md border border-border bg-muted/40 text-muted-foreground text-[10px] mx-auto">
                                    <Lock className="h-3 w-3 mr-1" /> Full
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{role.label} is a super role — it already has every permission.</TooltipContent>
                              </Tooltip>
                            </td>
                          );
                        }
                        const level = staged[role.key]?.[permission.key] ?? null;
                        return (
                          <td key={role.key} className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleCellClick(role, permission)}
                              className={`inline-flex items-center justify-center h-7 w-16 rounded-md border text-[10px] font-medium mx-auto transition-colors ${
                                level ? LEVEL_STYLE[level] : "border-border text-muted-foreground hover:bg-secondary/30"
                              }`}
                            >
                              {level ? LEVEL_LABEL[level] : "—"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </TooltipProvider>
  );
}
