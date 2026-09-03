import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";
import { describeFunctionError } from "@/lib/functionError";
import { slugifyRoleKey, type RoleDiff, type RoleRow, type PermissionRow, type RolePermissionRow } from "@/lib/roleMatrix";

export type { RoleRow, PermissionRow, RolePermissionRow, RoleDiff };

type UserRoleRow = Database["public"]["Tables"]["user_roles"]["Row"];

// Phase 3 (docs/admin-module-plan/PHASE-3-role-management-ui.md) — TanStack Query pattern
// per CLAUDE.md's own "prefer TanStack Query for new work." Four reads (roles, permissions,
// role_permissions, per-role user counts) and four writes (create role, delete role, save a
// staged matrix diff, assign a role to an existing user). RLS on roles/permissions/
// role_permissions is world-readable to any authenticated user (Phase 1 §B); user_roles is
// readable here only because reaching this hook at all already implies admin.roles_invites
// (super_admin, per D-2) — see "Admins can view all roles" in 20260812000000_roles_as_data.sql.
export function useRoleCatalogue() {
  return useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("roles").select("*").order("rank", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RoleRow[];
    },
  });
}

export function usePermissionCatalogue() {
  return useQuery({
    queryKey: ["admin-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("permissions").select("*").order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PermissionRow[];
    },
  });
}

export function useRolePermissionMatrix() {
  return useQuery({
    queryKey: ["admin-role-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("role_permissions").select("*");
      if (error) throw error;
      return (data ?? []) as RolePermissionRow[];
    },
  });
}

// §B.2: "User count is live, not cached — it is the warning shown before a delete." Backed
// by a real query (not a stale count column), refetched via the same invalidation as every
// other mutation below.
export function useRoleUserCounts() {
  return useQuery({
    queryKey: ["admin-role-user-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as Pick<UserRoleRow, "role">[]) {
        counts[row.role] = (counts[row.role] ?? 0) + 1;
      }
      return counts;
    },
  });
}

// The actor's own rank — needed client-side for §C.6/§C.8's pre-checks (canEditRoleMatrixRow).
// Derived from useAuth()'s `role` string plus whatever useRoleCatalogue() already fetched,
// rather than a second round trip.
export function useActorRoleInfo(roles: RoleRow[] | undefined) {
  const { role, isSuper } = useAuth();
  return useMemo(() => {
    const found = roles?.find((r) => r.key === role);
    return { rank: found?.rank ?? Infinity, isSuper, roleKey: role };
  }, [roles, role, isSuper]);
}

function invalidateRoleQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
  queryClient.invalidateQueries({ queryKey: ["admin-role-permissions"] });
  queryClient.invalidateQueries({ queryKey: ["admin-role-user-counts"] });
}

export interface CreateRoleInput {
  label: string;
  description?: string | null;
  copyFromRoleKey?: string | null;
}

// §D.1: "Create dialog: label, description, blank-or-copy-from starting point." §D.2: the key
// is generated from the label and immutable after this call — there is no update path for
// `roles.key` anywhere in this hook, deliberately (it's an FK target from user_roles).
export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ label, description, copyFromRoleKey }: CreateRoleInput) => {
      const key = slugifyRoleKey(label);
      if (!key) throw new Error("That label doesn't produce a usable role key. Try adding a letter or number.");

      const { error: insertError } = await supabase
        .from("roles")
        .insert({ key, label: label.trim(), description: description?.trim() || null });
      if (insertError) throw insertError;

      if (copyFromRoleKey) {
        const { data: sourceRows, error: fetchError } = await supabase
          .from("role_permissions")
          .select("permission_key, level")
          .eq("role_key", copyFromRoleKey);
        if (fetchError) throw fetchError;

        if (sourceRows && sourceRows.length > 0) {
          const rows = sourceRows.map((r) => ({ role_key: key, permission_key: r.permission_key, level: r.level }));
          const { error: copyError } = await supabase.from("role_permissions").insert(rows);
          if (copyError) throw copyError;
        }
      }

      return key;
    },
    onSuccess: () => invalidateRoleQueries(queryClient),
  });
}

// §D.2/D.4: deletion relies on the plain (non-cascading) FK from user_roles.role for
// "block if users assigned" — see the migration's own D.6/D.7 note — and on the
// roles_system_lock trigger for "refuse for is_system roles" (§D.5). Both callers should
// still run src/lib/roleMatrix.ts's canDeleteRole() first for a fast, friendly refusal;
// this mutation is the fallback when that pre-check is stale (e.g. another admin deleted
// the last user on the role a moment ago) or was bypassed.
export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (roleKey: string) => {
      const { error } = await supabase.from("roles").delete().eq("key", roleKey);
      if (error) throw error;
    },
    onSuccess: () => invalidateRoleQueries(queryClient),
  });
}

// §C.3: "Staged changes with an explicit Save — no write-on-click." Takes the output of
// src/lib/roleMatrix.ts's diffMatrix() and turns it into the minimal set of writes: an
// upsert for every add/level-change, a delete for every removal. Runs as parallel requests
// rather than one RPC — role_permissions has no single-transaction requirement here (each
// row is independent), and the four guard triggers on that table evaluate per-row regardless.
export function useSaveMatrixDiff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (diffs: RoleDiff[]) => {
      const upsertRows = diffs.flatMap((d) => [
        ...d.added.map((c) => ({ role_key: d.roleKey, permission_key: c.permissionKey, level: c.to as string })),
        ...d.changed.map((c) => ({ role_key: d.roleKey, permission_key: c.permissionKey, level: c.to as string })),
      ]);
      const deletePairs = diffs.flatMap((d) =>
        d.removed.map((c) => ({ role_key: d.roleKey, permission_key: c.permissionKey }))
      );

      if (upsertRows.length > 0) {
        const { error } = await supabase
          .from("role_permissions")
          .upsert(upsertRows, { onConflict: "role_key,permission_key" });
        if (error) throw error;
      }

      if (deletePairs.length > 0) {
        const results = await Promise.all(
          deletePairs.map(({ role_key, permission_key }) =>
            supabase.from("role_permissions").delete().eq("role_key", role_key).eq("permission_key", permission_key)
          )
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;
      }
    },
    onSuccess: () => invalidateRoleQueries(queryClient),
  });
}

// §E: "Minimal assign control on a user row." Routes through manage-users
// (action: 'set_role'), never a direct browser write — user_roles has no admin write
// policy (§E.2/§E.3). See supabase/functions/manage-users/index.ts's handleSetRole for the
// server-side rank / last-super-admin guards this depends on.
export function useAssignRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const response = await supabase.functions.invoke("manage-users", {
        body: { action: "set_role", user_id: userId, role },
      });
      if (response.error) {
        throw new Error(await describeFunctionError(response.error, "Failed to change the user's role."));
      }
      if (response.data?.error) throw new Error(response.data.error);
      return response.data as { success: boolean; user_id: string; role: string };
    },
    onSuccess: () => {
      invalidateRoleQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
}
