import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissionCatalogue, useRolePermissionMatrix, type PermissionRow } from "@/hooks/useRoles";
import { useUserPermissionOverrides, useUpdateUserPermissions } from "@/hooks/useUsers";
import {
  computeEffectivePermissions, diffOverrides, overrideChoiceFor, cycleOverrideChoice,
  type OverrideChoice, type UserDisplay,
} from "@/lib/userLifecycle";
import type { RoleRow } from "@/lib/roleMatrix";
import { AssignRoleSelect } from "./AssignRoleSelect";

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserDisplay; // an ACTIVE/frozen/blocked/removed user — pending invites use EditInviteDialog
  roles: RoleRow[];
  actorRank: number;
  onSaved: () => void;
}

const LEVEL_LABEL: Record<string, string> = { view: "View", edit: "Edit", full: "Full" };
const CHOICE_LABEL: Record<OverrideChoice, string> = { inherit: "Inherit", allow: "Allow", deny: "Deny" };
const CHOICE_STYLE: Record<OverrideChoice, string> = {
  inherit: "border-border text-muted-foreground",
  allow: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  deny: "border-destructive/40 text-destructive",
};

// Phase 6 (docs/admin-module-plan/PHASE-6-user-lifecycle.md §E) — reuses Phase 3's permission
// checklist SHAPE (grouped by feature_group) but a tri-state control per permission, not a
// 4-level cycle: §E.2's whole point is that "not overridden" must stay distinguishable from
// "explicitly denied", which PermissionMatrixGrid.tsx's role-level editor doesn't need to
// express at all (a role either grants a level or it doesn't).
export function EditUserDialog({ open, onOpenChange, user, roles, actorRank, onSaved }: EditUserDialogProps) {
  const { user: authUser, hasPermission } = useAuth();
  const isSelf = !!authUser && authUser.id === user.userId;

  // Permission-overrides plan Phase 4 §H.1 (docs/permission-overrides-plan/README.md) — the
  // template case: this editor is reachable by anyone who can open /admin (gated only on
  // admin.roles_invites), but the seed data grants admin.permission_overrides to super_admin
  // ONLY (E15) — not even plain `admin`, per Phase 1 D-2's own finding that Permission
  // Overrides is one of the three things separating `admin` from `super_admin`. Wiring this
  // is therefore a deliberate, intended access reduction for `admin`, not a new restriction
  // being invented here.
  const canEditOverrides = hasPermission("admin.permission_overrides");

  const { data: permissions = [], isLoading: permsLoading } = usePermissionCatalogue();
  const { data: matrixRows = [] } = useRolePermissionMatrix();
  const { data: overrideRows = [], isLoading: overridesLoading } = useUserPermissionOverrides(open ? user.userId : null);
  const updateOverrides = useUpdateUserPermissions();

  const role = roles.find((r) => r.key === user.role);
  const rolePermissionsForRole = useMemo(
    () => matrixRows.filter((rp) => rp.role_key === user.role),
    [matrixRows, user.role]
  );

  const initialChoices = useMemo(() => {
    const map: Record<string, OverrideChoice> = {};
    for (const p of permissions) map[p.key] = overrideChoiceFor(p.key, overrideRows);
    return map;
  }, [permissions, overrideRows]);

  const [staged, setStaged] = useState<Record<string, OverrideChoice>>({});
  const [saving, setSaving] = useState(false);

  // Re-seed staged edits every time the dialog opens (or the underlying data it was seeded
  // from changes) — §C.3's "no write-on-click" pattern RolesTab.tsx already established:
  // stage locally, diff on save, discard on close.
  useEffect(() => {
    if (open) setStaged(initialChoices);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, overrideRows, permissions]);

  const stagedOverrideRows = useMemo(
    () =>
      Object.entries(staged)
        .filter(([, choice]) => choice !== "inherit")
        .map(([permission_key, choice]) => ({ permission_key, effect: choice as "allow" | "deny" })),
    [staged]
  );

  // §E.3 — the effective result, computed the same way get_permissions_for() would (mirrored,
  // not called — see src/lib/userLifecycle.ts's own header for why).
  const effective = useMemo(
    () => computeEffectivePermissions(!!role?.is_super, rolePermissionsForRole, stagedOverrideRows),
    [role, rolePermissionsForRole, stagedOverrideRows]
  );

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, PermissionRow[]>();
    for (const p of permissions) {
      const key = p.feature_group ?? "Pages";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    return Array.from(groups.entries());
  }, [permissions]);

  const diff = diffOverrides(initialChoices, staged);
  const hasChanges = Object.keys(diff).length > 0;
  // Permission-overrides plan (docs/permission-overrides-plan/README.md, Phase 2 §C.6/E11) —
  // true when this user currently holds ANY personal override, before staging anything new.
  // Drives whether "Clear all exceptions" even shows up — no point offering it on a user who
  // has none.
  const hasAnyExistingOverride = Object.values(initialChoices).some((c) => c !== "inherit");
  const [clearing, setClearing] = useState(false);

  const handleSave = async () => {
    if (!hasChanges) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      await updateOverrides.mutateAsync({ user_id: user.userId!, overrides: diff });
      toast.success("Permission overrides saved.");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save overrides.");
    } finally {
      setSaving(false);
    }
  };

  // §C.6/E11 — "no backend work: call the existing update_permissions action with every
  // catalogue key set to 'inherit'." Deliberately the full catalogue, not just the keys
  // currently overridden — `update_permissions` treats 'inherit' as "delete the row, if any",
  // so sending a key with no existing override is a harmless no-op, and this stays correct
  // even if `staged` has unrelated pending edits (which it discards, same as any other close).
  const handleClearAllExceptions = async () => {
    setClearing(true);
    try {
      const overrides: Record<string, OverrideChoice> = {};
      for (const p of permissions) overrides[p.key] = "inherit";
      await updateOverrides.mutateAsync({ user_id: user.userId!, overrides });
      toast.success("All exceptions cleared — access now comes from the role alone.");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear exceptions.");
    } finally {
      setClearing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Edit {user.name}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label className="text-xs">Role</Label>
          {/* ⚠️ Known simplification: `user` is a snapshot passed in when this dialog opened.
              Changing the role here updates the database immediately (same useAssignRole
              mutation the table's own inline select uses) but the permission section below
              keeps showing overrides against the ORIGINAL role until the dialog is reopened —
              it does not live-recompute mid-session. Close and reopen after a role change to
              see the new role's baseline before setting overrides against it. */}
          <AssignRoleSelect
            userId={user.userId!}
            currentRole={user.role}
            roles={roles}
            actorRank={actorRank}
            disabled={isSelf}
          />
          {/* §C.11: self-demotion refused — manage-users' handleSetRole also refuses this
              server-side regardless, this just avoids offering a control that would 403. */}
          {isSelf && (
            <p className="text-[11px] text-muted-foreground">
              You cannot change your own role — ask another admin.
            </p>
          )}
        </div>

        <Separator />

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs flex items-center gap-2">
              <Lock className="h-3 w-3 text-primary" /> Permission overrides
            </Label>
            {hasAnyExistingOverride && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-2 text-destructive hover:text-destructive"
                onClick={handleClearAllExceptions}
                disabled={clearing || saving || !!role?.is_super || !canEditOverrides}
              >
                {clearing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Clear all exceptions"}
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Inherit uses whatever {role?.label ?? user.role} grants. Allow/Deny override it for
            this user only — deny always wins, even over an allow (§E.2).
          </p>
        </div>

        {!canEditOverrides && !role?.is_super && (
          <p className="text-xs text-muted-foreground bg-secondary/20 rounded-lg border border-border p-3">
            You can see this user's exceptions, but changing them needs the Permission Overrides
            permission — ask a super admin.
          </p>
        )}

        {role?.is_super ? (
          <p className="text-xs text-muted-foreground bg-secondary/20 rounded-lg border border-border p-3">
            {role.label} is a super role — it already has every permission, always. Overrides here
            would have no effect (Phase 1 §D).
          </p>
        ) : permsLoading || overridesLoading ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>
        ) : (
          <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
            {groupedPermissions.map(([group, perms]) => (
              <div key={group}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                  {group}
                </p>
                <div className="space-y-1">
                  {perms.map((p) => {
                    const choice = staged[p.key] ?? "inherit";
                    const roleLevel = rolePermissionsForRole.find((rp) => rp.permission_key === p.key)?.level;
                    const effectiveLevel = effective.get(p.key);
                    return (
                      <div
                        key={p.key}
                        className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-secondary/10"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs text-foreground truncate">{p.label}</span>
                          <span className="text-[10px] text-muted-foreground">
                            Role grants: {roleLevel ? LEVEL_LABEL[roleLevel] : "None"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={`h-6 text-[10px] px-2 ${CHOICE_STYLE[choice]}`}
                            onClick={() => setStaged((s) => ({ ...s, [p.key]: cycleOverrideChoice(choice) }))}
                            disabled={!canEditOverrides}
                          >
                            {CHOICE_LABEL[choice]}
                          </Button>
                          <Badge
                            variant="outline"
                            className={`text-[9px] h-5 px-1.5 w-12 justify-center ${
                              effectiveLevel ? "border-primary/40 text-primary" : "border-muted-foreground/30 text-muted-foreground"
                            }`}
                          >
                            {effectiveLevel ? LEVEL_LABEL[effectiveLevel] : "None"}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {hasChanges ? "Cancel" : "Close"}
          </Button>
          <Button onClick={handleSave} disabled={saving || !!role?.is_super || !hasChanges || !canEditOverrides}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save overrides"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
