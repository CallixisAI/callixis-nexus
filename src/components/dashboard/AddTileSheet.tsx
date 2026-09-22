import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TILE_ICON_MAP } from "@/components/dashboard/tileIcons";
import { DASHBOARD_TILES, type TileGroup, type TileId } from "@/lib/dashboardTiles";
import type { DashboardLayout } from "@/lib/dashboardLayout";

// Dashboard tiles plan §G items 36-37 — "Add a box". A right-hand Sheet, deliberately not a
// Dialog: the grid stays visible behind it so you watch the tile land when you flip a switch.

const GROUP_ORDER: TileGroup[] = ["Key numbers", "Charts", "Activity"];

interface AddTileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: DashboardLayout;
  addedTileIds: string[];
  onShow: (id: string) => void;
  onHide: (id: string) => void;
  onResetToDefault: () => void;
}

export function AddTileSheet({ open, onOpenChange, layout, addedTileIds, onShow, onHide, onResetToDefault }: AddTileSheetProps) {
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const visibilityById = new Map(layout.tiles.map((t) => [t.id, t.visible]));
  const addedSet = new Set(addedTileIds);

  const tilesByGroup = GROUP_ORDER.map((group) => ({
    group,
    tiles: Object.values(DASHBOARD_TILES)
      .filter((meta) => meta.group === group)
      .sort((a, b) => a.defaultOrder - b.defaultOrder),
  }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add a box</SheetTitle>
          <SheetDescription>Show or hide boxes on your dashboard. Changes save to your account.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {tilesByGroup.map(({ group, tiles }) => (
            <div key={group}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{group}</h3>
              <div className="space-y-1">
                {tiles.map((meta) => {
                  const Icon = TILE_ICON_MAP[meta.icon];
                  const isVisible = visibilityById.get(meta.id) ?? meta.defaultVisible;
                  return (
                    <div key={meta.id} className="flex items-center gap-3 py-2.5">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{meta.title}</span>
                          {addedSet.has(meta.id) && (
                            <Badge variant="outline" className="text-[10px] text-primary border-primary/30 bg-primary/10">New</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{meta.description}</p>
                      </div>
                      <Switch
                        checked={isVisible}
                        onCheckedChange={(checked) => (checked ? onShow(meta.id as TileId) : onHide(meta.id as TileId))}
                        aria-label={`Show ${meta.title}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <Separator className="my-6" />

        {/* §G.37 — deliberately not a top-level button, and behind a confirmation: too easy to
            hit by accident otherwise. Writes immediately, bypassing the usual save debounce. */}
        <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full gap-1.5 text-muted-foreground">
              <RotateCcw className="h-3.5 w-3.5" /> Reset to default
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset dashboard layout?</AlertDialogTitle>
              <AlertDialogDescription>
                Every box goes back to its default size and position, and boxes you've hidden will come back.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onResetToDefault();
                  setResetConfirmOpen(false);
                }}
              >
                Reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
