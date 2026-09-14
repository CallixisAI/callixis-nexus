// Client-feedback plan §C — the voice registry, moved out of AIAgents.tsx so it can grow past the
// two entries it had, and so the picker can group it by accent/gender.
//
// D-3 — no voice ID written from memory. Every `voiceId` below was verified on 2026-09-09 against
// the live ElevenLabs endpoint this app actually calls
// (`POST /v1/text-to-speech/{voiceId}?output_format=mp3_22050_32`, `model_id: eleven_turbo_v2_5`,
// same request `supabase/functions/elevenlabs-tts` sends) using the project's real
// `ELEVENLABS_API_KEY` — each returned HTTP 200 with real MP3 bytes (ID3 header, 8–12 KB). That
// is the exact "silently-failing preview" failure mode D-3 exists to prevent, so verifying
// against that endpoint satisfies its intent even though `GET /v1/voices` was unreachable (the
// key is TTS-scoped, no `voices_read`).
//
// ⚠️ `name` / `gender` / `accent` are from ElevenLabs' published premade-voice list, NOT the
// API's own `labels` object (which needs `voices_read`). They're cosmetic — a wrong accent label
// doesn't break anything. If a `voices_read`-scoped key becomes available, re-derive these from
// each voice's `labels` and, if desired, expand the list from the API response.
//
// The first two entries (`eleven-sarah`, `eleven-james`) are the ones that were already in the
// committed code — their `id`/`voiceId` are unchanged so no existing agent loses its saved voice
// (C.8: `ai_agents.voice` stores the `voiceId`; EditAgentDialog reverse-looks-up by it).

export interface VoiceEntry {
  id: string;
  name: string;
  provider: "elevenlabs";
  voiceId: string; // the ElevenLabs voice_id — this is what ai_agents.voice stores (C.8)
  language: string;
  flag: string;
  desc: string;
  gender: "female" | "male";
  accent: string; // e.g. "American", "British" — for VoicePicker's grouping
}

export const VOICE_REGISTRY: VoiceEntry[] = [
  // ── already in the code before §C (ids unchanged) ──────────────────────────────────
  { id: "eleven-sarah", name: "Sarah", provider: "elevenlabs", voiceId: "EXAVITQu4vr4xnSDxMaL", language: "en", flag: "🇺🇸", desc: "Warm, professional", gender: "female", accent: "American" },
  // NB: ElevenLabs calls this voice "George"; the registry entry has been "James" since before
  // §C and is kept that way so existing agents/users aren't surprised. The voiceId is George's.
  { id: "eleven-james", name: "James", provider: "elevenlabs", voiceId: "JBFqnCBsd6RMkjVDRZzb", language: "en", flag: "🇬🇧", desc: "Confident, authoritative", gender: "male", accent: "British" },

  // ── added in §C (all live-verified 2026-09-09) ────────────────────────────────────
  { id: "eleven-rachel", name: "Rachel", provider: "elevenlabs", voiceId: "21m00Tcm4TlvDq8ikWAM", language: "en", flag: "🇺🇸", desc: "Calm, clear narration", gender: "female", accent: "American" },
  { id: "eleven-aria", name: "Aria", provider: "elevenlabs", voiceId: "9BWtsMINqrJLrRacOk9x", language: "en", flag: "🇺🇸", desc: "Expressive, warm", gender: "female", accent: "American" },
  { id: "eleven-laura", name: "Laura", provider: "elevenlabs", voiceId: "FGY2WhTYpPnrIDTdsKH5", language: "en", flag: "🇺🇸", desc: "Upbeat, youthful", gender: "female", accent: "American" },
  { id: "eleven-jessica", name: "Jessica", provider: "elevenlabs", voiceId: "cgSgspJ2msm6clMCkdW9", language: "en", flag: "🇺🇸", desc: "Friendly, conversational", gender: "female", accent: "American" },
  { id: "eleven-alice", name: "Alice", provider: "elevenlabs", voiceId: "Xb7hH8MSUJpSbSDYk0k2", language: "en", flag: "🇬🇧", desc: "Clear, confident", gender: "female", accent: "British" },
  { id: "eleven-lily", name: "Lily", provider: "elevenlabs", voiceId: "pFZP5JQG7iQjIQuC4Bku", language: "en", flag: "🇬🇧", desc: "Warm, friendly", gender: "female", accent: "British" },
  { id: "eleven-charlotte", name: "Charlotte", provider: "elevenlabs", voiceId: "XB0fDUnXU5powFXDhCwa", language: "en", flag: "🇸🇪", desc: "Soft, measured", gender: "female", accent: "Swedish" },
  { id: "eleven-roger", name: "Roger", provider: "elevenlabs", voiceId: "CwhRBWXzGAHq8TQ4Fs17", language: "en", flag: "🇺🇸", desc: "Easy-going, natural", gender: "male", accent: "American" },
  { id: "eleven-brian", name: "Brian", provider: "elevenlabs", voiceId: "nPczCjzI2devNBz1zQrb", language: "en", flag: "🇺🇸", desc: "Deep, resonant", gender: "male", accent: "American" },
  { id: "eleven-eric", name: "Eric", provider: "elevenlabs", voiceId: "cjVigY5qzO86Huf0OWal", language: "en", flag: "🇺🇸", desc: "Smooth, friendly", gender: "male", accent: "American" },
  { id: "eleven-daniel", name: "Daniel", provider: "elevenlabs", voiceId: "onwK4e9ZLuTAKqWW03F9", language: "en", flag: "🇬🇧", desc: "Deep, authoritative", gender: "male", accent: "British" },
  { id: "eleven-charlie", name: "Charlie", provider: "elevenlabs", voiceId: "IKne3meq5aSn9XLyUdCD", language: "en", flag: "🇦🇺", desc: "Casual, natural", gender: "male", accent: "Australian" },
  { id: "eleven-callum", name: "Callum", provider: "elevenlabs", voiceId: "N2lVS1w4EtoT3dr4eOWO", language: "en", flag: "🏴", desc: "Warm, intense", gender: "male", accent: "Transatlantic" },
];

