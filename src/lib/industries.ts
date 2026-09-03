// AI Agents plan (docs/AI-Agents-plan/README.md), Phase 2 §C.1 / D-3 — the one industry list,
// replacing the two that used to drift independently: AIAgents.tsx's 7-value list (with
// "Finance") and CreateCampaignDialog.tsx's 10-value list (with "Financial Services"). Same
// "one catalogue, not two" move src/lib/permissions.ts already made for APP_PERMISSIONS.
//
// The 10-value list wins because it's the more complete one, and "Financial Services" wins over
// "Finance" per D-3's explicit call — both name the same business, and E11 confirmed (2026-09-02)
// zero live ai_agents rows use "Finance", so renaming costs nothing today. Re-check E11 if this
// file is touched again; that stops being free the moment someone picks "Finance" in the UI.
//
// This list is also what Phase 4's industry_assistants table keys on (industry TEXT PRIMARY KEY)
// — every value here is a legal key for that table, and every key in that table should be one of
// these values. Keep them in sync by construction: nothing should introduce an industry string
// that doesn't come from this array.
export const INDUSTRIES = [
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
] as const;

export type Industry = (typeof INDUSTRIES)[number];
