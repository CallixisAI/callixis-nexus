import { useMemo, useState } from "react";
import { Upload, ChevronDown, ChevronRight, Play, Pause, RotateCcw, CheckCircle, XCircle, Clock, AlertTriangle, Ban, HelpCircle, Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown, ShieldAlert } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TimeframeFilter, type TimeframePreset } from "@/components/TimeframeFilter";
import { toast } from "sonner";
import { Campaign, CallRecord, statusColor } from "@/components/campaigns/types";
import CampaignSettingsDialog from "@/components/campaigns/CampaignSettingsDialog";
import CreateCampaignDialog from "@/components/campaigns/CreateCampaignDialog";
import UploadLeadsDialog from "@/components/campaigns/UploadLeadsDialog";
import StartCampaignDialog from "@/components/campaigns/StartCampaignDialog";
import CallDetailSheet from "@/components/campaigns/CallDetailSheet";
import { useCampaigns, UNASSIGNED_CAMPAIGN_ID } from "@/hooks/useCampaigns";
import { useAgents } from "@/hooks/useAgents";
import { fireDispatchTrigger } from "@/lib/dispatchTrigger";
import { COMPLETION_REASON_LABEL, DISPLAY_STATUS_LABEL, attemptSummaryLine, campaignCompletionReason, describeAttempts, formatPercent, type DisplayStatus } from "@/lib/callPipeline";
import { detectBrowserTimezone, needsTimezoneAttention } from "@/lib/timezones";
import { needsCompanyName } from "@/lib/companyIdentity";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

// C.13 — Record<DisplayStatus, …>, not Record<string, …>: a new state added to the union breaks
// the build here instead of silently falling back to "pending" the way the old open-ended Record
// let it. Reuses DISPLAY_STATUS_LABEL for the label so the copy lives in one place.
const callStatusIcons: Record<DisplayStatus, { icon: React.ElementType; color: string }> = {
  "completed": { icon: CheckCircle, color: "text-primary" },
  "no-answer": { icon: XCircle, color: "text-yellow-400" },
  "failed": { icon: XCircle, color: "text-destructive" },
  "queued": { icon: Clock, color: "text-muted-foreground" },
  "dialing": { icon: Play, color: "text-primary" },
  "stalled": { icon: AlertTriangle, color: "text-orange-400" },
  "excluded": { icon: Ban, color: "text-muted-foreground" },
  "unattributed": { icon: HelpCircle, color: "text-muted-foreground" },
};

// C.14 — one predicate per tab, used for both the TabsTrigger counts and the body filter, so the
// two can never quietly disagree the way two separately hand-written filters could. "Pending"
// groups the three not-yet-resolved buckets; "Failed" groups everything terminal-but-not-
// completed, including excluded (opted out / retry-capped) and unattributed (debris) rows, so
// every record is still reachable from some tab.
const TAB_PREDICATES: Record<"all" | "completed" | "pending" | "failed", (status: DisplayStatus) => boolean> = {
  all: () => true,
  completed: (status) => status === "completed",
  pending: (status) => status === "queued" || status === "dialing" || status === "stalled",
  failed: (status) => status === "failed" || status === "no-answer" || status === "excluded" || status === "unattributed",
};

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

type SortConfig = { key: keyof CallRecord; direction: 'asc' | 'desc' } | null;

