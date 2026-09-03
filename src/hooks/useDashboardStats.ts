import { useMemo } from "react";
import type { Database } from "@/integrations/supabase/types";
import { useAccountData } from "@/hooks/useAccountData";
import { useNow } from "@/hooks/useNow";
import {
  countCalls,
  countLeads,
  connectRate as pipelineConnectRate,
  qualifiedRate as pipelineQualifiedRate,
  bucketLead,
  engineStatus as pipelineEngineStatus,
  LEAD_BUCKET_LABEL,
  type LeadCounts,
  type EngineStatus,
} from "@/lib/callPipeline";
import { isWithinTimeframe, type TimeframeRange } from "@/lib/timeframe";

type CallRecordRow = Database["public"]["Tables"]["call_records"]["Row"];
type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];
type AiAgentRow = Database["public"]["Tables"]["ai_agents"]["Row"];

interface DashboardStats {
  // C.1 — real call ATTEMPTS (completed/no-answer/failed), never the raw call_records row count,
  // which used to include unattributed debris rows (E9). D.9 — respects the selected timeframe.
  totalCalls: number;
  activeLeads: number;
  // completed / attempted (E6) — same definition connectRate uses; kept as its own field so
  // existing "Conversion" copy doesn't need a UI rewrite, but the number itself is no longer
  // wrong the way it was before this phase.
  conversion: number;
  revenue: number;
  aiAgentsCount: number;
  // D.2 — replaces the hardcoded `avgResponseTime: 1.8`. `null` when no lead has ever received a
  // first call yet — rendered as "—", never a fake number.
  avgTimeToFirstCallSeconds: number | null;
  activeCampaignsCount: number;
  connectRate: number;
  avgDurationSeconds: number;
  qualifiedRate: number;
  costPerQualifiedLead: number;
  // D.9 — lead counts are deliberately NOT timeframe-filtered: they're "as of now" pipeline state
  // (is this lead queued/dialing/stalled/called/excluded right now), not a historical event with
  // its own date to filter by the way a call attempt has.
  leadsTotal: number;
  leadsCalled: number;
  leadsDialingNow: number;
  // C.12 — the full 5-bucket breakdown (src/lib/callPipeline.ts's countLeads), so Phase 4's
  // "Lead Pipeline" pie chart (D.1) has a real source instead of a hardcoded distribution.
  leadCounts: LeadCounts;
  // D.3 — replaces the hardcoded "System Online" badge with a real signal.
  engineStatus: EngineStatus;
}

interface CallData {
  name: string;
  calls: number;
  conversions: number;
  revenue: number;
}

interface AgentPerformance {
  name: string;
  active: number;
  leads: number;
  conversion: number;
  revenue: number;
}

// D.1 — replaces the old hardcoded "Voice/SMS/WhatsApp/Email" channel split (a channel field
// doesn't exist anywhere in this schema) with the five real lead-pipeline buckets.
interface LeadPipelineSlice {
  name: string;
  value: number;
  fill: string;
}

interface LiveAgent {
  id: string;
  name: string;
  status: string;
  lead: string;
  geo: string;
  duration: string;
  campaign: string;
}

interface RecentActivity {
  icon: string;
  action: string;
  detail: string;
  time: string;
  type: "success" | "info" | "neutral";
}

interface DashboardData {
  stats: DashboardStats;
  callData: CallData[];
  agentPerformance: AgentPerformance[];
  leadPipelineData: LeadPipelineSlice[];
  liveAgents: LiveAgent[];
  recentActivity: RecentActivity[];
}

// Last 7 days call data based on actual recent dates, not weekday buckets.
export function buildLast7DaysCallData(records: Pick<CallRecordRow, "call_date" | "status" | "revenue">[]): CallData[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    const dayRecords = records.filter(r => r.call_date?.slice(0, 10) === key);
    return {
      name: date.toLocaleDateString('en-US', { weekday: 'short' }),
      calls: dayRecords.length,
      conversions: dayRecords.filter(r => r.status === 'completed').length,
      revenue: dayRecords.reduce((sum, r) => sum + Number(r.revenue || 0), 0)
    };
  });
}

