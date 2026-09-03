import type { TimeframePreset } from "@/components/TimeframeFilter";

// Phase 4 (counting-model plan) D.9 — src/components/TimeframeFilter.tsx has been on Dashboard,
// Reports, and Campaigns since before this plan, always fully wired to local `useState`, and
// never once consumed: changing it never changed a single number on screen. This resolves a
// preset (or a custom range) into a concrete [from, to] instant so real call attempts can
// actually be filtered by it. Pure/DB-free, same "src/lib is pure logic, the page wires it up"
// split as src/lib/callPipeline.ts.
export interface TimeframeRange {
  from: Date;
  to: Date;
}

export function resolveTimeframeRange(
  preset: TimeframePreset,
  customRange: { from?: Date; to?: Date } | undefined,
  now: number = Date.now()
): TimeframeRange {
  const to = new Date(now);

  if (preset === "custom" && customRange?.from) {
    return { from: customRange.from, to: customRange.to ?? to };
  }

  const from = new Date(now);
  switch (preset) {
    case "today":
      from.setHours(0, 0, 0, 0);
      break;
    case "7d":
      from.setDate(from.getDate() - 7);
      break;
    case "30d":
      from.setDate(from.getDate() - 30);
      break;
    case "90d":
      from.setDate(from.getDate() - 90);
      break;
    case "ytd":
      from.setMonth(0, 1);
      from.setHours(0, 0, 0, 0);
      break;
    default:
      from.setDate(from.getDate() - 30);
  }
  return { from, to };
}

// Only real call attempts have a call_date at all (debris rows never do — E9) — a null date is
// simply never "within" any timeframe, not an error.
export function isWithinTimeframe(dateStr: string | null | undefined, range: TimeframeRange): boolean {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  return t >= range.from.getTime() && t <= range.to.getTime();
}
