import { useQuery } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";
import { isDemoModeActive, getDemoAccountData } from "@/lib/globalDemo";

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

export const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export function useAccountData() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: accountDataQueryKey(userId),
    queryFn: async (): Promise<AccountData> => {
      if (isDemoModeActive()) {
        return getDemoAccountData() as AccountData;
      }

      if (!userId) throw new Error("No user");

      const [campaignsRes, leads, callRecords, agentsRes] = await Promise.all([
        supabase.from("campaigns").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        fetchAllRows<LeadRow>((from, to) =>
          supabase.from("leads").select("*").eq("user_id", userId)
            .order("created_at", { ascending: false }).order("id", { ascending: true })
            .range(from, to)
        ),
        fetchAllRows<CallRecordRow>((from, to) =>
          supabase.from("call_records").select("*").eq("user_id", userId)
            .order("created_at", { ascending: false }).order("id", { ascending: true })
            .range(from, to)
        ),
        supabase.from("ai_agents").select("*").eq("user_id", userId),
      ]);

      if (campaignsRes.error) throw campaignsRes.error;
      if (agentsRes.error) throw agentsRes.error;

      return {
        campaigns: campaignsRes.data || [],
        leads,
        callRecords,
        agents: agentsRes.data || [],
      };
    },
    enabled: !!userId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
