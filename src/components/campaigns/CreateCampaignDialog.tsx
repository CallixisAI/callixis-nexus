import { useMemo, useState } from "react";
import { Plus, Clock, Users, Globe, Briefcase, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Campaign, ALL_DAYS, WorkHours } from "./types";
import { INDUSTRIES } from "@/lib/industries";
import type { AiAgentRow } from "@/hooks/useAgents";
import { useAuth } from "@/contexts/AuthContext";

interface CreateCampaignDialogProps {
  onCreated: (campaign: Campaign) => void;
  // AI Agents plan Phase 3 §D.1/D.2/E6 — replaces the five hardcoded, nonexistent agent names
  // this dialog used to offer. Passed down rather than fetched here so this component doesn't
  // duplicate useAgents()'s query — Campaigns.tsx already needs the same list.
  agents: AiAgentRow[];
}

const defaultWorkHours: WorkHours = {
  days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  startTime: "09:00",
  endTime: "17:00",
};

const CreateCampaignDialog = ({ onCreated, agents }: CreateCampaignDialogProps) => {
  // Permission-overrides plan Phase 4 §H.4 (docs/permission-overrides-plan/README.md) —
  // campaigns.create_delete. Only super_admin/admin/sales_manager hold it (all at `full`, no
  // partial grants exist), so presence is the whole gate.
  const { hasPermission } = useAuth();
  const canCreateOrDelete = hasPermission("campaigns.create_delete");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [agentId, setAgentId] = useState<string>("");
  const [workHours, setWorkHours] = useState<WorkHours>(defaultWorkHours);
  const [maxLeads, setMaxLeads] = useState(0);
  const [crmEndpoint, setCrmEndpoint] = useState("");
  const [startImmediately, setStartImmediately] = useState(false);

  // §D.2 — filtered to the campaign's chosen industry, so two agents that both happen to serve
  // "Medical" don't get offered on an "Insurance" campaign by mistake (D-1's whole reason to
  // require an explicit pick rather than auto-matching by industry).
  const agentsForIndustry = useMemo(
    () => agents.filter((a) => a.industry === industry),
    [agents, industry],
  );

  const toggleDay = (day: string) => {
    setWorkHours((prev) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day],
    }));
  };

  const resetForm = () => {
    setName("");
    setIndustry("");
    setAgentId("");
    setWorkHours(defaultWorkHours);
    setMaxLeads(0);
    setCrmEndpoint("");
    setStartImmediately(false);
  };

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    if (!industry) {
      toast.error("Please select an industry");
      return;
    }

    const agentName = agents.find((a) => a.id === agentId)?.name || "Unassigned";

    const newCampaign: Campaign = {
      id: crypto.randomUUID(),
      name: name.trim(),
      status: startImmediately ? "Active" : "Scheduled",
      callsAttempted: 0,
      connectRate: 0,
      qualifiedRate: 0,
      industry,
      agent: agentName,
      agentId: agentId || null,
      records: [],
      workHours,
      maxQualifiedLeads: maxLeads,
      qualifiedLeadsSent: 0,
      crmApiEndpoint: crmEndpoint.trim(),
      budget: 0,
      leadsTotal: 0,
      leadCounts: { total: 0, queued: 0, dialing: 0, stalled: 0, called: 0, excluded: 0 },
      dailyCallCap: 100,
      timezone: "UTC",
    };

    onCreated(newCampaign);
    resetForm();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button className="glow-cyan" disabled={!canCreateOrDelete} title={canCreateOrDelete ? undefined : "Needs the Campaigns — Create/Delete Campaign permission"}>
          <Plus className="h-4 w-4 mr-2" />
          New Campaign
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground text-base">
            Create New Campaign
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Name & Industry */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Briefcase className="h-4 w-4 text-primary" />
              Campaign Details
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Campaign Name
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-secondary border-border text-sm"
                placeholder="e.g. Spring Real Estate Push"
                maxLength={100}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Industry
                </Label>
                <Select value={industry} onValueChange={(v) => { setIndustry(v); setAgentId(""); }}>
                  <SelectTrigger className="bg-secondary border-border text-sm">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {INDUSTRIES.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  AI Agent
                </Label>
                {/* §D.3 — an industry with zero agents isn't an error state; the campaign can
                    still be created "Unassigned" and pointed at an agent later once one exists
                    (CampaignSettingsDialog, §D.5). Required-and-empty would be a dead end. */}
                <Select value={agentId} onValueChange={setAgentId} disabled={!industry || agentsForIndustry.length === 0}>
                  <SelectTrigger className="bg-secondary border-border text-sm">
                    <SelectValue placeholder={!industry ? "Pick an industry first" : agentsForIndustry.length === 0 ? "No agents yet — optional" : "Unassigned"} />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {agentsForIndustry.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <div className="flex items-center gap-1.5">
                          <Bot className="h-3.5 w-3.5 text-primary" />
                          {a.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {industry && agentsForIndustry.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    No agents for "{industry}" yet — create one in AI Agents, or start this campaign Unassigned.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Work Hours */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Clock className="h-4 w-4 text-primary" />
              Work Hours
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Active Days
              </Label>
              <div className="flex gap-1.5 flex-wrap">
                {ALL_DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
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
                <Label className="text-xs text-muted-foreground">
                  Start Time
                </Label>
                <Input
                  type="time"
                  value={workHours.startTime}
                  onChange={(e) =>
                    setWorkHours((prev) => ({
                      ...prev,
                      startTime: e.target.value,
                    }))
                  }
                  className="bg-secondary border-border text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  End Time
                </Label>
                <Input
                  type="time"
                  value={workHours.endTime}
                  onChange={(e) =>
                    setWorkHours((prev) => ({
                      ...prev,
                      endTime: e.target.value,
                    }))
                  }
                  className="bg-secondary border-border text-sm"
                />
              </div>
            </div>
          </div>

          {/* Max Qualified Leads */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Users className="h-4 w-4 text-primary" />
              Max Qualified Leads
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Maximum leads to qualify & push to CRM (0 = unlimited)
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
          </div>

          {/* CRM Endpoint */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Globe className="h-4 w-4 text-primary" />
              CRM API Endpoint
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Webhook URL to push qualified leads (optional)
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

          <p className="text-xs text-muted-foreground -mt-2">
            Add leads after creating the campaign, from the campaign's "Upload Data" button.
          </p>

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1 border-border"
              onClick={() => {
                setStartImmediately(false);
                handleCreate();
              }}
            >
              Create as Scheduled
            </Button>
            <Button
              className="flex-1 glow-cyan"
              onClick={() => {
                setStartImmediately(true);
                handleCreate();
              }}
            >
              Create & Start Now
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateCampaignDialog;
