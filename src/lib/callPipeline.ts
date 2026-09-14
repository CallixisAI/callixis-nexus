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

// The values campaigns.status is ever set to by this app. `mapCampaignWithStats`'s own fallback
// already treated anything unrecognized as "paused" before this file existed — normalizeCampaignStatus
// keeps that behaviour.
//
// 🔴 Client-feedback plan §E.1 — "completed" is BACK, deliberately. counting-model Phase 3's C.9
// removed it as "unreachable dead vocabulary, not a real state" — correct at the time, because
// nothing wrote it. §E.6 (call-ingest, at the moment a qualified count reaches
// campaigns.max_qualified_leads) now writes it, so it is a real, reachable state again. This is a
// consequence of §E.6, not someone undoing C.9 by accident.
export type CampaignStatus = "active" | "paused" | "scheduled" | "completed";

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
  // §E.2 — "completed" passes through now that §E.6 writes it, instead of falling into the
  // "paused" default (which would make a finished campaign look manually paused).
  if (value === "active" || value === "scheduled" || value === "completed") return value;
  return "paused";
}

// Client-feedback plan §E.V1 — the Max Qualified Leads cap predicate, pure and unit-tested the
// same way this file's buckets are. `max_qualified_leads = 0` means unlimited (matches the UI
// copy "0 = unlimited"), so a 0 cap is never "reached". Mirrored — NOT imported, these are Deno
// functions — in supabase/functions/call-ingest/index.ts (§E.6) and
// supabase/functions/dispatch-batch/index.ts (§E.10), each with the grep that finds this as the
// source of truth, same cross-runtime convention as STUCK_CALL_MINUTES above.
export function isQualifiedCapReached(qualifiedCount: number, maxQualifiedLeads: number): boolean {
  return maxQualifiedLeads > 0 && qualifiedCount >= maxQualifiedLeads;
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

// ---------------------------------------------------------------------------------------------
// What happened on the attempts so far
// ---------------------------------------------------------------------------------------------

// 2026-09-11 (James) — "the user will not know that the user is busy if they do not have access
// to vapi right?". Correct, and it was a real hole: a lead that had been dialled and come back
// `customer-busy` rendered as a bare "Queued", identical to one nobody had ever touched. Every
// fact needed to say otherwise (retry_count, ended_reason, next_call_at) was already in the
// query and simply never reached the screen.
//
// Vapi's raw endedReason values are engine vocabulary, not customer vocabulary. Only reasons we
// have actually decided how to phrase are mapped; anything unknown returns null and the UI shows
// nothing rather than leaking a string like "pipeline-error-openai-llm-failed" into a sales view.
// The raw value is still surfaced verbatim in the detail sheet, where debugging is the point.
export const ENDED_REASON_LABEL: Record<string, string> = {
  // Nobody picked up. NO_ANSWER_REASONS in call-ingest/index.ts treats these three as one class
  // (a retry is scheduled); they are phrased apart here because the difference matters to a
  // human deciding whether to try this person again.
  "customer-busy": "Line busy",
  "customer-did-not-answer": "No answer",
  "no-answer": "No answer",
  // Reached a person.
  "customer-ended-call": "They hung up",
  "assistant-ended-call": "Call completed",
  "assistant-forwarded-call": "Transferred",
  "customer-ended-call-after-message": "They hung up",
  // Reached a person, but the audio never worked. Worth phrasing distinctly: this is the
  // signature of the 2026-09-11 call-quality problem, not of an uninterested prospect.
  "silence-timed-out": "No response heard",
  "exceeded-max-duration": "Reached the time limit",
  // Never reached the network.
  "twilio-failed-to-connect-call": "Could not connect",
  "voicemail": "Voicemail",
};

export function endedReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return ENDED_REASON_LABEL[reason] ?? null;
}

export interface AttemptInfo {
  attemptsMade: number;
  attemptsAllowed: number;
  reasonLabel: string | null; // friendly, null when the reason is unmapped or absent
  rawReason: string | null; // always the untouched value, for the detail sheet
  retryAt: string | null; // ISO, ONLY when a retry is genuinely still in the future
  attemptsExhausted: boolean;
}

export interface AttemptInfoInput {
  retryCount?: number | null;
  endedReason?: string | null;
  nextCallAt?: string | null;
}

