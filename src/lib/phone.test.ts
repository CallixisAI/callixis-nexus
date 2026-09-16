import { describe, it, expect } from "vitest";
import { normalizePhone, E164 } from "./phone";

describe("normalizePhone", () => {
  it("accepts an already-E.164 number as-is", () => {
    expect(normalizePhone("+15550100123")).toEqual({ ok: true, phone: "+15550100123" });
  });

  it("strips formatting from a +-prefixed number", () => {
    expect(normalizePhone("+1 (555) 010-0123")).toEqual({ ok: true, phone: "+15550100123" });
  });

  it("rejects a +-prefixed number that's too short", () => {
    const result = normalizePhone("+1550");
    expect(result.ok).toBe(false);
  });

  it("applies the known calling code for a bare national number", () => {
    expect(normalizePhone("5550100123", "Canada")).toEqual({ ok: true, phone: "+15550100123" });
  });

  // lead-enrichment plan §A.2 — changed 2026-09-15. A bare 10-digit number with NO country column
  // at all is now assumed US, not rejected — see phone.ts's own comment on why.
  it("assumes US for a bare 10-digit number with no country column at all", () => {
    expect(normalizePhone("5550100123", null)).toEqual({ ok: true, phone: "+15550100123" });
    expect(normalizePhone("5550100123", undefined)).toEqual({ ok: true, phone: "+15550100123" });
    expect(normalizePhone("5550100123", "")).toEqual({ ok: true, phone: "+15550100123" });
  });

  it("does NOT assume US for a number that isn't exactly 10 digits with no country", () => {
    expect(normalizePhone("555010012", null).ok).toBe(false); // 9 digits
    expect(normalizePhone("55501001234", null).ok).toBe(false); // 11 digits
  });

  it("still rejects an unrecognized EXPLICIT country rather than silently assuming US", () => {
    const result = normalizePhone("5550100123", "France");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no known calling code/);
  });

  it("accepts the United States spelling variants", () => {
    expect(normalizePhone("5550100123", "United States")).toEqual({ ok: true, phone: "+15550100123" });
    expect(normalizePhone("5550100123", "USA")).toEqual({ ok: true, phone: "+15550100123" });
    expect(normalizePhone("5550100123", "US")).toEqual({ ok: true, phone: "+15550100123" });
  });

  it("rejects an empty or whitespace-only phone", () => {
    expect(normalizePhone("").ok).toBe(false);
    expect(normalizePhone("   ").ok).toBe(false);
    expect(normalizePhone(null).ok).toBe(false);
    expect(normalizePhone(undefined).ok).toBe(false);
  });

  it("rejects a value with no digits at all", () => {
    expect(normalizePhone("N/A", "Canada").ok).toBe(false);
  });

  it("accepts a literal calling code in the country field, e.g. the app's own CSV template", () => {
    expect(normalizePhone("5550199", "+1")).toEqual({ ok: true, phone: "+15550199" });
    expect(normalizePhone("7700900123", "44")).toEqual({ ok: true, phone: "+447700900123" });
  });
});

describe("E164", () => {
  it("matches normalized output", () => {
    expect(E164.test("+15550100123")).toBe(true);
  });

  it("rejects numbers without a leading +", () => {
    expect(E164.test("15550100123")).toBe(false);
  });
});
