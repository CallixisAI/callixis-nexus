import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";
import type { Campaign, CallRecord } from "@/components/campaigns/types";
import type { ParsedLeadRow } from "@/lib/leadCsv";
import { useAccountData, accountDataQueryKey, type AiAgentRow } from "@/hooks/useAccountData";
import { useNow } from "@/hooks/useNow";
import {
  bucketLead,
  classifyCallRecord,
  countCalls,
  countLeads,
  connectRate as computeConnectRate,
  qualifiedRate as computeQualifiedRate,
  displayStatusFor,
  normalizeCampaignStatus,
  CAMPAIGN_STATUS_LABEL,
  type CallAttemptStatus,
} from "@/lib/callPipeline";

export type { Campaign, CallRecord };

type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];
type CallRecordRow = Database["public"]["Tables"]["call_records"]["Row"];
type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];

const formatDuration = (seconds: number | null | undefined) => {
  if (!seconds) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

const formatCallDate = (value: string | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 16).replace("T", " ") : "—";

const recordTimestamp = (r: CallRecordRow) => new Date(r.call_date ?? r.created_at).getTime();

/**
 * A campaign's "records" used to be call_records rows only — attempts made, never the people
 * still waiting to be called. That's what let the dispatcher (Phase 4, reading only from `leads`)
 * go completely unfed by the app's own CSV upload, which wrote into call_records instead. This
 * merges the two: every lead becomes a row (its most recent call outcome layered on top if one
 * exists), plus any call_records row with no lead_id — a legacy row, or one call-ingest couldn't
 * match to a lead — surfaces on its own rather than being silently dropped.
 *
 * Phase 3 (counting-model plan) — every row's `status` now comes from src/lib/callPipeline.ts's
 * bucketLead()/displayStatusFor() instead of ad hoc string comparisons, so a lead with no call yet
 * reads "queued" (not the old synthetic "pending"), a fresh dial reads "dialing", a >30-minute
 * stuck dial reads "stalled" (not the old fake "in-progress"), and so on — the same vocabulary
 * every other page now shares.
 *
 * Phase 4 D.6 — `agentName` replaces the hardcoded "LeadGen Pro" this function used to stamp on
 * every row regardless of which (if any) real AI agent the owning campaign is linked to. Callers
 * pass the campaign's real resolved agent name (or "Unassigned" — D.15's own recorded finding is
 * that no campaign has ever actually been linked to one, so this is expected to read "Unassigned"
 * everywhere today, not a bug in this function).
 */
export function mergeLeadsWithCallRecords(leads: LeadRow[], callRecords: CallRecordRow[], agentName: string = "Unassigned", now: number = Date.now()): CallRecord[] {
  const latestByLeadId = new Map<string, CallRecordRow>();
  const orphans: CallRecordRow[] = [];

  for (const cr of callRecords) {
    if (!cr.lead_id) {
      orphans.push(cr);
      continue;
    }
    const existing = latestByLeadId.get(cr.lead_id);
    if (!existing || recordTimestamp(cr) > recordTimestamp(existing)) {
      latestByLeadId.set(cr.lead_id, cr);
    }
  }

  const attemptStatusOf = (cr: CallRecordRow | undefined): CallAttemptStatus | null => {
    if (!cr) return null;
    const classified = classifyCallRecord(cr);
    return classified.kind === "attempt" ? classified.status : null;
  };

  const leadRows: CallRecord[] = leads.map((lead) => {
    const cr = latestByLeadId.get(lead.id);
    const name = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || cr?.contact_name || "";
    const status = displayStatusFor(bucketLead(lead, now), attemptStatusOf(cr));

    if (cr) {
      return {
        id: lead.id,
        kind: "lead",
        name: name || cr.contact_name || "",
        phone: lead.phone,
        email: lead.email ?? cr.contact_email ?? "",
        status,
        duration: formatDuration(cr.duration),
        callDate: formatCallDate(cr.call_date),
        hasRecording: !!cr.recording_url,
        notes: cr.notes || "",
        agent: agentName,
        outcome: lead.outcome,
        leadScore: cr.lead_score,
        recordingUrl: cr.recording_url,
        transcript: cr.transcript,
        disqualReason: cr.disqual_reason,
        needsReview: cr.needs_review,
        doNotCall: lead.do_not_call,
        retryCount: lead.retry_count,
        callRecordId: cr.id,
        lastCalledAt: lead.last_called_at,
      };
    }

    return {
      id: lead.id,
      kind: "lead",
      name,
      phone: lead.phone,
      email: lead.email ?? "",
      status,
      duration: "—",
      callDate: "—",
      hasRecording: false,
      notes: "",
      agent: agentName,
      outcome: lead.outcome,
      leadScore: lead.lead_score,
      recordingUrl: null,
      transcript: null,
      disqualReason: null,
      needsReview: false,
      doNotCall: lead.do_not_call,
      retryCount: lead.retry_count,
      callRecordId: null,
      lastCalledAt: lead.last_called_at,
    };
  });

  const orphanRows: CallRecord[] = orphans.map((cr) => {
    const classified = classifyCallRecord(cr);
    return {
      id: cr.id,
      kind: "call_record",
      name: cr.contact_name || "",
      phone: cr.contact_phone || "",
      email: cr.contact_email || "",
      status: classified.kind === "attempt" ? classified.status : "unattributed",
      duration: formatDuration(cr.duration),
      callDate: formatCallDate(cr.call_date),
      hasRecording: !!cr.recording_url,
      notes: cr.notes || "",
      agent: agentName,
      outcome: null,
      leadScore: cr.lead_score,
      recordingUrl: cr.recording_url,
      transcript: cr.transcript,
      disqualReason: cr.disqual_reason,
      needsReview: cr.needs_review,
      doNotCall: false,
      retryCount: 0,
      callRecordId: cr.id,
      lastCalledAt: cr.call_date,
    };
  });

  return [...leadRows, ...orphanRows];
}

// Phase 4 D.6 — `agentsById` is the real ai_agents table, keyed by id, so a campaign's `agent`
// field can be resolved from its real `agent_id` instead of a hardcoded string. D.15's own
// recorded finding: `campaigns.agent_id` is NULL on every real campaign today (no campaign screen
// ever writes it), so this is expected to resolve to "Unassigned" everywhere right now — that's
// this function working correctly, not a bug to "fix" by inventing a fallback name again.
export function mapCampaignWithStats(row: CampaignRow, leads: LeadRow[], callRecords: CallRecordRow[], agentsById: Map<string, AiAgentRow> = new Map(), now: number = Date.now()): Campaign {
  const callCounts = countCalls(callRecords);
  const qualifiedCount = callRecords.filter(r => r.is_qualified).length;
  const agentName = (row.agent_id && agentsById.get(row.agent_id)?.name) || "Unassigned";

  return {
    id: row.id,
    name: row.name,
    status: CAMPAIGN_STATUS_LABEL[normalizeCampaignStatus(row.status)] as Campaign["status"],
    callsAttempted: callCounts.attempted,
    connectRate: computeConnectRate(callCounts),
    qualifiedRate: computeQualifiedRate(qualifiedCount, callCounts.attempted),
    industry: row.industry || "General",
    agent: agentName,
    agentId: row.agent_id,
    records: mergeLeadsWithCallRecords(leads, callRecords, agentName, now),
    workHours: (row.work_hours as Campaign["workHours"] | null) || { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], startTime: "09:00", endTime: "17:00" },
    maxQualifiedLeads: row.max_qualified_leads,
    qualifiedLeadsSent: qualifiedCount,
    crmApiEndpoint: row.crm_api_endpoint || "",
    budget: Number(row.budget || 0),
    leadsTotal: leads.length,
    leadCounts: countLeads(leads, now),
    dailyCallCap: row.daily_call_cap,
    timezone: row.timezone,
  };
}

