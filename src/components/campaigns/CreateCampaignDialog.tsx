import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Clock, Users, Globe, Briefcase, Bot, ArrowRight } from "lucide-react";
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
import { TIMEZONES, detectBrowserTimezone } from "@/lib/timezones";
import type { AiAgentRow } from "@/hooks/useAgents";
import { useAuth } from "@/contexts/AuthContext";
import { useDraftState } from "@/hooks/useDraftState";

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

// Client-feedback plan §G.7 — every field on this form persists as one draft object so a
// half-filled campaign survives Esc / click-outside / navigating away. Cleared only by Cancel or
// a successful create (§G.10).
interface CampaignDraft {
  name: string;
  industry: string;
  agentId: string;
  workHours: WorkHours;
  maxLeads: number;
  crmEndpoint: string;
  // Call-quality plan §C.3 — detected once when the draft is first created, not re-detected on
  // every render (a browser's own zone doesn't change mid-session). The value itself, not just a
  // display hint — §C.2 is what makes this actually reach the database insert.
  timezone: string;
}

const emptyCampaignDraft = (): CampaignDraft => ({
  name: "",
  industry: "",
  agentId: "",
  workHours: defaultWorkHours,
  maxLeads: 0,
  crmEndpoint: "",
  timezone: detectBrowserTimezone(),
});

