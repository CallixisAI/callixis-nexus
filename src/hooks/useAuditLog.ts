import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AuditLogRow } from "@/lib/auditLog";

// Phase 7 admin-module-plan (docs/admin-module-plan/PHASE-7-audit-and-hardening.md §C) — same
// shape as useSecurity.ts's useIpAccessLog: RLS (admin_audit_log's own SELECT policy, gated on
// the admin.audit permission — 20260828000000_admin_audit_log.sql §A.1) does the real access
// control; this just fetches the most recent rows and lets AuditTab.tsx filter/search them
// client-side, same as the IP access log viewer already does. No pagination yet — fine at this
// project's current volume, and §A.5's retention policy is still an open decision (the
// migration's own header), so there's no "how far back" answer to page against yet either.
const AUDIT_LOG_LIMIT = 500;

export function useAuditLog() {
  return useQuery({
    queryKey: ["admin-audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(AUDIT_LOG_LIMIT);
      if (error) throw error;
      return (data ?? []) as AuditLogRow[];
    },
  });
}
