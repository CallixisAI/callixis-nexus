// docs/counting-model-plan/README.md — the counting model. Pure, additive, DB-free, unit tested
// the same way src/lib/userLifecycle.ts / roleMatrix.ts / ipRules.ts already are. This is the one
// place that decides what a "call" is and what a lead's status means — before this file existed,
// Campaigns, Call Center and Dashboard each invented their own answer (see the plan doc's "Why
// this exists"). Real enforcement lives elsewhere, same split as every file in this family:
//   - which statuses actually get written: supabase/functions/call-ingest/index.ts (call_records)
//     and supabase/functions/dispatch-batch/index.ts (leads.call_status)
//   - the stuck-call sweep that would actually clear a `stalled` lead:
//     supabase/functions/dispatch-batch/index.ts's `?action=sweep`
//   - the retry cap that actually stops dialing: supabase/functions/dispatch-batch/index.ts's
//     `due` query (`.lt('retry_count', MAX_RETRY_COUNT)`)
// Everything in this file only classifies and counts rows already read from those tables — it
// never writes anything and never decides who gets called.

import type { Database } from "@/integrations/supabase/types";

type CallRecordRow = Database["public"]["Tables"]["call_records"]["Row"];
type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

// ---------------------------------------------------------------------------------------------
// Unions
// ---------------------------------------------------------------------------------------------

// The only three values call-ingest ever writes to call_records.status (E1 — re-verify with
// `grep -n "function mapOutcomeToCallRecordStatus" -A 8 supabase/functions/call-ingest/index.ts`).
export type CallAttemptStatus = "completed" | "no-answer" | "failed";

// classifyCallRecord()'s result: either a real attempt with one of the three statuses above, or
// "unattributed" — anything else living in call_records.status is debris (a stale DB default with
// no writer left, E9), not a fourth kind of call.
export type CallRecordStatus =
  | { kind: "attempt"; status: CallAttemptStatus }
  | { kind: "unattributed" };

// The only three values leads.call_status ever receives (E2). 'failed' survives only in a
// migration comment and one now-removed read branch — never write or expect it here.
export type LeadCallStatus = "pending" | "dialing" | "completed";

// The five mutually-exclusive, exhaustive lead buckets (the counting model's own table).
// Invariant, asserted by a test below: queued + dialing + stalled + called + excluded === total.
export type LeadBucket = "queued" | "dialing" | "stalled" | "called" | "excluded";

// The only three values campaigns.status is ever set to by this app (mapCampaignWithStats's own
// fallback already treated anything else as "paused" before this file existed — normalizeCampaignStatus
// keeps that behaviour rather than changing it).
export type CampaignStatus = "active" | "paused" | "scheduled";

// The one status vocabulary every page-level badge/label should render through. A real call
// attempt's own outcome (completed/no-answer/failed) if there is one, else the lead's bucket
// (queued/dialing/stalled/excluded), else "unattributed" for a debris call_records row with no
// lead behind it at all. Deliberately has no "called" member — a lead in the `called` bucket
// always has a real attempt behind it, so displayStatusFor() reports that attempt's own outcome
// instead of a generic "called".
export type DisplayStatus =
  | CallAttemptStatus
  | "queued"
  | "dialing"
  | "stalled"
  | "excluded"
  | "unattributed";

// ---------------------------------------------------------------------------------------------
// Constants — mirrored (not imported; this is a browser bundle, those are Deno functions, same
// cross-runtime boundary src/lib/phone.ts already documents), each with the grep that finds its
// real source of truth. Re-run the grep before trusting a "stalled" badge or a retry decision.
// ---------------------------------------------------------------------------------------------

// grep -n "const STUCK_CALL_MINUTES" supabase/functions/dispatch-batch/index.ts — unique, = 30.
export const STUCK_CALL_MINUTES = 30;

// grep -rn "const MAX_RETRY_COUNT" supabase/functions/ — TWO matches (dispatch-batch/index.ts and
// call-ingest/index.ts, E8). Both are 3 today, so they currently agree; if this ever drifts, name
// which file you mean rather than assuming they still match.
export const MAX_RETRY_COUNT = 3;

// ---------------------------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------------------------

export type CallRecordStatusInput = Pick<CallRecordRow, "status">;

