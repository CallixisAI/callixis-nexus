import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useDashboardLayout } from "@/hooks/usePageLayout";
import { type TimeframePreset } from "@/components/TimeframeFilter";
import { resolveTimeframeRange } from "@/lib/timeframe";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardGrid, DashboardGridSkeleton } from "@/components/dashboard/DashboardGrid";
import { AddTileSheet } from "@/components/dashboard/AddTileSheet";
import type { TileRenderContext } from "@/components/dashboard/tiles";

// Dashboard tiles plan (docs/dashboard-tiles-plan/README.md) §G.13 — down from 383 lines to
// hooks, two early returns, header, grid. Every number here is unchanged from before this plan;
// this file only decides layout now, not content — see src/components/dashboard/tiles.tsx for
// the (verbatim) per-tile JSX this used to contain directly.

const Dashboard = () => {
  const navigate = useNavigate();
  // Permission-overrides plan Phase 4 §H.5 (docs/permission-overrides-plan/README.md) —
  // dashboard.global_overview, "read-only by nature" (D-3): every holder is `full` except
  // `operator` (`view`), and there's no write action on this page to distinguish them, so
  // presence is the whole gate.
  const { hasPermission } = useAuth();
  const canViewOverview = hasPermission("dashboard.global_overview");

  const [timeframe, setTimeframe] = useState<TimeframePreset>("7d");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const timeframeRange = useMemo(() => resolveTimeframeRange(timeframe, customRange), [timeframe, customRange]);
  const { data, isLoading } = useDashboardStats(timeframeRange);

  const [isCustomizing, setIsCustomizing] = useState(false);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);

  // 🔴 §G.4 — called ABOVE the early returns below, alongside useDashboardStats. Called after
  // one of them, React throws "rendered fewer hooks than expected" the instant loading flips.
  const pageLayout = useDashboardLayout(canViewOverview);

  const handleToggleCustomize = useCallback(() => {
    const next = !isCustomizing;
    // §25/§G.5 — leaving Customize mode flushes any pending debounced save immediately, same as
    // unmounting.
    if (isCustomizing && !next) pageLayout.flush();
    setIsCustomizing(next);
    setIsAddSheetOpen(false);
  }, [isCustomizing, pageLayout]);

  // §F.2's whole point — a prop only re-renders a tile when ITS OWN prop actually changes —
  // needs these two to stay referentially stable across renders that don't touch dashboard data
  // (opening the Add sheet, toggling Customize mode, the header's own gmtTime tick). A fresh
  // object literal here every render would defeat React.memo(DashboardTile) for all 16 tiles.
  // Computed above both early returns below (rules of hooks) — `data` may still be undefined
  // here, hence the null-safe derivation; `ctx` is only ever read once the early returns below
  // have already guaranteed `data` is present.
  const ctx: TileRenderContext | null = useMemo(() => {
    if (!data) return null;
    const { stats, callData, agentPerformance, leadPipelineData, liveAgents, recentActivity } = data;
    return { stats, callData, agentPerformance, leadPipelineData, liveAgents, recentActivity, navigate };
  }, [data, navigate]);
  const availabilityData = useMemo(
    () => ({ stats: { totalCalls: data?.stats.totalCalls ?? 0, leadsTotal: data?.stats.leadsTotal ?? 0 } }),
    [data?.stats.totalCalls, data?.stats.leadsTotal],
  );

  if (isLoading || !data) {
    // §F.15 — the header (independent of dashboard data) plus a skeleton at each visible tile's
    // REAL width, available synchronously from the cache (§E.13) — the page's shape is right
    // before the numbers land, instead of one line of text that then pops into a full layout.
    return (
      <div className="space-y-6 pb-20">
        <DashboardHeader
          engineStatus="idle"
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
          isCustomizing={false}
          onToggleCustomize={() => {}}
          onOpenAddSheet={() => {}}
          isSaving={false}
          syncError={false}
        />
        <DashboardGridSkeleton layout={pageLayout.layout} />
      </div>
    );
  }

  if (!canViewOverview) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Viewing the dashboard needs the Dashboard — Global Overview permission.
      </div>
    );
  }

  // `data` (and therefore `ctx`, derived only from `data` above) is guaranteed non-null past this
  // point — the early return above already covers `!data`.
  return (
    <div className="space-y-6 pb-20">
      <DashboardHeader
        engineStatus={data.stats.engineStatus}
        timeframe={timeframe}
        onTimeframeChange={setTimeframe}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        isCustomizing={isCustomizing}
        onToggleCustomize={handleToggleCustomize}
        onOpenAddSheet={() => setIsAddSheetOpen(true)}
        isSaving={pageLayout.isSaving}
        syncError={pageLayout.syncError}
      />

      <DashboardGrid
        layout={pageLayout.layout}
        isCustomizing={isCustomizing}
        ctx={ctx as TileRenderContext}
        availabilityData={availabilityData}
        onMoveTile={pageLayout.moveTile}
        onSetWidth={pageLayout.setWidth}
        onHide={pageLayout.hide}
        onDragStart={() => setIsAddSheetOpen(false)}
      />

      <AddTileSheet
        open={isAddSheetOpen}
        onOpenChange={setIsAddSheetOpen}
        layout={pageLayout.layout}
        addedTileIds={pageLayout.addedTileIds}
        onShow={pageLayout.show}
        onHide={pageLayout.hide}
        onResetToDefault={pageLayout.resetToDefault}
      />
    </div>
  );
};

export default Dashboard;
