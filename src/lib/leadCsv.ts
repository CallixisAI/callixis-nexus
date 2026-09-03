import { normalizePhone } from "./phone";

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
}

export interface LeadPreviewRow {
  rowNum: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  source: string | null;
  invalidReason: string | null;
  duplicateInFile: boolean;
}

export interface LeadPreview {
  rows: LeadPreviewRow[];
  validRows: ParsedLeadRow[];
  invalidCount: number;
  duplicateInFileCount: number;
}

// Header lookup is case-insensitive and tries a couple of aliases, matching the flexibility the
// upload dialog already had before this rewrite (row.Name || row.name, etc.) — a real-world
// export's exact casing is not something to fail a whole file over.
function pick(row: RawCsvRow, ...keys: string[]): string {
  const lower = new Map(Object.entries(row).map(([key, value]) => [key.toLowerCase().trim(), value]));
  for (const key of keys) {
    const value = lower.get(key.toLowerCase());
    if (value && value.trim()) return value.trim();
  }
  return "";
}

/**
 * Validates and normalizes a parsed CSV before anything is written to `leads` — §A.4's "show a
 * preview before committing". Rows with an unnormalizable phone, or a phone repeated elsewhere in
 * the same file, are flagged rather than dropped silently, so the person uploading can see exactly
 * what will and won't be dialable.
 */
export function buildLeadPreview(rawRows: RawCsvRow[]): LeadPreview {
  const rows: LeadPreviewRow[] = [];
  const seenPhones = new Set<string>();
  let invalidCount = 0;
  let duplicateInFileCount = 0;

  rawRows.forEach((rawRow, index) => {
    const rowNum = index + 2; // 1-indexed + header row
    const firstName = pick(rawRow, "Name", "First Name", "FirstName") || null;
    const lastName = pick(rawRow, "Surname", "Last Name", "LastName") || null;
    const email = pick(rawRow, "Email") || null;
    const phoneRaw = pick(rawRow, "Phone");
    const country = pick(rawRow, "Country Code", "Country") || null;
    const source = pick(rawRow, "Source") || null;

    const normalized = normalizePhone(phoneRaw, country);
    if (!normalized.ok || !normalized.phone) {
      invalidCount++;
      rows.push({ rowNum, firstName, lastName, email, phone: null, country, source, invalidReason: normalized.reason ?? "invalid phone", duplicateInFile: false });
      return;
    }

    if (seenPhones.has(normalized.phone)) {
      duplicateInFileCount++;
      rows.push({ rowNum, firstName, lastName, email, phone: normalized.phone, country, source, invalidReason: null, duplicateInFile: true });
      return;
    }
    seenPhones.add(normalized.phone);
    rows.push({ rowNum, firstName, lastName, email, phone: normalized.phone, country, source, invalidReason: null, duplicateInFile: false });
  });

  const validRows: ParsedLeadRow[] = rows
    .filter((row) => !row.invalidReason && !row.duplicateInFile)
    .map((row) => ({ first_name: row.firstName, last_name: row.lastName, email: row.email, phone: row.phone as string, country: row.country, source: row.source }));

  return { rows, validRows, invalidCount, duplicateInFileCount };
}
