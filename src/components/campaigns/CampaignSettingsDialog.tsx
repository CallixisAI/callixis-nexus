import { useMemo, useState } from "react";
import { Settings2, Clock, Users, Globe, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Campaign, ALL_DAYS, WorkHours } from "./types";
import { isValidIanaZone } from "@/lib/timezones";
import type { AiAgentRow } from "@/hooks/useAgents";
import { useAuth } from "@/contexts/AuthContext";

interface CampaignSettingsDialogProps {
  campaign: Campaign;
  // Client-feedback plan §X.2 — widened from `=> void` so handleSave can await it. The parent
  // (Campaigns.tsx's updateCampaignSettings) toasts the real outcome and re-throws on failure.
  onSave: (id: string, updates: Partial<Campaign>) => void | Promise<void>;
  // AI Agents plan Phase 3 §D.5 — lets an existing campaign be re-pointed at a different (or no)
  // agent, same real list CreateCampaignDialog uses, filtered to this campaign's own industry.
  agents: AiAgentRow[];
}

const CampaignSettingsDialog = ({ campaign, onSave, agents }: CampaignSettingsDialogProps) => {
  // Permission-overrides plan Phase 4 §H.4/§I (docs/permission-overrides-plan/README.md) — a
  // gap found while mapping this table's writes to RLS: this dialog's Save had no permission
  // check at all, even though it writes the same `campaigns` row create_delete/start_pause_stop
  // gate elsewhere on this page. Both keys' holder sets are identical in the live matrix
  // (super_admin/admin/sales_manager, all `full`), so either suffices — matches §I's own
  // UPDATE policy on `campaigns`.
  const { hasPermission } = useAuth();
  const canEditSettings = hasPermission("campaigns.create_delete") || hasPermission("campaigns.start_pause_stop");
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [workHours, setWorkHours] = useState<WorkHours>(campaign.workHours);
  const [maxLeads, setMaxLeads] = useState(campaign.maxQualifiedLeads);
  const [crmEndpoint, setCrmEndpoint] = useState(campaign.crmApiEndpoint);
  const [dailyCallCap, setDailyCallCap] = useState(campaign.dailyCallCap);
  const [timezone, setTimezone] = useState(campaign.timezone);
  const [agentId, setAgentId] = useState<string>(campaign.agentId || "");
  // Call-quality plan §C.4 — validated on change (E9), so a typo (`Asia/Manilla`) can no longer
  // save cleanly with a success toast and then silently stop the campaign forever. Mirrors the
  // dispatcher's own `isWithinWorkHours()` check exactly (src/lib/timezones.ts's own comment) —
  // a wrong-case zone like "ASIA/MANILA" is genuinely valid (verified against the real runtime,
  // not assumed) and is correctly NOT flagged here.
  const timezoneValid = isValidIanaZone(timezone);

  const agentsForIndustry = useMemo(
    () => agents.filter((a) => a.industry === campaign.industry),
    [agents, campaign.industry],
  );

  const toggleDay = (day: string) => {
    setWorkHours(prev => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter(d => d !== day)
        : [...prev.days, day],
    }));
  };

  // §X.2 — was fire-and-forget: `onSave(...)` unawaited, then setOpen(false) + a success toast
  // fired unconditionally, so a rejected save still closed the dialog AND told the user it
  // worked. Now: await, close only on success, and let the parent own the toast (Campaigns.tsx's
  // updateCampaignSettings already toasts the real outcome and re-throws on failure).
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(campaign.id, {
        workHours,
        maxQualifiedLeads: maxLeads,
        crmApiEndpoint: crmEndpoint,
        dailyCallCap,
        timezone,
        agentId: agentId || null,
      });
      setOpen(false);
    } catch {
      // Parent already surfaced the error; keep the dialog open so the user can retry.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={!canEditSettings}
          title={canEditSettings ? undefined : "Needs the Campaigns — Create/Delete or Start/Pause/Stop permission"}
          onClick={(e) => e.stopPropagation()}
        >
          <Settings2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="text-foreground text-base">{campaign.name} — Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 pt-2">
          {/* AI Agent — §D.5 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Bot className="h-4 w-4 text-primary" />
              AI Agent
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Agent for this campaign's calls</Label>
              <Select value={agentId} onValueChange={setAgentId} disabled={agentsForIndustry.length === 0}>
                <SelectTrigger className="bg-secondary border-border text-sm">
                  <SelectValue placeholder={agentsForIndustry.length === 0 ? `No agents for "${campaign.industry}" yet` : "Unassigned"} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {agentsForIndustry.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Work Hours */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Clock className="h-4 w-4 text-primary" />
              Work Hours
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Active Days</Label>
              <div className="flex gap-1.5 flex-wrap">
                {ALL_DAYS.map(day => (
                  <button
                    key={day}
                    onClick={() => toggleDay(day)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                      workHours.days.includes(day)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-muted-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Start Time</Label>
                <Input
                  type="time"
                  value={workHours.startTime}
                  onChange={(e) => setWorkHours(prev => ({ ...prev, startTime: e.target.value }))}
                  className="bg-secondary border-border text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">End Time</Label>
                <Input
                  type="time"
                  value={workHours.endTime}
                  onChange={(e) => setWorkHours(prev => ({ ...prev, endTime: e.target.value }))}
                  className="bg-secondary border-border text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Daily Call Cap</Label>
                <Input
                  type="number"
                  min={1}
                  value={dailyCallCap}
                  onChange={(e) => setDailyCallCap(Number(e.target.value))}
                  className="bg-secondary border-border text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Timezone (IANA)</Label>
                <Input
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="America/New_York"
                  className={`bg-secondary text-sm ${timezoneValid ? "border-border" : "border-destructive focus-visible:ring-destructive"}`}
                />
                {/* §C.4 — catches E9's actual bug at save time instead of letting a typo save
                    cleanly with a success toast and then silently stop the campaign forever. */}
                {!timezoneValid && (
                  <p className="text-[11px] text-destructive">
                    Not a recognized timezone — calls to this campaign would silently stop going out.
                  </p>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground/70">
              These are the actual limits the dispatcher enforces — not just a display default.
            </p>
          </div>

          {/* Max Qualified Leads */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Users className="h-4 w-4 text-primary" />
              Max Qualified Leads
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Maximum leads to qualify & push to CRM ({campaign.qualifiedLeadsSent} sent so far)
              </Label>
              <Input
                type="number"
                min={0}
                value={maxLeads}
                onChange={(e) => setMaxLeads(Number(e.target.value))}
                className="bg-secondary border-border text-sm"
                placeholder="0 = unlimited"
              />
            </div>
            {maxLeads > 0 && (
              <div className="bg-secondary/50 rounded-lg p-2.5 border border-border">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Progress</span>
                  <span>{campaign.qualifiedLeadsSent} / {maxLeads}</span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${Math.min((campaign.qualifiedLeadsSent / maxLeads) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
            {/* §E.14 — this field IS enforced now (call-ingest §E.6 + dispatch-batch §E.10), so
                the "actual limits the dispatcher enforces" line above the Work Hours group is
                finally true of all three fields. Stated here too because Max Qualified Leads is a
                separate section — a reader shouldn't have to infer it applies. */}
            <p className="text-xs text-muted-foreground/70">
              When the qualified count reaches this number, calling stops and the campaign is
              marked Completed. Set 0 for unlimited.
            </p>
          </div>

          {/* CRM API Endpoint */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Globe className="h-4 w-4 text-primary" />
              CRM API Endpoint
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Webhook URL to push qualified leads
              </Label>
              <Input
                type="url"
                value={crmEndpoint}
                onChange={(e) => setCrmEndpoint(e.target.value)}
                className="bg-secondary border-border text-sm"
                placeholder="https://your-crm.com/api/leads"
              />
            </div>
          </div>

          <Button onClick={handleSave} disabled={!canEditSettings || isSaving || !timezoneValid} className="w-full">
            {isSaving ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CampaignSettingsDialog;
