// E.164 phone normalization for lead upload (Phase 5 §A.3, docs/call-engine-plan/PHASE-5-wire-the-app.md).
//
// Mirrors scripts/import-leads.mjs's normalizePhone rule-for-rule. That script is a Node ESM
// file living outside this repo (the parent "Callixis AI/" folder isn't a git repo, and isn't
// bundled by Vite), so it can't be imported directly here — there is no module boundary that
// spans both a Deno/Node script and a browser bundle. If you change the normalization rule in
// one place, change it in the other, or the CSV importer and the in-app uploader will silently
// diverge on which numbers they accept.
//
// lead-enrichment plan §A.1 — added United States/USA/US -> "1". Before this, a real 2000+ row
// US lead list was rejected outright: every "Country" cell said some spelling of "United States",
// which had no entry here at all.
const COUNTRY_CALLING_CODE: Record<string, string> = {
  Canada: "1",
  Pakistan: "92",
  "United States": "1",
  USA: "1",
  US: "1",
};

// lead-enrichment plan §A.2 — a bare 10-digit number with NO country column at all (not "an
// unrecognized one" — that still fails below, on purpose) is assumed to be a US number. This is a
// deliberate business call, not a silent guess: this app's upload flows exist to serve US client
// lead lists, and rejecting the whole file to guard against a non-US bare-10-digit number that
// hasn't happened yet costs real leads for no real protection.
const ASSUME_US_CALLING_CODE_FOR_BARE_10_DIGIT = "1";

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
  let code = COUNTRY_CALLING_CODE[countryInput] || (/^\d{1,3}$/.test(asCallingCode) ? asCallingCode : undefined);

  // §A.2 — only when the country column is genuinely blank, never when it names an unrecognized
  // country (e.g. "France" still fails below, deliberately — a wrong explicit country is a data
  // problem worth flagging, not one to silently override).
  if (!code && !countryInput && digits.length === 10) {
    code = ASSUME_US_CALLING_CODE_FOR_BARE_10_DIGIT;
  }

  if (!code) {
    return { ok: false, reason: `no known calling code for country "${country || "(blank)"}"` };
  }
  return { ok: true, phone: "+" + code + digits };
}

// Same E.164 shape check dispatch-batch/index.ts uses to decide whether a lead is safe to dial.
export const E164 = /^\+[1-9]\d{6,14}$/;
