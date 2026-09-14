import { describe, it, expect } from "vitest";
import { shouldFireLeadsUploadedTrigger } from "./dispatchTrigger";

// §B.2b's decision as a pure predicate — see dispatchTrigger.ts's own comment for why this one
// piece of the three call sites is worth extracting and testing. `fireDispatchTrigger` itself is
// deliberately not unit-tested here: it's thin wiring around supabase.functions.invoke with the
// same error-swallowing shape AIAgents.tsx's existing (also untested) n8n-proxy/elevenlabs-tts
// calls already use, and this repo has no vi.mock convention for the Supabase client to test it
// against without either a real network call (slow/flaky/CI-dependent — exactly why
// permissions.parity.test.ts is opt-in only) or introducing a first-of-its-kind mock for one
// fire-and-forget function.

describe("shouldFireLeadsUploadedTrigger", () => {
  it("fires for an active campaign", () => {
    expect(shouldFireLeadsUploadedTrigger({ status: "Active" })).toBe(true);
  });

  it("does not fire for a paused campaign", () => {
    expect(shouldFireLeadsUploadedTrigger({ status: "Paused" })).toBe(false);
  });

  it("does not fire for a scheduled campaign", () => {
    expect(shouldFireLeadsUploadedTrigger({ status: "Scheduled" })).toBe(false);
  });

  // client-feedback plan §E re-added "Completed" (call-ingest §E.6 writes it once a campaign hits
  // its qualified-leads cap). Uploading into a completed campaign must not auto-start dialing.
  it("does not fire for a completed campaign", () => {
    expect(shouldFireLeadsUploadedTrigger({ status: "Completed" })).toBe(false);
  });

  it("does not fire when the campaign is unknown", () => {
    expect(shouldFireLeadsUploadedTrigger(undefined)).toBe(false);
    expect(shouldFireLeadsUploadedTrigger(null)).toBe(false);
  });
});
