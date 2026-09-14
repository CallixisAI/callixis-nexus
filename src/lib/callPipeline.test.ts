import { describe, it, expect } from "vitest";
import {
  classifyCallRecord,
  isCallAttempt,
  normalizeLeadCallStatus,
  normalizeCampaignStatus,
  isStalledDialing,
  bucketLead,
  displayStatusFor,
  countLeads,
  countCalls,
  connectRate,
  qualifiedRate,
  formatPercent,
  engineStatus,
  isQualifiedCapReached,
  describeAttempts,
  endedReasonLabel,
  attemptSummaryLine,
  formatRetryTime,
  isLeadPoolExhausted,
  campaignCompletionReason,
  STUCK_CALL_MINUTES,
  MAX_RETRY_COUNT,
  type LeadBucketInput,
  type LeadBucket,
} from "./callPipeline";

const NOW = new Date("2026-09-01T12:00:00Z").getTime();

const baseLead = (overrides: Partial<LeadBucketInput> = {}): LeadBucketInput => ({
  call_status: "pending",
  do_not_call: false,
  retry_count: 0,
  last_called_at: null,
  ...overrides,
});

describe("classifyCallRecord / isCallAttempt", () => {
  it("classifies the three real outcomes as attempts", () => {
    expect(classifyCallRecord({ status: "completed" })).toEqual({ kind: "attempt", status: "completed" });
    expect(classifyCallRecord({ status: "no-answer" })).toEqual({ kind: "attempt", status: "no-answer" });
    expect(classifyCallRecord({ status: "failed" })).toEqual({ kind: "attempt", status: "failed" });
    expect(isCallAttempt({ status: "completed" })).toBe(true);
  });

  it("classifies anything else — the debris default, dead vocabulary — as unattributed", () => {
    for (const status of ["pending", "voicemail", "callback", "in-progress", "", "bogus"]) {
      expect(classifyCallRecord({ status })).toEqual({ kind: "unattributed" });
      expect(isCallAttempt({ status })).toBe(false);
    }
  });
});

describe("normalizeLeadCallStatus", () => {
  it("passes through the two non-default real values", () => {
    expect(normalizeLeadCallStatus("dialing")).toBe("dialing");
    expect(normalizeLeadCallStatus("completed")).toBe("completed");
  });

  it("folds pending, 'failed' (dead — E2), null and garbage all to pending", () => {
    expect(normalizeLeadCallStatus("pending")).toBe("pending");
    expect(normalizeLeadCallStatus("failed")).toBe("pending");
    expect(normalizeLeadCallStatus(null)).toBe("pending");
    expect(normalizeLeadCallStatus(undefined)).toBe("pending");
    expect(normalizeLeadCallStatus("bogus")).toBe("pending");
  });
});

describe("normalizeCampaignStatus", () => {
  it("passes through active/scheduled/completed, folds everything else to paused", () => {
    expect(normalizeCampaignStatus("active")).toBe("active");
    expect(normalizeCampaignStatus("scheduled")).toBe("scheduled");
    expect(normalizeCampaignStatus("paused")).toBe("paused");
    // §E.2 — "completed" is reachable again (§E.6 writes it) and must not fall into the paused
    // default, which would make a finished campaign look manually paused.
    expect(normalizeCampaignStatus("completed")).toBe("completed");
    expect(normalizeCampaignStatus("anything-else")).toBe("paused");
    expect(normalizeCampaignStatus(null)).toBe("paused");
  });
});

describe("isQualifiedCapReached (client-feedback §E)", () => {
  it("is not reached below the cap", () => {
    expect(isQualifiedCapReached(0, 50)).toBe(false);
    expect(isQualifiedCapReached(49, 50)).toBe(false);
  });

  it("is reached at the cap and beyond it (a cap lowered under an existing count — §E.10's job)", () => {
    expect(isQualifiedCapReached(50, 50)).toBe(true);
    expect(isQualifiedCapReached(51, 50)).toBe(true);
    expect(isQualifiedCapReached(200, 5)).toBe(true);
  });

  it("treats 0 as unlimited — never reached, matching the UI's '0 = unlimited' copy", () => {
    expect(isQualifiedCapReached(0, 0)).toBe(false);
    expect(isQualifiedCapReached(9999, 0)).toBe(false);
  });
});

describe("isStalledDialing", () => {
  it("is not stalled just under the threshold", () => {
    const justUnder = new Date(NOW - (STUCK_CALL_MINUTES * 60_000 - 1000)).toISOString();
    expect(isStalledDialing(justUnder, NOW)).toBe(false);
  });

  it("is stalled at and beyond the threshold", () => {
    const exactly = new Date(NOW - STUCK_CALL_MINUTES * 60_000).toISOString();
    expect(isStalledDialing(exactly, NOW)).toBe(true);
    const nineteenDaysAgo = new Date(NOW - 19 * 24 * 60 * 60_000).toISOString();
    expect(isStalledDialing(nineteenDaysAgo, NOW)).toBe(true);
  });

  it("treats a null last_called_at while dialing as stalled, not a crash", () => {
    expect(isStalledDialing(null, NOW)).toBe(true);
  });
});

