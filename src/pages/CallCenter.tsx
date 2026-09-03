import { useMemo, useState } from "react";
import {
  Headphones,
  PhoneCall,
  Clock,
  Bot,
  Play,
  Pause,
  History,
  CheckCircle,
  XCircle,
  PhoneOff,
  AlertTriangle,
  Ban,
  HelpCircle,
  Activity,
  Eye,
  Bell,
  PhoneIncoming,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useNow } from "@/hooks/useNow";
import { DISPLAY_STATUS_LABEL, STUCK_CALL_MINUTES, type DisplayStatus } from "@/lib/callPipeline";
import { useAuth } from "@/contexts/AuthContext";

// The three "hasn't been resolved yet" buckets — a lead here either hasn't been dialed, is being
// dialed right now, or was claimed but the dispatcher's own 30-minute sweep window has passed
// with no result. Everything else (a real attempt outcome, excluded, or unattributed debris) is a
// resolved/stored call instead. Replaces the old fake "active"/"ringing"/"hold" vocabulary, which
// was never derived from real data (docs/counting-model-plan/README.md — "Why this exists").
const PRE_ATTEMPT_STATUSES: DisplayStatus[] = ["queued", "dialing", "stalled"];

interface PipelineCall {
  id: string;
  agentName: string;
  leadId: string;
  leadName: string;
  geo: string;
  geoFlag: string;
  campaign: string;
  duration: string;
  status: DisplayStatus; // queued | dialing | stalled
  lastCalledAt: string | null;
  queue: string;
  notes: string;
}

interface StoredCall {
  id: string;
  agentName: string;
  leadId: string;
  leadName: string;
  geo: string;
  geoFlag: string;
  campaign: string;
  duration: string;
  date: string;
  status: DisplayStatus; // completed | no-answer | failed | excluded | unattributed
  queue: string;
  notes: string;
}

interface Notification {
  id: string;
  type: "incoming_call" | "assistance" | "call_ended";
  title: string;
  message: string;
  read: boolean;
}

const geoFlagForPhone = (phone: string) => {
  if (phone.startsWith("+1")) return "🇺🇸";
  if (phone.startsWith("+44")) return "🇬🇧";
  if (phone.startsWith("+61")) return "🇦🇺";
  if (phone.startsWith("+49")) return "🇩🇪";
  if (phone.startsWith("+33")) return "🇫🇷";
  if (phone.startsWith("+39")) return "🇮🇹";
  if (phone.startsWith("+34")) return "🇪🇸";
  return "🌍";
};

const geoLabelForPhone = (phone: string) => {
  if (phone.startsWith("+1")) return "United States/Canada";
  if (phone.startsWith("+44")) return "United Kingdom";
  if (phone.startsWith("+61")) return "Australia";
  if (phone.startsWith("+49")) return "Germany";
  if (phone.startsWith("+33")) return "France";
  if (phone.startsWith("+39")) return "Italy";
  if (phone.startsWith("+34")) return "Spain";
  return "Unknown region";
};

// Dot/badge colour per pipeline state — dialing is the only one actually happening right now.
const PIPELINE_DOT_CLASS: Record<"queued" | "dialing" | "stalled", string> = {
  dialing: "bg-green-500",
  stalled: "bg-orange-500",
  queued: "bg-yellow-500",
};

const PIPELINE_BADGE_CLASS: Record<"queued" | "dialing" | "stalled", string> = {
  dialing: "bg-green-500/10 text-green-500 border-green-500/20",
  stalled: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  queued: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
};

const STORED_CALL_ICON: Record<DisplayStatus, React.ElementType> = {
  completed: CheckCircle,
  "no-answer": PhoneOff,
  failed: XCircle,
  excluded: Ban,
  unattributed: HelpCircle,
  queued: Clock,
  dialing: Play,
  stalled: AlertTriangle,
};

const STORED_CALL_BADGE_CLASS: Record<DisplayStatus, string> = {
  completed: "bg-green-500/10 text-green-500 border-green-500/20",
  "no-answer": "bg-muted text-muted-foreground border-border",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  excluded: "bg-muted text-muted-foreground border-border",
  unattributed: "bg-muted text-muted-foreground border-border",
  queued: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  dialing: "bg-green-500/10 text-green-500 border-green-500/20",
  stalled: "bg-orange-500/10 text-orange-500 border-orange-500/20",
};