export function classifyCallRecord(record: CallRecordStatusInput): CallRecordStatus {
  if (record.status === "completed" || record.status === "no-answer" || record.status === "failed") {
    return { kind: "attempt", status: record.status };
  }
  return { kind: "unattributed" };
}

export function isCallAttempt(record: CallRecordStatusInput): boolean {
  return classifyCallRecord(record).kind === "attempt";
}

export function normalizeLeadCallStatus(value: string | null | undefined): LeadCallStatus {
  if (value === "dialing" || value === "completed") return value;
  // Folds away the dead 'failed' read branch (C.8 — leads.call_status='failed' has no writer,
  // E2) along with any other unexpected value into the safe default.
  return "pending";
}

export function normalizeCampaignStatus(value: string | null | undefined): CampaignStatus {
  if (value === "active" || value === "scheduled") return value;
  return "paused";
}

// NULL last_called_at while dialing reads as stalled too — a lead can't be genuinely "just
// claimed" with no timestamp at all; that shape only happens from stale/malformed data.
export function isStalledDialing(lastCalledAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!lastCalledAt) return true;
  const ageMinutes = (now - new Date(lastCalledAt).getTime()) / 60_000;
  return ageMinutes >= STUCK_CALL_MINUTES;
}

export type LeadBucketInput = Pick<LeadRow, "call_status" | "do_not_call" | "retry_count" | "last_called_at">;

// Bucket precedence: test dialing/completed BEFORE do_not_call. call-ingest sets do_not_call=true
// AND call_status='completed' together on a refusal — that person *was* called. Checking
// do_not_call first would silently misfile every refusal as merely "excluded" rather than
// "called" (A.11 asserts this exact case).
export function bucketLead(lead: LeadBucketInput, now: number = Date.now()): LeadBucket {
  const status = normalizeLeadCallStatus(lead.call_status);

  if (status === "dialing") {
    return isStalledDialing(lead.last_called_at, now) ? "stalled" : "dialing";
  }
  if (status === "completed") {
    return "called";
  }
  // status === "pending"
  if (lead.do_not_call || (lead.retry_count ?? 0) >= MAX_RETRY_COUNT) {
    return "excluded";
  }
  return "queued";
}

// The one status a row-level badge (Campaigns' record table, Call Center, CallDetailSheet)
// should render. `latestAttemptStatus` is the most recent real call attempt's outcome for this
// lead, if any exists — pass null when there isn't one yet.
export function displayStatusFor(bucket: LeadBucket, latestAttemptStatus: CallAttemptStatus | null): DisplayStatus {
  if (bucket === "called") {
    // A `called` lead should always have a real attempt behind it; fall back to "unattributed"
    // rather than inventing a status if that's somehow not true (data inconsistency, not
    // something this pure function should hide).
    return latestAttemptStatus ?? "unattributed";
  }
  return bucket;
}

// ---------------------------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------------------------

export interface LeadCounts {
  total: number;
  queued: number;
  dialing: number;
  stalled: number;
  called: number;
  excluded: number;
}

export function countLeads(leads: LeadBucketInput[], now: number = Date.now()): LeadCounts {
  const counts: LeadCounts = { total: leads.length, queued: 0, dialing: 0, stalled: 0, called: 0, excluded: 0 };
  for (const lead of leads) {
    counts[bucketLead(lead, now)] += 1;
  }
  return counts;
}

export interface CallCounts {
  total: number; // every call_records row, attempts + unattributed
  attempted: number; // real attempts only (completed/no-answer/failed)
  completed: number;
  noAnswer: number;
  failed: number;
  unattributed: number; // debris — shown, never counted toward any rate
}

export function countCalls(records: CallRecordStatusInput[]): CallCounts {
  const counts: CallCounts = { total: records.length, attempted: 0, completed: 0, noAnswer: 0, failed: 0, unattributed: 0 };
  for (const record of records) {
    const classified = classifyCallRecord(record);
    if (classified.kind === "unattributed") {
      counts.unattributed += 1;
      continue;
    }
    counts.attempted += 1;
    if (classified.status === "completed") counts.completed += 1;
    else if (classified.status === "no-answer") counts.noAnswer += 1;
    else counts.failed += 1;
  }
  return counts;
}