// Phase 5 (call-engine plan) §C.3 / Phase 3 (counting-model plan) — the numbers that "now exist
// and matter" once call-ingest is actually writing real rows: connect rate (E6 — completed /
// real attempts, never / all call_records rows, which used to let a never-dialled default-
// 'pending' row or a 'failed' row count as a connect), average duration of calls that connected,
// qualified rate (same "attempts" denominator as connectRate, kept separate since `completed`
// includes "Not Qualified"), and cost per qualified lead.
export function computeCallQualityStats(records: Pick<CallRecordRow, "status" | "duration" | "is_qualified" | "cost">[]) {
  const counts = countCalls(records);
  const connectRate = pipelineConnectRate(counts);

  const withDuration = records.filter((r) => (r.duration ?? 0) > 0);
  const avgDurationSeconds = withDuration.length > 0
    ? Math.round(withDuration.reduce((sum, r) => sum + (r.duration ?? 0), 0) / withDuration.length)
    : 0;

  const qualifiedCount = records.filter((r) => r.is_qualified).length;
  const qualifiedRate = pipelineQualifiedRate(qualifiedCount, counts.attempted);

  const totalCost = records.reduce((sum, r) => sum + Number(r.cost || 0), 0);
  const costPerQualifiedLead = qualifiedCount > 0 ? totalCost / qualifiedCount : 0;

  return { connectRate, avgDurationSeconds, qualifiedRate, costPerQualifiedLead, qualifiedCount };
}

// D.2 — "time to first call" per lead is (that lead's EARLIEST call_records.call_date) minus
// (lead.created_at). Not the same computation mergeLeadsWithCallRecords does elsewhere (that one
// wants the MOST RECENT record to show current status) — this one deliberately wants the first.
// Leads never called yet contribute nothing; returns null (never a fake number) when nobody in
// the set has been called at all.
export function computeAvgTimeToFirstCallSeconds(
  leads: Pick<LeadRow, "id" | "created_at">[],
  callRecords: Pick<CallRecordRow, "lead_id" | "call_date">[]
): number | null {
  const earliestByLead = new Map<string, number>();
  for (const record of callRecords) {
    if (!record.lead_id || !record.call_date) continue;
    const t = new Date(record.call_date).getTime();
    const existing = earliestByLead.get(record.lead_id);
    if (existing === undefined || t < existing) earliestByLead.set(record.lead_id, t);
  }

  const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
  const gapsSeconds: number[] = [];
  for (const [leadId, firstCallTime] of earliestByLead) {
    const lead = leadsById.get(leadId);
    if (!lead) continue;
    const gapSeconds = (firstCallTime - new Date(lead.created_at).getTime()) / 1000;
    if (gapSeconds >= 0) gapsSeconds.push(gapSeconds);
  }

  if (gapsSeconds.length === 0) return null;
  return Math.round(gapsSeconds.reduce((sum, g) => sum + g, 0) / gapsSeconds.length);
}

const formatDurationSeconds = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// Mirrors the geo helpers already duplicated independently in CallCenter.tsx/CalendarScheduling.tsx
// (same precedent this codebase already follows rather than introducing a new shared import for
// one small derivation used in three places).
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

