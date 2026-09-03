import { useState } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useAssignRole } from "@/hooks/useRoles";
import type { RoleRow } from "@/lib/roleMatrix";
import { ConfirmActionDialog } from "./ConfirmActionDialog";

// Phase 3 §E.1 — "Minimal assign control on a user row." Phase 6 builds the full edit-user
// dialog; this is only enough to demonstrate the loop (§S.1): pick a user, change their
// role, confirm the effect. Always goes through manage-users (useAssignRole), never a direct
// browser write — see that hook's own comment for why.
interface AssignRoleSelectProps {
  userId: string;
  currentRole: string;
  roles: RoleRow[];
  actorRank: number;
  disabled?: boolean;
  // Permission-overrides plan (docs/permission-overrides-plan/README.md, Phase 2 §C.5) — true
  // when this user currently holds any personal override (allow or deny). Changing their role
  // while that's true is exactly the trap James hit ("Why this exists"): the role change works
  // perfectly and the sidebar doesn't move, because a second, independent source of access is
  // still in effect. Warn before committing, don't silently let it happen again.
  hasExceptions?: boolean;
}

export function AssignRoleSelect({ userId, currentRole, roles, actorRank, disabled, hasExceptions }: AssignRoleSelectProps) {
  const [pending, setPending] = useState(false);
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const assignRole = useAssignRole();

  const commitChange = async (role: string) => {
    setPending(true);
    try {
      await assignRole.mutateAsync({ userId, role });
      toast.success("Role updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change the role.");
    } finally {
      setPending(false);
    }
  };

  const handleChange = (role: string) => {
    if (role === currentRole) return;
    if (hasExceptions) {
      // Ask first — see ConfirmActionDialog's onConfirm signature (reason/frozenUntil are
      // unused here; this isn't a destructive/reasoned action, just a warning gate).
      setPendingRole(role);
      return;
    }
    void commitChange(role);
  };

  return (
    <>
      <Select value={currentRole} onValueChange={handleChange} disabled={disabled || pending}>
        <SelectTrigger className="h-8 w-[160px] bg-secondary/30 border-border text-xs">
          {pending ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving…
            </span>
          ) : (
            <SelectValue />
          )}
        </SelectTrigger>
        <SelectContent>
          {roles.map((role) => (
            // §C.8's rank rule, mirrored here: an actor should not be offered a role more
            // powerful than their own. The server (manage-users' handleSetRole) is the real
            // enforcement — this only keeps the dropdown from offering a choice that would
            // just come back as a 403.
            <SelectItem key={role.key} value={role.key} disabled={role.rank < actorRank}>
              {role.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ConfirmActionDialog
        open={!!pendingRole}
        onOpenChange={(open) => !open && setPendingRole(null)}
        title="This user has personal exceptions"
        description="Their new role will have no visible effect until these are cleared — the exceptions stay in place and keep granting access independently of the role. Clear them from Edit User first if you want the role change to actually take effect."
        confirmLabel="Change role anyway"
        destructive={false}
        onConfirm={async () => {
          if (pendingRole) await commitChange(pendingRole);
        }}
      />
    </>
  );
}