// completed / attempted — NOT completed / total. E6: a never-dialled default-'pending' row and a
// 'failed' (Vapi *Unreachable*) row must never count as a connect; both are excluded by
// definition since the denominator is real attempts only.
export function connectRate(counts: Pick<CallCounts, "attempted" | "completed">): number {
  return counts.attempted > 0 ? Math.round((counts.completed / counts.attempted) * 100) : 0;
}

// Same denominator as connectRate (real attempts), kept as a separate number rather than folded
// into "conversion" — `completed` already includes "Not Qualified" calls, so a connect is not the
// same claim as a qualified lead.
export function qualifiedRate(qualifiedCount: number, attempted: number): number {
  return attempted > 0 ? Math.round((qualifiedCount / attempted) * 100) : 0;
}

export function formatPercent(value: number): string {
  return `${value}%`;
}

// ---------------------------------------------------------------------------------------------
// Label maps — the copy lives here once; icons/colours stay in components (A.9).
// ---------------------------------------------------------------------------------------------

export const LEAD_BUCKET_LABEL: Record<LeadBucket, string> = {
  queued: "Queued",
  dialing: "Dialing",
  stalled: "Stalled",
  called: "Called",
  excluded: "Excluded",
};

export const DISPLAY_STATUS_LABEL: Record<DisplayStatus, string> = {
  completed: "Completed",
  "no-answer": "No Answer",
  failed: "Failed",
  queued: "Queued",
  dialing: "Dialing",
  stalled: "Stalled",
  excluded: "Excluded",
  // D.12 — "Not a call attempt" reads honestly to a non-technical user; "Unattributed" doesn't
  // say what it means. Changing this one label updates every page that renders it (Campaigns,
  // Call Center, Reports, CallDetailSheet) — the whole point of one shared label map.
  unattributed: "Not a call attempt",
};

export const DISPLAY_STATUS_HELP: Record<DisplayStatus, string> = {
  completed: "The call connected and finished.",
  "no-answer": "Nobody picked up, or it went to voicemail.",
  failed: "The call could not be completed (e.g. an unreachable number).",
  queued: "Waiting for the dispatcher to dial this lead.",
  dialing: `Currently being called — claimed within the last ${STUCK_CALL_MINUTES} minutes.`,
  stalled: `Marked "dialing" for more than ${STUCK_CALL_MINUTES} minutes with no result yet. The dispatcher's own sweep (dispatch-batch?action=sweep) resets rows like this once the engine is running again.`,
  excluded: "Opted out (do-not-call) or exhausted its retry attempts — will never be dialed again.",
  unattributed: "This row has no real outcome recorded — it isn't a call that happened. It's excluded from every count on this page. Safe to review and delete.",
};

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  active: "Active",
  paused: "Paused",
  scheduled: "Scheduled",
};

// ---------------------------------------------------------------------------------------------
// Engine status (Phase 4 D.3) — "System Online" used to be a hardcoded badge with no data behind
// it at all. This mirrors the dispatcher's own stuck-call sweep window (STUCK_CALL_MINUTES): if
// there's real work waiting (an active campaign with queued leads) and nothing has actually been
// dialed within that window, the engine is stalled, not "online" — whatever the badge used to
// unconditionally claim. CLAUDE.md's own "READ THIS FIRST" documents the n8n engine going offline
// for real; this is what lets the UI say so instead of contradicting it.
// ---------------------------------------------------------------------------------------------

export type EngineStatus = "online" | "idle" | "stalled";

export function engineStatus(
  hasActiveCampaignWithQueuedLeads: boolean,
  lastCalledAt: string | null | undefined,
  now: number = Date.now()
): EngineStatus {
  if (!hasActiveCampaignWithQueuedLeads) return "idle";
  if (!lastCalledAt) return "stalled";
  const ageMinutes = (now - new Date(lastCalledAt).getTime()) / 60_000;
  return ageMinutes < STUCK_CALL_MINUTES ? "online" : "stalled";
}

export const ENGINE_STATUS_LABEL: Record<EngineStatus, string> = {
  online: "System Online",
  idle: "Idle — Nothing Queued",
  stalled: "Engine Offline",
};
