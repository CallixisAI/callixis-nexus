import type { DisplayStatus, LeadCounts } from "@/lib/callPipeline";

export const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface WorkHours {
  days: string[];
  startTime: string;
  endTime: string;
}

export interface Campaign {
  id: string;
  name: string;
  // C.9 — "Completed" removed: campaigns.status is never written as anything but
  // active/paused/scheduled (src/lib/callPipeline.ts's normalizeCampaignStatus), so the old
  // fourth member was unreachable dead vocabulary, not a real state.
  status: "Active" | "Paused" | "Scheduled";
  // C.1 — renamed from `calls`: this is real call ATTEMPTS (call_records rows classified by
  // src/lib/callPipeline.ts's countCalls as completed/no-answer/failed), never debris rows.
  callsAttempted: number;
  // C.2 — renamed from `conversion: string` (a pre-formatted "50.0%"). This is a plain number
  // now; format for display with formatPercent() at the point of use. `completed / attempted`
  // (E6) — never `completed / total`, which would count never-dialled/unattributed rows as
  // connects.
  connectRate: number;
  // C.2 — surfaced separately from connectRate: `completed` includes "Not Qualified" calls, so a
  // connect is not the same claim as a qualified lead.
  qualifiedRate: number;
  industry: string;
  agent: string;
  // AI Agents plan Phase 3 §D.6 — the real FK, alongside the resolved display name above. A
  // dropdown needs the id to write; the id, unlike the name, survives the agent being renamed.
  // null means "Unassigned" (either never set, or the linked agent was deleted — agent_id is
  // ON DELETE SET NULL, §D.8).
  agentId: string | null;
  records: CallRecord[];
  workHours: { days: string[]; startTime: string; endTime: string };
  maxQualifiedLeads: number;
  qualifiedLeadsSent: number;
  crmApiEndpoint: string;
  budget: number;
  // Lead-level counts (leads table), distinct from `callsAttempted` (call_records — attempts
  // made). Used by the Start confirmation dialog (§B.4) and the live progress indicator (§C.4).
  leadsTotal: number;
  // C.3 — replaces leadsPending/leadsDialing with the full 5-bucket breakdown from
  // src/lib/callPipeline.ts's countLeads(), so every consumer sees queued/dialing/stalled/
  // called/excluded instead of just two of the five.
  leadCounts: LeadCounts;
  // What the dispatcher (Phase 4) actually enforces — surfaced here per §B.6 so they aren't a
  // hidden default the user finds out about only by watching call volume.
  dailyCallCap: number;
  timezone: string;
}

export interface CallRecord {
  // `id` + `kind` together say which table a row identifies and which id to use for
  // delete/override writes — most rows are a lead (possibly never called yet), but a call_records
  // row created before the leads table existed (or with no phone/lead match) has no lead to point
  // to, so it surfaces as its own row instead of being silently dropped.
  id: string;
  kind: "lead" | "call_record";
  name: string;
  phone: string;
  email: string;
  // The one status vocabulary (src/lib/callPipeline.ts's DisplayStatus) every page renders
  // through — a real call attempt's own outcome if there's been one, else the lead's pipeline
  // bucket, else "unattributed" for a debris call_records row with no lead behind it.
  status: DisplayStatus;
  duration: string;
  callDate: string;
  hasRecording: boolean;
  notes: string;
  agent: string;
  outcome?: string | null;
  leadScore?: number | null;
  recordingUrl?: string | null;
  transcript?: string | null;
  disqualReason?: string | null;
  needsReview?: boolean;
  doNotCall?: boolean;
  retryCount?: number;
  // Present when kind === "lead" and a call has actually happened for it — the id to write a
  // manual override (§D.6) or needs_review clear against.
  callRecordId?: string | null;
  // Phase 4 D.8/D.5 — the raw timestamp `callDate` is formatted from (lead.last_called_at for a
  // "lead" row, the orphan call_records row's own call_date for a "call_record" row). Kept
  // alongside the display string so consumers can sort/compute elapsed time without re-parsing
  // a human-formatted date.
  lastCalledAt?: string | null;
}

export const statusColor: Record<string, string> = {
  "Active": "bg-primary/20 text-primary border-primary/30",
  "Paused": "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
  "Scheduled": "bg-blue-500/20 text-blue-500 border-blue-500/30",
};