describe("bucketLead", () => {
  it("buckets a fresh dialing lead as dialing, an old one as stalled", () => {
    const fresh = baseLead({ call_status: "dialing", last_called_at: new Date(NOW - 60_000).toISOString() });
    const old = baseLead({ call_status: "dialing", last_called_at: new Date(NOW - 40 * 60_000).toISOString() });
    expect(bucketLead(fresh, NOW)).toBe("dialing");
    expect(bucketLead(old, NOW)).toBe("stalled");
  });

  it("buckets a plain pending, non-DNC, under-cap lead as queued", () => {
    expect(bucketLead(baseLead(), NOW)).toBe("queued");
  });

  it("buckets a DNC pending lead, and a retry-capped pending lead, as excluded", () => {
    expect(bucketLead(baseLead({ do_not_call: true }), NOW)).toBe("excluded");
    expect(bucketLead(baseLead({ retry_count: MAX_RETRY_COUNT }), NOW)).toBe("excluded");
    expect(bucketLead(baseLead({ retry_count: MAX_RETRY_COUNT + 5 }), NOW)).toBe("excluded");
  });

  it("buckets a completed lead as called, regardless of do_not_call", () => {
    expect(bucketLead(baseLead({ call_status: "completed" }), NOW)).toBe("called");
  });

  // A.11 — DNC precedence: call-ingest sets do_not_call=true AND call_status='completed' together
  // on a refusal. That person WAS called. Getting this backwards silently misfiles every refusal.
  it("A.11: a refusal (do_not_call=true, call_status='completed') is 'called', not 'excluded'", () => {
    const refusal = baseLead({ do_not_call: true, call_status: "completed" });
    expect(bucketLead(refusal, NOW)).toBe("called");
  });
});

describe("displayStatusFor", () => {
  it("reports the real attempt outcome for a called lead", () => {
    expect(displayStatusFor("called", "no-answer")).toBe("no-answer");
    expect(displayStatusFor("called", "completed")).toBe("completed");
  });

  it("falls back to unattributed for a called lead with no attempt on record (data inconsistency)", () => {
    expect(displayStatusFor("called", null)).toBe("unattributed");
  });

  it("passes every other bucket straight through", () => {
    const buckets: LeadBucket[] = ["queued", "dialing", "stalled", "excluded"];
    for (const bucket of buckets) {
      expect(displayStatusFor(bucket, null)).toBe(bucket);
    }
  });
});

// A.10 — bucket-sum invariant.
describe("countLeads", () => {
  it("sums to the total across a mixed batch (the bucket-sum invariant)", () => {
    const leads: LeadBucketInput[] = [
      baseLead(), // queued
      baseLead({ do_not_call: true }), // excluded
      baseLead({ retry_count: MAX_RETRY_COUNT }), // excluded
      baseLead({ call_status: "dialing", last_called_at: new Date(NOW - 1000).toISOString() }), // dialing
      baseLead({ call_status: "dialing", last_called_at: new Date(NOW - 60 * 60_000).toISOString() }), // stalled
      baseLead({ call_status: "completed" }), // called
      baseLead({ call_status: "completed", do_not_call: true }), // called (refusal)
    ];
    const counts = countLeads(leads, NOW);
    expect(counts.total).toBe(leads.length);
    expect(counts.queued + counts.dialing + counts.stalled + counts.called + counts.excluded).toBe(counts.total);
    expect(counts).toEqual({ total: 7, queued: 1, dialing: 1, stalled: 1, called: 2, excluded: 2 });
  });

  it("holds for an empty list too", () => {
    const counts = countLeads([], NOW);
    expect(counts.queued + counts.dialing + counts.stalled + counts.called + counts.excluded).toBe(counts.total);
    expect(counts.total).toBe(0);
  });
});

describe("countCalls", () => {
  it("splits attempts from unattributed debris and sums correctly", () => {
    const records = [
      { status: "completed" },
      { status: "completed" },
      { status: "no-answer" },
      { status: "failed" },
      { status: "pending" }, // debris
    ];
    const counts = countCalls(records);
    expect(counts).toEqual({ total: 5, attempted: 4, completed: 2, noAnswer: 1, failed: 1, unattributed: 1 });
  });
});

