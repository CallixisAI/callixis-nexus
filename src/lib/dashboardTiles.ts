// Dashboard tiles plan §D — the tile registry. `import type` only, so this file stays
// runtime-pure: no recharts, no lucide, no React. That's what lets dashboardLayout.test.ts and
// dashboardTiles.test.ts (below) run instantly with nothing heavy loaded, and it's what lets
// src/hooks/usePageLayout.ts reconcile a layout synchronously in a useState initializer
// (E.13) without pulling in every chart tile's dependencies just to know its width and order.
//
// `icon` is a NAME (TileIconName), not a component reference — resolving it to an actual lucide
// component happens in src/components/dashboard/tileIcons.tsx, the one place in this feature
// allowed to import lucide-react for real.

import type { TileWidth, LayoutTileSpec } from "./dashboardLayout";

export type TileId =
  | "kpi.total-calls"
  | "kpi.active-leads"
  | "kpi.conversion"
  | "kpi.revenue"
  | "kpi.ai-agents"
  | "kpi.avg-time-to-first-call"
  | "kpi.connect-rate"
  | "kpi.avg-call-duration"
  | "kpi.qualified-rate"
  | "kpi.cost-per-qualified-lead"
  | "strip.leads-called"
  | "chart.call-volume"
  | "chart.lead-pipeline"
  | "chart.industry-performance"
  | "list.currently-dialing"
  | "stream.activity";

export type TileGroup = "Key numbers" | "Charts" | "Activity";

export type TileIconName =
  | "Phone"
  | "Users"
  | "TrendingUp"
  | "DollarSign"
  | "Bot"
  | "Clock"
  | "PhoneCall"
  | "Target"
  | "ListChecks"
  | "AreaChart"
  | "PieChart"
  | "BarChart3"
  | "Radio"
  | "Sparkles";

// The minimal shape isAvailable() needs — deliberately NOT the full DashboardData from
// useDashboardStats.ts (this file imports nothing at all, runtime-pure by design). Only the two
// fields the two conditional tile groups actually branch on (E2).
export interface TileAvailabilityData {
  stats: {
    totalCalls: number;
    leadsTotal: number;
  };
}

export interface TileMeta {
  id: TileId;
  title: string;
  description: string; // one line, shown in the "Add a box" panel
  group: TileGroup;
  icon: TileIconName;
  defaultWidth: TileWidth;
  allowedWidths: readonly TileWidth[];
  defaultVisible: boolean;
  defaultOrder: number;
  // Trap 2's floor — every chart tile gets one, so a mis-measured ResponsiveContainer still has
  // somewhere to be instead of collapsing to height 0.
  minHeightClass?: string;
  // §D.9 — deliberately has NO data-dependent behaviour baked into reconcileLayout; this is
  // read only at RENDER time by DashboardTile.tsx, and in Customize mode is always overridden to
  // "show a placeholder anyway" — a tile you can't see is a tile you can't move or remove.
  isAvailable?: (data: TileAvailabilityData) => boolean;
  whenUnavailable?: "hide" | "placeholder";
  unavailableReason?: string;
}

const CALL_QUALITY_UNAVAILABLE_REASON =
  "No calls yet in this timeframe. Connect rate, duration, and cost-per-lead will appear here once the dispatcher starts placing calls.";
const callQualityIsAvailable = (data: TileAvailabilityData) => data.stats.totalCalls > 0;