const STORED_CALL_FILTERS: DisplayStatus[] = ["completed", "no-answer", "failed", "excluded", "unattributed"];

function StatPill({ icon: Icon, value, label, accent = false }: { icon: React.ElementType; value: string | number; label: string; accent?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors ${accent ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}>
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${accent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xl font-bold text-foreground leading-none">{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

function PipelineCallRow({ call, onSelect, isSelected }: { call: PipelineCall; onSelect: (id: string) => void; isSelected: boolean }) {
  const statusDot = PIPELINE_DOT_CLASS[call.status as "queued" | "dialing" | "stalled"];

  return (
    <div
      className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-all border ${isSelected ? "border-primary/40 bg-primary/5 shadow-[0_0_15px_-5px_hsl(var(--primary)/0.25)]" : "border-transparent hover:border-border hover:bg-card/60"}`}
      onClick={() => onSelect(call.id)}
    >
      <div className="relative">
        <div className={`h-2 w-2 rounded-full ${statusDot}`} />
        {call.status === "dialing" && <div className={`absolute inset-0 h-2 w-2 rounded-full ${statusDot} animate-ping opacity-40`} />}
      </div>
      <div className="flex items-center gap-2 w-32 shrink-0">
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center"><Bot className="h-3.5 w-3.5 text-primary" /></div>
        <span className="text-sm font-medium text-foreground truncate">{call.agentName}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground truncate">{call.leadName}</span>
          <span className="text-[10px] font-mono text-muted-foreground">{call.leadId}</span>
        </div>
      </div>
      <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground w-36 shrink-0">
        <span>{call.geoFlag}</span>
        <span className="truncate">{call.geo}</span>
      </div>
      <div className="hidden lg:block text-xs text-muted-foreground w-32 shrink-0 truncate">{call.campaign}</div>
      <Badge variant="outline" className="font-mono text-[10px] shrink-0">{call.duration}</Badge>
      <Badge className={`text-[10px] shrink-0 ${PIPELINE_BADGE_CLASS[call.status as "queued" | "dialing" | "stalled"]}`} variant="outline">
        {DISPLAY_STATUS_LABEL[call.status]}
      </Badge>
      <Eye className="h-4 w-4 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors shrink-0" />
    </div>
  );
}

// D.5 — real elapsed time against the dispatcher's own 30-minute stuck-call window, not the old
// hardcoded 70/45/15. A queued lead hasn't started a call yet, so its progress is 0 regardless of
// how long it's been waiting in the queue (that's not "call progress").
function pipelineProgress(call: PipelineCall, now: number): number {
  if (call.status === "queued" || !call.lastCalledAt) return 0;
  const elapsedMinutes = (now - new Date(call.lastCalledAt).getTime()) / 60_000;
  return Math.max(0, Math.min(100, Math.round((elapsedMinutes / STUCK_CALL_MINUTES) * 100)));
}

function ExpandedCallPanel({ call, now }: { call: PipelineCall; now: number }) {
  return (
    <div className="rounded-xl border border-primary/20 bg-card overflow-hidden shadow-lg shadow-primary/5 animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between px-4 py-2.5 bg-primary/5 border-b border-primary/10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center"><Bot className="h-4 w-4 text-primary" /></div>
            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-card" />
          </div>
          <div>
            <span className="text-sm font-semibold text-foreground">{call.agentName}</span>
            <span className="text-xs text-muted-foreground ml-2">→ {call.leadName}</span>
          </div>
          <Badge variant="outline" className="font-mono text-[10px]">{call.duration}</Badge>
        </div>
        <Badge variant="outline" className="text-[10px]">Read-only live view</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Lead</p>
              <p className="text-sm font-medium text-foreground">{call.leadName}</p>
              <p className="text-[10px] font-mono text-muted-foreground">{call.leadId}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Location</p>
              <p className="text-sm font-medium text-foreground">{call.geoFlag} {call.geo}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Campaign</p>
              <p className="text-sm font-medium text-foreground">{call.campaign}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Queue</p>
              <p className="text-sm font-medium text-foreground">{call.queue}</p>
            </div>
          </div>
          <div className="rounded-lg bg-muted/30 border border-border p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Lead Notes</p>
            <p className="text-sm text-foreground leading-relaxed">{call.notes}</p>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm text-foreground"><Activity className="h-4 w-4 text-primary" /> Current call progress</div>
          <Progress value={pipelineProgress(call, now)} className="h-2" />
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-muted-foreground">Status</p>
              <p className="text-foreground font-medium mt-1">{DISPLAY_STATUS_LABEL[call.status]}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-muted-foreground">Duration</p>
              <p className="text-foreground font-medium mt-1">{call.duration}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-muted-foreground">Queue</p>
              <p className="text-foreground font-medium mt-1">{call.queue}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This panel reflects real records already stored in the app. Monitoring, whisper, and transfer controls were removed because the app does not have a real telephony backend connected yet.
          </p>
        </div>
      </div>
    </div>
  );
}

function RecordingDetail({ call, onClose }: { call: StoredCall; onClose: () => void }) {
  const OutcomeIcon = STORED_CALL_ICON[call.status];

  return (
    <Dialog open={!!call} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="h-4 w-4 text-primary" /> Call Detail</DialogTitle>
          <DialogDescription>Stored from campaign call records</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Lead</p>
              <p className="text-foreground font-medium mt-1">{call.leadName}</p>
              <p className="text-[10px] font-mono text-muted-foreground">{call.leadId}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Agent</p>
              <p className="text-foreground font-medium mt-1">{call.agentName}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Campaign</p>
              <p className="text-foreground font-medium mt-1">{call.campaign}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Duration</p>
              <p className="text-foreground font-medium mt-1">{call.duration}</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex items-center gap-2"><OutcomeIcon className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-foreground">{DISPLAY_STATUS_LABEL[call.status]}</span></div>
            <span className="text-xs text-muted-foreground">{call.date}</span>
          </div>
          <div className="rounded-lg bg-muted/30 border border-border p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Stored Notes</p>
            <p className="text-sm text-foreground leading-relaxed">{call.notes}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const CallCenter = () => {
  // Deliberately not defaulted in the destructure: useCampaigns returns `data`, which is
  // undefined until the query resolves, so `campaigns = []` would mint a fresh array on every
  // render and invalidate every useMemo below it each time. Default inside the memo instead.
  const { campaigns, isLoading, isFetching, dataUpdatedAt } = useCampaigns();
  // Permission-overrides plan Phase 4 §H.4 (docs/permission-overrides-plan/README.md) —
  // callcenter.live_dashboard: "read-only by nature" (D-3), so presence is the whole gate;
  // there's no write action on this tab to distinguish view from full.
  const { hasPermission } = useAuth();
  const canViewLiveDashboard = hasPermission("callcenter.live_dashboard");
  const now = useNow();
  const [filterQueue, setFilterQueue] = useState<string>("all");
  const [selectedCall, setSelectedCall] = useState<string | null>(null);
  const [activeRecording, setActiveRecording] = useState<string | null>(null);
  const [recordingFilter, setRecordingFilter] = useState<string>("all");
  const [showNotifications, setShowNotifications] = useState(false);

  const { pipelineCalls, storedCalls, queues } = useMemo(() => {
    const allRecords = (campaigns ?? []).flatMap((campaign) =>
      campaign.records.map((record) => ({ campaign, record }))
    );

    // D.7 — real campaign grouping: campaigns.industry (a real column, already shown elsewhere on
    // the Campaigns page) replaces the old keyword guess against the campaign's name string.
    const queueNameForCampaign = (campaign: { industry: string }) => campaign.industry || "General";

    const currentCalls: PipelineCall[] = allRecords
      .filter(({ record }) => PRE_ATTEMPT_STATUSES.includes(record.status))
      // D.8 — sorted by real recency (most recently touched first; never-touched queued leads
      // sort last), no cap: the ScrollArea below carries the list instead of silently hiding
      // anything past the 8th row.
      .sort((a, b) => (b.record.lastCalledAt ?? "").localeCompare(a.record.lastCalledAt ?? ""))
      .map(({ campaign, record }) => {
        const queue = queueNameForCampaign(campaign);
        return {
          id: record.id,
          agentName: record.agent || campaign.agent,
          leadId: record.id.slice(0, 8).toUpperCase(),
          leadName: record.name || "Unknown lead",
          geo: geoLabelForPhone(record.phone || ""),
          geoFlag: geoFlagForPhone(record.phone || ""),
          campaign: campaign.name,
          duration: record.duration || "0:00",
          status: record.status,
          lastCalledAt: record.lastCalledAt ?? null,
          queue,
          notes: record.notes || `${DISPLAY_STATUS_LABEL[record.status]} in ${campaign.name}`,
        };
      });

    const finishedCalls: StoredCall[] = allRecords
      .filter(({ record }) => !PRE_ATTEMPT_STATUSES.includes(record.status))
      .map(({ campaign, record }) => ({
        id: record.id,
        agentName: record.agent || campaign.agent,
        leadId: record.id.slice(0, 8).toUpperCase(),
        leadName: record.name || "Unknown lead",
        geo: geoLabelForPhone(record.phone || ""),
        geoFlag: geoFlagForPhone(record.phone || ""),
        campaign: campaign.name,
        duration: record.duration || "0:00",
        date: record.callDate || "Not scheduled",
        status: record.status,
        queue: queueNameForCampaign(campaign),
        notes: record.notes || `${DISPLAY_STATUS_LABEL[record.status]} call in ${campaign.name}`,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // D.7 — the queue list itself is now real too: whichever industries actually appear on the
    // pipeline, not a fixed four-item guess (Sales/Customer Service/Support/Billing) that had no
    // relationship to any real campaign's industry.
    const queueNames = [...new Set(currentCalls.map((call) => call.queue))].sort();
    const queueMap = queueNames.map((name) => ({
      name,
      dialing: currentCalls.filter((call) => call.queue === name && call.status === "dialing").length,
      queued: currentCalls.filter((call) => call.queue === name && call.status === "queued").length,
      stalled: currentCalls.filter((call) => call.queue === name && call.status === "stalled").length,
      agents: new Set(currentCalls.filter((call) => call.queue === name).map((call) => call.agentName)).size,
    }));

    return { pipelineCalls: currentCalls, storedCalls: finishedCalls, queues: queueMap };
  }, [campaigns]);

  // Purely derived from the calls above — no state. Writing this into a useState from inside a
  // useMemo (what this used to do) is a render-phase update, and since every array here is a new
  // reference it looped until React threw "Too many re-renders" and blanked the whole app.
  const notifications = useMemo<Notification[]>(() => {
    const generated: Notification[] = [];
    if (pipelineCalls[0]) {
      const first = pipelineCalls[0];
      generated.push({
        id: `${first.id}-incoming`,
        type: "incoming_call",
        title: first.status === "dialing" ? "Active lead in queue" : "Lead waiting",
        message: `${first.leadName} is ${DISPLAY_STATUS_LABEL[first.status].toLowerCase()}, assigned to ${first.agentName}.`,
        read: false,
      });
    }
    if (pipelineCalls[1]) {
      const second = pipelineCalls[1];
      generated.push({
        id: `${second.id}-assist`,
        type: "assistance",
        title: second.status === "stalled" ? "Lead needs attention" : "Lead waiting in queue",
        message: `${second.leadName} is ${DISPLAY_STATUS_LABEL[second.status].toLowerCase()} in ${second.queue}.`,
        read: false,
      });
    }
    if (storedCalls[0]) {
      generated.push({
        id: `${storedCalls[0].id}-done`,
        type: "call_ended",
        title: "Recent call stored",
        message: `${storedCalls[0].leadName} finished — ${DISPLAY_STATUS_LABEL[storedCalls[0].status]}.`,
        read: true,
      });
    }
    return generated;
  }, [pipelineCalls, storedCalls]);

  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const filtered = filterQueue === "all" ? pipelineCalls : pipelineCalls.filter((call) => call.queue === filterQueue);
  const selectedLiveCall = pipelineCalls.find((call) => call.id === selectedCall) || null;
  const selectedRecording = storedCalls.find((call) => call.id === activeRecording) || null;

  // C.19 — the headline check: this must read the same as Campaigns' leadCounts.dialing/stalled
  // and Dashboard's leadsDialingNow, not the old fake "1 Active / 5 Ringing".
  const totalDialing = pipelineCalls.filter((call) => call.status === "dialing").length;
  const totalQueued = pipelineCalls.filter((call) => call.status === "queued").length;
  const totalStalled = pipelineCalls.filter((call) => call.status === "stalled").length;
  const totalAgents = new Set(pipelineCalls.map((call) => call.agentName)).size;

  // D.4 — real signal instead of a hardcoded green dot: isFetching/dataUpdatedAt come straight
  // from the underlying useAccountData() query (React Query's own fields, already true — nothing
  // to compute, just to actually read).
  const minutesSinceSync = dataUpdatedAt ? Math.max(0, Math.floor((now - dataUpdatedAt) / 60_000)) : null;
  const syncLabel = isFetching
    ? "Syncing…"
    : minutesSinceSync === null
      ? "Not synced yet"
      : minutesSinceSync < 1
        ? "Synced just now"
        : `Synced ${minutesSinceSync}m ago`;

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading call center...</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-foreground">Call Center</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Operational console based on stored campaign calls</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9 relative" onClick={() => setShowNotifications(!showNotifications)}>
            <Bell className={`h-4 w-4 ${unreadCount > 0 ? "text-primary" : "text-muted-foreground"}`} />
            {unreadCount > 0 && <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">{unreadCount}</span>}
          </Button>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${isFetching ? "bg-primary/10 border-primary/20" : "bg-green-500/10 border-green-500/20"}`}>
            <div className={`h-2 w-2 rounded-full ${isFetching ? "bg-primary animate-pulse" : "bg-green-500"}`} />
            <span className={`text-xs font-medium ${isFetching ? "text-primary" : "text-green-500"}`}>{syncLabel}</span>
          </div>
        </div>
      </div>

      {showNotifications && (
        <div className="rounded-xl border border-border bg-card overflow-hidden animate-in slide-in-from-top-2 duration-200 shadow-lg">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Notifications</span>
            </div>
            <Button size="sm" variant="ghost" className="h-7 text-[10px] text-muted-foreground" onClick={() => setShowNotifications(false)}>Close</Button>
          </div>
          <ScrollArea className="h-[240px]">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground"><Bell className="h-8 w-8 mb-2 opacity-30" /><p className="text-sm">No notifications yet</p></div>
            ) : (
              <div className="divide-y divide-border/50">
                {notifications.map((notification) => (
                  <div key={notification.id} className={`flex items-start gap-3 px-4 py-3 ${!notification.read ? "bg-primary/[0.03]" : ""}`}>
                    <div className="mt-0.5 shrink-0">
                      {notification.type === "incoming_call" ? <PhoneIncoming className="h-4 w-4 text-green-500" /> : notification.type === "assistance" ? <UserCheck className="h-4 w-4 text-yellow-500" /> : <PhoneCall className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${!notification.read ? "text-foreground" : "text-muted-foreground"}`}>{notification.title}</span>
                        {!notification.read && <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{notification.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatPill icon={PhoneCall} value={totalDialing} label="Dialing" accent />
        <StatPill icon={Clock} value={totalQueued} label="Queued" />
        <StatPill icon={AlertTriangle} value={totalStalled} label="Stalled" />
        <StatPill icon={Headphones} value={totalAgents} label="Agents Online" accent />
      </div>

      <Tabs defaultValue="live" className="space-y-4">
        <TabsList className="bg-muted/50 border border-border">
          <TabsTrigger value="live" className="gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <Activity className="h-3.5 w-3.5" />
            Active Pipeline
            <Badge variant="destructive" className="text-[9px] h-4 px-1 ml-1">LIVE</Badge>
          </TabsTrigger>
          <TabsTrigger value="recordings" className="gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <History className="h-3.5 w-3.5" />
            Stored Calls
            <Badge variant="outline" className="text-[9px] h-4 px-1 ml-1">{storedCalls.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="space-y-4 mt-0">
          {!canViewLiveDashboard ? (
            <div className="rounded-xl border border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
              Watching the live pipeline needs the Call Center — Live Call Dashboard permission.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground mr-1">Queue:</span>
                {["all", ...queues.map((queue) => queue.name)].map((queue) => (
                  <Button key={queue} size="sm" variant={filterQueue === queue ? "default" : "ghost"} className={`h-7 text-xs capitalize ${filterQueue === queue ? "" : "text-muted-foreground"}`} onClick={() => setFilterQueue(queue)}>
                    {queue}
                    {queue !== "all" && <span className="ml-1 text-[10px] opacity-60">({pipelineCalls.filter((call) => call.queue === queue).length})</span>}
                  </Button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {queues.map((queue) => (
                  <div key={queue.name} className="rounded-xl border border-border bg-card p-4">
                    <p className="text-sm font-medium text-foreground">{queue.name}</p>
                    <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                      <div className="flex items-center justify-between"><span>Dialing</span><span className="text-foreground">{queue.dialing}</span></div>
                      <div className="flex items-center justify-between"><span>Queued</span><span className="text-foreground">{queue.queued}</span></div>
                      <div className="flex items-center justify-between"><span>Stalled</span><span className="text-foreground">{queue.stalled}</span></div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
                {/* D.8 — the cap is gone (was a bare .slice(0, 8)); this ScrollArea carries whatever
                    real count is on the pipeline instead of silently hiding everything past 8. */}
                <ScrollArea className="h-[420px]">
                  <div className="divide-y divide-border/50">
                    {filtered.map((call) => (
                      <PipelineCallRow key={call.id} call={call} onSelect={(id) => setSelectedCall(selectedCall === id ? null : id)} isSelected={selectedCall === call.id} />
                    ))}
                  </div>
                </ScrollArea>
                {filtered.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">No active calls in this queue</div>}
              </div>

              {selectedLiveCall && <ExpandedCallPanel call={selectedLiveCall} now={now} />}
            </>
          )}
        </TabsContent>

        <TabsContent value="recordings" className="space-y-4 mt-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">Outcome:</span>
            {(["all", ...STORED_CALL_FILTERS] as const).map((status) => (
              <Button key={status} size="sm" variant={recordingFilter === status ? "default" : "ghost"} className={`h-7 text-xs ${recordingFilter === status ? "" : "text-muted-foreground"}`} onClick={() => setRecordingFilter(status)}>
                {status === "all" ? "All" : DISPLAY_STATUS_LABEL[status]}
              </Button>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3">Agent</th>
                  <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3">Lead</th>
                  <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3 hidden md:table-cell">Geo</th>
                  <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3 hidden lg:table-cell">Campaign</th>
                  <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3">Duration</th>
                  <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3">Outcome</th>
                  <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3 hidden lg:table-cell">Date</th>
                  <th className="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {storedCalls
                  .filter((call) => recordingFilter === "all" || call.status === recordingFilter)
                  .map((call) => {
                    const outcomeStyle = STORED_CALL_BADGE_CLASS[call.status];
                    return (
                      <tr key={call.id} className={`border-b border-border/50 last:border-0 cursor-pointer transition-colors hover:bg-muted/30 ${activeRecording === call.id ? "bg-primary/5" : ""}`} onClick={() => setActiveRecording(activeRecording === call.id ? null : call.id)}>
                        <td className="p-3 text-sm text-foreground font-medium">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center"><Bot className="h-3 w-3 text-primary" /></div>
                            <span className="truncate">{call.agentName}</span>
                          </div>
                        </td>
                        <td className="p-3 text-sm text-muted-foreground"><div className="truncate">{call.leadName}</div><div className="text-[10px] font-mono">{call.leadId}</div></td>
                        <td className="p-3 text-sm text-muted-foreground hidden md:table-cell">{call.geoFlag} {call.geo}</td>
                        <td className="p-3 text-sm text-muted-foreground hidden lg:table-cell truncate">{call.campaign}</td>
                        <td className="p-3 text-sm text-muted-foreground font-mono">{call.duration}</td>
                        <td className="p-3"><Badge variant="outline" className={`text-[10px] ${outcomeStyle}`}>{DISPLAY_STATUS_LABEL[call.status]}</Badge></td>
                        <td className="p-3 text-xs text-muted-foreground hidden lg:table-cell">{call.date}</td>
                        <td className="p-3">
                          <Button size="icon" variant={activeRecording === call.id ? "default" : "ghost"} className="h-7 w-7" onClick={(event) => { event.stopPropagation(); setActiveRecording(activeRecording === call.id ? null : call.id); }}>
                            {activeRecording === call.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {storedCalls.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">No completed calls stored yet</div>}
          </div>
        </TabsContent>
      </Tabs>

      {selectedRecording && <RecordingDetail call={selectedRecording} onClose={() => setActiveRecording(null)} />}
    </div>
  );
};

export default CallCenter;
