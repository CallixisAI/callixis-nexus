import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X, Maximize2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { TILE_WIDTH_CLASS, TILE_WIDTH_LABEL, type TileWidth } from "@/lib/dashboardLayout";
import { resolveTileVisibility, type TileMeta, type TileAvailabilityData } from "@/lib/dashboardTiles";
import { DASHBOARD_TILE_RENDERERS, type TileRenderContext } from "@/components/dashboard/tiles";

// Dashboard tiles plan §F.3 — the one wrapper every visible tile renders through, whether or not
// Customize mode is on. useSortable is called unconditionally (rules of hooks) — DashboardGrid.tsx
// keeps DndContext/SortableContext mounted at all times, but outside Customize mode no node ever
// gets `{...listeners}` attached (the grip handle simply isn't rendered), so a drag can never
// start (D-2's "exactly as inert as it is today").

interface DashboardTileProps {
  meta: TileMeta;
  width: TileWidth;
  isCustomizing: boolean;
  ctx: TileRenderContext;
  availabilityData: TileAvailabilityData;
  onSetWidth: (id: string, width: TileWidth) => void;
  onHide: (id: string) => void;
}

function DashboardTileInner({ meta, width, isCustomizing, ctx, availabilityData, onSetWidth, onHide }: DashboardTileProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: meta.id,
  });

  // 🔴 Trap 2 defence 1 — CSS.Translate, never CSS.Transform. Transform emits scaleX/scaleY
  // whenever sortable items differ in size (ours deliberately do: sm/md/lg/full), and a scaled
  // ancestor is what makes recharts' ResponsiveContainer mis-measure and settle at height 0.
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const visibility = resolveTileVisibility(meta, availabilityData, isCustomizing);
  if (visibility === "omit") return null;
  const showPlaceholder = visibility === "placeholder";

  const renderer = DASHBOARD_TILE_RENDERERS[meta.id];

  return (
    <div
      ref={setNodeRef}
      style={style}
      // F.4 — min-w-0: grid items default to min-width:auto, so a chart at width="100%" can blow
      // out its column instead of shrinking to it. Today's four separate grids happen to mask
      // this; one merged grid exposes it.
      className={`${TILE_WIDTH_CLASS[width]} min-w-0 relative group ${isDragging ? "z-10 opacity-50" : ""}`}
    >
      {showPlaceholder ? (
        <div className={`bg-card border border-dashed border-border rounded-xl p-5 h-full flex items-center justify-center text-center text-sm text-muted-foreground ${meta.minHeightClass ?? ""}`}>
          {meta.unavailableReason}
        </div>
      ) : (
        renderer(ctx)
      )}

      {isCustomizing && (
        // G.10 — focus-within is mandatory, not decorative: without it these controls are
        // keyboard-unreachable (a mouse hover is the only other way to raise opacity to 100).
        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity z-20">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-7 w-7"
                disabled={meta.allowedWidths.length <= 1}
                title="Resize"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value={width} onValueChange={(next) => onSetWidth(meta.id, next as TileWidth)}>
                {meta.allowedWidths.map((w) => (
                  <DropdownMenuRadioItem key={w} value={w}>
                    {TILE_WIDTH_LABEL[w]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-7 w-7"
            onClick={() => onHide(meta.id)}
            title="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </Button>

          {/* §F item 29 — {...listeners} and setActivatorNodeRef go on the GRIP ONLY. Everything
              else (charts, tooltips, the Currently Dialing scroll list, "View Call Center", the
              two buttons above) stays outside the listener tree. No stopPropagation, no
              data-attribute sniffing. */}
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className="h-7 w-7 flex items-center justify-center rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 cursor-grab active:cursor-grabbing"
            title="Drag to reorder"
            aria-label={`Reorder ${meta.title}`}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export const DashboardTile = React.memo(DashboardTileInner);
