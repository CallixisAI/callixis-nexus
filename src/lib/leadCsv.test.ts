import { describe, it, expect } from "vitest";
import { buildLeadPreview } from "./leadCsv";

// Every enrichment field defaults to null unless a test overrides it — keeps the pre-existing
// assertions from having to spell out all fourteen new keys by hand.
const emptyEnrichment = {
  address: null, city: null, zip: null, home_type: null, home_built: null, last_service: null,
  gender: null, stories: null, bedrooms: null, bathrooms: null, phone_type: null,
  phone_region: null, phone_carrier: null, lead_posted_at: null, timezone: null,
};

describe("buildLeadPreview", () => {
  it("normalizes valid rows using the Country Code column", () => {
    const preview = buildLeadPreview([
      { "Country Code": "+1", Name: "John", Surname: "Smith", Email: "john@example.com", Phone: "555-0199" },
    ]);
    expect(preview.invalidCount).toBe(0);
    expect(preview.validRows).toEqual([
      { first_name: "John", last_name: "Smith", email: "john@example.com", phone: "+15550199", country: "+1", source: null, ...emptyEnrichment },
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
      { first_name: "Jane", last_name: null, email: null, phone: "+447700900123", country: "+44", source: null, ...emptyEnrichment },
    ]);
  });

  it("reports row numbers as 1-indexed plus the header row", () => {
    const preview = buildLeadPreview([{ Phone: "" }, { "Country Code": "+1", Phone: "5550100" }]);
    expect(preview.rows[0].rowNum).toBe(2);
    expect(preview.rows[1].rowNum).toBe(3);
  });

  // §A.3 — separator-insensitive header matching. Before this fix, a snake_case export matched
  // nothing at all (E3): "first_name" was compared literally against "name"/"first name"/
  // "firstname" with no separator stripping, so none matched.
  describe("§A.3 — snake_case headers", () => {
    it("matches first_name / last_name / phone_country in snake_case", () => {
      const preview = buildLeadPreview([
        { first_name: "Ana", last_name: "Reyes", phone: "5550100123", phone_country: "United States" },
      ]);
      expect(preview.invalidCount).toBe(0);
      expect(preview.validRows[0].first_name).toBe("Ana");
      expect(preview.validRows[0].last_name).toBe("Reyes");
      expect(preview.validRows[0].phone).toBe("+15550100123");
    });

    it("matches postal/zip variants", () => {
      const preview = buildLeadPreview([{ phone: "5550100123", zip_code: "90011" }]);
      expect(preview.validRows[0].zip).toBe("90011");
    });
  });

  describe("§C.1/§C.2 — enrichment fields", () => {
    it("parses address/city/zip/home_type/home_built/last_service using the REAL file's headers (home_built_year, 'Last service_required')", () => {
      // Corrected 2026-09-15 — the first real upload landed 0/2095 rows with home_built/
      // last_service, because the file's actual headers aren't "Home Built"/"Last Service" as
      // originally guessed. James pasted the real header row; these are the exact names.
      const preview = buildLeadPreview([{
        phone: "5550100123",
        address: "4961 S Central Avenue",
        city: "Los Angeles",
        zip: "90011",
        home_type: "Single Family",
        home_built_year: "1962",
        "Last service_required": "Roofing",
      }]);
      const row = preview.validRows[0];
      expect(row.address).toBe("4961 S Central Avenue");
      expect(row.city).toBe("Los Angeles");
      expect(row.zip).toBe("90011");
      expect(row.home_type).toBe("Single Family");
      expect(row.home_built).toBe(1962);
      expect(row.last_service).toBe("Roofing");
      // D-4 — a real LA zip resolves to a real timezone on the way in.
      expect(row.timezone).toBe("America/Los_Angeles");
    });

    it("still matches the originally-guessed header spellings too, in case a different export uses them", () => {
      const preview = buildLeadPreview([{ phone: "5550100123", "Home Built": "1962", "Last Service": "Roofing" }]);
      const row = preview.validRows[0];
      expect(row.home_built).toBe(1962);
      expect(row.last_service).toBe("Roofing");
    });

    it("parses numeric fields to null on empty/non-numeric input, never 0", () => {
      const preview = buildLeadPreview([{ phone: "5550100123", Bedrooms: "", Bathrooms: "N/A", Stories: "2" }]);
      const row = preview.validRows[0];
      expect(row.bedrooms).toBeNull();
      expect(row.bathrooms).toBeNull();
      expect(row.stories).toBe(2);
    });

    it("clamps home_built to null when outside the 1800-2100 range rather than passing garbage to the DB CHECK", () => {
      const preview = buildLeadPreview([{ phone: "5550100123", home_built_year: "9999" }]);
      expect(preview.validRows[0].home_built).toBeNull();
    });

    it("never invents a timezone for an unresolvable zip", () => {
      const preview = buildLeadPreview([{ phone: "5550100123", Zip: "00000" }]);
      expect(preview.validRows[0].timezone).toBeNull();
    });

    it("stores gender/stories/bedrooms/bathrooms/phone_type/phone_region/phone_carrier without speaking them (D-2)", () => {
      const preview = buildLeadPreview([{
        phone: "5550100123", Gender: "F", Stories: "1", Bedrooms: "3", Bathrooms: "2",
        phone_type: "mobile", phone_region: "California", phone_carrier: "Verizon",
      }]);
      const row = preview.validRows[0];
      expect(row.gender).toBe("F");
      expect(row.stories).toBe(1);
      expect(row.bedrooms).toBe(3);
      expect(row.bathrooms).toBe(2);
      expect(row.phone_type).toBe("mobile");
      expect(row.phone_region).toBe("California");
      expect(row.phone_carrier).toBe("Verizon");
    });
  });

  // §A.4 — the REAL file's 24 headers, pasted verbatim by James 2026-09-15 after the first real
  // upload revealed two of them didn't match. This replaces the earlier reconstructed guess (it
  // had "source" instead of the real "phone_carrier", and guessed "Home Built"/"Last service"
  // instead of the real "home_built_year"/"Last service_required").
  describe("§A.4 — real-file fixture (24 headers, confirmed verbatim by James)", () => {
    const realFileRow: Record<string, string> = {
      EMAIL: "maria.gonzalez@example.com",
      first_name: "Maria",
      last_name: "Gonzalez",
      address: "1234 W Sunset Blvd",
      city: "Los Angeles",
      zip: "90026",
      phone: "3235550142",
      phone_type: "mobile",
      phone_country: "United States",
      phone_region: "California",
      phone_carrier: "Verizon",
      gender: "F",
      home_type: "Single Family",
      home_built_year: "1948",
      stories: "1",
      bedrooms: "3",
      bathrooms: "2",
      "Last service_required": "Roofing",
      datepost: "2026-01-15",
      // D-3 — deliberately not ingested. Present in the fixture (matching the real file) but must
      // not break parsing, and must not appear anywhere in ParsedLeadRow.
      dob: "1985-03-22",
      married: "Yes",
      edu_level: "Bachelors",
      credit_score: "720",
      ip: "192.0.2.10",
    };
    it("the fixture itself has all 24 headers — this test's whole point is exercising them", () => {
      expect(Object.keys(realFileRow)).toHaveLength(24);
    });

    it("parses one row end to end with no invalid/duplicate flag", () => {
      const preview = buildLeadPreview([realFileRow]);
      expect(preview.invalidCount).toBe(0);
      expect(preview.duplicateInFileCount).toBe(0);
      expect(preview.validRows).toHaveLength(1);
    });

    it("lands every spoken and stored field, and never a D-3 excluded one", () => {
      const row = buildLeadPreview([realFileRow]).validRows[0];
      expect(row).toEqual({
        first_name: "Maria",
        last_name: "Gonzalez",
        email: "maria.gonzalez@example.com",
        phone: "+13235550142",
        country: "United States",
        source: null, // the real file has no "Source" column at all
        address: "1234 W Sunset Blvd",
        city: "Los Angeles",
        zip: "90026",
        home_type: "Single Family",
        home_built: 1948,
        last_service: "Roofing",
        gender: "F",
        stories: 1,
        bedrooms: 3,
        bathrooms: 2,
        phone_type: "mobile",
        phone_region: "California",
        phone_carrier: "Verizon",
        lead_posted_at: "2026-01-15",
        timezone: "America/Los_Angeles",
      });
      // D-3 fields never make it into ParsedLeadRow's shape at all.
      expect(Object.keys(row)).not.toContain("dob");
      expect(Object.keys(row)).not.toContain("married");
      expect(Object.keys(row)).not.toContain("edu_level");
      expect(Object.keys(row)).not.toContain("credit_score");
      expect(Object.keys(row)).not.toContain("ip");
    });
  });
});
