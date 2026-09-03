// E.164 phone normalization for lead upload (Phase 5 §A.3, docs/call-engine-plan/PHASE-5-wire-the-app.md).
//
// Mirrors scripts/import-leads.mjs's normalizePhone rule-for-rule. That script is a Node ESM
// file living outside this repo (the parent "Callixis AI/" folder isn't a git repo, and isn't
// bundled by Vite), so it can't be imported directly here — there is no module boundary that
// spans both a Deno/Node script and a browser bundle. If you change the normalization rule in
// one place, change it in the other, or the CSV importer and the in-app uploader will silently
// diverge on which numbers they accept.
const COUNTRY_CALLING_CODE: Record<string, string> = { Canada: "1", Pakistan: "92" };

export interface PhoneNormalizeResult {
  ok: boolean;
  phone?: string;
  reason?: string;
}

// `country` accepts either a country name from the Airtable picklist above, or a literal calling
// code (e.g. "+1", "44") — the app's own CSV template uses a free-typed "Country Code" column
// rather than Airtable's fixed country picklist, so this extends (never narrows) what the script
// accepts: every input scripts/import-leads.mjs would normalize is normalized identically here.
export function normalizePhone(rawPhone: string | null | undefined, country?: string | null): PhoneNormalizeResult {
  if (rawPhone == null || String(rawPhone).trim() === "") {
    return { ok: false, reason: "empty phone" };
  }
  const trimmed = String(rawPhone).trim();
  if (trimmed.startsWith("+")) {
    const digits = trimmed.replace(/[^\d]/g, "");
    if (digits.length < 8) return { ok: false, reason: `too short after +: ${trimmed}` };
    return { ok: true, phone: "+" + digits };
  }
  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return { ok: false, reason: `no digits: ${trimmed}` };

  const countryInput = country?.trim() ?? "";
  const asCallingCode = countryInput.replace(/^\+/, "");
  const code = COUNTRY_CALLING_CODE[countryInput] || (/^\d{1,3}$/.test(asCallingCode) ? asCallingCode : undefined);
  if (!code) {
    return { ok: false, reason: `no known calling code for country "${country || "(blank)"}"` };
  }
  return { ok: true, phone: "+" + code + digits };
}

// Same E.164 shape check dispatch-batch/index.ts uses to decide whether a lead is safe to dial.
export const E164 = /^\+[1-9]\d{6,14}$/;
