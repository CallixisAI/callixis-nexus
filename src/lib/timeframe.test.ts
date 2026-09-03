import { describe, it, expect } from "vitest";
import { resolveTimeframeRange, isWithinTimeframe } from "./timeframe";

const NOW = new Date("2026-09-15T12:00:00Z").getTime();

describe("resolveTimeframeRange", () => {
  it("resolves '7d' to a 7-day window ending now", () => {
    const range = resolveTimeframeRange("7d", undefined, NOW);
    expect(range.to.getTime()).toBe(NOW);
    expect(range.from.getTime()).toBe(NOW - 7 * 24 * 60 * 60_000);
  });

  it("resolves 'today' to midnight through now", () => {
    const range = resolveTimeframeRange("today", undefined, NOW);
    expect(range.from.getHours()).toBe(0);
    expect(range.from.getMinutes()).toBe(0);
    expect(range.to.getTime()).toBe(NOW);
  });

  it("uses the custom range when preset is 'custom' and a from date was picked", () => {
    const from = new Date("2026-08-01T00:00:00Z");
    const to = new Date("2026-08-10T00:00:00Z");
    const range = resolveTimeframeRange("custom", { from, to }, NOW);
    expect(range.from).toBe(from);
    expect(range.to).toBe(to);
  });

  it("falls back to now as the end of a custom range with no 'to' picked yet", () => {
    const from = new Date("2026-08-01T00:00:00Z");
    const range = resolveTimeframeRange("custom", { from }, NOW);
    expect(range.from).toBe(from);
    expect(range.to.getTime()).toBe(NOW);
  });

  it("falls back to 30 days when 'custom' is selected but no range picked yet", () => {
    const range = resolveTimeframeRange("custom", undefined, NOW);
    expect(range.from.getTime()).toBe(NOW - 30 * 24 * 60 * 60_000);
  });
});

describe("isWithinTimeframe", () => {
  const range = resolveTimeframeRange("7d", undefined, NOW);

  it("is false for a null/undefined date — debris rows never have one (E9)", () => {
    expect(isWithinTimeframe(null, range)).toBe(false);
    expect(isWithinTimeframe(undefined, range)).toBe(false);
  });

  it("is true for a date inside the window, false for one outside it", () => {
    expect(isWithinTimeframe(new Date(NOW - 24 * 60 * 60_000).toISOString(), range)).toBe(true);
    expect(isWithinTimeframe(new Date(NOW - 10 * 24 * 60 * 60_000).toISOString(), range)).toBe(false);
  });
});
