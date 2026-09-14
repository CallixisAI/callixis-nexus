import { describe, it, expect, vi, afterEach } from "vitest";
import { isValidIanaZone, detectBrowserTimezone, needsTimezoneAttention, TIMEZONES } from "./timezones";

describe("TIMEZONES", () => {
  it("has no duplicates and includes UTC", () => {
    expect(new Set(TIMEZONES).size).toBe(TIMEZONES.length);
    expect(TIMEZONES).toContain("UTC");
  });
});

describe("isValidIanaZone", () => {
  it("accepts a real zone", () => {
    expect(isValidIanaZone("Asia/Manila")).toBe(true);
    expect(isValidIanaZone("UTC")).toBe(true);
  });

  it("rejects a typo (E9's own example)", () => {
    expect(isValidIanaZone("Asia/Manilla")).toBe(false);
  });

  // 🔴 Deviation from the plan's own assumption, verified against the real runtime, not guessed:
  // `Intl.DateTimeFormat`'s timezone canonicalization is case-INsensitive per ECMA-402 — the same
  // `new Intl.DateTimeFormat(..., { timeZone: tz })` call `isWithinWorkHours()` uses in
  // dispatch-batch/index.ts does not throw on "ASIA/MANILA" either (checked directly:
  // `node -e 'new Intl.DateTimeFormat(undefined,{timeZone:"ASIA/MANILA"})'` does not throw, while
  // the same call with "Asia/Manilla" does). So E9's client-reported "wrong case ... saves cleanly
  // and then never dials" bug is real only for a genuine typo, not for a case variation — a
  // wrong-case zone actually still resolves and works. Asserting the opposite here would make this
  // helper disagree with the dispatcher it's meant to mirror, which is the one thing C.1b exists
  // to prevent.
  it("accepts a wrong-case zone, matching the dispatcher's own lenient Intl behaviour", () => {
    expect(isValidIanaZone("ASIA/MANILA")).toBe(true);
  });

  it("rejects null, undefined and empty string without throwing", () => {
    expect(isValidIanaZone(null)).toBe(false);
    expect(isValidIanaZone(undefined)).toBe(false);
    expect(isValidIanaZone("")).toBe(false);
  });
});

describe("detectBrowserTimezone", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a valid IANA zone in this environment", () => {
    expect(isValidIanaZone(detectBrowserTimezone())).toBe(true);
  });

  it("falls back to UTC if Intl.DateTimeFormat throws", () => {
    const spy = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("no Intl here");
    });
    expect(detectBrowserTimezone()).toBe("UTC");
    spy.mockRestore();
  });
});

describe("needsTimezoneAttention", () => {
  it("fires only for a UTC campaign viewed from a non-UTC browser", () => {
    expect(needsTimezoneAttention("UTC", "Asia/Manila")).toBe(true);
  });

  it("is false when the campaign is already non-UTC (E9 typo case)", () => {
    expect(needsTimezoneAttention("Asia/Manilla", "Asia/Manila")).toBe(false);
  });

  it("is false when the browser is itself UTC", () => {
    expect(needsTimezoneAttention("UTC", "UTC")).toBe(false);
  });

  it("is false for null/undefined campaign timezone", () => {
    expect(needsTimezoneAttention(null, "Asia/Manila")).toBe(false);
    expect(needsTimezoneAttention(undefined, "Asia/Manila")).toBe(false);
  });

  // C.5a's three false-positive classes a general mismatch check would produce — this predicate
  // must not fire for any of them.
  it("C.5a #1 — a legitimate US campaign managed from Manila is not flagged", () => {
    expect(needsTimezoneAttention("America/New_York", "Asia/Manila")).toBe(false);
  });

  it("C.5a #2 — Asia/Calcutta vs Asia/Kolkata (same zone, different string) is not flagged", () => {
    expect(needsTimezoneAttention("Asia/Calcutta", "Asia/Kolkata")).toBe(false);
  });
});
