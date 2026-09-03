import { useState } from "react";
import { toast } from "sonner";
import { ShieldAlert, ShieldCheck, ShieldOff, Trash2, Check, ScrollText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useSecuritySettings,
  useSetIpEnforcement,
  useAllIpRules,
  useDeleteIpRule,
  useApproveIpRule,
  useToggleIpRuleActive,
  useIpAccessLog,
  type IpEnforcementMode,
} from "@/hooks/useSecurity";

// Phase 5 admin-module-plan (docs/admin-module-plan/PHASE-5-ip-whitelisting.md §F.8) — the
// admin UI for managing the IP allowlist. Gated by the same admin.roles_invites permission as
// the Roles tab (Admin.tsx already checks this before rendering "Security" at all).
//
// §F is the operational core of this component, not an afterthought: the mode switch defaults
// to whatever security_settings.ip_enforcement currently is (migration default 'off'), and
// flipping to 'enforce' is behind its own confirmation dialog that restates §F.5/F.6's
// requirement (a week of 'audit' logs reviewed first) rather than letting a click silently
// lock out the whole company, including whoever clicked it.
//
// D-7's self-declare half (any signed-in user adding their own network) deliberately does NOT
// live here — see src/components/settings/MyNetworksCard.tsx's own header comment for why an
// earlier version of this build got that wrong by nesting it inside this admin-only tab. This
// component is the "admin-approved" half only: approve/deactivate/delete any user's declared
// range, plus the enforcement-mode switch and the access log.
export function SecurityTab() {
  const { data: mode = "off", isLoading: modeLoading } = useSecuritySettings();
  const setMode = useSetIpEnforcement();

  const { data: allRules = [], isLoading: rulesLoading } = useAllIpRules();
  const deleteRule = useDeleteIpRule();
  const approveRule = useApproveIpRule();
  const toggleActive = useToggleIpRuleActive();

  const { data: logRows = [], isLoading: logLoading } = useIpAccessLog();

  const [confirmEnforce, setConfirmEnforce] = useState(false);

  const handleModeChange = async (next: IpEnforcementMode) => {
    if (next === "enforce" && mode !== "enforce") {
      setConfirmEnforce(true);
      return;
    }
    try {
      await setMode.mutateAsync(next);
      toast.success(`IP enforcement set to "${next}".`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change enforcement mode.");
    }
  };

  const confirmEnforceNow = async () => {
    try {
      await setMode.mutateAsync("enforce");
      toast.success('IP enforcement set to "enforce".');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change enforcement mode.");
    } finally {
      setConfirmEnforce(false);
    }
  };

  const pendingCount = allRules.filter((r) => !r.approved_by).length;
  const distinctIpsByUser = new Map<string, Set<string>>();
  for (const row of logRows) {
    if (!row.user_id || !row.ip) continue;
    if (!distinctIpsByUser.has(row.user_id)) distinctIpsByUser.set(row.user_id, new Set());
    distinctIpsByUser.get(row.user_id)!.add(row.ip);
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* §A's result, recorded for whoever reads this screen — S.1's "which header is
            authoritative and whether RLS enforcement is possible" needs to be visible here,
            not just in a doc nobody looking at this page will find. */}
        <Alert className="border-primary/30 bg-primary/5">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <AlertTitle className="text-sm">Enforcement is real, not just advisory</AlertTitle>
          <AlertDescription className="text-xs text-muted-foreground">
            The pre-flight check (§A) confirmed <code className="font-mono">cf-connecting-ip</code> is
            reachable from the database and cannot be forged by a client — so the database-level check
            below, not just the post-login screen, actually blocks a stolen token used directly against
            the API in <strong>enforce</strong> mode. Confirmed live 2026-08-26.
          </AlertDescription>
        </Alert>

        {/* §F: mode switch */}
        <Card className="border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Enforcement mode</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Applies instantly, no deploy needed — this table is the whole rollback mechanism.
              </p>
            </div>
            {!modeLoading && <ModeBadge mode={mode} />}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={mode === "off" ? "default" : "outline"}
              disabled={setMode.isPending}
              onClick={() => handleModeChange("off")}
              className="gap-1.5"
            >
              <ShieldOff className="h-3.5 w-3.5" /> Off
            </Button>
            <Button
              size="sm"
              variant={mode === "audit" ? "default" : "outline"}
              disabled={setMode.isPending}
              onClick={() => handleModeChange("audit")}
              className="gap-1.5"
            >
              <ScrollText className="h-3.5 w-3.5" /> Audit (log only)
            </Button>
            <Button
              size="sm"
              variant={mode === "enforce" ? "destructive" : "outline"}
              disabled={setMode.isPending}
              onClick={() => handleModeChange("enforce")}
              className="gap-1.5"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Enforce (blocks)
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            §F.1/F.5: ship in <strong>audit</strong> for at least a week and review the log below before
            ever switching to <strong>enforce</strong> — most staff are on dynamic IPs, and the first
            person locked out is usually whoever turned it on.
          </p>
        </Card>

        {/* §C.2/C.3: admin approval — the write that actually grants access. Users declare
            their own networks from Settings (MyNetworksCard); this table is every user's rows,
            for review and approval. */}
        <Card className="border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div>
              <h3 className="text-sm font-semibold text-foreground">All declared networks</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {allRules.length} total{pendingCount > 0 ? ` · ${pendingCount} awaiting approval` : ""}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</th>
                  <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Range</th>
                  <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active</th>
                  <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rulesLoading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground text-sm">
                      Loading…
                    </td>
                  </tr>
                ) : allRules.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground text-sm">
                      No networks declared by anyone yet — users declare their own from Settings.
                    </td>
                  </tr>
                ) : (
                  allRules.map((r) => (
                    <tr key={r.id} className="hover:bg-secondary/10 transition-colors">
                      <td className="p-3 text-sm text-foreground">{r.userLabel}</td>
                      <td className="p-3">
                        <code className="text-xs font-mono">{r.cidr}</code>
                        {r.label && <span className="text-xs text-muted-foreground ml-2">{r.label}</span>}
                      </td>
                      <td className="p-3">
                        {r.approved_by ? (
                          <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-500">
                            Approved
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500">
                            Pending
                          </Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <Switch
                          checked={r.is_active}
                          onCheckedChange={(checked) => toggleActive.mutate({ id: r.id, isActive: checked })}
                        />
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!r.approved_by && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-emerald-500"
                                  onClick={() => approveRule.mutate(r.id)}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Approve — grants access from this range</TooltipContent>
                            </Tooltip>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteRule.mutate(r.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* §F.5/F.6: the log an admin has to actually read before enforcing. */}
        <Card className="border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Recent login attempts</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {distinctIpsByUser.size > 0
                ? `${distinctIpsByUser.size} user(s) with logged attempts — review the distinct-IP spread per user before enforcing.`
                : "No attempts logged yet."}
            </p>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border bg-muted/30">
                  <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">When</th>
                  <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">IP</th>
                  <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mode</th>
                  <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logLoading ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground text-sm">
                      Loading…
                    </td>
                  </tr>
                ) : logRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground text-sm">
                      Nothing logged yet — session-guard writes a row on every login attempt, in every mode.
                    </td>
                  </tr>
                ) : (
                  logRows.slice(0, 100).map((row) => (
                    <tr key={row.id} className="hover:bg-secondary/10 transition-colors">
                      <td className="p-3 text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</td>
                      <td className="p-3">
                        <code className="text-xs font-mono">{row.ip ?? "—"}</code>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 capitalize">
                          {row.mode}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {row.allowed ? (
                          <span className="text-xs text-emerald-500">Allowed</span>
                        ) : (
                          <span className="text-xs text-destructive">Denied</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* §F.1/F.5 restated at the one moment it matters most — the click that turns blocking
          on for real. */}
      <AlertDialog open={confirmEnforce} onOpenChange={setConfirmEnforce}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" /> Switch to enforce mode?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will actually block logins and API access from unlisted networks — including,
              possibly, your own. §F.5 requires at least a week of <strong>audit</strong>-mode logs
              reviewed first ({distinctIpsByUser.size} user(s) currently logged). Make sure every real
              admin has an approved network before continuing, and that break-glass is documented
              somewhere outside this app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmEnforceNow} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              I've reviewed the logs — enforce now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

function ModeBadge({ mode }: { mode: IpEnforcementMode }) {
  if (mode === "enforce") {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
        <ShieldCheck className="h-3 w-3" /> Enforcing
      </Badge>
    );
  }
  if (mode === "audit") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-500">
        <ScrollText className="h-3 w-3" /> Auditing
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-muted-foreground/40 text-muted-foreground">
      <ShieldOff className="h-3 w-3" /> Off
    </Badge>
  );
}