const CreateCampaignDialog = ({ onCreated, agents }: CreateCampaignDialogProps) => {
  // Permission-overrides plan Phase 4 §H.4 (docs/permission-overrides-plan/README.md) —
  // campaigns.create_delete. Only super_admin/admin/sales_manager hold it (all at `full`, no
  // partial grants exist), so presence is the whole gate.
  const { hasPermission, user } = useAuth();
  const navigate = useNavigate();
  const canCreateOrDelete = hasPermission("campaigns.create_delete");
  const [open, setOpen] = useState(false);

  const initialDraft = useMemo(emptyCampaignDraft, []);
  const { value: draft, setValue: setDraft, clearDraft, restored } = useDraftState<CampaignDraft>(
    "create-campaign",
    initialDraft,
    user?.id,
  );
  const { name, industry, agentId, workHours, maxLeads, crmEndpoint, timezone } = draft;
  const patch = (p: Partial<CampaignDraft>) => setDraft((d) => ({ ...d, ...p }));

  // §C.3 — the detected zone always appears as a selectable option even when it isn't one of the
  // curated TIMEZONES entries (the curated list is ~30 common zones; a real browser can report
  // any of ~400). Without this, a Select whose current value isn't among its own items renders
  // as if nothing were selected, even though the underlying (correct) value is still there.
  const timezoneOptions = useMemo(() => Array.from(new Set([timezone, ...TIMEZONES])), [timezone]);

  // §D.2 — filtered to the campaign's chosen industry, so two agents that both happen to serve
  // "Medical" don't get offered on an "Insurance" campaign by mistake (D-1's whole reason to
  // require an explicit pick rather than auto-matching by industry).
  const agentsForIndustry = useMemo(
    () => agents.filter((a) => a.industry === industry),
    [agents, industry],
  );

  // §F.3 — an industry the user has picked that has no agents at all: creation is blocked and the
  // form points at the AI Agents page rather than offering an "Unassigned" escape hatch.
  const industryHasNoAgents = industry !== "" && agentsForIndustry.length === 0;

  const toggleDay = (day: string) => {
    setDraft((d) => ({
      ...d,
      workHours: {
        ...d.workHours,
        days: d.workHours.days.includes(day)
          ? d.workHours.days.filter((x) => x !== day)
          : [...d.workHours.days, day],
      },
    }));
  };

  // §G.10 — the only two ways a draft is cleared.
  const cancel = () => {
    clearDraft();
    setOpen(false);
  };

  const goToAgents = () => {
    // §G — navigating away KEEPS the draft; this is not a Cancel.
    setOpen(false);
    navigate("/ai-agents");
  };

  // 2026-09-11 — "Create & Start Now" was removed, so a newly-created campaign is ALWAYS
  // Scheduled. A brand-new campaign has zero leads (they are uploaded afterwards via "Add
  // Data"), so starting it here could never dial anyone; worse, it bypassed StartCampaignDialog
  // and with it the blocking company-name gate, the 0-leads-queued warning, and the
  // qualified-leads cap warning. The campaign row's own ▶ button is the one start path now.
  // (This also retires §F.6/§X.1's `startNow` parameter — it only ever had one caller left.)
  const handleCreate = () => {
    if (!name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    if (!industry) {
      toast.error("Please select an industry");
      return;
    }
    // §F.1 — the agent is mandatory now. (The submit buttons are also disabled when the chosen
    // industry has no agents at all — §F.4 — so this toast is for the "agents exist, none
    // picked" case.)
    if (!agentId) {
      toast.error("Please select an AI agent for this campaign");
      return;
    }

    const agentName = agents.find((a) => a.id === agentId)?.name || "Unassigned";

    const newCampaign: Campaign = {
      id: crypto.randomUUID(),
      name: name.trim(),
      status: "Scheduled",
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
      // §C.2/§C.3 — the detected (or user-changed) zone, not a hardcoded "UTC". This is what
      // actually reaches the database now that useCampaigns.ts's createMutation inserts it.
      timezone,
    };

    onCreated(newCampaign);
    // §G.10 — a successful create clears the draft (the dialog closes optimistically, same as
    // before this change).
    clearDraft();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        // §G.9 — closing (Esc / click-outside / the X) no longer wipes the form. Only `cancel()`
        // and a successful create do.
        setOpen(v);
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

        {restored && (
          <p className="text-xs text-primary/80">Draft restored — your previous entries are still here. Cancel to start fresh.</p>
        )}

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
                onChange={(e) => patch({ name: e.target.value })}
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
                <Select value={industry} onValueChange={(v) => patch({ industry: v, agentId: "" })}>
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
                {/* §F.1/§F.2 — the agent is required on create now (AI Agents plan Phase 3 made
                    campaigns.agent_id actually reach the engine, so an unassigned campaign is a
                    campaign that can't call anyone). The old "optional" placeholder and
                    "…start Unassigned" helper are gone. §F.5: edit (CampaignSettingsDialog) still
                    allows Unassigned — every existing campaign is Unassigned and that must stay
                    representable. */}
                <Select value={agentId} onValueChange={(v) => patch({ agentId: v })} disabled={!industry || industryHasNoAgents}>
                  <SelectTrigger className="bg-secondary border-border text-sm">
                    <SelectValue placeholder={!industry ? "Pick an industry first" : industryHasNoAgents ? "No agents for this industry" : "Select an agent"} />
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
              </div>
            </div>

            {/* §F.3 — industry chosen, no agents exist for it. Creation is blocked; point at the
                fix rather than offering an Unassigned campaign that can never call anyone. */}
            {industryHasNoAgents && (
              <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 space-y-2">
                <p className="text-xs text-foreground">
                  No AI agent exists for <span className="font-medium">{industry}</span> yet.
                  Create one on the AI Agents page first.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-border"
                  onClick={goToAgents}
                >
                  Go to AI Agents <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            )}
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
                    setDraft((d) => ({ ...d, workHours: { ...d.workHours, startTime: e.target.value } }))
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
                    setDraft((d) => ({ ...d, workHours: { ...d.workHours, endTime: e.target.value } }))
                  }
                  className="bg-secondary border-border text-sm"
                />
              </div>
            </div>
            {/* Call-quality plan §C.3 — states the detected zone in plain words and lets it be
                changed before creating. §C.2 is what makes this value actually reach the
                database; this is just where it's chosen. */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Timezone</Label>
              <Select value={timezone} onValueChange={(v) => patch({ timezone: v })}>
                <SelectTrigger className="bg-secondary border-border text-sm">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border max-h-64">
                  {timezoneOptions.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Calls will go out {workHours.startTime}–{workHours.endTime}{" "}
                <span className="font-medium text-foreground">{timezone}</span> — detected from this browser, change
                it above if this account is managed from somewhere else.
              </p>
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
                onChange={(e) => patch({ maxLeads: Number(e.target.value) })}
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
                onChange={(e) => patch({ crmEndpoint: e.target.value })}
                className="bg-secondary border-border text-sm"
                placeholder="https://your-crm.com/api/leads"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground -mt-2">
            {/* §H.6 — the button inside a campaign is labelled "Add Data", not "Upload Data". */}
            The campaign is created as <span className="text-foreground">Scheduled</span>. Add leads
            with its "Add Data" button, then press ▶ on the campaign to start calling.
          </p>

          <div className="flex gap-2 pt-1">
            {/* §G.10 — the explicit Cancel that clears the draft. */}
            <Button variant="ghost" className="border-border" onClick={cancel}>
              Cancel
            </Button>
            {/* §F.4 — disabled when the chosen industry has no agents at all, so nobody fills
                the whole form only to be blocked on submit. */}
            <Button
              className="flex-1 glow-cyan"
              disabled={industryHasNoAgents}
              onClick={handleCreate}
            >
              Create Campaign
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateCampaignDialog;