// Call-quality plan §B.1 — the `voiceId → name` helper that never existed (E6): one place reads
// `EXAVITQu4vr4xnSDxMaL` back to "Sarah" instead of the lookup being written inline once (the
// wizard's Review step never did this at all) and skipped in two others (the agent card just
// rendered the raw code; EditAgentDialog's reverse lookup returned the registry `id`, not the
// display name — see the Insight below `voiceNameFor`).
//
// Matches on `voiceId` (what `ai_agents.voice` actually stores, C.8) — NOT the registry `id`
// (`eleven-sarah`). The two are easy to mix up; see the header comment above.
export function voiceEntryFor(voiceId: string | null | undefined): VoiceEntry | undefined {
  if (!voiceId) return undefined;
  return VOICE_REGISTRY.find((entry) => entry.voiceId === voiceId);
}

// Never returns the raw id — an unrecognised voiceId (a stale value, a manually-edited row, or
// the retired "nova" placeholder — §B.6) gets a readable fallback instead of a string that looks
// deliberately like a code.
export function voiceNameFor(voiceId: string | null | undefined): string {
  return voiceEntryFor(voiceId)?.name ?? "Unknown voice";
}

// VoicePicker's grouping: accent (alpha), then gender (female before male). Kept here so the
// picker component stays presentational.
export function groupVoices(voices: VoiceEntry[]): { accent: string; genders: { gender: "female" | "male"; voices: VoiceEntry[] }[] }[] {
  const byAccent = new Map<string, VoiceEntry[]>();
  for (const v of voices) {
    if (!byAccent.has(v.accent)) byAccent.set(v.accent, []);
    byAccent.get(v.accent)!.push(v);
  }
  return [...byAccent.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([accent, list]) => {
      const genders: { gender: "female" | "male"; voices: VoiceEntry[] }[] = [];
      for (const gender of ["female", "male"] as const) {
        const g = list.filter((v) => v.gender === gender);
        if (g.length > 0) genders.push({ gender, voices: g });
      }
      return { accent, genders };
    });
}
