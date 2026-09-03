import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { describeFunctionError } from "@/lib/functionError";
import type { OverrideChoice } from "@/lib/userLifecycle";

// Phase 6 (docs/admin-module-plan/PHASE-6-user-lifecycle.md §C/§D/§E) — mutations wrapping
// manage-users' lifecycle actions, same "never a direct browser write" shape as useRoles.ts's
// useAssignRole and for the same reason: profiles.status has no admin write policy a browser
// could use instead, and user_permissions' one policy it DOES have is guarded by a trigger
// that only fires for an authenticated session, not the service-role door these actions
// actually go through — see manage-users/index.ts's own header for the full explanation.
//
// Admin.tsx's user directory is still local useState/useEffect (its own pre-existing pattern,
// unchanged by this phase — CLAUDE.md's own "AIAgents.tsx and Plugins.tsx use raw useState"
// convention already covers it), so these mutations invalidate the ["admin-users"] TanStack key
// for forward-compatibility with useAssignRole's existing invalidate call (same key, already
// reserved by that hook) but Admin.tsx itself re-fetches directly in each action's onSuccess,
// same as it already does after inviting or resending an invite.

async function invokeManageUsers<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke("manage-users", { body });
  if (error) throw new Error(await describeFunctionError(error, fallback));
  if (data?.error) throw new Error(data.error as string);
  return data as T;
}

function useLifecycleMutation<TArgs extends { user_id: string }, TResult = { success: boolean }>(
  action: string,
  fallback: string
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: TArgs) => invokeManageUsers<TResult>({ action, ...args }, fallback),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });
}

export function useBlockUser() {
  return useLifecycleMutation<{ user_id: string; reason: string }, { success: boolean; ban_applied: boolean; note: string }>(
    "block",
    "Failed to block the user."
  );
}
export function useUnblockUser() {
  return useLifecycleMutation<{ user_id: string }>("unblock", "Failed to unblock the user.");
}
export function useFreezeUser() {
  return useLifecycleMutation<{ user_id: string; reason: string; frozen_until?: string | null }>(
    "freeze",
    "Failed to freeze the user."
  );
}
export function useUnfreezeUser() {
  return useLifecycleMutation<{ user_id: string }>("unfreeze", "Failed to unfreeze the user.");
}
export function useRemoveUser() {
  return useLifecycleMutation<{ user_id: string; reason: string }>("remove", "Failed to remove the user.");
}
export function useRestoreUser() {
  return useLifecycleMutation<{ user_id: string }>("restore", "Failed to restore the user.");
}
export function useForceSignout() {
  return useLifecycleMutation<{ user_id: string }>("force_signout", "Failed to sign the user out.");
}
export function useSendPasswordReset() {
  return useLifecycleMutation<{ user_id: string }, { success: boolean; email: string }>(
    "reset_password",
    "Failed to send the reset email."
  );
}
export function useUpdateUserPermissions() {
  return useLifecycleMutation<{ user_id: string; overrides: Record<string, OverrideChoice> }>(
    "update_permissions",
    "Failed to save permission overrides."
  );
}

// §E.2/E.3 — the target user's raw override rows: the tri-state control's initial state, and
// (combined with role_permissions + is_super, both already world-readable) the input to
// src/lib/userLifecycle.ts's computeEffectivePermissions(). That function mirrors
// get_permissions_for() rather than calling it — that RPC is deliberately service_role-only
// (manage-users' own grant-ceiling check), not exposed to the browser for an arbitrary user id.
export function useUserPermissionOverrides(userId: string | null) {
  return useQuery({
    queryKey: ["admin-user-permission-overrides", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_permissions")
        .select("permission_key, effect")
        .eq("user_id", userId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// §D.1 — a pending invite is a plain user_invites row; "Admins can manage invites" is FOR ALL,
// which already covers DELETE, so cancelling one needs no manage-users involvement at all —
// unlike an active user, which has no equivalent browser write path (see that function's own
// §D.1 comment for exactly why the two need different code paths behind the same icon).
export function useCancelInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.from("user_invites").delete().eq("id", inviteId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });
}

// §E — editing a PENDING invite's role is the same story: it's a real user_invites row an
// admin already has write access to, not a real account manage-users needs to touch.
// Permission-overrides plan (docs/permission-overrides-plan/README.md, Phase 1 §B.11, D-1) —
// `permissions` dropped from both the signature and the write. An invite no longer carries a
// personal permission list to edit; EditInviteDialog is role-only now, matching the invite
// dialog it's a variant of.
export function useUpdateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ inviteId, role }: { inviteId: string; role: string }) => {
      const { error } = await supabase.from("user_invites").update({ role }).eq("id", inviteId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });
}
