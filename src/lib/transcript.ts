// Call-quality plan (docs/call-quality-plan/README.md) §E.1/§E.2 — turning a call's transcript
// into a proper back-and-forth conversation. Same "pure logic in src/lib, unit tested, no
// database needed" shape as callPipeline.ts, roleMatrix.ts and userLifecycle.ts. Real writes
// happen elsewhere (n8n's `Normalize Call` node and supabase/functions/call-ingest/index.ts) —
// this file only classifies and renders text already read from call_records.

export type TranscriptSpeaker = "agent" | "lead" | "unknown";

export interface TranscriptTurn {
  speaker: TranscriptSpeaker;
  text: string;
  secondsFromStart?: number;
}

// Anchored, and requires one of nine known speaker words before the colon — a colon inside the
// utterance itself ("AI: Call me at 3:15") is safe because `.*` is greedy and only the first
// colon after the speaker word is consumed by the pattern. "Note: he hung up" does NOT match
// (`Note` isn't a speaker word), so it correctly stays attached to whatever turn came before it
// rather than starting a new one.
const SPEAKER_LINE = /^\s*(AI|Assistant|Bot|Agent|User|Human|Customer|Lead|System)\s*:[ \t]?(.*)$/i;

const LINE_SPEAKER_MAP: Record<string, TranscriptSpeaker> = {
  ai: "agent",
  assistant: "agent",
  bot: "agent",
  agent: "agent",
  user: "lead",
  human: "lead",
  customer: "lead",
  lead: "lead",
  // System never maps to "agent" — it's the rendered system prompt / call metadata, not
  // something either party said (E14).
  system: "unknown",
};

// Splits on line breaks and matches each line against SPEAKER_LINE. A match starts a new turn; a
// non-matching line appends to whatever turn is currently open (that's how a multi-line answer
// stays one turn); a non-matching line with no turn open yet becomes its own "unknown" turn.
// Consecutive same-speaker turns are deliberately NOT merged — Vapi emits one line per turn, and
// merging would destroy boundaries a conversation view wants to show. Trailing whitespace is
// trimmed per turn; internal line breaks inside a turn are kept. Empty turns are dropped.
export function parseTranscript(raw: string | null | undefined): TranscriptTurn[] {
  if (!raw || typeof raw !== "string" || raw.trim() === "") return [];

  const lines = raw.split(/\r?\n/);
  const turns: { speaker: TranscriptSpeaker; lines: string[] }[] = [];

  for (const line of lines) {
    const match = line.match(SPEAKER_LINE);
    if (match) {
      const speaker = LINE_SPEAKER_MAP[match[1].toLowerCase()] ?? "unknown";
      turns.push({ speaker, lines: [match[2]] });
    } else if (turns.length > 0) {
      turns[turns.length - 1].lines.push(line);
    } else if (line.trim() !== "") {
      // A continuation appearing before any marker at all — no turn to attach to yet.
      turns.push({ speaker: "unknown", lines: [line] });
    }
    // A blank line with nothing open yet is dropped outright — nothing to attach it to.
  }

  return turns
    .map((t) => ({ speaker: t.speaker, text: t.lines.join("\n").trimEnd() }))
    .filter((t) => t.text.trim() !== "");
}

// Prefers Vapi's structured `artifact.messages` over the flat string when it's usable: true
// roles (immune to a lead whose name is literally "User"), true ordering, and per-turn timings.
// Returns null when there's nothing usable so the caller can fall back to the string parser.
//
// 🔴 role === "system" is dropped UNCONDITIONALLY (E14) — that entry is the full rendered system
// prompt, not something either party said, and it must never reach storage or render.
export function turnsFromMessages(messages: unknown): TranscriptTurn[] | null {
  if (!Array.isArray(messages) || messages.length === 0) return null;

  const turns: TranscriptTurn[] = [];
  for (const entry of messages) {
    if (!entry || typeof entry !== "object") continue; // malformed entries skipped, never throws
    const { role, message, secondsFromStart } = entry as Record<string, unknown>;
    if (typeof role !== "string") continue;

    const normalizedRole = role.toLowerCase();
    if (normalizedRole === "system") continue; // E14 — unconditional, before storage or render

    if (typeof message !== "string" || message.trim() === "") continue; // blank message skipped

    const speaker: TranscriptSpeaker =
      normalizedRole === "bot" || normalizedRole === "assistant" || normalizedRole === "ai"
        ? "agent"
        : normalizedRole === "user" || normalizedRole === "human" || normalizedRole === "customer"
          ? "lead"
          : "unknown";

    const turn: TranscriptTurn = { speaker, text: message };
    if (typeof secondsFromStart === "number") turn.secondsFromStart = secondsFromStart;
    turns.push(turn);
  }

  // All-system (or otherwise entirely unusable) input produces no turns — treated the same as
  // "nothing usable at all", so the caller falls back to the string parser rather than rendering
  // an empty conversation.
  return turns.length > 0 ? turns : null;
}

// Structured wins when present; the string parser is the fallback for every call recorded before
// call_records.transcript_messages existed (D-3 — "both", not "either").
export function resolveTranscriptTurns(messages: unknown, raw: string | null | undefined): TranscriptTurn[] {
  const structured = turnsFromMessages(messages);
  if (structured) return structured;
  return parseTranscript(raw);
}
