import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";

// docs/counting-model-plan/README.md, Phase 2 — "one query". Before this, useCampaigns.ts and
// useDashboardStats.ts each ran their own independent campaigns/leads/call_records fetches
// against the same tables, on two different queryKeys that could never invalidate together
// (E4 — zero mutations in the whole repo ever touched ['dashboard-stats']). A shared cache entry
// cannot fall out of sync with itself the way two separate queryKeys reading the same tables can.
//
// Every page that needs campaigns, leads, call records, or AI agents should derive from this one
// query rather than fetching independently — see useCampaigns.ts / useDashboardStats.ts for how.

export type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];
export type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
export type CallRecordRow = Database["public"]["Tables"]["call_records"]["Row"];
export type AiAgentRow = Database["public"]["Tables"]["ai_agents"]["Row"];

export interface AccountData {
  campaigns: CampaignRow[];
  leads: LeadRow[];
  callRecords: CallRecordRow[];
  agents: AiAgentRow[];
}

export function accountDataQueryKey(userId: string | undefined) {
  return ["account-data", userId] as const;
}

export function useAccountData() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: accountDataQueryKey(userId),
    queryFn: async (): Promise<AccountData> => {
      if (!userId) throw new Error("No user");

      const [campaignsRes, leadsRes, callRecordsRes, agentsRes] = await Promise.all([
        supabase.from("campaigns").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("leads").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("call_records").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("ai_agents").select("*").eq("user_id", userId),
      ]);

      if (campaignsRes.error) throw campaignsRes.error;
      if (leadsRes.error) throw leadsRes.error;
      if (callRecordsRes.error) throw callRecordsRes.error;
      if (agentsRes.error) throw agentsRes.error;

      return {
        campaigns: campaignsRes.data || [],
        leads: leadsRes.data || [],
        callRecords: callRecordsRes.data || [],
        agents: agentsRes.data || [],
      };
    },
    enabled: !!userId,
    // B.2 — set here, on this query only, never globally (see App.tsx's defaultOptions, which
    // adds `retry` only). A stale dashboard number for 30-60s is an acceptable tradeoff for
    // fewer round trips; a stale role/permission/security row (useUsers/useRoles/useAuditLog/
    // useSecurity, none of which read this hook) is a different risk class this plan has no
    // mandate to touch.
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
