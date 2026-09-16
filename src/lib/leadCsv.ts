import { normalizePhone } from "./phone";
import { timezoneForZip } from "./leadTimezone";

export interface RawCsvRow {
  [key: string]: string;
}

export interface ParsedLeadRow {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string;
  country: string | null;
  source: string | null;
  // lead-enrichment plan §B/D-1 — spoken on the call.
  address: string | null;
  city: string | null;
  zip: string | null;
  home_type: string | null;
  home_built: number | null;
  last_service: string | null;
  // §B/D-2 — stored for filtering, never spoken.
  gender: string | null;
  stories: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  phone_type: string | null;
  phone_region: string | null;
  phone_carrier: string | null;
  lead_posted_at: string | null;
  // §C.3/D-4 — derived from zip, never guessed when unknown. Null means "leave leads.timezone
  // unset so it falls back to the campaign's own timezone" — never invent one.
  timezone: string | null;
}

export interface LeadPreviewRow {
  rowNum: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  source: string | null;
  // §C.5 — enrichment fields shown in the preview step, so the uploader can see it landed before
  // committing. Not the full ParsedLeadRow shape: this is only what's worth a human glancing at.
  address: string | null;
  city: string | null;
  zip: string | null;
  homeType: string | null;
  homeBuilt: number | null;
  lastService: string | null;
  invalidReason: string | null;
  duplicateInFile: boolean;
}

export interface LeadPreview {
  rows: LeadPreviewRow[];
  validRows: ParsedLeadRow[];
  invalidCount: number;
  duplicateInFileCount: number;
}

// §A.3 — header lookup is case-insensitive AND separator-insensitive: keys are lower-cased and
// stripped of spaces/underscores/hyphens before comparing, so "first_name", "First Name" and
// "firstname" all land on the same normalized key ("firstname"). Before this, only casing was
// normalized — a real snake_case export (first_name, last_name, phone_country) matched nothing at
// all, because the header comparison never stripped the underscore (E3, docs/lead-enrichment-plan).
function normalizeKey(key: string): string {
  return key.toLowerCase().trim().replace(/[\s_-]+/g, "");
}

function pick(row: RawCsvRow, ...keys: string[]): string {
  const lower = new Map(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));
  for (const key of keys) {
    const value = lower.get(normalizeKey(key));
    if (value && value.trim()) return value.trim();
  }
  return "";
}

// §C.1 — numbers parse to null on anything non-numeric, never 0: a 0 would read as "this house
// has zero bedrooms" if the AI ever said it aloud, when the real meaning is "unknown".
function parseIntOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^-?\d+$/.test(trimmed)) return null;
  return parseInt(trimmed, 10);
}

// home_built gets its own parser, not just parseIntOrNull, because the migration's own CHECK
// (home_built BETWEEN 1800 AND 2100) would reject an entire upsert chunk over one garbage year —
// clamping to null client-side here means one bad cell degrades that one field, not the chunk.
const MIN_YEAR_BUILT = 1800;
const MAX_YEAR_BUILT = 2100;
function parseYearOrNull(raw: string): number | null {
  const year = parseIntOrNull(raw);
  if (year === null || year < MIN_YEAR_BUILT || year > MAX_YEAR_BUILT) return null;
  return year;
}

// Every field this module extracts from one raw CSV row, before phone validation splits it into
// "valid" vs "invalid/duplicate". LeadPreviewRow and ParsedLeadRow are both projections of this,
// not independent re-derivations — a row is parsed once.
interface ExtractedRow {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phoneRaw: string;
  country: string | null;
  source: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  homeType: string | null;
  homeBuilt: number | null;
  lastService: string | null;
  gender: string | null;
  stories: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  phoneType: string | null;
  phoneRegion: string | null;
  phoneCarrier: string | null;
  leadPostedAt: string | null;
}

