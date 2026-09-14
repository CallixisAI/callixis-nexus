import type { Industry } from "@/lib/industries";

// Client-feedback plan §B / D-1 / D-2 — the code half of the per-industry starter text. Picking
// an industry in the agent wizard pre-fills the Extra Instructions box with the matching entry
// here (unless an admin has saved an override in industry_assistants.starter_instructions — §B.3's
// resolver prefers that).
//
// D-2: guidance prose, NO `{{placeholders}}`. Extra Instructions is itself substituted into the
// assistant's Vapi prompt at `{{extra_instructions}}` (AI-Agents plan D-13/D-14); a placeholder
// *inside* a substituted value most likely isn't filled by the same single pass, so the lead
// would hear "my name is agent name." The client's example used fill-in-the-blanks — this carries
// the same intent without them. Reword any of it freely; it's a starting point, not a contract.
//
// Typed as Record<Industry, string> deliberately (§B.4): add a value to INDUSTRIES without a
// starter here and it's a COMPILE error, not a silently empty box. Keys must be the exact ten
// strings from src/lib/industries.ts.
export const INDUSTRY_STARTERS: Record<Industry, string> = {
  "Insurance":
    "Open by introducing yourself by name and confirming you're speaking with the right person. Check whether they still have life insurance in place and when they last reviewed it. If they are not the policy holder, ask who is and when would be a good time to reach them.",
  "Real Estate":
    "Open by introducing yourself and confirming you have the right person. Ask whether they are currently looking to buy, sell, or just keeping an eye on the market, and roughly what timeframe they have in mind. Note the area they're interested in before offering anything.",
  "Medical":
    "Open warmly and confirm you're speaking with the right person before mentioning anything specific. Ask whether they are still looking for the service they enquired about and whether they have a preferred day or time. Never discuss medical details with anyone other than the patient.",
  "Car Sales":
    "Open by introducing yourself and confirming you have the right person. Ask what they are driving now and what they are looking for next — size, budget, and whether they are trading anything in. Find out how soon they want to be in a new vehicle.",
  "Home Improvement":
    "Open by introducing yourself and confirming you have the right person. Ask what part of the home they are looking to improve and whether they have had anyone out to quote it yet. Establish whether they own the property before going further.",
  "Legal":
    "Open by introducing yourself and confirming you're speaking with the right person. Ask what the matter concerns in general terms and how recently it arose. Do not give legal advice — the goal is only to establish whether it is worth a consultation.",
  "Financial Services":
    "Open by introducing yourself and confirming you have the right person. Ask what they are trying to achieve — paying something down, saving, or planning ahead — and roughly what timeframe. Do not ask for account numbers or any sensitive financial detail.",
  "Education":
    "Open by introducing yourself and confirming you have the right person. Ask what they are looking to study, whether it is for themselves or someone else, and when they would want to start. Note any format preference such as online or in person.",
  "SaaS / Tech":
    "Open by introducing yourself and confirming you have the right person. Ask what problem prompted them to look, what they are using today, and roughly how many people would use it. Establish whether they are the decision maker.",
  "Other":
    "Open by introducing yourself and confirming you're speaking with the right person. Ask what prompted their enquiry and what they are hoping to get out of the conversation. Keep it brief and let them do most of the talking.",
};

// §B.13 — the one resolver. An admin override (industry_assistants.starter_instructions) wins;
// then the code default; then empty string (an unknown industry string, which shouldn't happen
// given INDUSTRIES is the single source of truth, but this never throws).
export function resolveIndustryStarter(
  industry: string,
  override: string | null | undefined,
): string {
  if (override && override.trim()) return override;
  return INDUSTRY_STARTERS[industry as Industry] ?? "";
}
