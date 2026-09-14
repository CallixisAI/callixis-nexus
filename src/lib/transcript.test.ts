import { describe, it, expect } from "vitest";
import { parseTranscript, turnsFromMessages, resolveTranscriptTurns } from "./transcript";

describe("parseTranscript", () => {
  it("returns [] for null, undefined, empty string, and whitespace-only", () => {
    expect(parseTranscript(null)).toEqual([]);
    expect(parseTranscript(undefined)).toEqual([]);
    expect(parseTranscript("")).toEqual([]);
    expect(parseTranscript("   \n  \n ")).toEqual([]);
  });

  it("parses a single turn", () => {
    expect(parseTranscript("AI: Hello there")).toEqual([{ speaker: "agent", text: "Hello there" }]);
  });

  it("parses canonical alternating turns", () => {
    expect(parseTranscript("AI: Hi, how can I help?\nUser: I have a question.")).toEqual([
      { speaker: "agent", text: "Hi, how can I help?" },
      { speaker: "lead", text: "I have a question." },
    ]);
  });

  it("produces no empty final turn from a trailing newline", () => {
    expect(parseTranscript("AI: Hello\nUser: Hi\n")).toEqual([
      { speaker: "agent", text: "Hello" },
      { speaker: "lead", text: "Hi" },
    ]);
  });

  it("keeps a multi-line answer as one turn", () => {
    expect(parseTranscript("AI: Line one\nLine two\nLine three")).toEqual([
      { speaker: "agent", text: "Line one\nLine two\nLine three" },
    ]);
  });

  it("a continuation that itself contains a colon stays attached, doesn't start a new turn", () => {
    expect(parseTranscript("AI: Here's the plan.\nNote: he hung up")).toEqual([
      { speaker: "agent", text: "Here's the plan.\nNote: he hung up" },
    ]);
  });

  it("a colon inside the utterance on the marker line itself is safe", () => {
    expect(parseTranscript("AI: Call me at 3:15")).toEqual([{ speaker: "agent", text: "Call me at 3:15" }]);
  });

  it("a continuation appearing before any marker becomes its own unknown turn", () => {
    expect(parseTranscript("he arrived on time\nAI: Hello")).toEqual([
      { speaker: "unknown", text: "he arrived on time" },
      { speaker: "agent", text: "Hello" },
    ]);
  });

  it("no markers at all produces exactly one unknown turn (the escape-hatch trigger)", () => {
    const result = parseTranscript("Just some plain text.\nMore plain text.");
    expect(result).toHaveLength(1);
    expect(result[0].speaker).toBe("unknown");
    expect(result[0].text).toBe("Just some plain text.\nMore plain text.");
  });

  it("is case- and spacing-insensitive on the marker", () => {
    expect(parseTranscript("ai: hi")).toEqual([{ speaker: "agent", text: "hi" }]);
    expect(parseTranscript("USER : hi")).toEqual([{ speaker: "lead", text: "hi" }]);
  });

  it("maps System to unknown, never agent", () => {
    expect(parseTranscript("System: call started")).toEqual([{ speaker: "unknown", text: "call started" }]);
  });

  it("drops an empty utterance", () => {
    expect(parseTranscript("AI:")).toEqual([]);
  });

  it("a blank line between turns doesn't corrupt the previous turn", () => {
    expect(parseTranscript("AI: Hello there\n\nUser: Hi")).toEqual([
      { speaker: "agent", text: "Hello there" },
      { speaker: "lead", text: "Hi" },
    ]);
  });

  it("does not merge consecutive same-speaker turns", () => {
    expect(parseTranscript("AI: Hello\nAI: How are you")).toEqual([
      { speaker: "agent", text: "Hello" },
      { speaker: "agent", text: "How are you" },
    ]);
  });
});

describe("turnsFromMessages", () => {
  it("returns null for a non-array", () => {
    expect(turnsFromMessages(null)).toBeNull();
    expect(turnsFromMessages(undefined)).toBeNull();
    expect(turnsFromMessages("not an array")).toBeNull();
    expect(turnsFromMessages({})).toBeNull();
  });

  it("returns null for an empty array", () => {
    expect(turnsFromMessages([])).toBeNull();
  });

  it("returns null when every entry is role=system (E14)", () => {
    expect(turnsFromMessages([{ role: "system", message: "full prompt here" }])).toBeNull();
  });

  it("strips system entries and preserves order for the rest", () => {
    const result = turnsFromMessages([
      { role: "system", message: "prompt" },
      { role: "bot", message: "Hello" },
      { role: "user", message: "Hi" },
    ]);
    expect(result).toEqual([
      { speaker: "agent", text: "Hello" },
      { speaker: "lead", text: "Hi" },
    ]);
  });

  it("maps an unrecognized role to unknown", () => {
    expect(turnsFromMessages([{ role: "moderator", message: "hold please" }])).toEqual([
      { speaker: "unknown", text: "hold please" },
    ]);
  });

  it("skips a blank message", () => {
    expect(turnsFromMessages([{ role: "user", message: "   " }, { role: "user", message: "real" }])).toEqual([
      { speaker: "lead", text: "real" },
    ]);
  });

  it("carries secondsFromStart only when numeric", () => {
    expect(turnsFromMessages([{ role: "bot", message: "hi", secondsFromStart: 1.5 }])).toEqual([
      { speaker: "agent", text: "hi", secondsFromStart: 1.5 },
    ]);
    expect(turnsFromMessages([{ role: "bot", message: "hi", secondsFromStart: "1.5" }])).toEqual([
      { speaker: "agent", text: "hi" },
    ]);
  });

  it("skips malformed entries inside the array without throwing", () => {
    expect(() =>
      turnsFromMessages([null, 42, "oops", { role: 123 }, { role: "user", message: "hi" }]),
    ).not.toThrow();
    expect(turnsFromMessages([null, 42, "oops", { role: 123 }, { role: "user", message: "hi" }])).toEqual([
      { speaker: "lead", text: "hi" },
    ]);
  });
});

describe("resolveTranscriptTurns", () => {
  it("prefers structured turns over the raw string when both are present and disagree", () => {
    const messages = [{ role: "bot", message: "structured wins" }];
    const raw = "AI: raw string version";
    expect(resolveTranscriptTurns(messages, raw)).toEqual([{ speaker: "agent", text: "structured wins" }]);
  });

  it("falls back to the string parser when messages is unusable", () => {
    expect(resolveTranscriptTurns(null, "AI: fallback text")).toEqual([{ speaker: "agent", text: "fallback text" }]);
  });

  it("returns [] when both are empty", () => {
    expect(resolveTranscriptTurns(null, null)).toEqual([]);
    expect(resolveTranscriptTurns([], "")).toEqual([]);
  });
});
