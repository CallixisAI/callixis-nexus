import { describe, it, expect } from "vitest";
import { INDUSTRIES } from "./industries";

// AI Agents plan Phase 2 §C.6 — both CreateCampaignDialog.tsx and AIAgents.tsx import this same
// array; the real test that "the drift is structurally impossible now" (§C.4) is the shared
// import itself, not a runtime comparison of two independently-built lists. This just pins the
// list's shape so a future edit here notices what it's changing.
describe("INDUSTRIES", () => {
  it("has no duplicates", () => {
    expect(new Set(INDUSTRIES).size).toBe(INDUSTRIES.length);
  });

  it("uses 'Financial Services', not 'Finance' (D-3)", () => {
    expect(INDUSTRIES).toContain("Financial Services");
    expect(INDUSTRIES).not.toContain("Finance");
  });

  it("matches the 10-value list D-3 settled on", () => {
    expect(INDUSTRIES).toEqual([
      "Real Estate",
      "Insurance",
      "Medical",
      "Car Sales",
      "Home Improvement",
      "Legal",
      "Financial Services",
      "Education",
      "SaaS / Tech",
      "Other",
    ]);
  });
});
