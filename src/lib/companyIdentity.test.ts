import { describe, it, expect } from "vitest";
import { needsCompanyName } from "./companyIdentity";

describe("needsCompanyName", () => {
  it("flags a NULL company name (the state all 10 live profiles were in on 2026-09-11)", () => {
    expect(needsCompanyName(null)).toBe(true);
  });

  it("flags an undefined company name (profile not loaded yet)", () => {
    expect(needsCompanyName(undefined)).toBe(true);
  });

  it("flags an empty string", () => {
    expect(needsCompanyName("")).toBe(true);
  });

  it("flags whitespace-only — ' ' breaks the spoken greeting exactly as badly as ''", () => {
    expect(needsCompanyName("   ")).toBe(true);
    expect(needsCompanyName("\t\n")).toBe(true);
  });

  it("accepts a real company name", () => {
    expect(needsCompanyName("Callixis")).toBe(false);
  });

  it("accepts a name that merely has padding around it", () => {
    expect(needsCompanyName("  Callixis  ")).toBe(false);
  });
});
