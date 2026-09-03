import { describe, it, expect } from "vitest";
import { isValidAssistantId } from "./useIndustryAssistants";

// AI Agents plan Phase 4 §E.15 — format-only validation before saving a pasted Vapi assistant
// id. Doesn't (can't, without VAPI_API_KEY — E18) confirm the id exists on Vapi.
describe("isValidAssistantId", () => {
  it("accepts the real fallback assistant id from E7", () => {
    expect(isValidAssistantId("311aed1f-7c12-4259-9ad8-202b5a0ae688")).toBe(true);
  });

  it("accepts a UUID regardless of case", () => {
    expect(isValidAssistantId("311AED1F-7C12-4259-9AD8-202B5A0AE688")).toBe(true);
  });

  it("tolerates surrounding whitespace from a paste", () => {
    expect(isValidAssistantId("  311aed1f-7c12-4259-9ad8-202b5a0ae688  ")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidAssistantId("")).toBe(false);
  });

  it("rejects a non-UUID string, e.g. a pasted URL or the wrong field's contents", () => {
    expect(isValidAssistantId("https://dashboard.vapi.ai/assistants/311aed1f")).toBe(false);
  });

  it("rejects a UUID-shaped string with the wrong segment lengths", () => {
    expect(isValidAssistantId("311aed1f-7c12-4259-9ad8-202b5a0ae68")).toBe(false);
  });
});
