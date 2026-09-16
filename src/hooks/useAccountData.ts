import { useQuery } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
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

// lead-enrichment plan — found 2026-09-16, after James asked why the app showed 1,000 leads
// instead of the real 2,000+. Confirmed live via `supabase config pull` (no `[api]` override in
// config.toml locally or on the linked project, so both sides sit on the CLI's built-in default):
// this project's PostgREST layer caps every single request at 1,000 rows, silently — no error, no
// truncation flag, just fewer rows than actually exist. `leads` is the only table here that
// realistically grows past that on one account; a single `select("*")` on it was quietly dropping
// everything past the 1,000th most-recently-created row.
//
// Fetches every row by paging with `.range()` until a page comes back short, so this "syncs" with
// however many leads actually exist — 1,000 or 100,000 — rather than hardcoding a bigger number
// that would just move the same silent ceiling further out.
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
    if (data.length < PAGE_SIZE) break; // a short page means this was the last one
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
      if (!userId) throw new Error("No user");

      const [campaignsRes, leads, callRecords, agentsRes] = await Promise.all([
        supabase.from("campaigns").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        // lead-enrichment plan §B.4 — flagged, deliberately not narrowed. The 13 new columns on
        // `leads` (address/city/zip/home_type/... ) do make this `select("*")` a materially bigger
        // payload at real volume (2000+ rows), the same concern call-quality plan's §X.2 already
        // raised for `call_records` and left unfixed at lower volume. Left as `select("*")` here
        // too, on purpose, rather than risk a hand-maintained column list silently going stale the
        // next time a field is added to `leads` (schema-audit.mjs would not catch that drift — it
        // only checks table-level presence, not which columns a `.select()` names). Revisit if
        // dashboard load time actually becomes a problem, not preemptively.
        //
        // Paged, not a single `.select("*")` — see PAGE_SIZE's comment above. `.order("id")` is a
        // tiebreaker only: `created_at` alone isn't guaranteed unique (a chunked upload can insert
        // many rows in the same instant), and an unstable sort can skip or repeat a row across
        // pages of a `.range()` walk.
        fetchAllRows<LeadRow>((from, to) =>
          supabase.from("leads").select("*").eq("user_id", userId)
            .order("created_at", { ascending: false }).order("id", { ascending: true })
            .range(from, to)
        ),
        // call_records isn't known to have hit 1,000 rows on any account yet, but it grows with
        // every call placed and has no ceiling of its own — paged for the same reason as leads,
        // before it silently does the same thing.
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
    // B.2 — set here, on this query only, never globally (see App.tsx's defaultOptions, which
    // adds `retry` only). A stale dashboard number for 30-60s is an acceptable tradeoff for
    // fewer round trips; a stale role/permission/security row (useUsers/useRoles/useAuditLog/
    // useSecurity, none of which read this hook) is a different risk class this plan has no
    // mandate to touch.
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
