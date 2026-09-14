import { describe, it, expect } from "vitest";
import { INDUSTRY_STARTERS, resolveIndustryStarter } from "./industryStarters";
import { INDUSTRIES } from "./industries";

// Client-feedback plan §B.2/§B.3 — the code half of the per-industry starter text.

describe("INDUSTRY_STARTERS", () => {
  it("has an entry for every industry in the single source of truth (B.2)", () => {
    for (const industry of INDUSTRIES) {
      expect(INDUSTRY_STARTERS[industry], `missing starter for "${industry}"`).toBeTruthy();
    }
    expect(Object.keys(INDUSTRY_STARTERS).sort()).toEqual([...INDUSTRIES].sort());
  });

  it("contains no {{placeholders}} anywhere (B.3 / D-2)", () => {
    for (const [industry, text] of Object.entries(INDUSTRY_STARTERS)) {
      expect(text.includes("{{"), `"${industry}" starter contains {{`).toBe(false);
    }
  });
});

describe("resolveIndustryStarter (B.13)", () => {
  it("prefers a non-blank admin override over the code default", () => {
    expect(resolveIndustryStarter("Insurance", "Custom text for this account")).toBe("Custom text for this account");
  });

  it("falls back to the code default when the override is null, undefined, or blank", () => {
    expect(resolveIndustryStarter("Insurance", null)).toBe(INDUSTRY_STARTERS["Insurance"]);
    expect(resolveIndustryStarter("Insurance", undefined)).toBe(INDUSTRY_STARTERS["Insurance"]);
    expect(resolveIndustryStarter("Insurance", "   ")).toBe(INDUSTRY_STARTERS["Insurance"]);
  });

  it("returns empty string for an unknown industry rather than throwing", () => {
    expect(resolveIndustryStarter("Not A Real Industry", null)).toBe("");
  });
});
