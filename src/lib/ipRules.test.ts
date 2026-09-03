import { describe, it, expect } from "vitest";
import { normalizeCidrInput } from "./ipRules";

describe("normalizeCidrInput", () => {
  it("appends /32 to a bare IPv4 address", () => {
    expect(normalizeCidrInput("203.0.113.9")).toBe("203.0.113.9/32");
  });

  it("leaves an IPv4 range with an explicit prefix untouched", () => {
    expect(normalizeCidrInput("203.0.113.0/24")).toBe("203.0.113.0/24");
  });

  it("appends /128 to a bare IPv6 address", () => {
    expect(normalizeCidrInput("2001:db8::1")).toBe("2001:db8::1/128");
  });

  it("leaves an IPv6 range with an explicit prefix untouched", () => {
    expect(normalizeCidrInput("2001:db8::/48")).toBe("2001:db8::/48");
  });

  it("trims surrounding whitespace before checking for a prefix", () => {
    expect(normalizeCidrInput("  203.0.113.9  ")).toBe("203.0.113.9/32");
  });
});