describe("connectRate / qualifiedRate", () => {
  it("connectRate is completed/attempted, not completed/total — E6", () => {
    // 1 completed, 1 no-answer attempt, plus a debris row that must NOT count toward either side.
    const counts = countCalls([{ status: "completed" }, { status: "no-answer" }, { status: "pending" }]);
    expect(connectRate(counts)).toBe(50); // 1 of 2 attempts, not 1 of 3 rows
  });

  it("returns 0 rather than dividing by zero when there are no attempts", () => {
    expect(connectRate({ attempted: 0, completed: 0 })).toBe(0);
    expect(qualifiedRate(0, 0)).toBe(0);
  });

  it("qualifiedRate shares connectRate's denominator (attempts), separate from connect", () => {
    expect(qualifiedRate(1, 4)).toBe(25);
  });
});

describe("engineStatus", () => {
  it("is idle when there's nothing queued to dial, regardless of last_called_at", () => {
    expect(engineStatus(false, null, NOW)).toBe("idle");
    expect(engineStatus(false, new Date(NOW - 1000).toISOString(), NOW)).toBe("idle");
  });

  it("is stalled when work is waiting but nothing has ever been dialed", () => {
    expect(engineStatus(true, null, NOW)).toBe("stalled");
  });

  it("is online when a lead was dialed within the stuck-call window", () => {
    const recent = new Date(NOW - 5 * 60_000).toISOString();
    expect(engineStatus(true, recent, NOW)).toBe("online");
  });

  it("is stalled once the last dial is older than the stuck-call window", () => {
    const old = new Date(NOW - (STUCK_CALL_MINUTES + 1) * 60_000).toISOString();
    expect(engineStatus(true, old, NOW)).toBe("stalled");
  });
});

describe("formatPercent", () => {
  it("appends a percent sign to a plain number", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(67)).toBe("67%");
  });
});

// A.12 — "three pages, one number", fixtured on E9's live snapshot for yaniv.skoury@gmail.com:
// 0 call attempts · 2 leads (1 queued, 1 stalled) · 4 unattributed call_records rows (debris).
describe("three pages, one number (E9 fixture)", () => {
  const leads: LeadBucketInput[] = [
    baseLead({ call_status: "pending" }), // queued
    baseLead({ call_status: "dialing", last_called_at: new Date(NOW - 19 * 24 * 60 * 60_000).toISOString() }), // 19 days stuck -> stalled
  ];
  const debrisRecord = { status: "pending" }; // vapi_call_id/lead_id/call_date all null in reality — status is all this model reads
  const callRecords = [debrisRecord, debrisRecord, debrisRecord, debrisRecord];

  it("produces the same numbers regardless of which page is asking", () => {
    const leadCounts = countLeads(leads, NOW);
    const callCounts = countCalls(callRecords);

    expect(leadCounts).toEqual({ total: 2, queued: 1, dialing: 0, stalled: 1, called: 0, excluded: 0 });
    expect(callCounts).toEqual({ total: 4, attempted: 0, completed: 0, noAnswer: 0, failed: 0, unattributed: 4 });
  });
});

// 2026-09-11 — auto-complete a campaign when its lead pool is spent, not just when the
// qualified-leads cap is hit.
describe("isLeadPoolExhausted", () => {
  const counts = (over: Partial<ReturnType<typeof countLeads>> = {}) => ({
    total: 10, queued: 0, dialing: 0, stalled: 0, called: 10, excluded: 0, ...over,
  });

  it("is true when nothing is queued, dialing or stalled", () => {
    expect(isLeadPoolExhausted(counts())).toBe(true);
  });

  it("counts a DNC/retry-exhausted lead as finished, not as work remaining", () => {
    expect(isLeadPoolExhausted(counts({ called: 7, excluded: 3 }))).toBe(true);
  });

  it("is false while a lead is still queued — including one whose retry is scheduled for later", () => {
    // bucketLead ignores next_call_at, so a future retry is still `queued`. This is the case
    // that would otherwise auto-complete every campaign overnight.
    expect(isLeadPoolExhausted(counts({ queued: 1, called: 9 }))).toBe(false);
  });

  it("is false while a call is in flight", () => {
    expect(isLeadPoolExhausted(counts({ dialing: 1, called: 9 }))).toBe(false);
  });

  it("is false while a lead is stalled — the sweeper will reset and redial it", () => {
    expect(isLeadPoolExhausted(counts({ stalled: 1, called: 9 }))).toBe(false);
  });

  it("is false for a campaign with no leads at all — empty is not finished", () => {
    expect(isLeadPoolExhausted(counts({ total: 0, called: 0 }))).toBe(false);
  });
});

