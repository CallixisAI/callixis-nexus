import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";

// Phase 5 admin-module-plan (docs/admin-module-plan/PHASE-5-ip-whitelisting.md) — TanStack
// Query pattern per CLAUDE.md's own "prefer TanStack Query for new work," matching
// src/hooks/useRoles.ts's shape.

export type IpRuleRow = Database["public"]["Tables"]["user_ip_rules"]["Row"];
export type IpAccessLogRow = Database["public"]["Tables"]["ip_access_log"]["Row"];
export type IpEnforcementMode = "off" | "audit" | "enforce";

// §B.8: security_settings has no SELECT policy at all — get_security_settings() is the only
// read path, and it returns zero rows for a caller who doesn't hold admin.roles_invites (same
// "empty means not authorized" shape RLS itself uses elsewhere). Defaulting to 'off' on an
// empty result is the safe reading: a non-admin reaching this hook at all shouldn't happen
// (the tab that renders it is already gated), and 'off' is the least-surprising fallback if
// it somehow does.
export function useSecuritySettings() {
  return useQuery({
    queryKey: ["ip-enforcement-mode"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_security_settings");
      if (error) throw error;
      return (data?.[0]?.ip_enforcement ?? "off") as IpEnforcementMode;
    },
  });
}

// §F.1/F.7 — the one write path to the enforcement mode. set_ip_enforcement() re-checks
// admin.roles_invites itself rather than trusting this hook's caller.
export function useSetIpEnforcement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (mode: IpEnforcementMode) => {
      const { error } = await supabase.rpc("set_ip_enforcement", { p_mode: mode });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ip-enforcement-mode"] }),
  });
}

// Every rule, every user — reachable via the "Holders of admin.roles_invites can view all IP
// rules" policy. Joined against profiles client-side (two queries), matching
// AuthContext.tsx's own "no nested-resource select in this codebase" convention rather than a
// Supabase embed.
export function useAllIpRules() {
  return useQuery({
    queryKey: ["admin-ip-rules"],
    queryFn: async () => {
      const [{ data: rules, error: rulesError }, { data: profiles, error: profilesError }] = await Promise.all([
        supabase.from("user_ip_rules").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
      if (rulesError) throw rulesError;
      if (profilesError) throw profilesError;
      const labelByUser = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || p.id]));
      return (rules ?? []).map((r) => ({ ...r, userLabel: labelByUser.get(r.user_id) ?? r.user_id }));
    },
  });
}

export type IpRuleWithUser = IpRuleRow & { userLabel: string };

// D-7: the signed-in user's own self-declared rules — every user can reach this, not just
// admins, since D-7 is "self-declared, admin-approved," not "admin-managed only."
export function useMyIpRules() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-ip-rules", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_ip_rules")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as IpRuleRow[];
    },
  });
}

function invalidateIpRuleQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["admin-ip-rules"] });
  queryClient.invalidateQueries({ queryKey: ["my-ip-rules"] });
}

// D-7 self-declare: always lands with approved_by null — the self-insert RLS policy's own
// WITH CHECK enforces this regardless, this just doesn't pretend otherwise client-side.
export function useCreateMyIpRule() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ cidr, label }: { cidr: string; label?: string }) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("user_ip_rules").insert({ user_id: user.id, cidr, label: label || null });
      if (error) throw error;
    },
    onSuccess: () => invalidateIpRuleQueries(queryClient),
  });
}

// Deleting your own rule only ever narrows your own access — never an escalation, so the RLS
// policy allows any user to do this for their own rows regardless of approval state.
export function useDeleteIpRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_ip_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateIpRuleQueries(queryClient),
  });
}

// §C.2/C.3 — approval is the one write that actually grants access. Admin-only per the
// "Holders of admin.roles_invites can manage all IP rules" RLS policy.
export function useApproveIpRule() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("user_ip_rules").update({ approved_by: user.id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateIpRuleQueries(queryClient),
  });
}

export function useToggleIpRuleActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from("user_ip_rules").update({ is_active: isActive }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateIpRuleQueries(queryClient),
  });
}

// §F.5/F.6 — the log an admin reviews for at least a week of 'audit' mode before flipping to
// 'enforce'. Capped at 500 rows: a review tool, not an export.
export function useIpAccessLog() {
  return useQuery({
    queryKey: ["ip-access-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ip_access_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as IpAccessLogRow[];
    },
  });
}
