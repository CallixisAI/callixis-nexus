import { useState } from "react";
import { toast } from "sonner";
import {
  MoreVertical, Pencil, Copy, Mail, Ban, Snowflake, Sun, ShieldCheck,
  LogOut, KeyRound, Trash2, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { getRowActions, type ActionKey, type UserDisplay } from "@/lib/userLifecycle";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import {
  useBlockUser, useUnblockUser, useFreezeUser, useUnfreezeUser, useRemoveUser, useRestoreUser,
  useForceSignout, useSendPasswordReset, useCancelInvite,
} from "@/hooks/useUsers";

const ACTION_ICON: Record<ActionKey, React.ComponentType<{ className?: string }>> = {
  edit: Pencil,
  copy_link: Copy,
  resend_invite: Mail,
  cancel_invite: Trash2,
  freeze: Snowflake,
  unfreeze: Sun,
  block: Ban,
  unblock: ShieldCheck,
  remove: Trash2,
  restore: RotateCcw,
  force_signout: LogOut,
  reset_password: KeyRound,
};

interface UserActionsMenuProps {
  user: UserDisplay;
  actorRank: number;
  targetRank: number | undefined;
  onEdit: () => void;
  onResendInvite: () => void;
  onCopyLink: () => void;
  onChanged: () => void;
}

// Phase 6 (docs/admin-module-plan/PHASE-6-user-lifecycle.md §D) — [E11]'s actual fix. Replaces
// the old lone trash-icon button (no onClick handler at all) with a menu whose contents are
// computed by src/lib/userLifecycle.ts's getRowActions() — never hand-written per status here,
// so the menu and that function's own unit tests can't silently drift apart.
export function UserActionsMenu({
  user, actorRank, targetRank, onEdit, onResendInvite, onCopyLink, onChanged,
}: UserActionsMenuProps) {
  const { user: authUser } = useAuth();
  const isSelf = !!authUser && authUser.id === user.userId;

  const actions = getRowActions({
    status: user.status,
    frozenUntil: user.frozenUntil,
    isSelf,
    actorRank,
    targetRank,
  });

  const [confirmKey, setConfirmKey] = useState<ActionKey | null>(null);
  const confirmDef = confirmKey ? actions.find((a) => a.key === confirmKey) : undefined;

  const block = useBlockUser();
  const unblock = useUnblockUser();
  const freeze = useFreezeUser();
  const unfreeze = useUnfreezeUser();
  const remove = useRemoveUser();
  const restore = useRestoreUser();
  const forceSignout = useForceSignout();
  const resetPassword = useSendPasswordReset();
  const cancelInvite = useCancelInvite();

  const runSimple = async (mutate: () => Promise<unknown>, successMessage: string) => {
    try {
      await mutate();
      toast.success(successMessage);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  const handleSelect = (key: ActionKey) => {
    switch (key) {
      case "edit":
        onEdit();
        return;
      case "copy_link":
        onCopyLink();
        return;
      case "resend_invite":
        onResendInvite();
        return;
      // §D.4/§D.5: block, freeze, remove, and cancel_invite all need the confirmation dialog
      // (reason and/or typed name) — routed through it rather than firing immediately.
      case "block":
      case "freeze":
      case "remove":
      case "cancel_invite":
        setConfirmKey(key);
        return;
      case "unblock":
        runSimple(() => unblock.mutateAsync({ user_id: user.userId! }), `${user.name} unblocked.`);
        return;
      case "unfreeze":
        runSimple(() => unfreeze.mutateAsync({ user_id: user.userId! }), `${user.name} unfrozen.`);
        return;
      case "restore":
        runSimple(() => restore.mutateAsync({ user_id: user.userId! }), `${user.name} restored.`);
        return;
      case "force_signout":
        runSimple(() => forceSignout.mutateAsync({ user_id: user.userId! }), `${user.name}'s sessions were revoked.`);
        return;
      case "reset_password":
        runSimple(() => resetPassword.mutateAsync({ user_id: user.userId! }), `Password reset email sent to ${user.email}.`);
        return;
    }
  };

  const handleConfirm = async (reason: string | null, frozenUntil: string | null) => {
    if (!confirmKey) return;
    if (confirmKey === "cancel_invite") {
      await cancelInvite.mutateAsync(user.inviteId!);
      toast.success(`Invite for ${user.email} cancelled.`);
      onChanged();
      return;
    }
    if (confirmKey === "block") {
      await block.mutateAsync({ user_id: user.userId!, reason: reason! });
      toast.success(`${user.name} blocked.`);
      onChanged();
      return;
    }
    if (confirmKey === "freeze") {
      await freeze.mutateAsync({ user_id: user.userId!, reason: reason!, frozen_until: frozenUntil });
      toast.success(`${user.name} frozen.`);
      onChanged();
      return;
    }
    if (confirmKey === "remove") {
      await remove.mutateAsync({ user_id: user.userId!, reason: reason! });
      toast.success(`${user.name} removed.`);
      onChanged();
      return;
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {actions.map((action, i) => {
            const Icon = ACTION_ICON[action.key];
            return (
              <div key={action.key}>
                {/* §D.3: an unavailable action is never simply hidden with no explanation —
                    disabled AND its reason is shown, right in the item, since a Radix item
                    marked `disabled` sets pointer-events:none and can never receive a hover
                    tooltip. */}
                <DropdownMenuItem
                  disabled={action.disabled}
                  onSelect={() => handleSelect(action.key)}
                  className={action.destructive && !action.disabled ? "text-destructive focus:text-destructive" : ""}
                >
                  <Icon className="mr-2 h-3.5 w-3.5" />
                  <div className="flex flex-col">
                    <span>{action.label}</span>
                    {action.disabled && action.disabledReason && (
                      <span className="text-[10px] text-muted-foreground">{action.disabledReason}</span>
                    )}
                  </div>
                </DropdownMenuItem>
                {/* A thin visual break before the destructive tail of the menu. */}
                {!action.disabled && action.destructive && i < actions.length - 1 && actions[i + 1] && !actions[i + 1].destructive && (
                  <DropdownMenuSeparator />
                )}
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {confirmDef && (
        <ConfirmActionDialog
          open={!!confirmKey}
          onOpenChange={(open) => !open && setConfirmKey(null)}
          title={`${confirmDef.label} ${user.name}?`}
          description={
            confirmKey === "cancel_invite"
              ? `This cancels the pending invitation to ${user.email}. They will not be able to activate with the current link.`
              : confirmKey === "freeze"
              ? `${user.name} will be signed out and unable to log in until unfrozen (or the auto-unfreeze time passes). All of their data is kept.`
              : confirmKey === "block"
              ? `${user.name} will be signed out and unable to log in until an admin explicitly unblocks them. All of their data is kept.`
              : `${user.name} will disappear from the active directory and be unable to log in. This does NOT delete their campaigns, leads, or call history — it can be undone with Restore.`
          }
          confirmLabel={confirmDef.label}
          requireReason={confirmDef.requiresReason}
          requireTypedName={confirmDef.requiresTypedConfirm ? user.name : undefined}
          showFrozenUntil={confirmKey === "freeze"}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}
