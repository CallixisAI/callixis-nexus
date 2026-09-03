import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";
import { useAccountData, accountDataQueryKey, type AiAgentRow } from "@/hooks/useAccountData";

export type { AiAgentRow };

type AgentInsert = Database["public"]["Tables"]["ai_agents"]["Insert"];
type AgentUpdate = Database["public"]["Tables"]["ai_agents"]["Update"];

// AI Agents plan (docs/AI-Agents-plan/README.md), Phase 2 §C.10 — reads derive from the one
// shared useAccountData() query (['account-data', userId]) rather than a second, independently
// fetched ['agents', userId] — ai_agents is already part of that query's Promise.all, so a
// second queryKey here would just be a duplicate network call for data already in cache. Every
// mutation below invalidates the shared key, matching useCampaigns.ts's own established pattern.
//
// C.11 — deliberately NOT `const { agents = [] } = useAgents()` at any call site: see
// CLAUDE.md's 2026-08-31 "/call-center rendered a blank page" lesson. `agents` is `undefined`
// while loading; callers must handle that explicitly (a loading state, or `agents ?? []` inside
// a stable useMemo), never via a destructure default feeding a dependency array.
export function useAgents() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;

  const { data: accountData, isLoading, error, isFetching } = useAccountData();

  const agents = useMemo<AiAgentRow[] | undefined>(() => {
    if (!accountData) return undefined;
    return accountData.agents;
  }, [accountData]);

  const invalidateAccountData = () => queryClient.invalidateQueries({ queryKey: accountDataQueryKey(userId) });

  const createMutation = useMutation({
    mutationFn: async (agent: Omit<AgentInsert, "user_id">) => {
      if (!userId) throw new Error("No user");
      const { data, error: insertError } = await supabase
        .from("ai_agents")
        .insert({ ...agent, user_id: userId })
        .select()
        .single();
      if (insertError) throw insertError;
      return data;
    },
    onSuccess: invalidateAccountData,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: AgentUpdate }) => {
      const { data, error: updateError } = await supabase
        .from("ai_agents")
        .update(updates)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (updateError) throw updateError;
      return data;
    },
    onSuccess: invalidateAccountData,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: deleteError } = await supabase.from("ai_agents").delete().eq("id", id).eq("user_id", userId);
      if (deleteError) throw deleteError;
    },
    onSuccess: invalidateAccountData,
  });

  return {
    agents,
    isLoading,
    isFetching,
    error,
    createAgent: createMutation.mutateAsync,
    updateAgent: updateMutation.mutateAsync,
    deleteAgent: deleteMutation.mutateAsync,
  };
}

// Phase 2 §C.9 — case-insensitive, trims whitespace; used both by the wizard's create step and
// the edit dialog (excluding the agent being edited from its own duplicate check).
export function isDuplicateAgentName(name: string, existing: AiAgentRow[], excludeId?: string): boolean {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return false;
  return existing.some((a) => a.id !== excludeId && a.name.trim().toLowerCase() === normalized);
}