const Campaigns = () => {
  const { campaigns = [], isLoading, createCampaign, updateCampaign: updateDBCampaign, addLeads, deleteCampaign, deleteCallRecord, deleteLead, overrideOutcome } = useCampaigns();
  // Permission-overrides plan Phase 4 §H.4 (docs/permission-overrides-plan/README.md). Each of
  // the 4 campaigns.* sub-functions gates one distinct action; create_delete and
  // start_pause_stop/bulk_lead_upload have only `full` grants in the live matrix (presence is
  // the whole gate), while lead_management has a real full-vs-view split (support_manager holds
  // it at `view` only — E21) so viewing the leads table needs presence, editing/deleting a lead
  // needs `full`.
  const { hasPermission, hasPermissionAtLeast, profile, profileLoaded } = useAuth();
  const navigate = useNavigate();
  // 2026-09-11 — account-level, NOT per-campaign, so this is checked once here and
  // rendered once below. `profiles.company_name` is what the assistant speaks as
  // {{company_name}}; blank resolves to "" and silently mangles every greeting.
  //
  // Gated on `profileLoaded` on purpose: `profile` is null until the fetch resolves, so
  // without it this reads "missing" on every first render — the banner would flash yellow
  // on each page load and the Start button would sit disabled for a beat on a perfectly
  // well-configured account. Absence of data is not the same claim as an empty field.
  const companyNameMissing = profileLoaded && needsCompanyName(profile?.company_name);
  const canManageCampaigns = hasPermission("campaigns.create_delete");
  const canStartPause = hasPermission("campaigns.start_pause_stop");
  const canUploadLeads = hasPermission("campaigns.bulk_lead_upload");
  const canViewLeads = hasPermission("campaigns.lead_management");
  const canManageLeads = hasPermissionAtLeast("campaigns.lead_management", "full");
  // AI Agents plan Phase 3 §D.1/D.5 — shares useAccountData()'s cache with useCampaigns() above
  // (same queryKey), so this is not a second network fetch. A stable `useMemo` default (not
  // `= []` on the destructure) so CreateCampaignDialog/CampaignSettingsDialog's own `agents`-keyed
  // useMemos below don't get invalidated by a fresh array reference on every render — CLAUDE.md's
  // 2026-08-31 "/call-center" lesson.
  const { agents } = useAgents();
  const agentsList = useMemo(() => agents ?? [], [agents]);
  // Call-quality plan §C.5/§C.6 — computed once per page load (a browser's own zone doesn't
  // change mid-session), used only to decide whether the narrow "still on the UTC default"
  // banner below should show, never written anywhere by itself.
  const browserTimezone = useMemo(() => detectBrowserTimezone(), []);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  // §H — undefined from the header "Upload Data" button (full picker), a campaign id from a
  // per-campaign "Add Data" button (picker replaced by a fixed read-only target).
  const [uploadLockedCampaignId, setUploadLockedCampaignId] = useState<string | undefined>(undefined);
  const [startTarget, setStartTarget] = useState<Campaign | null>(null);
  const [detailRecord, setDetailRecord] = useState<CallRecord | null>(null);
  // D.9 — deliberately left decorative here, unlike Dashboard.tsx/Reports.tsx (both wired to
  // real call-attempt filtering via useDashboardStats(timeframeRange)). This page's table is
  // every lead/call for a campaign — its own contact list, not a historical event log — so a
  // "last 7 days" filter narrowing it down would hide leads a user came here specifically to
  // find. Raised, not silently left: revisit if that assumption turns out wrong.
  const [timeframe, setTimeframe] = useState<TimeframePreset>("30d");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});

  // Bulk selection and filters
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<{ name?: string; phone?: string; email?: string; status?: string; duration?: string; date?: string }>({});
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  // Reset selections when campaign changes
  const handleCampaignClick = (campaignId: string) => {
    setExpandedCampaign(expandedCampaign === campaignId ? null : campaignId);
    setSelectedLeadIds(new Set()); // Clear selection when switching campaigns
    setFilters({}); // Clear filters when switching campaigns
    setSortConfig(null); // Clear sort when switching campaigns
  };

  const handleSort = (key: keyof CallRecord) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return null;
      }
      return { key, direction: 'asc' };
    });
  };

  const toggleSelectLead = (id: string) => {
    const newSelected = new Set(selectedLeadIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedLeadIds(newSelected);
  };

  const toggleSelectAll = (recordIds: string[]) => {
    if (selectedLeadIds.size === recordIds.length && recordIds.every(id => selectedLeadIds.has(id))) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(recordIds));
    }
  };

  const deleteRecordByKind = async (record: Pick<CallRecord, "id" | "kind">) => {
    if (record.kind === "lead") await deleteLead(record.id);
    else await deleteCallRecord(record.id);
  };

  const handleBulkDelete = async (records: CallRecord[]) => {
    if (selectedLeadIds.size === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedLeadIds.size} leads?`)) return;

    try {
      const toDelete = records.filter(r => selectedLeadIds.has(r.id));
      for (const record of toDelete) {
        await deleteRecordByKind(record);
      }
      toast.success(`Deleted ${selectedLeadIds.size} leads`);
      setSelectedLeadIds(new Set());
    } catch (err) {
      toast.error(`Failed to delete: ${errorMessage(err)}`);
    }
  };

  const getFilteredAndSortedRecords = (records: CallRecord[]) => {
    let result = records.filter(r => {
      const matchesName = !filters.name || r.name.toLowerCase().includes(filters.name.toLowerCase());
      const matchesPhone = !filters.phone || r.phone.includes(filters.phone);
      const matchesEmail = !filters.email || r.email.toLowerCase().includes(filters.email.toLowerCase());
      const matchesStatus = !filters.status || r.status === filters.status;
      const matchesDuration = !filters.duration || (r.duration || "").toLowerCase().includes(filters.duration.toLowerCase());
      const matchesDate = !filters.date || (r.callDate || "").toLowerCase().includes(filters.date.toLowerCase());
      return matchesName && matchesPhone && matchesEmail && matchesStatus && matchesDuration && matchesDate;
    });

    if (sortConfig) {
      result = [...result].sort((a, b) => {
        const aVal = a[sortConfig.key] || "";
        const bVal = b[sortConfig.key] || "";

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  };

  const toggleCampaignStatus = async (campaign: Campaign, e: React.MouseEvent) => {
    e.stopPropagation();
    if (campaign.status === "Active") {
      // §B.5 — pausing stops *new* dispatches; calls already in flight finish on their own.
      try {
        await updateDBCampaign({ id: campaign.id, updates: { status: "Paused" } });
        toast.success(`"${campaign.name}" paused — no new calls will start. Any call already in progress will finish.`);
      } catch (err) {
        toast.error(`Failed to pause: ${errorMessage(err)}`);
      }
      return;
    }
    // §B.4 — starting always goes through the confirmation dialog with real numbers.
    setStartTarget(campaign);
  };

  const handleConfirmStart = async (campaign: Campaign) => {
    // 2026-09-11 — StartCampaignDialog already disables its own button for this, and
    // toggleCampaignStatus routes every start through that dialog (there is no bypass today).
    // Re-checked here anyway so a future call site that skips the dialog fails loudly instead
    // of quietly dialing leads with a broken greeting. Throws so the dialog stays open.
    if (companyNameMissing) {
      toast.error("Set your company name in Settings → Company first — the AI says it out loud on every call.");
      throw new Error("Company name is not set");
    }
    try {
      await updateDBCampaign({ id: campaign.id, updates: { status: "Active" } });
      // Event-driven Phase 4 §B.1 — after the DB write, never before (a trigger fired earlier
      // could race the tick and still see "paused"). Fire-and-forget: dispatch-trigger never
      // throws (§A.3), and there's nothing here worth blocking the success toast on.
      void fireDispatchTrigger("campaign_started", campaign.id);
      toast.success(`"${campaign.name}" started`);
    } catch (err) {
      toast.error(`Failed to start: ${errorMessage(err)}`);
      throw err;
    }
  };

  const updateCampaignSettings = async (id: string, updates: Partial<Campaign>) => {
    try {
      await updateDBCampaign({ id, updates });
      toast.success(`Settings updated`);
    } catch (err) {
      toast.error(`Failed to update settings: ${errorMessage(err)}`);
      // §X.2 — re-throw so CampaignSettingsDialog keeps itself open on failure instead of
      // closing and (previously) also claiming success.
      throw err;
    }
  };

  const handleCreate = async (c: Campaign) => {
    try {
      await createCampaign(c);
      toast.success("Campaign created — upload leads next to start calling.");
    } catch (err) {
      toast.error(`Failed to save: ${errorMessage(err)}`);
    }
  };

  const handleDeleteCampaign = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete campaign "${name}"? This will also delete all associated leads.`)) return;
    try {
      await deleteCampaign(id);
      toast.success("Campaign deleted");
    } catch (err) {
      toast.error(`Failed to delete: ${errorMessage(err)}`);
    }
  };

  const handleDeleteRecord = async (record: CallRecord) => {
    if (!window.confirm("Are you sure you want to delete this lead?")) return;
    try {
      await deleteRecordByKind(record);
      toast.success("Lead deleted");
    } catch (err) {
      toast.error(`Failed to delete lead: ${errorMessage(err)}`);
    }
  };

  const handleOverride = async (args: { leadId: string | null; callRecordId: string | null; outcome: string; isQualified: boolean }) => {
    await overrideOutcome(args);
  };

  const SortIcon = ({ column }: { column: keyof CallRecord }) => {
    if (sortConfig?.key !== column) return <ArrowUpDown className="ml-1.5 h-3 w-3 text-muted-foreground/50" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-1.5 h-3 w-3 text-primary" /> : <ArrowDown className="ml-1.5 h-3 w-3 text-primary" />;
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading campaigns from database...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display text-foreground">Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your outbound AI calling campaigns</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <TimeframeFilter value={timeframe} onChange={setTimeframe} customRange={customRange} onCustomRangeChange={setCustomRange} compact />
          <Button
            variant="outline"
            className="border-border"
            disabled={!canUploadLeads}
            title={canUploadLeads ? undefined : "Needs the Campaigns — Bulk Lead Upload permission"}
            onClick={() => { setUploadLockedCampaignId(undefined); setUploadDialogOpen(true); }}
          >
            <Upload className="h-4 w-4 mr-2" />Upload Data
          </Button>
          <CreateCampaignDialog onCreated={handleCreate} agents={agentsList} />
        </div>
      </div>

      {/* 2026-09-11 — the company-name gap, found on a real test call (`call_records`
          2026-09-11 08:30:56 UTC): every one of the 10 live `profiles` rows had
          `company_name` NULL, so dispatch-batch sent `company_name: ''` and the assistant
          read "...calling on behalf of [nothing] We help Los Angeles homeowners...".
          Deliberately page-level, not per-campaign-card like the timezone banner below:
          this is one account-wide setting, so a per-card copy would repeat identically on
          every row. Mirrors that banner's shape otherwise. */}
      {companyNameMissing && (
        <div className="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-foreground">
          <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed">
            <p className="font-medium">Your company name is blank — and the AI says it out loud on every call.</p>
            <p className="text-muted-foreground text-xs mt-1">
              The agent introduces itself as "…calling on behalf of <span className="italic">your company</span>". While this
              is empty, every caller hears that sentence with a hole in it. Campaigns can't be started until it's set.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-yellow-500/40"
            onClick={() => navigate("/settings?tab=company")}
          >
            Set company name
          </Button>
        </div>
      )}

      {/* Campaign List */}
      <div className="space-y-3">
        {campaigns.length === 0 && (
          <div className="text-center p-8 bg-card border border-border rounded-lg text-muted-foreground">
            No campaigns found. Create your first real campaign above!
          </div>
        )}
        {campaigns.map((campaign: Campaign) => {
          const isUnassigned = campaign.id === UNASSIGNED_CAMPAIGN_ID;
          // Only meaningful for a Completed campaign; null when neither ending explains it
          // (e.g. more leads were uploaded after it finished).
          const completionReason = campaignCompletionReason(
            campaign.qualifiedLeadsSent,
            campaign.maxQualifiedLeads,
            campaign.leadCounts,
          );
          return (
          <div key={campaign.id} className="bg-card rounded-lg border border-border overflow-hidden">
            {/* Campaign Row */}
            <div
              className="flex items-center gap-4 p-4 cursor-pointer hover:bg-secondary/30 transition-colors"
              onClick={() => handleCampaignClick(campaign.id)}
            >
              <div className="text-muted-foreground">
                {expandedCampaign === campaign.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{campaign.name}</p>
                <p className="text-xs text-muted-foreground">
                  {campaign.industry} · {campaign.agent}
                  {campaign.workHours?.days?.length > 0 && (
                    <span className="ml-2 text-muted-foreground/60">
                      · {campaign.workHours.days.join(", ")} {campaign.workHours.startTime}–{campaign.workHours.endTime}
                    </span>
                  )}
                </p>
                {campaign.status === "Active" && campaign.leadsTotal > 0 && (
                  <div className="mt-1.5 flex items-center gap-2 max-w-xs">
                    <div className="h-1 flex-1 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min((campaign.leadCounts.called / campaign.leadsTotal) * 100, 100)}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {campaign.leadCounts.called}/{campaign.leadsTotal} called{campaign.leadCounts.dialing > 0 ? ` · ${campaign.leadCounts.dialing} dialing now` : ""}
                    </span>
                  </div>
                )}
                {/* Call-quality plan §C.5/§C.6 — narrowly scoped: fires ONLY when this campaign is
                    still on the literal database default ('UTC', E8's own bug) and this browser
                    isn't itself in UTC. Never fires for a campaign someone deliberately set to
                    UTC, or one already fixed. */}
                {!isUnassigned && needsTimezoneAttention(campaign.timezone, browserTimezone) && (
                  <div
                    className="mt-2 flex items-center gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                    <span className="flex-1 leading-relaxed">
                      Work hours ({campaign.workHours.startTime}–{campaign.workHours.endTime}) are still on the UTC
                      default — that may not be when you think calls go out. If it looks like nothing is happening,
                      this is usually why.
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] shrink-0 border-yellow-500/40"
                      disabled={!(canManageCampaigns || canStartPause)}
                      title={canManageCampaigns || canStartPause ? undefined : "Needs the Campaigns — Create/Delete or Start/Pause/Stop permission"}
                      onClick={async () => {
                        try {
                          await updateDBCampaign({ id: campaign.id, updates: { timezone: browserTimezone } });
                          toast.success(`Timezone set to ${browserTimezone}. Reversible any time in Settings.`);
                        } catch (err) {
                          toast.error(`Failed to update timezone: ${errorMessage(err)}`);
                        }
                      }}
                    >
                      Set to {browserTimezone}
                    </Button>
                  </div>
                )}
              </div>

              {/* E7/C.11 — the synthetic "Unassigned Leads" grouping isn't a real campaigns row:
                  no start/pause, settings, or delete action has anything to act on. */}
              {!isUnassigned && (
                <>
                  {/* §E.13 — Active/Paused get the toggle. Scheduled and Completed each get a
                      dedicated button that opens the Start confirmation dialog; a Completed
                      campaign must NOT offer "Pause" (it isn't running) and its button reads
                      "Restart" with a cap warning in the dialog. */}
                  {(campaign.status === "Active" || campaign.status === "Paused") && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      disabled={!canStartPause}
                      onClick={(e) => toggleCampaignStatus(campaign, e)}
                      title={canStartPause ? (campaign.status === "Active" ? "Pause campaign" : "Start campaign") : "Needs the Campaigns — Start/Pause/Stop permission"}
                    >
                      {campaign.status === "Active"
                        ? <Pause className="h-4 w-4 text-yellow-400" />
                        : <Play className="h-4 w-4 text-primary" />
                      }
                    </Button>
                  )}
                  {campaign.status === "Scheduled" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      disabled={!canStartPause}
                      onClick={(e) => { e.stopPropagation(); setStartTarget(campaign); }}
                      title={canStartPause ? "Start campaign now" : "Needs the Campaigns — Start/Pause/Stop permission"}
                    >
                      <Play className="h-4 w-4 text-primary" />
                    </Button>
                  )}
                  {campaign.status === "Completed" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      disabled={!canStartPause}
                      onClick={(e) => { e.stopPropagation(); setStartTarget(campaign); }}
                      title={canStartPause ? "Restart campaign (raise the qualified-leads cap first)" : "Needs the Campaigns — Start/Pause/Stop permission"}
                    >
                      <RotateCcw className="h-4 w-4 text-primary" />
                    </Button>
                  )}

                  {/* Settings */}
                  <CampaignSettingsDialog campaign={campaign} onSave={updateCampaignSettings} agents={agentsList} />
                </>
              )}

              {/* 2026-09-11 — a Completed campaign says WHY it finished. The reason is derived
                  (callPipeline.campaignCompletionReason), not stored: "Qualified-leads target
                  reached" means it stopped early and raising the cap may be worth it, whereas
                  "All leads called" means only new leads will restart it. Without this, both
                  endings look identical and a user can't tell which action to take. */}
              <div className="flex flex-col items-end gap-0.5">
                <Badge variant="outline" className={`text-xs ${isUnassigned ? "bg-muted text-muted-foreground border-border" : statusColor[campaign.status]}`}>
                  {isUnassigned ? "No campaign" : campaign.status}
                </Badge>
                {campaign.status === "Completed" && completionReason && (
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {COMPLETION_REASON_LABEL[completionReason]}
                  </span>
                )}
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-sm text-foreground">{campaign.callsAttempted.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">attempted</p>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-sm text-foreground">{formatPercent(campaign.connectRate)}</p>
                <p className="text-xs text-muted-foreground">connect rate</p>
              </div>
              <div className="text-right hidden md:block">
                <p className="text-sm text-foreground">
                  {campaign.qualifiedLeadsSent}{campaign.maxQualifiedLeads > 0 ? `/${campaign.maxQualifiedLeads}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">qualified</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-foreground">{campaign.records.length}</p>
                <p className="text-xs text-muted-foreground">contacts</p>
              </div>

              {!isUnassigned && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={!canManageCampaigns}
                  onClick={(e) => { e.stopPropagation(); handleDeleteCampaign(campaign.id, campaign.name); }}
                  title={canManageCampaigns ? "Delete campaign" : "Needs the Campaigns — Create/Delete Campaign permission"}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Expanded Call Records — campaigns.lead_management gates seeing this at all
                (§H.4). support_manager holds it at `view` only, so presence is enough here;
                editing/deleting a lead below requires `full` (canManageLeads). */}
            {expandedCampaign === campaign.id && !canViewLeads && (
              <div className="border-t border-border p-6 text-center text-sm text-muted-foreground">
                Viewing this campaign's leads needs the Campaigns — Lead Management permission.
              </div>
            )}
            {expandedCampaign === campaign.id && canViewLeads && (
              <div className="border-t border-border" key={campaign.id}>
                <Tabs defaultValue="all" className="w-full">
                  <div className="flex items-center justify-between px-4 pt-3 flex-wrap gap-2">
                    <div className="flex items-center gap-4">
                      <TabsList className="bg-secondary">
                        <TabsTrigger value="all" className="text-xs">All ({campaign.records.length})</TabsTrigger>
                        <TabsTrigger value="completed" className="text-xs">Completed ({campaign.records.filter(r => TAB_PREDICATES.completed(r.status)).length})</TabsTrigger>
                        <TabsTrigger value="pending" className="text-xs">Pending ({campaign.records.filter(r => TAB_PREDICATES.pending(r.status)).length})</TabsTrigger>
                        <TabsTrigger value="failed" className="text-xs">Failed ({campaign.records.filter(r => TAB_PREDICATES.failed(r.status)).length})</TabsTrigger>
                      </TabsList>

                      {selectedLeadIds.size > 0 && canManageLeads && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                          <span className="text-xs font-medium text-primary">{selectedLeadIds.size} selected</span>
                          <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={() => handleBulkDelete(campaign.records)}>
                            <Trash2 className="h-3 w-3" /> Delete Selected
                          </Button>
                        </div>
                      )}
                    </div>

                    {!isUnassigned && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-border text-xs"
                        disabled={!canUploadLeads}
                        title={canUploadLeads ? undefined : "Needs the Campaigns — Bulk Lead Upload permission"}
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setUploadLockedCampaignId(campaign.id); setUploadDialogOpen(true); }}
                      >
                        <Upload className="h-3 w-3 mr-1" />Add Data
                      </Button>
                    )}
                  </div>

                  {(["all", "completed", "pending", "failed"] as const).map(tab => {
                    const tabRecords = campaign.records.filter(r => TAB_PREDICATES[tab](r.status));

                    const filteredRecords = getFilteredAndSortedRecords(tabRecords);
                    const allFilteredIds = filteredRecords.map(r => r.id);
                    const isAllSelected = filteredRecords.length > 0 && filteredRecords.every(r => selectedLeadIds.has(r.id));

                    return (
                      <TabsContent key={tab} value={tab} className="mt-0">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-border bg-muted/30">
                                <th className="p-3 pl-4 w-10 text-left">
                                  <Checkbox
                                    checked={isAllSelected}
                                    onCheckedChange={() => toggleSelectAll(allFilteredIds)}
                                  />
                                </th>
                                <th className="text-left text-xs font-medium text-muted-foreground p-3">
                                  <div className="flex flex-col gap-1.5">
                                    <button
                                      className="flex items-center hover:text-foreground transition-colors outline-none"
                                      onClick={() => handleSort('name')}
                                    >
                                      Name <SortIcon column="name" />
                                    </button>
                                    <div className="relative">
                                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                      <Input
                                        placeholder="Filter..."
                                        className="h-6 text-[10px] pl-6 bg-background border-border w-24"
                                        value={filters.name || ""}
                                        onChange={(e) => setFilters({...filters, name: e.target.value})}
                                      />
                                    </div>
                                  </div>
                                </th>
                                <th className="text-left text-xs font-medium text-muted-foreground p-3">
                                  <div className="flex flex-col gap-1.5">
                                    <button
                                      className="flex items-center hover:text-foreground transition-colors outline-none"
                                      onClick={() => handleSort('phone')}
                                    >
                                      Phone <SortIcon column="phone" />
                                    </button>
                                    <Input
                                      placeholder="Filter..."
                                      className="h-6 text-[10px] px-2 bg-background border-border w-24"
                                      value={filters.phone || ""}
                                      onChange={(e) => setFilters({...filters, phone: e.target.value})}
                                    />
                                  </div>
                                </th>
                                <th className="text-left text-xs font-medium text-muted-foreground p-3 hidden md:table-cell">
                                  <div className="flex flex-col gap-1.5">
                                    <button
                                      className="flex items-center hover:text-foreground transition-colors outline-none"
                                      onClick={() => handleSort('email')}
                                    >
                                      Email <SortIcon column="email" />
                                    </button>
                                    <Input
                                      placeholder="Filter..."
                                      className="h-6 text-[10px] px-2 bg-background border-border w-32"
                                      value={filters.email || ""}
                                      onChange={(e) => setFilters({...filters, email: e.target.value})}
                                    />
                                  </div>
                                </th>
                                <th className="text-left text-xs font-medium text-muted-foreground p-3">
                                  <button
                                    className="flex items-center hover:text-foreground transition-colors outline-none"
                                    onClick={() => handleSort('status')}
                                  >
                                    Status <SortIcon column="status" />
                                  </button>
                                </th>
                                <th className="text-left text-xs font-medium text-muted-foreground p-3 hidden lg:table-cell">
                                  <button
                                    className="flex items-center hover:text-foreground transition-colors outline-none"
                                    onClick={() => handleSort('duration')}
                                  >
                                    Duration <SortIcon column="duration" />
                                  </button>
                                </th>
                                <th className="text-left text-xs font-medium text-muted-foreground p-3 hidden lg:table-cell whitespace-nowrap">
                                  <button
                                    className="flex items-center hover:text-foreground transition-colors outline-none"
                                    onClick={() => handleSort('callDate')}
                                  >
                                    Date <SortIcon column="callDate" />
                                  </button>
                                </th>
                                <th className="text-left text-xs font-medium text-muted-foreground p-3 hidden xl:table-cell">Outcome</th>
                                <th className="text-left text-xs font-medium text-muted-foreground p-3">Recording</th>
                                <th className="p-3 w-10 text-right"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredRecords.map((record) => {
                                  const statusConf = callStatusIcons[record.status];
                                  const StatusIcon = statusConf.icon;
                                  // Only for the buckets whose badge doesn't already say what
                                  // happened — a "called" row shows its real outcome instead.
                                  const attemptLine =
                                    record.status === "queued" || record.status === "stalled" || record.status === "excluded"
                                      ? attemptSummaryLine(describeAttempts(record))
                                      : null;
                                  return (
                                    <tr
                                      key={record.id}
                                      className={`border-b border-border last:border-0 hover:bg-secondary/30 transition-colors cursor-pointer ${selectedLeadIds.has(record.id) ? 'bg-primary/5' : ''}`}
                                      onClick={() => setDetailRecord(record)}
                                    >
                                      <td className="p-3 pl-4 text-left" onClick={(e) => e.stopPropagation()}>
                                        <Checkbox
                                          checked={selectedLeadIds.has(record.id)}
                                          onCheckedChange={() => toggleSelectLead(record.id)}
                                        />
                                      </td>
                                      <td className="p-3"><p className="text-sm text-foreground font-medium">{record.name || "—"}</p></td>
                                      <td className="p-3 text-sm text-muted-foreground">{record.phone}</td>
                                      <td className="p-3 text-sm text-muted-foreground hidden md:table-cell">{record.email}</td>
                                      <td className="p-3">
                                        <div className="flex items-center gap-1.5">
                                          <StatusIcon className={`h-3.5 w-3.5 ${statusConf.color}`} />
                                          <span className={`text-xs ${statusConf.color}`}>{DISPLAY_STATUS_LABEL[record.status]}</span>
                                          {record.needsReview && <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />}
                                        </div>
                                        {/* 2026-09-11 — "Queued" alone is a lie for a lead that
                                            HAS been dialled and came back busy. Shown only for
                                            the buckets where the badge doesn't already carry the
                                            outcome: a completed/no-answer/failed row says what
                                            happened in the badge, duration and date columns. */}
                                        {attemptLine && (
                                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{attemptLine}</p>
                                        )}
                                      </td>
                                      <td className="p-3 text-sm text-muted-foreground hidden lg:table-cell">{record.duration}</td>
                                      <td className="p-3 text-sm text-muted-foreground hidden lg:table-cell whitespace-nowrap">{record.callDate}</td>
                                      <td className="p-3 text-xs text-muted-foreground hidden xl:table-cell max-w-[160px] truncate">{record.outcome || "—"}</td>
                                      <td className="p-3">
                                        {record.hasRecording ? (
                                          <Badge variant="outline" className="text-[10px] text-primary border-primary/20">Available</Badge>
                                        ) : (
                                          <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                      </td>
                                      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          disabled={!canManageLeads}
                                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                          onClick={() => handleDeleteRecord(record)}
                                          title={canManageLeads ? "Delete lead" : "Needs the Campaigns — Lead Management permission at Full"}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              {filteredRecords.length === 0 && (
                                <tr>
                                  <td colSpan={9} className="p-8 text-center text-sm text-muted-foreground">
                                    {campaign.records.length > 0 ? "No records match your filters." : "No leads yet. Upload data to get started."}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </TabsContent>
                    );
                  })}
                </Tabs>
              </div>
            )}
          </div>
          );
        })}
      </div>

      <UploadLeadsDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        campaigns={campaigns}
        lockedCampaignId={uploadLockedCampaignId}
        addLeads={addLeads}
      />
      <StartCampaignDialog campaign={startTarget} onOpenChange={(open) => !open && setStartTarget(null)} onConfirm={handleConfirmStart} companyNameMissing={companyNameMissing} />
      {/* D.12 — offers the same delete action the table row already has, for "Not a call
          attempt" (unattributed/debris) rows specifically — see CallDetailSheet.tsx's own gate. */}
      <CallDetailSheet record={detailRecord} onOpenChange={(open) => !open && setDetailRecord(null)} onOverride={handleOverride} onDelete={deleteRecordByKind} canDelete={canManageLeads} />
    </div>
  );
};

export default Campaigns;