// E7/C.11 — campaigns.agent_id and leads.campaign_id are both ON DELETE SET NULL, so deleting a
// campaign parks its leads under campaign_id=null rather than deleting them. Before this phase
// they simply vanished from the Campaigns page (grouped under a "" key nothing ever reads) while
// Dashboard's unfiltered lead select kept counting them — the exact "three pages, one number"
// disagreement this whole plan exists to close. This sentinel id is never a real campaigns.id
// (those are UUIDs) — Campaigns.tsx checks for it to disable the per-campaign actions (start/
// pause/settings/delete) that assume a real row.
export const UNASSIGNED_CAMPAIGN_ID = "unassigned";

function buildUnassignedPseudoCampaign(leads: LeadRow[], now: number): Campaign {
  return {
    id: UNASSIGNED_CAMPAIGN_ID,
    name: "Unassigned Leads",
    status: "Paused",
    callsAttempted: 0,
    connectRate: 0,
    qualifiedRate: 0,
    industry: "—",
    agent: "Unassigned",
    agentId: null,
    records: mergeLeadsWithCallRecords(leads, [], "Unassigned", now),
    workHours: { days: [], startTime: "09:00", endTime: "17:00" },
    maxQualifiedLeads: 0,
    qualifiedLeadsSent: 0,
    crmApiEndpoint: "",
    budget: 0,
    leadsTotal: leads.length,
    leadCounts: countLeads(leads, now),
    dailyCallCap: 0,
    timezone: "UTC",
  };
}