function buildDashboardData(campaigns: CampaignRow[], leads: LeadRow[], callRecords: CallRecordRow[], allCallRecords: CallRecordRow[], agents: AiAgentRow[], now: number): DashboardData {
  const records = callRecords;
  const activeCampaigns = campaigns.filter(c => c.status === 'active');
  const activeAgents = agents.filter(a => a.status !== 'idle');

  const campaignsById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));

  // Calculate stats. C.1/E9 — totalCalls is real ATTEMPTS, not every call_records row; debris
  // (a stale DB default with no writer left) must never inflate this number.
  const callCounts = countCalls(records);
  const totalCalls = callCounts.attempted;
  const conversion = pipelineConnectRate(callCounts);
  const revenue = records.reduce((sum, r) => sum + Number(r.revenue || 0), 0);
  const activeLeads = records.filter(r => r.is_qualified).length;
  const { connectRate, avgDurationSeconds, qualifiedRate, costPerQualifiedLead } = computeCallQualityStats(records);
  // C.12 — computeLeadProgress deleted; the same three numbers now come straight out of the
  // shared 5-bucket model instead of a hand-rolled "not pending, not dialing = called" guess.
  const leadCounts = countLeads(leads, now);
  const leadsTotal = leadCounts.total;
  const leadsCalled = leadCounts.called;
  const leadsDialingNow = leadCounts.dialing;

  const callData: CallData[] = buildLast7DaysCallData(records);

  const industryMap = campaigns.reduce((acc, campaign) => {
    const industry = campaign.industry || 'Other';
    if (!acc[industry]) {
      acc[industry] = { campaignIds: new Set<string>(), leads: 0, completed: 0, revenue: 0 };
    }
    acc[industry].campaignIds.add(campaign.id);
    return acc;
  }, {} as Record<string, { campaignIds: Set<string>; leads: number; completed: number; revenue: number }>);

  records.forEach((record) => {
    const campaign = campaignsById.get(record.campaign_id);
    const industry = campaign?.industry || 'Other';
    if (!industryMap[industry]) {
      industryMap[industry] = { campaignIds: new Set<string>(), leads: 0, completed: 0, revenue: 0 };
    }
    industryMap[industry].leads += 1;
    industryMap[industry].revenue += Number(record.revenue || 0);
    if (record.status === 'completed') {
      industryMap[industry].completed += 1;
    }
  });

  const agentPerformance: AgentPerformance[] = Object.entries(industryMap)
    .map(([name, data]) => ({
      name,
      active: data.campaignIds.size,
      leads: data.leads,
      conversion: data.leads > 0 ? Math.round((data.completed / data.leads) * 100) : 0,
      revenue: data.revenue,
    }))
    .sort((a, b) => b.leads - a.leads);

  // D.1 — "Lead Pipeline": the five real countLeads buckets, replacing a hardcoded Voice/SMS/
  // WhatsApp/Email split that had no `channel` field anywhere in this schema behind it.
  const leadPipelineData: LeadPipelineSlice[] = [
    { name: LEAD_BUCKET_LABEL.queued, value: leadCounts.queued, fill: "hsl(45, 93%, 47%)" },
    { name: LEAD_BUCKET_LABEL.dialing, value: leadCounts.dialing, fill: "hsl(170, 100%, 45%)" },
    { name: LEAD_BUCKET_LABEL.stalled, value: leadCounts.stalled, fill: "hsl(25, 95%, 53%)" },
    { name: LEAD_BUCKET_LABEL.called, value: leadCounts.called, fill: "hsl(200, 80%, 55%)" },
    { name: LEAD_BUCKET_LABEL.excluded, value: leadCounts.excluded, fill: "hsl(220, 9%, 46%)" },
  ].filter((slice) => slice.value > 0);

  // D.11 — "who's actually being dialed right now", sourced from real dialing leads instead of
  // the `ai_agents` table. There is no real link between an AI agent and which call it's
  // currently on (D.15 — no campaign has ever been linked to an agent), so the old per-agent
  // on-call/idle status with a hardcoded '0:00' duration was invented from nothing. This shows
  // the real thing that IS knowable: which leads are mid-call, for how long, in which campaign.
  const dialingLeads = leads.filter((lead) => bucketLead(lead, now) === "dialing");
  const liveAgents: LiveAgent[] = dialingLeads.slice(0, 5).map((lead) => {
    const campaign = lead.campaign_id ? campaignsById.get(lead.campaign_id) : undefined;
    const elapsedSeconds = lead.last_called_at ? (now - new Date(lead.last_called_at).getTime()) / 1000 : 0;
    return {
      id: lead.id,
      name: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown lead",
      status: "on-call",
      lead: lead.phone,
      geo: geoLabelForPhone(lead.phone || ""),
      duration: formatDurationSeconds(elapsedSeconds),
      campaign: campaign?.name || "Unassigned",
    };
  });

  // Recent activity (from recent call records)
  const recentActivity: RecentActivity[] = records.slice(0, 6).map(r => ({
    icon: r.status === 'completed' ? 'TrendingUp' : 'Phone',
    action: r.status === 'completed' ? 'Call completed' : 'Call updated',
    detail: `${r.contact_name || 'Unknown'} - ${r.contact_phone || 'No phone'}`,
    time: r.call_date ? `${Math.max(1, Math.floor((Date.now() - new Date(r.call_date).getTime()) / 60000))} min ago` : 'Just now',
    type: r.status === 'completed' ? 'success' : 'info'
  }));

  // D.2 — deliberately computed from the FULL, un-timeframed call history (allCallRecords), not
  // the timeframe-filtered `records` above: "how responsive has this account's dispatcher been"
  // is an operational health question, not a volume metric — sampling it down to "last 7 days"
  // would make it swing wildly on 1-2 data points rather than mean anything.
  const avgTimeToFirstCallSeconds = computeAvgTimeToFirstCallSeconds(leads, allCallRecords);

  // D.3 — real engine status: is there work waiting (an active campaign with queued leads), and
  // has anything actually been dialed within the dispatcher's own 30-minute stuck-call window?
  // Sourced from `leads` (live "as of now" state), not the timeframe-filtered call records —
  // engine health isn't a historical question either.
  const hasActiveCampaignWithQueuedLeads = activeCampaigns.length > 0 && leadCounts.queued > 0;
  const lastCalledAtMs = leads.reduce<number | null>((latest, lead) => {
    if (!lead.last_called_at) return latest;
    const t = new Date(lead.last_called_at).getTime();
    return latest === null || t > latest ? t : latest;
  }, null);
  const status = pipelineEngineStatus(hasActiveCampaignWithQueuedLeads, lastCalledAtMs ? new Date(lastCalledAtMs).toISOString() : null, now);

  return {
    stats: {
      totalCalls,
      activeLeads,
      conversion,
      revenue,
      aiAgentsCount: activeAgents.length,
      avgTimeToFirstCallSeconds,
      activeCampaignsCount: activeCampaigns.length,
      connectRate,
      avgDurationSeconds,
      qualifiedRate,
      costPerQualifiedLead,
      leadsTotal,
      leadsCalled,
      leadsDialingNow,
      leadCounts,
      engineStatus: status,
    },
    callData,
    agentPerformance,
    leadPipelineData,
    liveAgents,
    recentActivity
  };
}

