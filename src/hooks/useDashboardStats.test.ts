import { describe, it, expect } from "vitest";
import { buildLast7DaysCallData, computeCallQualityStats, computeAvgTimeToFirstCallSeconds } from "./useDashboardStats";

const isoDateDaysAgo = (daysAgo: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
};

describe("buildLast7DaysCallData", () => {
  it("returns exactly 7 buckets ending today", () => {
    const buckets = buildLast7DaysCallData([]);
    expect(buckets).toHaveLength(7);
  });

  it("buckets records by calendar day, not weekday name collisions", () => {
    const records = [
      { call_date: isoDateDaysAgo(0), status: "completed", revenue: 100 },
      { call_date: isoDateDaysAgo(0), status: "pending", revenue: 0 },
      { call_date: isoDateDaysAgo(3), status: "completed", revenue: 50 },
    ];
    const buckets = buildLast7DaysCallData(records);

    const today = buckets[buckets.length - 1];
    expect(today.calls).toBe(2);
    expect(today.conversions).toBe(1);
    expect(today.revenue).toBe(100);

    const threeDaysAgo = buckets[buckets.length - 1 - 3];
    expect(threeDaysAgo.calls).toBe(1);
    expect(threeDaysAgo.revenue).toBe(50);
  });

  it("ignores records outside the 7-day window", () => {
    const records = [{ call_date: isoDateDaysAgo(10), status: "completed", revenue: 999 }];
    const buckets = buildLast7DaysCallData(records);
    const totalCalls = buckets.reduce((sum, bucket) => sum + bucket.calls, 0);
    expect(totalCalls).toBe(0);
  });

  it("treats a null call_date as unbucketed rather than crashing", () => {
    const records = [{ call_date: null, status: "completed", revenue: 10 }];
    expect(() => buildLast7DaysCallData(records)).not.toThrow();
    const totalCalls = buildLast7DaysCallData(records).reduce((sum, bucket) => sum + bucket.calls, 0);
    expect(totalCalls).toBe(0);
  });
});

describe("computeCallQualityStats", () => {
  it("returns all zeros rather than dividing by zero when there are no calls", () => {
    const stats = computeCallQualityStats([]);
    expect(stats).toEqual({ connectRate: 0, avgDurationSeconds: 0, qualifiedRate: 0, costPerQualifiedLead: 0, qualifiedCount: 0 });
  });

  // C.18 — this replaces the old "counts everything except no-answer as connected" case, which
  // encoded E6's bug: a 'failed' (Vapi *Unreachable*) row counted as a connect, and a debris row
  // (status='pending', no real call behind it) inflated the denominator. Only 'completed' counts
  // as connected now, and the denominator is real attempts only.
  it("counts only 'completed' as connected, out of real ATTEMPTS only — never debris (E6)", () => {
    const records = [
      { status: "completed", duration: 60, is_qualified: true, cost: 0.5 },
      { status: "failed", duration: 5, is_qualified: false, cost: 0.1 },
      { status: "no-answer", duration: 0, is_qualified: false, cost: 0.02 },
      { status: "pending", duration: 0, is_qualified: false, cost: 0 }, // debris — must not count toward either side
    ];
    const stats = computeCallQualityStats(records);
    expect(stats.connectRate).toBe(33); // 1 of 3 real attempts, not 2 of 3, not 1 of 4
  });

  it("averages duration only over calls that actually connected (duration > 0)", () => {
    const records = [
      { status: "completed", duration: 100, is_qualified: false, cost: 0 },
      { status: "completed", duration: 200, is_qualified: false, cost: 0 },
      { status: "no-answer", duration: 0, is_qualified: false, cost: 0 },
    ];
    const stats = computeCallQualityStats(records);
    expect(stats.avgDurationSeconds).toBe(150);
  });

  it("computes cost per qualified lead, not cost per call", () => {
    const records = [
      { status: "completed", duration: 60, is_qualified: true, cost: 1 },
      { status: "completed", duration: 60, is_qualified: false, cost: 1 },
    ];
    const stats = computeCallQualityStats(records);
    expect(stats.costPerQualifiedLead).toBe(2); // $2 total spent for the 1 qualified lead
  });

  it("reports zero cost per qualified lead when nobody qualified, not Infinity/NaN", () => {
    const records = [{ status: "completed", duration: 60, is_qualified: false, cost: 5 }];
    expect(computeCallQualityStats(records).costPerQualifiedLead).toBe(0);
  });

  it("qualifiedRate shares connectRate's attempts-only denominator, excluding debris", () => {
    const records = [
      { status: "completed", duration: 60, is_qualified: true, cost: 0 },
      { status: "no-answer", duration: 0, is_qualified: false, cost: 0 },
      { status: "pending", duration: 0, is_qualified: false, cost: 0 }, // debris
    ];
    const stats = computeCallQualityStats(records);
    expect(stats.qualifiedRate).toBe(50); // 1 of 2 attempts, not 1 of 3 rows
  });
});

// D.2 — replaces the old hardcoded avgResponseTime: 1.8.
describe("computeAvgTimeToFirstCallSeconds", () => {
  it("returns null (never a fake number) when nobody has been called yet", () => {
    const leads = [{ id: "l1", created_at: "2026-01-01T00:00:00Z" }];
    expect(computeAvgTimeToFirstCallSeconds(leads, [])).toBeNull();
  });

  it("computes the gap between lead creation and its EARLIEST call, not its most recent", () => {
    const leads = [{ id: "l1", created_at: "2026-01-01T00:00:00Z" }];
    const records = [
      { lead_id: "l1", call_date: "2026-01-01T01:00:00Z" }, // first attempt: 1 hour later
      { lead_id: "l1", call_date: "2026-01-01T05:00:00Z" }, // a retry — must not be used
    ];
    expect(computeAvgTimeToFirstCallSeconds(leads, records)).toBe(3600);
  });

  it("averages across multiple leads, ignoring records with no lead_id or call_date", () => {
    const leads = [
      { id: "l1", created_at: "2026-01-01T00:00:00Z" },
      { id: "l2", created_at: "2026-01-01T00:00:00Z" },
    ];
    const records = [
      { lead_id: "l1", call_date: "2026-01-01T00:01:00Z" }, // 60s
      { lead_id: "l2", call_date: "2026-01-01T00:03:00Z" }, // 180s
      { lead_id: null, call_date: "2026-01-01T00:05:00Z" }, // debris — excluded
      { lead_id: "l1", call_date: null }, // no call_date — excluded
    ];
    expect(computeAvgTimeToFirstCallSeconds(leads, records)).toBe(120);
  });
});

// C.12 — computeLeadProgress was deleted; the lead-bucket math it used to hand-roll now lives
// once in src/lib/callPipeline.ts's countLeads(), already covered there (bucket-sum invariant,
// DNC precedence, the "three pages, one number" fixture). Nothing left to test here that isn't
// already tested at the source.
