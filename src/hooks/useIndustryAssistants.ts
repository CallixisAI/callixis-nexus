import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

// AI Agents plan (docs/AI-Agents-plan/README.md), Phase 4 §E.13 — TanStack Query pattern per
// CLAUDE.md's own "prefer TanStack Query for new work," matching src/hooks/useSecurity.ts's shape.

export type IndustryAssistantRow = Database["public"]["Tables"]["industry_assistants"]["Row"];

const QUERY_KEY = ["industry-assistants"] as const;

// Readable by any authenticated user (the migration's own RLS SELECT policy) — every agent
// screen and, eventually, the dispatcher need this regardless of role, so this hook is not
// itself gated. Only the mutations below require admin.vapi_assistants, enforced by the DB.
export function useIndustryAssistants() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("industry_assistants").select("*").order("industry");
      if (error) throw error;
      return (data ?? []) as IndustryAssistantRow[];
    },
  });
}

// §E.14 — super admin pastes an assistant id per industry and saves. Upsert (not insert): the
// primary key is `industry` itself, so re-saving an already-mapped industry updates the existing
// row rather than erroring on a duplicate key.
export function useSetIndustryAssistant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ industry, vapiAssistantId, label }: { industry: string; vapiAssistantId: string; label?: string }) => {
      const { error } = await supabase
        .from("industry_assistants")
        .upsert({ industry, vapi_assistant_id: vapiAssistantId, label: label || null }, { onConflict: "industry" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteIndustryAssistant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (industry: string) => {
      const { error } = await supabase.from("industry_assistants").delete().eq("industry", industry);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

// §E.15 — basic format validation before saving. Vapi assistant ids are UUIDs; this doesn't
// confirm the id actually exists on Vapi (no VAPI_API_KEY in this app to check that — E18), only
// that it's shaped like one, catching the "pasted the wrong thing entirely" mistake.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidAssistantId(value: string): boolean {
  return UUID_RE.test(value.trim());
}
