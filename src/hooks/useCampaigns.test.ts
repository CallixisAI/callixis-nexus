import { describe, it, expect } from "vitest";
import { mapCampaignWithStats, mergeLeadsWithCallRecords, buildCampaignsFromAccountData, UNASSIGNED_CAMPAIGN_ID } from "./useCampaigns";
import type { Database } from "@/integrations/supabase/types";

type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];
type CallRecordRow = Database["public"]["Tables"]["call_records"]["Row"];
type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type AiAgentRow = Database["public"]["Tables"]["ai_agents"]["Row"];

const NOW = new Date("2026-09-01T12:00:00Z").getTime();
const NO_AGENTS = new Map<string, AiAgentRow>();

const baseCampaign: CampaignRow = {
  id: "campaign-1",
  user_id: "user-1",
  agent_id: null,
  name: "Test Campaign",
  status: "active",
  industry: "Real Estate",
  budget: 1000,
  max_qualified_leads: 50,
  crm_api_endpoint: null,
  work_hours: { days: ["Mon"], startTime: "09:00", endTime: "17:00" },
  timezone: "UTC",
  daily_call_cap: 100,
  start_date: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const baseAgent = (overrides: Partial<AiAgentRow> = {}): AiAgentRow => ({
  id: "agent-1",
  user_id: "user-1",
  name: "Real Agent",
  status: "active",
  industry: null,
  model: "gpt-4",
  voice: "alloy",
  logic_provider: null,
  script: null,
  voice_settings: null,
  vapi_assistant_id: null,
  prompt_instructions: null,
  welcome_message: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const baseRecord = (overrides: Partial<CallRecordRow> = {}): CallRecordRow => ({
  id: "record-1",
  campaign_id: "campaign-1",
  user_id: "user-1",
  contact_name: "Jane Lead",
  contact_phone: "555-0100",
  contact_email: "jane@example.com",
  status: "pending",
  duration: 0,
  call_date: null,
  notes: null,
  recording_url: null,
  is_qualified: false,
  revenue: 0,
  lead_id: null,
  vapi_call_id: null,
  ended_reason: null,
  lead_score: null,
  transcript: null,
  cost: null,
  disqual_reason: null,
  needs_review: false,
  reviewed_by: null,
  reviewed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const baseLead = (overrides: Partial<LeadRow> = {}): LeadRow => ({
  id: "lead-1",
  user_id: "user-1",
  campaign_id: "campaign-1",
  first_name: "Jane",
  last_name: "Lead",
  email: "jane@example.com",
  phone: "+15550100",
  country: null,
  source: "csv",
  external_ref: null,
  call_status: "pending",
  outcome: null,
  lead_score: null,
  retry_count: 0,
  last_called_at: null,
  next_call_at: null,
  do_not_call: false,
  timezone: null,
  active_call_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("mapCampaignWithStats", () => {
  it("guards against divide-by-zero when there are no records", () => {
    const result = mapCampaignWithStats(baseCampaign, [], [], NO_AGENTS, NOW);
    expect(result.connectRate).toBe(0);
    expect(result.callsAttempted).toBe(0);
  });

  it("computes connectRate from completed vs ATTEMPTED calls, not total call_records rows (E6)", () => {
    const records = [
      baseRecord({ id: "r1", status: "completed" }),
      baseRecord({ id: "r2", status: "completed" }),
      baseRecord({ id: "r3", status: "no-answer" }),
      baseRecord({ id: "r4", status: "pending" }), // debris — must not count toward either side
    ];
    const result = mapCampaignWithStats(baseCampaign, [], records, NO_AGENTS, NOW);
    expect(result.connectRate).toBe(67); // 2 of 3 real attempts, not 2 of 4 rows
    expect(result.callsAttempted).toBe(3);
  });

  it("maps the DB status vocabulary to the display status union, with no reachable 'Completed' (C.9)", () => {
    expect(mapCampaignWithStats({ ...baseCampaign, status: "active" }, [], [], NO_AGENTS, NOW).status).toBe("Active");
    expect(mapCampaignWithStats({ ...baseCampaign, status: "scheduled" }, [], [], NO_AGENTS, NOW).status).toBe("Scheduled");
    expect(mapCampaignWithStats({ ...baseCampaign, status: "paused" }, [], [], NO_AGENTS, NOW).status).toBe("Paused");
    expect(mapCampaignWithStats({ ...baseCampaign, status: "anything-else" }, [], [], NO_AGENTS, NOW).status).toBe("Paused");
  });

  it("counts leadCounts from the leads table via the shared bucket model, independent of calls made", () => {
    const leads = [
      baseLead({ id: "l1", call_status: "pending" }), // queued
      baseLead({ id: "l2", call_status: "pending", do_not_call: true }), // excluded
      baseLead({ id: "l3", call_status: "dialing", last_called_at: new Date(NOW - 1000).toISOString() }), // dialing
      baseLead({ id: "l4", call_status: "completed" }), // called
    ];
    const result = mapCampaignWithStats(baseCampaign, leads, [], NO_AGENTS, NOW);
    expect(result.leadsTotal).toBe(4);
    expect(result.leadCounts).toEqual({ total: 4, queued: 1, dialing: 1, stalled: 0, called: 1, excluded: 1 });
  });

  it("passes through the dispatcher's own enforced settings rather than hiding them", () => {
    const result = mapCampaignWithStats({ ...baseCampaign, daily_call_cap: 250, timezone: "America/New_York" }, [], [], NO_AGENTS, NOW);
    expect(result.dailyCallCap).toBe(250);
    expect(result.timezone).toBe("America/New_York");
  });

  // D.6/D.15 — campaigns.agent_id is NULL on every real campaign today (no campaign screen ever
  // writes it); "Unassigned" is the honest, expected result, not a fallback string masking it.
  // AI Agents plan Phase 3 §D.10 — the same case now also carries a real agentId: null (D.6),
  // not just the display name, since the campaign↔agent link's UI needs the id, not just the label.
  it("resolves 'Unassigned' when the campaign has no agent_id, or the id doesn't match a known agent", () => {
    const noAgent = mapCampaignWithStats(baseCampaign, [], [], NO_AGENTS, NOW);
    expect(noAgent.agent).toBe("Unassigned");
    expect(noAgent.agentId).toBeNull();

    const unmatched = mapCampaignWithStats({ ...baseCampaign, agent_id: "agent-404" }, [], [], NO_AGENTS, NOW);
    expect(unmatched.agent).toBe("Unassigned");
    // §D.8 — the id itself is passed through even when it doesn't resolve to a known agent (e.g.
    // a race between the agents query and the campaigns query), rather than silently dropped.
    expect(unmatched.agentId).toBe("agent-404");
  });

  // §D.9 — a campaign with a real agent_id resolves to that agent's name, and agentId round-trips.
  it("resolves the real agent name when campaigns.agent_id matches a real ai_agents row", () => {
    const agentsById = new Map([["agent-1", baseAgent({ id: "agent-1", name: "Sales Bot" })]]);
    const result = mapCampaignWithStats({ ...baseCampaign, agent_id: "agent-1" }, [], [], agentsById, NOW);
    expect(result.agent).toBe("Sales Bot");
    expect(result.agentId).toBe("agent-1");
  });
});

describe("mergeLeadsWithCallRecords", () => {
  it("shows a lead with no call yet as a queued row with no duration/recording", () => {
    const rows = mergeLeadsWithCallRecords([baseLead()], [], "Test Agent", NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "lead", status: "queued", duration: "—", callDate: "—", hasRecording: false, agent: "Test Agent" });
  });

  it("maps a freshly-dialing lead to 'dialing' and a stuck one (>30 min) to 'stalled'", () => {
    const fresh = mergeLeadsWithCallRecords([baseLead({ call_status: "dialing", last_called_at: new Date(NOW - 60_000).toISOString() })], [], "Test Agent", NOW);
    expect(fresh[0].status).toBe("dialing");

    const stuck = mergeLeadsWithCallRecords([baseLead({ call_status: "dialing", last_called_at: new Date(NOW - 40 * 60_000).toISOString() })], [], "Test Agent", NOW);
    expect(stuck[0].status).toBe("stalled");
  });

  it("layers the most recent call record's real outcome onto its lead", () => {
    const older = baseRecord({ id: "r-old", lead_id: "lead-1", status: "no-answer", call_date: "2026-01-01T00:00:00Z" });
    const newer = baseRecord({ id: "r-new", lead_id: "lead-1", status: "completed", call_date: "2026-01-02T00:00:00Z", duration: 65, recording_url: "https://example.com/rec.mp3" });
    const rows = mergeLeadsWithCallRecords([baseLead({ call_status: "completed", outcome: "Qualified" })], [older, newer], "Test Agent", NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "lead", status: "completed", duration: "1:05", hasRecording: true, outcome: "Qualified", callRecordId: "r-new" });
  });

  it("surfaces a call_records row with no lead_id as its own row instead of dropping it", () => {
    const orphan = baseRecord({ id: "r-orphan", lead_id: null, contact_name: "Legacy Caller" });
    const rows = mergeLeadsWithCallRecords([], [orphan], "Test Agent", NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "call_record", id: "r-orphan", name: "Legacy Caller", status: "unattributed" });
  });

  it("classifies a real orphan attempt (not debris) by its actual outcome", () => {
    const orphan = baseRecord({ id: "r-orphan-2", lead_id: null, status: "failed" });
    const rows = mergeLeadsWithCallRecords([], [orphan], "Test Agent", NOW);
    expect(rows[0].status).toBe("failed");
  });

  it("carries the needs_review flag through onto the merged row", () => {
    const cr = baseRecord({ lead_id: "lead-1", needs_review: true });
    const rows = mergeLeadsWithCallRecords([baseLead()], [cr], "Test Agent", NOW);
    expect(rows[0].needsReview).toBe(true);
  });

  // A.11-equivalent at this layer: a refusal (do_not_call + completed together) must display as
  // the real attempt outcome, not silently vanish into an "excluded" reading.
  it("shows a refusal (do_not_call=true, call_status='completed') by its real call outcome", () => {
    const cr = baseRecord({ lead_id: "lead-1", status: "no-answer" });
    const rows = mergeLeadsWithCallRecords([baseLead({ call_status: "completed", do_not_call: true })], [cr], "Test Agent", NOW);
    expect(rows[0].status).toBe("no-answer");
  });

  // D.8/D.5 — the raw timestamp needed to sort Call Center's pipeline and compute real elapsed
  // time travels alongside the formatted display string instead of being thrown away.
  it("carries the lead's raw last_called_at through as lastCalledAt", () => {
    const ts = new Date(NOW - 5 * 60_000).toISOString();
    const rows = mergeLeadsWithCallRecords([baseLead({ call_status: "dialing", last_called_at: ts })], [], "Test Agent", NOW);
    expect(rows[0].lastCalledAt).toBe(ts);
  });
});

// E7/C.11 — leads whose campaign_id doesn't match any real campaign (parked there by a campaign
// delete, ON DELETE SET NULL) must surface somewhere instead of silently vanishing.
describe("buildCampaignsFromAccountData", () => {
  it("returns nothing extra when every lead belongs to a real campaign", () => {
    const leads = [baseLead({ campaign_id: "campaign-1" })];
    const result = buildCampaignsFromAccountData([baseCampaign], leads, []);
    expect(result).toHaveLength(1);
    expect(result.some((c) => c.id === UNASSIGNED_CAMPAIGN_ID)).toBe(false);
  });

  it("surfaces orphaned leads (campaign_id null, or pointing at a deleted campaign) as an 'Unassigned Leads' pseudo-campaign", () => {
    const leads = [
      baseLead({ id: "l1", campaign_id: null }),
      baseLead({ id: "l2", campaign_id: "deleted-campaign-id" }),
      baseLead({ id: "l3", campaign_id: "campaign-1" }), // belongs to a real campaign — not orphaned
    ];
    const result = buildCampaignsFromAccountData([baseCampaign], leads, [], [], NOW);
    expect(result).toHaveLength(2);
    const unassigned = result.find((c) => c.id === UNASSIGNED_CAMPAIGN_ID);
    expect(unassigned).toBeDefined();
    expect(unassigned?.leadsTotal).toBe(2);
    expect(unassigned?.name).toBe("Unassigned Leads");

    const real = result.find((c) => c.id === "campaign-1");
    expect(real?.leadsTotal).toBe(1);
  });
});
