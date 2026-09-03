import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ShieldCheck, Lock, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import {
  useRoleCatalogue,
  usePermissionCatalogue,
  useRolePermissionMatrix,
  useRoleUserCounts,
  useActorRoleInfo,
  useCreateRole,
  useDeleteRole,
  useSaveMatrixDiff,
} from "@/hooks/useRoles";
import {
  buildMatrix,
  diffMatrix,
  affectedUserCount,
  canDeleteRole,
  wouldStripLastRolesInvitesHolder,
  friendlyDbError,
  slugifyRoleKey,
  type MatrixState,
  type RoleRow,
} from "@/lib/roleMatrix";
import { PermissionMatrixGrid } from "./PermissionMatrixGrid";

export function RolesTab() {
  const { data: roles = [], isLoading: rolesLoading } = useRoleCatalogue();
  const { data: permissions = [], isLoading: permsLoading } = usePermissionCatalogue();
  const { data: matrixRows = [] } = useRolePermissionMatrix();
  const { data: userCounts = {} } = useRoleUserCounts();
  const { rank: actorRank } = useActorRoleInfo(roles);

  // §C.9's "a permission the actor lacks" means exactly what AuthContext already resolved
  // via get_my_permissions() — the same RPC RLS itself uses (Phase 2 §C) — not a second,
  // possibly-disagreeing reconstruction from role_permissions here. Using it directly means
  // the UI and the database read the actor's own grants from the same place.
  const { permissions: actorPermissions } = useAuth();
  const actorPermissionKeys = useMemo(() => new Set(actorPermissions), [actorPermissions]);

  const permissionLabelByKey = useMemo(() => {
    const map = new Map(permissions.map((p) => [p.key, p.label]));
    return (key: string) => map.get(key) ?? key;
  }, [permissions]);

  const originalMatrix = useMemo(() => buildMatrix(matrixRows), [matrixRows]);
  const [staged, setStaged] = useState<MatrixState>(originalMatrix);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setStaged(originalMatrix);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrixRows]);

  const diffs = useMemo(() => diffMatrix(originalMatrix, staged), [originalMatrix, staged]);
  const affected = useMemo(() => affectedUserCount(diffs, userCounts), [diffs, userCounts]);

  const saveMutation = useSaveMatrixDiff();

  const handleChange = (next: MatrixState) => {
    setStaged(next);
    setDirty(true);
  };

  const handleDiscard = () => {
    setStaged(originalMatrix);
    setDirty(false);
  };

  const handleSave = async () => {
    // §C.7 pre-check — the real floor is the role_permissions_admin_floor trigger, this is
    // only a faster refusal for the common case.
    if (wouldStripLastRolesInvitesHolder(staged, roles)) {
      toast.error("This change would leave no role able to reach the Roles tab. Refused.");
      return;
    }
    try {
      await saveMutation.mutateAsync(diffs);
      toast.success("Permission matrix updated.");
      setDirty(false);
    } catch (err) {
      toast.error(friendlyDbError(err as { message?: string; code?: string }));
    }
  };

  // ── Create / delete ──────────────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoleRow | null>(null);
  const createMutation = useCreateRole();
  const deleteMutation = useDeleteRole();

  const [form, setForm] = useState({ label: "", description: "", copyFrom: "" });
  const previewKey = slugifyRoleKey(form.label);

  const handleCreate = async () => {
    if (!form.label.trim()) {
      toast.error("A label is required.");
      return;
    }
    if (!previewKey) {
      toast.error("That label doesn't produce a usable role key.");
      return;
    }
    if (roles.some((r) => r.key === previewKey)) {
      toast.error(`A role with key "${previewKey}" already exists.`);
      return;
    }
    try {
      await createMutation.mutateAsync({
        label: form.label.trim(),
        description: form.description.trim() || null,
        copyFromRoleKey: form.copyFrom || null,
      });
      toast.success(`Role "${form.label.trim()}" created.`);
      setCreateOpen(false);
      setForm({ label: "", description: "", copyFrom: "" });
    } catch (err) {
      toast.error(friendlyDbError(err as { message?: string; code?: string }));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.key);
      toast.success(`Role "${deleteTarget.label}" deleted.`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(friendlyDbError(err as { message?: string; code?: string }));
    }
  };

  const loading = rolesLoading || permsLoading;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* B. The roles list */}
        <Card className="border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Roles</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {roles.length} role{roles.length === 1 ? "" : "s"} — create, inspect, or retire one below.
              </p>
            </div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Create role
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border max-w-md">
                <DialogHeader>
                  <DialogTitle>Create a role</DialogTitle>
                  <DialogDescription>
                    The machine key is generated from the label and cannot be changed after creation.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Label</Label>
                    <Input
                      placeholder="Support Agent"
                      value={form.label}
                      onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                      className="bg-secondary/30 border-border"
                    />
                    {form.label.trim() && (
                      <p className="text-[11px] text-muted-foreground">
                        Key: <code className="font-mono">{previewKey || "(none — try adding a letter)"}</code>
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Description (optional)</Label>
                    <Textarea
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      className="bg-secondary/30 border-border"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Starting point</Label>
                    <Select value={form.copyFrom || "blank"} onValueChange={(v) => setForm((f) => ({ ...f, copyFrom: v === "blank" ? "" : v }))}>
                      <SelectTrigger className="bg-secondary/30 border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="blank">Blank — no permissions</SelectItem>
                        {roles
                          .filter((r) => !r.is_super)
                          .map((r) => (
                            <SelectItem key={r.key} value={r.key}>
                              Copy from {r.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={createMutation.isPending}>
                    {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create role"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* §B.4: "Empty state that makes sense before any custom role exists." The table
              itself is never literally empty — 8 system roles ship seeded — so the thing
              that needs to make sense is a *no custom roles yet* state, not a blank table. */}
          {!loading && roles.length > 0 && roles.every((r) => r.is_system) && (
            <div className="px-4 py-3 text-xs text-muted-foreground bg-secondary/10 border-b border-border">
              No custom roles yet — the built-in roles above cover the standard matrix. Use "Create role" to add one
              tailored to your team.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                  <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Key</th>
                  <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Users</th>
                  <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Permissions</th>
                  <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground text-sm">
                      Loading roles…
                    </td>
                  </tr>
                ) : roles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground text-sm">
                      No roles found. This shouldn't happen — the 8 built-in roles ship seeded by migration.
                    </td>
                  </tr>
                ) : (
                  roles.map((role) => {
                    const userCount = userCounts[role.key] ?? 0;
                    const permCount = role.is_super ? permissions.length : Object.keys(originalMatrix[role.key] ?? {}).length;
                    const del = canDeleteRole(role, userCount);
                    return (
                      <tr key={role.key} className="hover:bg-secondary/10 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{role.label}</span>
                            {role.is_super && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-1 border-primary/40 text-primary">
                                    <ShieldCheck className="h-2.5 w-2.5" /> super
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>Has every permission, always — cannot be restricted.</TooltipContent>
                              </Tooltip>
                            )}
                            {role.is_system && !role.is_super && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-1">
                                    <Lock className="h-2.5 w-2.5" /> system
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>Built in — cannot be renamed or deleted, but its permissions can still be edited below.</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          {role.description && <p className="text-[11px] text-muted-foreground mt-0.5">{role.description}</p>}
                        </td>
                        <td className="p-3">
                          <code className="text-xs font-mono text-muted-foreground">{role.key}</code>
                        </td>
                        <td className="p-3 text-sm text-foreground">{userCount}</td>
                        <td className="p-3 text-sm text-foreground">{role.is_super ? "All" : permCount}</td>
                        <td className="p-3 text-right">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive disabled:opacity-30"
                                  disabled={!del.allowed}
                                  onClick={() => setDeleteTarget(role)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            {!del.allowed && <TooltipContent>{del.reason}</TooltipContent>}
                          </Tooltip>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* C. The matrix editor */}
        {!loading && (
          <PermissionMatrixGrid
            roles={roles}
            permissions={permissions}
            staged={staged}
            onChange={handleChange}
            actorRank={actorRank}
            actorPermissionKeys={actorPermissionKeys}
            userCountByRole={userCounts}
            diffs={diffs}
            affectedUsers={affected}
            dirty={dirty}
            saving={saveMutation.isPending}
            onSave={handleSave}
            onDiscard={handleDiscard}
            labelFor={permissionLabelByKey}
          />
        )}
      </div>

      {/* D.2 — delete confirmation. canDeleteRole already disables the trigger button when
          refused, but the dialog itself re-states why for anyone who gets here regardless
          (e.g. a stale count). */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. {deleteTarget && (userCounts[deleteTarget.key] ?? 0) > 0
                ? `${userCounts[deleteTarget.key]} user(s) are currently on this role — reassign them first.`
                : "No users are currently on this role."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={!deleteTarget || !canDeleteRole(deleteTarget, userCounts[deleteTarget.key] ?? 0).allowed}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
