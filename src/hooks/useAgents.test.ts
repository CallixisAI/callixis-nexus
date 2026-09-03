import { describe, it, expect } from "vitest";
import { isDuplicateAgentName } from "./useAgents";
import type { Database } from "@/integrations/supabase/types";

type AiAgentRow = Database["public"]["Tables"]["ai_agents"]["Row"];

const agent = (overrides: Partial<AiAgentRow> = {}): AiAgentRow => ({
  id: "agent-1",
  user_id: "user-1",
  name: "LeadGen Pro",
  status: "running",
  industry: "Real Estate",
  model: "gemini-1.5-pro",
  voice: "EXAVITQu4vr4xnSDxMaL",
  logic_provider: "default",
  script: null,
  voice_settings: null,
  vapi_assistant_id: null,
  prompt_instructions: null,
  welcome_message: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

// AI Agents plan Phase 2 §C.9 — duplicate name guard, checked at wizard "Basics" step and in the
// edit dialog before either lets a Deploy/Save proceed.
describe("isDuplicateAgentName", () => {
  it("is false against an empty list", () => {
    expect(isDuplicateAgentName("LeadGen Pro", [])).toBe(false);
  });

  it("is true for an exact match", () => {
    expect(isDuplicateAgentName("LeadGen Pro", [agent()])).toBe(true);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(isDuplicateAgentName("  leadgen pro  ", [agent()])).toBe(true);
  });

  it("excludes the agent being edited by id", () => {
    expect(isDuplicateAgentName("LeadGen Pro", [agent({ id: "agent-1" })], "agent-1")).toBe(false);
  });

  it("still catches a collision with a DIFFERENT agent while editing", () => {
    expect(isDuplicateAgentName("LeadGen Pro", [agent({ id: "agent-1" }), agent({ id: "agent-2", name: "LeadGen Pro" })], "agent-1")).toBe(true);
  });

  it("is false for a blank name (handled separately by the required-field check)", () => {
    expect(isDuplicateAgentName("   ", [agent()])).toBe(false);
  });
});