const CHUNK_SIZE = 500;

// Phase 2 (counting-model plan) — the grouping + orphan-surfacing logic pulled out of the
// useCampaigns() hook itself so it's unit-testable without rendering React (same "pure logic in
// src/lib or here, real wiring stays thin" split as callPipeline.ts). E7/C.11: leads whose
// campaign_id doesn't match any real campaign (orphaned by a campaign delete — ON DELETE SET
// NULL, never a hard delete) used to silently vanish from this page's output while Dashboard's
// unfiltered lead count kept including them — exactly the "three pages, one number" disagreement
// this plan exists to close.
export function buildCampaignsFromAccountData(campaignRows: CampaignRow[], leads: LeadRow[], callRecords: CallRecordRow[], agents: AiAgentRow[] = [], now: number = Date.now()): Campaign[] {
  const leadsByCampaign = leads.reduce((acc, lead) => {
    const key = lead.campaign_id ?? "";
    if (!acc[key]) acc[key] = [];
    acc[key].push(lead);
    return acc;
  }, {} as Record<string, LeadRow[]>);

  const recordsByCampaign = callRecords.reduce((acc, record) => {
    if (!acc[record.campaign_id]) acc[record.campaign_id] = [];
    acc[record.campaign_id].push(record);
    return acc;
  }, {} as Record<string, CallRecordRow[]>);

  const agentsById = new Map(agents.map((a) => [a.id, a]));

  const mapped = campaignRows.map(row =>
    mapCampaignWithStats(row, leadsByCampaign[row.id] || [], recordsByCampaign[row.id] || [], agentsById, now)
  );

  const realCampaignIds = new Set(campaignRows.map((c) => c.id));
  const orphanLeads = Object.entries(leadsByCampaign)
    .filter(([key]) => !realCampaignIds.has(key))
    .flatMap(([, orphanedLeads]) => orphanedLeads);
  if (orphanLeads.length > 0) {
    mapped.push(buildUnassignedPseudoCampaign(orphanLeads, now));
  }

  return mapped;
}

