import { useEffect, useState } from "react";
import { Settings2, Check, Plus, Loader2, CloudOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TimeframeFilter, type TimeframePreset } from "@/components/TimeframeFilter";
import { ENGINE_STATUS_LABEL, type EngineStatus } from "@/lib/callPipeline";
import { DemoModeToggle } from "@/components/DemoModeToggle";

// Dashboard tiles plan §G — the chrome. §G.1: the hero header stays pinned — not a tile, not
// removable, outside DndContext. It holds TimeframeFilter (the page's only data control), the
// engine-status pill, the page's <h1>, and the Customize button itself, which cannot be made
// removable without also removing the only way back out of Customize mode.
//
// §G.3 — gmtTime and its 60s setInterval live HERE, not in Dashboard.tsx. Left on the page, that
// tick would re-render Dashboard -> DashboardGrid every minute and churn prop identity across all
// 16 memoized tiles for no reason; contained here, it re-renders only this header.

interface DashboardHeaderProps {
  engineStatus: EngineStatus;
  timeframe: TimeframePreset;
  onTimeframeChange: (value: TimeframePreset) => void;
  customRange: { from?: Date; to?: Date };
  onCustomRangeChange: (value: { from?: Date; to?: Date }) => void;
  isCustomizing: boolean;
  onToggleCustomize: () => void;
  onOpenAddSheet: () => void;
  isSaving: boolean;
  syncError: boolean;
}

export function DashboardHeader({
  engineStatus,
  timeframe,
  onTimeframeChange,
  customRange,
  onCustomRangeChange,
  isCustomizing,
  onToggleCustomize,
  onOpenAddSheet,
  isSaving,
  syncError,
}: DashboardHeaderProps) {
  const [gmtTime, setGmtTime] = useState("");

  useEffect(() => {
    const tick = () => {
      setGmtTime(new Date().toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }));
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);

  const engineDotClass = engineStatus === "online" ? "bg-primary" : engineStatus === "stalled" ? "bg-destructive" : "bg-muted-foreground";
  const engineTextClass = engineStatus === "online" ? "text-primary" : engineStatus === "stalled" ? "text-destructive" : "text-muted-foreground";
  const engineBadgeClass = engineStatus === "online" ? "bg-primary/10 border-primary/20" : engineStatus === "stalled" ? "bg-destructive/10 border-destructive/20" : "bg-muted/50 border-border";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${engineBadgeClass}`}>
              <span className="relative flex h-2 w-2">
                {engineStatus === "online" && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${engineDotClass}`} />
              </span>
              <span className={`text-[10px] font-medium uppercase tracking-widest ${engineTextClass}`}>{ENGINE_STATUS_LABEL[engineStatus]}</span>
            </div>
            <Badge variant="outline" className="text-[10px] text-muted-foreground font-mono">UTC · {gmtTime}</Badge>
          </div>
          <h1 className="text-3xl font-bold text-foreground font-body tracking-tight">Your Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">Live summary of campaigns, calls, revenue, and agent activity.</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <DemoModeToggle />
          {isCustomizing && (
            <>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {isSaving ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                  </>
                ) : syncError ? (
                  <>
                    <CloudOff className="h-3 w-3 text-destructive" /> Saved on this device only
                  </>
                ) : (
                  "Saved to your account"
                )}
              </span>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={onOpenAddSheet}>
                <Plus className="h-3.5 w-3.5" /> Add a box
              </Button>
            </>
          )}
          <Button
            variant={isCustomizing ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={onToggleCustomize}
          >
            {isCustomizing ? <Check className="h-3.5 w-3.5" /> : <Settings2 className="h-3.5 w-3.5" />}
            {isCustomizing ? "Done" : "Customize"}
          </Button>
          <TimeframeFilter value={timeframe} onChange={onTimeframeChange} customRange={customRange} onCustomRangeChange={onCustomRangeChange} />
        </div>
      </div>
    </div>
  );
}
