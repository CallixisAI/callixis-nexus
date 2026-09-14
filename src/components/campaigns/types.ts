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
  // 🔴 Client-feedback plan §E.4 — "Completed" is BACK. counting-model Phase 3's C.9 removed it
  // because nothing wrote campaigns.status as anything but active/paused/scheduled — a correct
  // read of the code *at that time*. §E.6 changed that: call-ingest now sets a campaign to
  // 'completed' the moment its qualified count reaches max_qualified_leads. So this widening is a
  // downstream consequence of §E.6 making the value reachable, NOT someone reverting C.9 by
  // accident. (mapCampaignWithStats maps the raw 'completed' → this "Completed" via
  // CAMPAIGN_STATUS_LABEL.)
  status: "Active" | "Paused" | "Scheduled" | "Completed";
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
  // Call-quality plan §E.4f — the raw call_records.transcript_messages column (untyped JSONB,
  // shape asserted only by src/lib/transcript.ts's own runtime checks), not yet resolved into
  // turns. E.5 renders with resolveTranscriptTurns(transcriptMessages, transcript), so a NULL
  // here — every call recorded before this column existed — correctly falls back to parsing
  // `transcript` above instead.
  transcriptMessages?: unknown;
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
  // 2026-09-11 — the two facts that make an already-attempted lead distinguishable from an
  // untouched one. Both were already being fetched (useAccountData selects * from leads and
  // call_records); neither had ever been carried this far, so a lead that came back
  // `customer-busy` rendered as a bare "Queued". Read via callPipeline.describeAttempts().
  //
  // endedReason is Vapi's RAW value (e.g. "customer-busy"), never a pre-formatted label — the
  // phrasing decision belongs to ENDED_REASON_LABEL, in one place.
  endedReason?: string | null;
  // leads.next_call_at — when the scheduled retry is due. May be in the past (due now).
  nextCallAt?: string | null;
}

export const statusColor: Record<string, string> = {
  "Active": "bg-primary/20 text-primary border-primary/30",
  "Paused": "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
  "Scheduled": "bg-blue-500/20 text-blue-500 border-blue-500/30",
  // §E.4 — a finished-at-the-cap campaign. Muted/neutral, distinct from Paused (which reads as
  // "someone stopped this on purpose, it can resume as-is") — a completed campaign needs its cap
  // raised before Restart does anything.
  "Completed": "bg-muted text-muted-foreground border-border",
};
