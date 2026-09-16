import { describe, it, expect } from "vitest";
import { timezoneForZip } from "./leadTimezone";

describe("timezoneForZip", () => {
  it("resolves Los Angeles ZIPs to America/Los_Angeles — the plan's real, immediate data", () => {
    expect(timezoneForZip("90011")).toBe("America/Los_Angeles"); // South LA
    expect(timezoneForZip("90210")).toBe("America/Los_Angeles"); // Beverly Hills
    expect(timezoneForZip("91301")).toBe("America/Los_Angeles"); // Agoura Hills
  });

  it("resolves the full California range boundary", () => {
    expect(timezoneForZip("90001")).toBe("America/Los_Angeles");
    expect(timezoneForZip("96199")).toBe("America/Los_Angeles");
  });

  it("resolves a handful of other well-known, unambiguous zones", () => {
    expect(timezoneForZip("10001")).toBe("America/New_York"); // NYC
    expect(timezoneForZip("60601")).toBe("America/Chicago"); // Chicago
    expect(timezoneForZip("80202")).toBe("America/Denver"); // Denver
    expect(timezoneForZip("98101")).toBe("America/Los_Angeles"); // Seattle
    expect(timezoneForZip("85001")).toBe("America/Phoenix"); // Phoenix — no DST
    expect(timezoneForZip("96813")).toBe("Pacific/Honolulu"); // Honolulu
    expect(timezoneForZip("99501")).toBe("America/Anchorage"); // Anchorage
  });

  it("tolerates formatting — 9-digit ZIP+4, whitespace", () => {
    expect(timezoneForZip("90011-1234")).toBe("America/Los_Angeles");
    expect(timezoneForZip(" 90011 ")).toBe("America/Los_Angeles");
  });

  it("returns null for a malformed or too-short ZIP, never a guess", () => {
    expect(timezoneForZip("")).toBeNull();
    expect(timezoneForZip(null)).toBeNull();
    expect(timezoneForZip(undefined)).toBeNull();
    expect(timezoneForZip("ab")).toBeNull();
    expect(timezoneForZip("9")).toBeNull();
  });

  it("returns null for a deliberately-unmapped ambiguous range rather than guessing", () => {
    // Eastern Tennessee — genuinely split between Central and Eastern at finer granularity than
    // this table maps; left null on purpose rather than risk a wrong hour.
    expect(timezoneForZip("37901")).toBeNull();
  });

  it("returns null for an out-of-range zip3 with no known mapping", () => {
    expect(timezoneForZip("00000")).toBeNull();
  });
});
