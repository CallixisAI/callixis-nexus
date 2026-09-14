import { describe, it, expect } from "vitest";
import { VOICE_REGISTRY, voiceEntryFor, voiceNameFor } from "./voices";

// Call-quality plan §B.1t.
describe("voiceEntryFor / voiceNameFor", () => {
  it("resolves a known voiceId to its registry entry", () => {
    expect(voiceEntryFor("EXAVITQu4vr4xnSDxMaL")?.name).toBe("Sarah");
  });

  it("resolves a known voiceId to its name, not the raw id (E6)", () => {
    expect(voiceNameFor("EXAVITQu4vr4xnSDxMaL")).toBe("Sarah");
  });

  it("returns a readable fallback for an unknown id, never the raw id itself", () => {
    expect(voiceEntryFor("some-unrecognized-id")).toBeUndefined();
    const name = voiceNameFor("some-unrecognized-id");
    expect(name).not.toBe("some-unrecognized-id");
    expect(name).toBe("Unknown voice");
  });

  it("returns the fallback, not the OpenAI-shaped 'nova' string, for the retired default (§B.6)", () => {
    expect(voiceNameFor("nova")).toBe("Unknown voice");
  });

  it("handles null/undefined without throwing", () => {
    expect(voiceNameFor(null)).toBe("Unknown voice");
    expect(voiceNameFor(undefined)).toBe("Unknown voice");
  });

  it("every VOICE_REGISTRY entry resolves to itself by its own voiceId", () => {
    for (const entry of VOICE_REGISTRY) {
      expect(voiceEntryFor(entry.voiceId)).toEqual(entry);
      expect(voiceNameFor(entry.voiceId)).toBe(entry.name);
    }
  });
});
