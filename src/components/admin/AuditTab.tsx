import { useMemo, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, Eye, RefreshCcw, ScrollText, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuditLog } from "@/hooks/useAuditLog";
import { AUDIT_ACTION_VERBS, AUDIT_ACTIONS, describeAuditRow, redactSecrets, type AuditLogRow } from "@/lib/auditLog";

// Phase 7 admin-module-plan (docs/admin-module-plan/PHASE-7-audit-and-hardening.md §C) — the
// audit viewer. Gated on admin.audit by Admin.tsx before this ever mounts (same belt-and-braces
// pattern RolesTab/SecurityTab already use — the route-level gate on /admin plus a second check
// here). §C.2's filters (actor, target, action type, date range) are all client-side against the
// same bounded fetch useIpAccessLog already established for the IP access log — see
// useAuditLog.ts's own header for why that's fine at this project's current volume.
//
// §C.3 — describeAuditRow() (src/lib/auditLog.ts) is the PRIMARY rendering, "James blocked
// sarah@example.com — reason: left the company", not a JSON dump. The raw before/after is still
// available, deliberately one click away in the details dialog below, for the rarer case
// someone actually needs to see exactly what changed rather than just that it did.
export function AuditTab() {
  const { data: rows = [], isLoading, isError, error, refetch, isFetching } = useAuditLog();

  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<"all" | "success" | "denied">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [detailRow, setDetailRow] = useState<AuditLogRow | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    // Inclusive of the whole `toDate` day — a bare date input has no time component, and a
    // reviewer picking "today" as the end of a range expects today's rows included, not
    // excluded by a midnight-00:00 cutoff.
    const toBound = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null;
    const fromBound = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;

    return rows.filter((row) => {
      if (actionFilter !== "all" && row.action !== actionFilter) return false;
      if (outcomeFilter === "success" && !row.success) return false;
      if (outcomeFilter === "denied" && row.success) return false;

      const created = new Date(row.created_at).getTime();
      if (fromBound !== null && created < fromBound) return false;
      if (toBound !== null && created > toBound) return false;

      if (!term) return true;
      const haystack = `${row.actor_email ?? ""} ${row.target_label ?? ""} ${row.reason ?? ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [rows, search, actionFilter, outcomeFilter, fromDate, toDate]);

  const deniedCount = rows.filter((r) => !r.success).length;

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by actor, target, or reason..."
              className="pl-10 bg-background border-border h-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-full md:w-[220px] h-10 bg-background border-border">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {AUDIT_ACTIONS.map((action) => (
                <SelectItem key={action} value={action}>
                  {AUDIT_ACTION_VERBS[action]({} as AuditLogRow).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={outcomeFilter} onValueChange={(v) => setOutcomeFilter(v as typeof outcomeFilter)}>
            <SelectTrigger className="w-full md:w-[160px] h-10 bg-background border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any outcome</SelectItem>
              <SelectItem value="success">Succeeded</SelectItem>
              <SelectItem value="denied">Denied / failed</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            aria-label="From date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full md:w-[150px] h-10 bg-background border-border"
          />
          <Input
            type="date"
            aria-label="To date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full md:w-[150px] h-10 bg-background border-border"
          />
          <Button variant="outline" className="h-10 border-border shrink-0" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </Card>

      <Card className="border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Admin activity</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {filtered.length} of {rows.length} shown{deniedCount > 0 ? ` · ${deniedCount} denied/failed in the last ${rows.length}` : ""}
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">When</th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">What happened</th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Outcome</th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isError ? (
                <tr>
                  <td colSpan={4} className="p-10 text-center">
                    <div className="flex flex-col items-center gap-2 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                      <span className="text-sm font-medium">Couldn't load the audit log</span>
                      <span className="text-xs text-muted-foreground max-w-md">
                        {error instanceof Error ? error.message : "Unknown error."}
                      </span>
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>Try again</Button>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-10 text-center text-muted-foreground">
                    <ScrollText className="h-6 w-6 mx-auto mb-2 opacity-50" />
                    {isLoading ? "Loading…" : rows.length === 0 ? "No admin activity recorded yet." : "No rows match these filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="p-3 text-sm text-foreground">{describeAuditRow(row)}</td>
                    <td className="p-3">
                      {row.success ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-500 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Succeeded
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-destructive font-medium">
                          <Ban className="h-3.5 w-3.5" /> Denied
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setDetailRow(row)} className="gap-1.5">
                        <Eye className="h-3.5 w-3.5" /> View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* One click away from the plain-language row, per this file's own header comment. */}
      <Dialog open={!!detailRow} onOpenChange={(open) => !open && setDetailRow(null)}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-display">Audit entry #{detailRow?.id}</DialogTitle>
          </DialogHeader>
          {detailRow && (
            <div className="space-y-3 text-sm">
              <p className="text-foreground">{describeAuditRow(detailRow)}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-[10px]">action: {detailRow.action}</Badge>
                <Badge variant="outline" className="text-[10px]">{detailRow.success ? "succeeded" : "denied"}</Badge>
                {detailRow.ip && <Badge variant="outline" className="text-[10px]">ip: {detailRow.ip}</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">{new Date(detailRow.created_at).toLocaleString()}</div>
              {(detailRow.before || detailRow.after) && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Before</p>
                    <pre className="text-[11px] bg-secondary/30 border border-border rounded-md p-2 overflow-x-auto">
                      {JSON.stringify(redactSecrets(detailRow.before) ?? {}, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">After</p>
                    <pre className="text-[11px] bg-secondary/30 border border-border rounded-md p-2 overflow-x-auto">
                      {JSON.stringify(redactSecrets(detailRow.after) ?? {}, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