// Phase 2 (counting-model plan) — campaigns/leads/call_records now come from the one shared
// useAccountData() query instead of three independent selects on their own queryKey. Public
// surface here is unchanged on purpose (checklist B.4): every consumer keeps working exactly as
// before; only the plumbing underneath moved. Every mutation below invalidates the shared
// account-data key instead of a ['campaigns', userId] key nothing else ever read from.
export function useCampaigns() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;

  const { data: accountData, isLoading, error, refetch, isFetching, dataUpdatedAt } = useAccountData();
  // Phase 2 §B.3 — a lead crosses from `dialing` to `stalled` purely because time passed, with no
  // new data from the server. Without this tick, that transition would only ever show up on the
  // next full refetch.
  const now = useNow();

  const campaigns = useMemo<Campaign[] | undefined>(() => {
    if (!accountData) return undefined;
    return buildCampaignsFromAccountData(accountData.campaigns, accountData.leads, accountData.callRecords, accountData.agents, now);
  }, [accountData, now]);

  const invalidateAccountData = () => queryClient.invalidateQueries({ queryKey: accountDataQueryKey(userId) });

  const createMutation = useMutation({
    mutationFn: async (newCampaign: Partial<Campaign>) => {
      const { data, error } = await supabase
        .from('campaigns')
        .insert([{
          user_id: userId,
          name: newCampaign.name,
          status: (newCampaign.status || 'Paused').toLowerCase(),
          industry: newCampaign.industry,
          // AI Agents plan Phase 3 §D.4/E5 — this insert used to omit agent_id entirely, so
          // every campaign was created Unassigned regardless of what the (fictional, E6) agent
          // dropdown showed. `|| null` rather than requiring it: an agent-less campaign is a
          // real, supported state (D.3's "no agents in this industry yet" case), not an error.
          agent_id: newCampaign.agentId || null,
          budget: newCampaign.budget || 0,
          max_qualified_leads: newCampaign.maxQualifiedLeads || 0,
          crm_api_endpoint: newCampaign.crmApiEndpoint || "",
          work_hours: newCampaign.workHours || { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], startTime: "09:00", endTime: "17:00" },
          start_date: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: invalidateAccountData,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string, updates: Partial<Campaign> }) => {
      const dbUpdates: Record<string, unknown> = {};
      if (updates.status) dbUpdates.status = updates.status.toLowerCase();
      if (updates.name) dbUpdates.name = updates.name;
      if (updates.industry) dbUpdates.industry = updates.industry;
      // §D.5 — CampaignSettingsDialog can re-point an existing campaign at a different (or no)
      // agent. `!== undefined` so an explicit `null` (deliberately unassigning) is distinguished
      // from "this update didn't touch the agent at all."
      if (updates.agentId !== undefined) dbUpdates.agent_id = updates.agentId;
      if (updates.budget !== undefined) dbUpdates.budget = updates.budget;
      if (updates.maxQualifiedLeads !== undefined) dbUpdates.max_qualified_leads = updates.maxQualifiedLeads;
      if (updates.crmApiEndpoint !== undefined) dbUpdates.crm_api_endpoint = updates.crmApiEndpoint;
      if (updates.workHours) dbUpdates.work_hours = updates.workHours;
      if (updates.dailyCallCap !== undefined) dbUpdates.daily_call_cap = updates.dailyCallCap;
      if (updates.timezone !== undefined) dbUpdates.timezone = updates.timezone;

      const { data, error } = await supabase
        .from('campaigns')
        .update(dbUpdates)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: invalidateAccountData,
  });

  // Phase 5 (call-engine plan) §A — leads, not call_records, is what the dispatcher (Phase 4)
  // actually reads. Chunked so a large file doesn't send one enormous insert; ignoreDuplicates
  // relies on the (user_id, phone) unique index from Phase 3 to silently skip anyone already
  // loaded, rather than erroring the whole batch on the first repeat contact.
  const addLeadsMutation = useMutation({
    mutationFn: async ({ campaignId, rows, onProgress }: { campaignId: string; rows: ParsedLeadRow[]; onProgress?: (done: number, total: number) => void }) => {
      if (!userId) throw new Error("No user");
      let inserted = 0;
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const toInsert: LeadInsert[] = chunk.map((row) => ({
          user_id: userId,
          campaign_id: campaignId,
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          phone: row.phone,
          country: row.country,
          source: row.source,
          call_status: "pending",
        }));

        const { error, count } = await supabase
          .from('leads')
          .upsert(toInsert, { onConflict: 'user_id,phone', ignoreDuplicates: true, count: 'exact' });

        if (error) throw error;
        inserted += count ?? 0;
        onProgress?.(Math.min(i + CHUNK_SIZE, rows.length), rows.length);
      }
      return { inserted, attempted: rows.length };
    },
    onSuccess: invalidateAccountData,
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      // First delete associated call records and leads.
      await supabase.from('call_records').delete().eq('campaign_id', id);
      await supabase.from('leads').delete().eq('campaign_id', id);

      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: invalidateAccountData,
  });

  const deleteCallRecordMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('call_records')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: invalidateAccountData,
  });

  const deleteLeadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: invalidateAccountData,
  });

  // Phase 5 §D.6 — a human correcting an AI verdict. `outcome` lives on the lead (it's the
  // durable fact about the person); `needs_review`/`reviewed_by`/`reviewed_at` live on the call
  // record being reviewed, since a lead can have needed review on one attempt and not another.
  // leadId is null for a legacy call_records row with no matching lead (kind: "call_record" in
  // the merged view) — there's nowhere to write the richer outcome vocabulary for those, so only
  // the call record itself gets updated.
  const overrideOutcomeMutation = useMutation({
    mutationFn: async ({ leadId, callRecordId, outcome, isQualified }: { leadId: string | null; callRecordId: string | null; outcome: string; isQualified: boolean }) => {
      if (!userId) throw new Error("No user");

      if (leadId) {
        const { error: leadError } = await supabase
          .from('leads')
          .update({ outcome })
          .eq('id', leadId)
          .eq('user_id', userId);
        if (leadError) throw leadError;
      }

      if (callRecordId) {
        const { error: recordError } = await supabase
          .from('call_records')
          .update({
            is_qualified: isQualified,
            needs_review: false,
            reviewed_by: userId,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', callRecordId)
          .eq('user_id', userId);
        if (recordError) throw recordError;
      }
    },
    onSuccess: invalidateAccountData,
  });

  return {
    campaigns,
    isLoading,
    error,
    refetch,
    // Phase 4 D.4 — real signals for the "Data Synced" badge (Call Center), which used to be a
    // hardcoded green dot with no data behind it at all.
    isFetching,
    dataUpdatedAt,
    createCampaign: createMutation.mutateAsync,
    updateCampaign: updateMutation.mutateAsync,
    addLeads: addLeadsMutation.mutateAsync,
    deleteCampaign: deleteCampaignMutation.mutateAsync,
    deleteCallRecord: deleteCallRecordMutation.mutateAsync,
    deleteLead: deleteLeadMutation.mutateAsync,
    overrideOutcome: overrideOutcomeMutation.mutateAsync,
  };
}