// A `Record<TileId, TileMeta>`, NOT an array (D.2's own 🔑) — forgetting a tile here is then a
// `tsc` error (an incomplete Record literal fails to compile) rather than a silent hole in the
// Add-a-box panel that nobody notices until a client asks where a tile went.
export const DASHBOARD_TILES: Record<TileId, TileMeta> = {
  "kpi.total-calls": {
    id: "kpi.total-calls",
    title: "Total Calls",
    description: "Real call attempts, and how many campaigns are active.",
    group: "Key numbers",
    icon: "Phone",
    defaultWidth: "sm",
    allowedWidths: ["sm", "md"],
    defaultVisible: true,
    defaultOrder: 10,
  },
  "kpi.active-leads": {
    id: "kpi.active-leads",
    title: "Active Leads",
    description: "Leads marked qualified from a real call.",
    group: "Key numbers",
    icon: "Users",
    defaultWidth: "sm",
    allowedWidths: ["sm", "md"],
    defaultVisible: true,
    defaultOrder: 20,
  },
  "kpi.conversion": {
    id: "kpi.conversion",
    title: "Conversion",
    description: "Completed-call conversion rate.",
    group: "Key numbers",
    icon: "TrendingUp",
    defaultWidth: "sm",
    allowedWidths: ["sm", "md"],
    defaultVisible: true,
    defaultOrder: 30,
  },
  "kpi.revenue": {
    id: "kpi.revenue",
    title: "Revenue",
    description: "Estimated from stored calls.",
    group: "Key numbers",
    icon: "DollarSign",
    defaultWidth: "sm",
    allowedWidths: ["sm", "md"],
    defaultVisible: true,
    defaultOrder: 40,
  },
  "kpi.ai-agents": {
    id: "kpi.ai-agents",
    title: "AI Agents",
    description: "Agents that aren't idle right now.",
    group: "Key numbers",
    icon: "Bot",
    defaultWidth: "sm",
    allowedWidths: ["sm", "md"],
    defaultVisible: false,
    defaultOrder: 50,
  },
  "kpi.avg-time-to-first-call": {
    id: "kpi.avg-time-to-first-call",
    title: "Avg Time to First Call",
    description: "Lead created → first call, averaged.",
    group: "Key numbers",
    icon: "Clock",
    defaultWidth: "sm",
    allowedWidths: ["sm", "md"],
    defaultVisible: false,
    defaultOrder: 60,
  },
  "kpi.connect-rate": {
    id: "kpi.connect-rate",
    title: "Connect Rate",
    description: "Reached vs. no-answer/voicemail.",
    group: "Key numbers",
    icon: "PhoneCall",
    defaultWidth: "sm",
    allowedWidths: ["sm", "md"],
    defaultVisible: false,
    defaultOrder: 70,
    isAvailable: callQualityIsAvailable,
    whenUnavailable: "placeholder",
    unavailableReason: CALL_QUALITY_UNAVAILABLE_REASON,
  },
  "kpi.avg-call-duration": {
    id: "kpi.avg-call-duration",
    title: "Avg Call Duration",
    description: "Among calls that connected.",
    group: "Key numbers",
    icon: "Clock",
    defaultWidth: "sm",
    allowedWidths: ["sm", "md"],
    defaultVisible: false,
    defaultOrder: 80,
    isAvailable: callQualityIsAvailable,
    whenUnavailable: "placeholder",
    unavailableReason: CALL_QUALITY_UNAVAILABLE_REASON,
  },
  "kpi.qualified-rate": {
    id: "kpi.qualified-rate",
    title: "Qualified Rate",
    description: "Of real call attempts.",
    group: "Key numbers",
    icon: "Target",
    defaultWidth: "sm",
    allowedWidths: ["sm", "md"],
    defaultVisible: false,
    defaultOrder: 90,
    isAvailable: callQualityIsAvailable,
    whenUnavailable: "placeholder",
    unavailableReason: CALL_QUALITY_UNAVAILABLE_REASON,
  },
  "kpi.cost-per-qualified-lead": {
    id: "kpi.cost-per-qualified-lead",
    title: "Cost / Qualified Lead",
    description: "Vapi spend per qualified lead.",
    group: "Key numbers",
    icon: "DollarSign",
    defaultWidth: "sm",
    allowedWidths: ["sm", "md"],
    defaultVisible: false,
    defaultOrder: 100,
    isAvailable: callQualityIsAvailable,
    whenUnavailable: "placeholder",
    unavailableReason: CALL_QUALITY_UNAVAILABLE_REASON,
  },
  "strip.leads-called": {
    id: "strip.leads-called",
    title: "Leads Called",
    description: "How many of your leads have been called so far.",
    group: "Key numbers",
    icon: "ListChecks",
    defaultWidth: "full",
    allowedWidths: ["full"], // menu disabled — a horizontal strip at quarter width is unreadable
    defaultVisible: true,
    defaultOrder: 110,
    isAvailable: (data) => data.stats.leadsTotal > 0,
    whenUnavailable: "hide", // matches today exactly — no leads, no strip, no placeholder either
    unavailableReason: "No leads yet. Upload leads to a campaign to see this strip.",
  },
  "chart.call-volume": {
    id: "chart.call-volume",
    title: "Call Volume & Conversions",
    description: "Recent actual call activity, as an area chart.",
    group: "Charts",
    icon: "AreaChart",
    defaultWidth: "lg",
    // 🔑 No "sm" — a quarter-width area chart is illegible. This tile already has its own
    // correct internal empty state (Dashboard.tsx's original `stats.totalCalls > 0` ternary,
    // lifted verbatim into tiles.tsx), so it needs no isAvailable/whenUnavailable here.
    allowedWidths: ["md", "lg", "full"],
    defaultVisible: true,
    defaultOrder: 120,
    minHeightClass: "min-h-[360px]",
  },
  "chart.lead-pipeline": {
    id: "chart.lead-pipeline",
    title: "Lead Pipeline",
    description: "Where every lead in your account stands right now.",
    group: "Charts",
    icon: "PieChart",
    defaultWidth: "md",
    // Deliberately excludes "sm" too, despite being a compact donut: the legend below it is up
    // to 5 rows, which doesn't fit a quarter-width column any better than the bar/area charts do.
    allowedWidths: ["md", "lg"],
    defaultVisible: true,
    defaultOrder: 130,
    minHeightClass: "min-h-[340px]",
  },
  "chart.industry-performance": {
    id: "chart.industry-performance",
    title: "Industry Performance",
    description: "Top industries by leads, derived from campaign and call data.",
    group: "Charts",
    icon: "BarChart3",
    defaultWidth: "lg",
    allowedWidths: ["md", "lg", "full"],
    defaultVisible: false,
    defaultOrder: 140,
    minHeightClass: "min-h-[360px]",
  },
  "list.currently-dialing": {
    id: "list.currently-dialing",
    title: "Currently Dialing",
    description: "Real leads mid-call right now.",
    group: "Activity",
    icon: "Radio",
    defaultWidth: "md",
    allowedWidths: ["sm", "md", "lg"],
    defaultVisible: false,
    defaultOrder: 150,
  },
  "stream.activity": {
    id: "stream.activity",
    title: "Activity Stream",
    description: "Latest events from stored call activity.",
    group: "Activity",
    icon: "Sparkles",
    defaultWidth: "full",
    allowedWidths: ["md", "lg", "full"],
    defaultVisible: false,
    defaultOrder: 160,
  },
};

