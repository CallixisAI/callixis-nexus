import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { GRID_CONTAINER_CLASS, TILE_WIDTH_CLASS, type DashboardLayout, type TileWidth } from "@/lib/dashboardLayout";
import { DASHBOARD_TILES, resolveTileVisibility, type TileAvailabilityData, type TileId } from "@/lib/dashboardTiles";
import { DashboardTile } from "@/components/dashboard/DashboardTile";
import type { TileRenderContext } from "@/components/dashboard/tiles";

// Dashboard tiles plan §F — the grid. DndContext/SortableContext stay mounted whether or not
// Customize mode is on (D-2's inertness comes from the grip handle simply not being rendered
// outside it — see DashboardTile.tsx — not from tearing this whole tree down and rebuilding it).

interface DashboardGridProps {
  layout: DashboardLayout;
  isCustomizing: boolean;
  ctx: TileRenderContext;
  availabilityData: TileAvailabilityData;
  onMoveTile: (activeId: string, overId: string) => void;
  onSetWidth: (id: string, width: TileWidth) => void;
  onHide: (id: string) => void;
  // §G item 40 — onDragStart must close the Add sheet; its focus trap fights an in-progress
  // keyboard drag.
  onDragStart?: () => void;
}

function metaFor(id: string) {
  return DASHBOARD_TILES[id as TileId] as (typeof DASHBOARD_TILES)[TileId] | undefined;
}

export function DashboardGrid({
  layout,
  isCustomizing,
  ctx,
  availabilityData,
  onMoveTile,
  onSetWidth,
  onHide,
  onDragStart,
}: DashboardGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // 🔴 F.5 — a movement THRESHOLD, never a delay. A delay-based constraint swallows the first N
  // ms of every pointer interaction in the whole subtree, which is what would make chart
  // tooltips and the "View Call Center" button feel dead. 6px releases instantly on a plain
  // click and can't be triggered by one.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visibleTiles = layout.tiles.filter((t) => t.visible);
  // 🔑 F.12 — the visible subsequence that's ACTUALLY rendered right now, not just "visible" per
  // the stored layout. A tile omitted by resolveTileVisibility has no DOM node; dnd-kit needs
  // exactly one item per id in this list, or its position math breaks.
  const sortableIds = visibleTiles
    .filter((t) => {
      const meta = metaFor(t.id);
      return meta ? resolveTileVisibility(meta, availabilityData, isCustomizing) !== "omit" : false;
    })
    .map((t) => t.id);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    onDragStart?.();
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onMoveTile(String(active.id), String(over.id));
    }
  };

  const activeMeta = activeId ? metaFor(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {/* F.11 — closestCenter, not rectIntersection: rectIntersection fails to register when a
          3-column tile is dragged over a 12-column tile's edge. */}
      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        <div className={GRID_CONTAINER_CLASS}>
          {visibleTiles.map((tile) => {
            const meta = metaFor(tile.id);
            if (!meta) return null; // reconcileLayout already drops unknown ids; never crash the grid over it
            return (
              <DashboardTile
                key={tile.id}
                meta={meta}
                width={tile.width}
                isCustomizing={isCustomizing}
                ctx={ctx}
                availabilityData={availabilityData}
                onSetWidth={onSetWidth}
                onHide={onHide}
              />
            );
          })}
        </div>
      </SortableContext>

      {/* Trap 2 defences 2 & 3 — a lightweight, chart-free preview (no recharts tree is ever
          inside the element that moves), and no drop animation (which re-mounts a scaled clone
          at the drop site — the identical hazard through a different door). */}
      <DragOverlay dropAnimation={null}>
        {activeMeta ? (
          <div className="rounded-xl border border-primary/40 bg-card shadow-lg px-4 py-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            {activeMeta.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// §F.15 — a loading skeleton at each visible tile's REAL width, so the page's shape is correct
// before the data lands. Possible because the reconciled layout is available synchronously from
// the cache (§E.13) — this is the single biggest visible payoff of the write-through cache.
export function DashboardGridSkeleton({ layout }: { layout: DashboardLayout }) {
  const visibleTiles = layout.tiles.filter((t) => t.visible);
  return (
    <div className={GRID_CONTAINER_CLASS}>
      {visibleTiles.map((tile) => {
        const meta = metaFor(tile.id);
        if (!meta) return null;
        return (
          <div key={tile.id} className={`${TILE_WIDTH_CLASS[tile.width]} min-w-0`}>
            <Skeleton className={`w-full rounded-xl ${meta.minHeightClass ?? "h-28"}`} />
          </div>
        );
      })}
    </div>
  );
}
