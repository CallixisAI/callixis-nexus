import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpdateInvite } from "@/hooks/useUsers";
import type { UserDisplay } from "@/lib/userLifecycle";
import { permissionsGrantedByRole, type RoleRow, type RolePermissionRow } from "@/lib/roleMatrix";

interface AppFeature {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface EditInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invite: UserDisplay; // status === 'invited'
  roles: RoleRow[];
  actorRank: number;
  appFeatures: AppFeature[];
  matrixRows: RolePermissionRow[];
  onSaved: () => void;
}

// Phase 6 (docs/admin-module-plan/PHASE-6-user-lifecycle.md §D — the 'invited' row's own "Edit
// role" action). A pending invite is a plain user_invites row an admin already has write
// access to ("Admins can manage invites" is FOR ALL) — no manage-users involvement.
//
// Permission-overrides plan (docs/permission-overrides-plan/README.md, Phase 1 §B.10, D-1) —
// this used to also carry its own permission checklist, a second door onto the same column
// the main Invite dialog wrote through. Role-only now, same as that dialog: the checklist is
// gone, replaced with the same read-only "this role grants" preview (§B.4/B.12).
export function EditInviteDialog({ open, onOpenChange, invite, roles, actorRank, appFeatures, matrixRows, onSaved }: EditInviteDialogProps) {
  const [role, setRole] = useState(invite.role);
  const [saving, setSaving] = useState(false);
  const updateInvite = useUpdateInvite();

  useEffect(() => {
    if (open) {
      setRole(invite.role);
    }
  }, [open, invite]);

  const selectedRole = roles.find((r) => r.key === role);
  const grantedKeys = new Set(permissionsGrantedByRole(role, matrixRows));
  const grantedFeatures = appFeatures.filter((f) => grantedKeys.has(f.id));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateInvite.mutateAsync({ inviteId: invite.inviteId!, role });
      toast.success(`Invite for ${invite.email} updated.`);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update the invite.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Edit invite for {invite.name}</DialogTitle>
          <DialogDescription>{invite.email} — not yet activated.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">System role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="bg-secondary/30 border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles
                  .filter((r) => r.rank >= actorRank)
                  .map((r) => (
                    <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-xs">
              <Lock className="h-3 w-3 text-primary" /> This role grants
            </Label>
            {selectedRole?.is_super ? (
              <p className="text-xs text-muted-foreground p-3 bg-secondary/20 rounded-lg border border-border">
                {selectedRole.label} is a super role — full access to everything.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 p-3 bg-secondary/20 rounded-lg border border-border max-h-56 overflow-y-auto">
                {grantedFeatures.length === 0 ? (
                  <p className="text-xs text-muted-foreground">This role grants no pages yet.</p>
                ) : (
                  grantedFeatures.map((f) => (
                    <div key={f.id} className="flex items-center gap-2">
                      <f.icon className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs">{f.label}</span>
                    </div>
                  ))
                )}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              To give this person more than their role, use Edit → Permission overrides after
              they activate.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