function extractRow(rawRow: RawCsvRow): ExtractedRow {
  return {
    firstName: pick(rawRow, "Name", "First Name", "FirstName") || null,
    lastName: pick(rawRow, "Surname", "Last Name", "LastName") || null,
    email: pick(rawRow, "Email") || null,
    phoneRaw: pick(rawRow, "Phone"),
    // "Phone Country" added: a real file's `phone_country` header normalizes to "phonecountry",
    // a different word from "country"/"countrycode", so it needs its own alias — separator
    // stripping alone can't bridge two genuinely different words.
    country: pick(rawRow, "Country Code", "Country", "Phone Country") || null,
    source: pick(rawRow, "Source") || null,
    // lead-enrichment plan §B — the thirteen new columns.
    address: pick(rawRow, "Address", "Street Address") || null,
    city: pick(rawRow, "City") || null,
    zip: pick(rawRow, "Zip", "Zip Code", "Postal", "Postal Code") || null,
    homeType: pick(rawRow, "Home Type", "House Type", "Property Type") || null,
    // Corrected 2026-09-15, after a real upload landed 0/2095 rows with this field: the real
    // file's header is "home_built_year", not "Home Built" — confirmed directly from James
    // pasting the actual header row. Kept the old guesses too; they're harmless if unmatched.
    homeBuilt: parseYearOrNull(pick(rawRow, "Home Built Year", "home_built_year", "Home Built", "Year Built", "Built")),
    // Corrected 2026-09-15, same real-upload finding: the real header is "Last service_required",
    // not "Last Service" — confirmed the same way as home_built above.
    lastService: pick(rawRow, "Last Service Required", "Last service_required", "Last Service", "Last service") || null,
    gender: pick(rawRow, "Gender") || null,
    stories: parseIntOrNull(pick(rawRow, "Stories", "Storeys", "Floors")),
    bedrooms: parseIntOrNull(pick(rawRow, "Bedrooms", "Beds")),
    bathrooms: parseIntOrNull(pick(rawRow, "Bathrooms", "Baths")),
    phoneType: pick(rawRow, "Phone Type") || null,
    phoneRegion: pick(rawRow, "Phone Region") || null,
    // lead-enrichment plan — phone_carrier, found 2026-09-15 in the real file's header row but
    // never named in the plan's own D-1/D-2/D-3 decisions. Same "store it, never speak it"
    // bucket as phone_type/phone_region (D-4): not sensitive, not regulated, no reason to read it
    // aloud on a call. Flagged to James rather than silently assumed.
    phoneCarrier: pick(rawRow, "Phone Carrier", "phone_carrier") || null,
    // "datepost" is the real file's literal header (docs/lead-enrichment-plan/README.md §B.1's
    // own comment) — kept as an explicit alias alongside the more readable variants.
    leadPostedAt: pick(rawRow, "Date Posted", "Posted", "datepost") || null,
  };
}

/**
 * Validates and normalizes a parsed CSV before anything is written to `leads` — §A.4's "show a
 * preview before committing". Rows with an unnormalizable phone, or a phone repeated elsewhere in
 * the same file, are flagged rather than dropped silently, so the person uploading can see exactly
 * what will and won't be dialable.
 */
export function buildLeadPreview(rawRows: RawCsvRow[]): LeadPreview {
  const rows: LeadPreviewRow[] = [];
  const validRows: ParsedLeadRow[] = [];
  const seenPhones = new Set<string>();
  let invalidCount = 0;
  let duplicateInFileCount = 0;

  rawRows.forEach((rawRow, index) => {
    const rowNum = index + 2; // 1-indexed + header row
    const extracted = extractRow(rawRow);
    const previewFields = {
      rowNum,
      firstName: extracted.firstName,
      lastName: extracted.lastName,
      email: extracted.email,
      country: extracted.country,
      source: extracted.source,
      address: extracted.address,
      city: extracted.city,
      zip: extracted.zip,
      homeType: extracted.homeType,
      homeBuilt: extracted.homeBuilt,
      lastService: extracted.lastService,
    };

    const normalized = normalizePhone(extracted.phoneRaw, extracted.country);
    if (!normalized.ok || !normalized.phone) {
      invalidCount++;
      rows.push({ ...previewFields, phone: null, invalidReason: normalized.reason ?? "invalid phone", duplicateInFile: false });
      return;
    }

    if (seenPhones.has(normalized.phone)) {
      duplicateInFileCount++;
      rows.push({ ...previewFields, phone: normalized.phone, invalidReason: null, duplicateInFile: true });
      return;
    }
    seenPhones.add(normalized.phone);
    rows.push({ ...previewFields, phone: normalized.phone, invalidReason: null, duplicateInFile: false });

    validRows.push({
      first_name: extracted.firstName,
      last_name: extracted.lastName,
      email: extracted.email,
      phone: normalized.phone,
      country: extracted.country,
      source: extracted.source,
      address: extracted.address,
      city: extracted.city,
      zip: extracted.zip,
      home_type: extracted.homeType,
      home_built: extracted.homeBuilt,
      last_service: extracted.lastService,
      gender: extracted.gender,
      stories: extracted.stories,
      bedrooms: extracted.bedrooms,
      bathrooms: extracted.bathrooms,
      phone_type: extracted.phoneType,
      phone_region: extracted.phoneRegion,
      phone_carrier: extracted.phoneCarrier,
      lead_posted_at: extracted.leadPostedAt,
      // §C.3/D-4 — never invent a zone: null when the zip doesn't resolve, so the caller (§C.4)
      // leaves leads.timezone unset and dispatch-batch's own campaign-timezone fallback applies.
      timezone: timezoneForZip(extracted.zip),
    });
  });

  return { rows, validRows, invalidCount, duplicateInFileCount };
}
