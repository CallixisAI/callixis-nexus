import { describe, it, expect } from "vitest";
import { buildLeadPreview } from "./leadCsv";

describe("buildLeadPreview", () => {
  it("normalizes valid rows using the Country Code column", () => {
    const preview = buildLeadPreview([
      { "Country Code": "+1", Name: "John", Surname: "Smith", Email: "john@example.com", Phone: "555-0199" },
    ]);
    expect(preview.invalidCount).toBe(0);
    expect(preview.validRows).toEqual([
      { first_name: "John", last_name: "Smith", email: "john@example.com", phone: "+15550199", country: "+1", source: null },
    ]);
  });

  it("flags a row with an unnormalizable phone instead of throwing", () => {
    const preview = buildLeadPreview([{ Name: "No Phone Here", Phone: "" }]);
    expect(preview.invalidCount).toBe(1);
    expect(preview.validRows).toHaveLength(0);
    expect(preview.rows[0].invalidReason).toMatch(/empty phone/);
  });

  it("flags the second occurrence of a repeated phone as a within-file duplicate", () => {
    const preview = buildLeadPreview([
      { "Country Code": "+1", Name: "First", Phone: "5550100" },
      { "Country Code": "+1", Name: "Second", Phone: "555-0100" },
    ]);
    expect(preview.duplicateInFileCount).toBe(1);
    expect(preview.validRows).toHaveLength(1);
    expect(preview.validRows[0].first_name).toBe("First");
  });

  it("is case-insensitive and tolerates lowercase headers", () => {
    const preview = buildLeadPreview([{ "country code": "+44", name: "Jane", phone: "7700900123" }]);
    expect(preview.validRows).toEqual([
      { first_name: "Jane", last_name: null, email: null, phone: "+447700900123", country: "+44", source: null },
    ]);
  });

  it("reports row numbers as 1-indexed plus the header row", () => {
    const preview = buildLeadPreview([{ Phone: "" }, { "Country Code": "+1", Phone: "5550100" }]);
    expect(preview.rows[0].rowNum).toBe(2);
    expect(preview.rows[1].rowNum).toBe(3);
  });
});