// Phase 2 (counting-model plan) — derives from the one shared useAccountData() query instead of
// its own independent campaigns/leads/call_records/ai_agents fetch (E4: nothing ever invalidated
// this hook's old ['dashboard-stats'] queryKey, which is exactly how it drifted from Campaigns'
// numbers in the first place). Public surface here is unchanged on purpose (checklist B.5): still
// a query-shaped `{ data, isLoading, error, ... }`, still the same `data.stats/callData/
// agentPerformance/leadPipelineData/liveAgents/recentActivity` shape every consumer already
// expects.
//
// Phase 4 D.9 — `timeframeRange` is new and optional: when passed, real call attempts are
// filtered by `call_date` falling inside it before every call-derived number (totalCalls,
// connectRate, revenue, callData, agentPerformance, …) is computed. Omit it (or pass nothing) and
// this behaves exactly as it did before — every existing caller keeps working.
// `timeframeRange` must itself be a stable (memoized) reference across renders when it doesn't
// actually change — every caller wires it via `useMemo(() => resolveTimeframeRange(...), [...])`
// (see Dashboard.tsx/Reports.tsx) precisely so this dependency array doesn't recompute on every
// render for no reason.
export function useDashboardStats(timeframeRange?: TimeframeRange) {
  const accountQuery = useAccountData();
  const now = useNow();

  const data = useMemo<DashboardData | undefined>(() => {
    if (!accountQuery.data) return undefined;
    const { campaigns, leads, callRecords, agents } = accountQuery.data;
    const filteredCallRecords = timeframeRange
      ? callRecords.filter((r) => isWithinTimeframe(r.call_date, timeframeRange))
      : callRecords;
    return buildDashboardData(campaigns, leads, filteredCallRecords, callRecords, agents, now);
  }, [accountQuery.data, now, timeframeRange]);

  return {
    ...accountQuery,
    data,
  };
}
