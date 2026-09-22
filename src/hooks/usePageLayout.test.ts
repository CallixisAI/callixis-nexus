import { describe, it, expect } from "vitest";
import { layoutCacheKey, pageLayoutQueryKey } from "./usePageLayout";
import { readDraftValue, writeDraftValue } from "./useDraftState";
import { DASHBOARD_LAYOUT_VERSION, type DashboardLayout } from "@/lib/dashboardLayout";

// Dashboard tiles plan §E.21 — the hook itself needs React + a real Supabase client; this covers
// its pure pieces: the cache key shape (E.15, mirroring draftKey's) and a round-trip through the
// SAME readDraftValue/writeDraftValue primitives useDraftState.test.ts already exercises (E.14 —
// reused verbatim here, not reimplemented).

function memStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}
const throwingStorage = {
  getItem: () => { throw new Error("SecurityError"); },
  setItem: () => { throw new Error("QuotaExceededError"); },
  removeItem: () => { throw new Error("SecurityError"); },
};

describe("layoutCacheKey", () => {
  it("mirrors draftKey's shape: callixis:layout:v1:<userId>:<pageKey>", () => {
    expect(layoutCacheKey("user-a", "dashboard")).toBe("callixis:layout:v1:user-a:dashboard");
  });

  it("namespaces by user so two accounts never collide", () => {
    expect(layoutCacheKey("user-a", "dashboard")).not.toBe(layoutCacheKey("user-b", "dashboard"));
  });

  it("is page-keyed (D-4) so a future 'reports' page needs no new key shape", () => {
    expect(layoutCacheKey("user-a", "dashboard")).not.toBe(layoutCacheKey("user-a", "reports"));
  });

  it("falls back to 'anon' when there is no signed-in user", () => {
    expect(layoutCacheKey(undefined, "dashboard")).toBe("callixis:layout:v1:anon:dashboard");
  });
});

describe("pageLayoutQueryKey", () => {
  it("is stable and userId/pageKey-scoped, mirroring accountDataQueryKey's factory style", () => {
    expect(pageLayoutQueryKey("u", "dashboard")).toEqual(["page-layout", "u", "dashboard"]);
    expect(pageLayoutQueryKey("u", "reports")).not.toEqual(pageLayoutQueryKey("u", "dashboard"));
  });
});

describe("the cache round-trips a DashboardLayout through readDraftValue/writeDraftValue", () => {
  it("writes and reads back a real layout shape", () => {
    const storage = memStorage();
    const key = layoutCacheKey("u", "dashboard");
    const layout: DashboardLayout = {
      version: DASHBOARD_LAYOUT_VERSION,
      tiles: [{ id: "kpi.total-calls", width: "sm", visible: true }],
    };
    writeDraftValue(storage, key, layout);
    expect(readDraftValue<DashboardLayout>(storage, key)).toEqual(layout);
  });

  it("never throws on a private-window / storage-disabled browser (reused resilience)", () => {
    const key = layoutCacheKey("u", "dashboard");
    expect(() => writeDraftValue(throwingStorage, key, { version: 1, tiles: [] })).not.toThrow();
    expect(readDraftValue(throwingStorage, key)).toBeUndefined();
  });
});