// Returns null when this lead has never been dialled — the caller renders nothing, which is the
// correct and honest display for a genuinely untouched lead.
//
// `retryAt` is deliberately null for a next_call_at in the PAST: that retry is due now and the
// dispatcher is about to take it, so promising the user a future time would be wrong. Same
// next_call_at-is-not-the-whole-story care as isLeadPoolExhausted above.
export function describeAttempts(input: AttemptInfoInput, now: number = Date.now()): AttemptInfo | null {
  const attemptsMade = input.retryCount ?? 0;
  if (attemptsMade <= 0) return null;

  const parsedRetry = input.nextCallAt ? new Date(input.nextCallAt).getTime() : NaN;
  const retryIsFuture = Number.isFinite(parsedRetry) && parsedRetry > now;

  return {
    attemptsMade,
    attemptsAllowed: MAX_RETRY_COUNT,
    reasonLabel: endedReasonLabel(input.endedReason),
    rawReason: input.endedReason ?? null,
    retryAt: retryIsFuture ? (input.nextCallAt as string) : null,
    attemptsExhausted: attemptsMade >= MAX_RETRY_COUNT,
  };
}

// ---------------------------------------------------------------------------------------------
// Why a campaign finished
// ---------------------------------------------------------------------------------------------

// 2026-09-11 (James) — "when all leads are completed or the number of qualified leads are done,
// automatically pause it, but label it as completed". The cap half already existed (§E.6); this
// is the other half, plus the shared vocabulary for saying WHICH of the two happened.
//
// The reason is DERIVED, never stored — no `completion_reason` column exists and none is needed,
// because both inputs (the qualified count, the lead buckets) are already on screen. That keeps
// this a pure, testable function and avoids a migration for a label.
export type CampaignCompletionReason = "cap-reached" | "leads-exhausted";

export const COMPLETION_REASON_LABEL: Record<CampaignCompletionReason, string> = {
  "cap-reached": "Qualified-leads target reached",
  "leads-exhausted": "All leads called",
};

// Nothing is left that could EVER be dialed again on this campaign.
//
// 🔑 The load-bearing subtlety: this deliberately ignores `next_call_at`. A lead whose retry is
// scheduled for tomorrow, or one waiting for the campaign's work hours to come round, is still
// `queued` (see bucketLead — it never looks at next_call_at), so this stays FALSE until that
// retry is actually spent. "No leads due right now" and "this campaign is finished" are very
// different questions, and confusing them would auto-complete every campaign overnight.
//
// `stalled` counts as not-exhausted on purpose: a stalled lead is one the sweeper
// (callixis-sweep-stuck-leads, every 5 min) is about to reset to `pending` and dial again.
// total > 0 guards the empty campaign — an untouched campaign with no leads is not "finished".
export function isLeadPoolExhausted(counts: LeadCounts): boolean {
  return counts.total > 0 && counts.queued === 0 && counts.dialing === 0 && counts.stalled === 0;
}

// Which of the two ended it, for a campaign already sitting at "completed". Returns null when
// neither condition explains it (a campaign completed by some other path, or data that has since
// changed — e.g. more leads were uploaded after it finished).
//
// The cap wins when both are true: it is the more informative answer, because it means the
// campaign stopped EARLY and there may still be leads worth calling if the cap is raised.
export function campaignCompletionReason(
  qualifiedCount: number,
  maxQualifiedLeads: number,
  counts: LeadCounts,
): CampaignCompletionReason | null {
  if (isQualifiedCapReached(qualifiedCount, maxQualifiedLeads)) return "cap-reached";
  if (isLeadPoolExhausted(counts)) return "leads-exhausted";
  return null;
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

// A scheduled retry is almost always within a day, so the time alone is what a user needs; a
// weekday prefix is added once it isn't today, so "09:00" can never be mistaken for this morning.
// Rendered in the viewer's own locale/zone deliberately — unlike the CAMPAIGN's timezone (which
// governs when the engine dials), this is "when will I see something happen", a local question.
export function formatRetryTime(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null;
  const when = new Date(iso);
  const ms = when.getTime();
  if (!Number.isFinite(ms)) return null;
  const time = when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const sameDay = when.toDateString() === new Date(now).toDateString();
  return sameDay ? time : `${when.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
}

// The one-line summary shown under a lead's status badge. Returns null when there is nothing
// worth saying, so callers can render it unconditionally.
export function attemptSummaryLine(info: AttemptInfo | null, now: number = Date.now()): string | null {
  if (!info) return null;
  const parts = [`Attempt ${info.attemptsMade} of ${info.attemptsAllowed}`];
  if (info.reasonLabel) parts.push(info.reasonLabel);
  if (info.attemptsExhausted) {
    parts.push("no attempts left");
  } else {
    const retry = formatRetryTime(info.retryAt, now);
    parts.push(retry ? `retrying ${retry}` : "retrying shortly");
  }
  return parts.join(" · ");
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
  // §E.3 — reachable again (see the CampaignStatus comment): §E.6 sets a campaign to this once
  // its qualified count hits max_qualified_leads.
  completed: "Completed",
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