// D-1's seven — the leaner first-load default. Kept as an explicit, independently-readable list
// (rather than only ever derived from DASHBOARD_TILES) so dashboardTiles.test.ts can lock it: if
// this list and the registry's own defaultVisible flags ever disagree, that's exactly the kind of
// drift this test exists to catch.
export const DEFAULT_VISIBLE_TILE_IDS: readonly TileId[] = [
  "kpi.total-calls",
  "kpi.active-leads",
  "kpi.conversion",
  "kpi.revenue",
  "strip.leads-called",
  "chart.call-volume",
  "chart.lead-pipeline",
];

// §D.9 / §F.12 — the one decision of "does this tile render its real content, a placeholder, or
// nothing at all right now", shared by DashboardTile.tsx (what to draw) and DashboardGrid.tsx
// (what belongs in SortableContext's `items` — a hidden-when-unavailable tile that's currently
// omitted has no DOM node, so it must not be in that list either, or dnd-kit's position
// calculations break). One function, not two independent copies that could drift.
export type TileVisibility = "render" | "placeholder" | "omit";

export function resolveTileVisibility(
  meta: TileMeta,
  data: TileAvailabilityData,
  isCustomizing: boolean,
): TileVisibility {
  const available = meta.isAvailable ? meta.isAvailable(data) : true;
  if (available) return "render";
  // In Customize mode, always show SOMETHING for a visible tile — a tile you can't see is a
  // tile you can't move or remove (§D.9's own 🔑).
  if (meta.whenUnavailable === "placeholder" || isCustomizing) return "placeholder";
  return "omit";
}

// D.10 — derived from DASHBOARD_TILES, never hand-written twice.
export const DASHBOARD_TILE_SPECS: LayoutTileSpec[] = (Object.values(DASHBOARD_TILES) as TileMeta[])
  .map((meta) => ({
    id: meta.id,
    defaultWidth: meta.defaultWidth,
    allowedWidths: meta.allowedWidths,
    defaultVisible: meta.defaultVisible,
    defaultOrder: meta.defaultOrder,
  }));