describe("campaignCompletionReason", () => {
  const spent = { total: 5, queued: 0, dialing: 0, stalled: 0, called: 5, excluded: 0 };
  const working = { total: 5, queued: 3, dialing: 0, stalled: 0, called: 2, excluded: 0 };

  it("reports the cap when the qualified target was reached", () => {
    expect(campaignCompletionReason(10, 10, working)).toBe("cap-reached");
  });

  it("prefers the cap when both endings apply — it means leads may still be worth calling", () => {
    expect(campaignCompletionReason(10, 10, spent)).toBe("cap-reached");
  });

  it("reports exhaustion when the pool is spent and no cap was hit", () => {
    expect(campaignCompletionReason(3, 10, spent)).toBe("leads-exhausted");
  });

  it("treats a 0 cap as unlimited, so it never explains the ending", () => {
    expect(campaignCompletionReason(99, 0, working)).toBeNull();
  });

  it("returns null when neither ending explains it (e.g. new leads were added afterwards)", () => {
    expect(campaignCompletionReason(3, 10, working)).toBeNull();
  });
});

// 2026-09-11 — a dialled-and-busy lead must not render identically to an untouched one.
describe("describeAttempts / endedReasonLabel", () => {
  const NOW = Date.parse("2026-09-11T10:10:00Z");

  it("returns null for a lead that has never been dialled", () => {
    expect(describeAttempts({ retryCount: 0 }, NOW)).toBeNull();
    expect(describeAttempts({}, NOW)).toBeNull();
  });

  it("describes the real live case: attempted once, line busy, retry tonight", () => {
    // Lead +639460314690 on "Test James 5", exactly as the database held it.
    const info = describeAttempts(
      { retryCount: 1, endedReason: "customer-busy", nextCallAt: "2026-09-11T14:07:35.864Z" },
      NOW,
    );
    expect(info).toEqual({
      attemptsMade: 1,
      attemptsAllowed: 3,
      reasonLabel: "Line busy",
      rawReason: "customer-busy",
      retryAt: "2026-09-11T14:07:35.864Z",
      attemptsExhausted: false,
    });
  });

  it("does not promise a future retry when next_call_at has already passed", () => {
    // That retry is due NOW — the dispatcher is about to take it.
    const info = describeAttempts(
      { retryCount: 1, endedReason: "customer-busy", nextCallAt: "2026-09-11T09:00:00Z" },
      NOW,
    );
    expect(info?.retryAt).toBeNull();
  });

  it("flags a lead that has used all its attempts", () => {
    const info = describeAttempts({ retryCount: 3, endedReason: "customer-did-not-answer" }, NOW);
    expect(info?.attemptsExhausted).toBe(true);
  });

  it("keeps an unmapped reason out of the friendly label but never loses it", () => {
    const info = describeAttempts({ retryCount: 1, endedReason: "pipeline-error-openai-llm-failed" }, NOW);
    expect(info?.reasonLabel).toBeNull();
    expect(info?.rawReason).toBe("pipeline-error-openai-llm-failed");
  });

  it("maps the reasons a salesperson actually needs to tell apart", () => {
    expect(endedReasonLabel("customer-busy")).toBe("Line busy");
    expect(endedReasonLabel("customer-did-not-answer")).toBe("No answer");
    expect(endedReasonLabel("customer-ended-call")).toBe("They hung up");
    expect(endedReasonLabel("silence-timed-out")).toBe("No response heard");
    expect(endedReasonLabel(null)).toBeNull();
    expect(endedReasonLabel("something-new-from-vapi")).toBeNull();
  });
});

describe("attemptSummaryLine / formatRetryTime", () => {
  const NOW = Date.parse("2026-09-11T10:10:00Z");

  it("renders nothing for an untouched lead", () => {
    expect(attemptSummaryLine(null, NOW)).toBeNull();
  });

  it("leads with the attempt count and includes the reason when one is known", () => {
    const line = attemptSummaryLine(
      describeAttempts({ retryCount: 1, endedReason: "customer-busy", nextCallAt: "2026-09-11T14:07:35.864Z" }, NOW),
      NOW,
    );
    // The retry time is rendered in the viewer's own zone, so assert the stable parts only.
    expect(line).toContain("Attempt 1 of 3");
    expect(line).toContain("Line busy");
    expect(line).toContain("retrying");
  });

  it("says so plainly when no attempts remain, instead of promising a retry", () => {
    const line = attemptSummaryLine(describeAttempts({ retryCount: 3 }, NOW), NOW);
    expect(line).toContain("no attempts left");
    expect(line).not.toContain("retrying");
  });

  it("falls back to 'retrying shortly' when nothing is scheduled yet", () => {
    expect(attemptSummaryLine(describeAttempts({ retryCount: 1 }, NOW), NOW)).toContain("retrying shortly");
  });

  it("formatRetryTime returns null for absent or unparseable input", () => {
    expect(formatRetryTime(null, NOW)).toBeNull();
    expect(formatRetryTime("not a date", NOW)).toBeNull();
  });

  it("formatRetryTime adds a weekday once the retry is not today", () => {
    const tomorrow = formatRetryTime("2026-09-12T09:00:00Z", NOW);
    expect(tomorrow).toMatch(/^[A-Za-z]{3}\s/);
  });
});
