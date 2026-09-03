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

  it("rejects a bare number with no recognized country", () => {
    const result = normalizePhone("5550100123", "France");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no known calling code/);
  });

  it("rejects a bare number with no country at all", () => {
    const result = normalizePhone("5550100123", null);
    expect(result.ok).toBe(false);
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
