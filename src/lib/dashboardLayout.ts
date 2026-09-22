// Dashboard tiles plan (docs/dashboard-tiles-plan/README.md) §C — the layout model. Pure. No
// React, no database, no charts — this file is deliberately importable by a test with nothing
// else loaded, and by src/hooks/usePageLayout.ts which needs it synchronously in a useState
// initializer (E.13's anti-flash guarantee).
//
// 🔑 Trap 3 (the plan doc's own framing): reconcileLayout takes `specs` as a PARAMETER and never
// imports the real tile registry (src/lib/dashboardTiles.ts) — and it has NO data parameter at
// all. That second fact is load-bearing, not incidental: "hide a tile because it looks empty
// today" is the exact mistake this plan's Trap 3 warns about, and leaving out the parameter makes
// that mistake impossible to write, not just easy to avoid.

export type TileWidth = "sm" | "md" | "lg" | "full";

export const DASHBOARD_LAYOUT_VERSION = 1;

export interface TilePlacement {
  id: string;
  width: TileWidth;
  visible: boolean;
}

export interface DashboardLayout {
  version: number;
  tiles: TilePlacement[];
}

// The only thing the reconciler needs from a registry. Structural, so tests inject a small fake
// spec list instead of the real 16-tile registry (and never pull in recharts/lucide by doing so).
export interface LayoutTileSpec {
  id: string;
  defaultWidth: TileWidth;
  allowedWidths: readonly TileWidth[];
  defaultVisible: boolean;
  defaultOrder: number;
}

export interface ReconcileResult {
  layout: DashboardLayout;
  // True when the reconciled layout differs from what was passed in. §C's own rule: report this,
  // but the CALLER decides whether to persist it — reconcileLayout itself never writes anything.
  changed: boolean;
  // Registry ids that appeared in `stored` but no longer exist — a retired tile, dropped silently.
  droppedTileIds: string[];
  // Registry ids that exist but never appeared in `stored` — a tile shipped after this person's
  // last save. Appended hidden (see reconcileLayout's own comment) so a deploy can never inject a
  // box into someone's curated dashboard.
  addedTileIds: string[];
}

export function defaultLayout(specs: readonly LayoutTileSpec[]): DashboardLayout {
  const tiles = [...specs]
    .sort((a, b) => a.defaultOrder - b.defaultOrder)
    .map((spec) => ({ id: spec.id, width: spec.defaultWidth, visible: spec.defaultVisible }));
  return { version: DASHBOARD_LAYOUT_VERSION, tiles };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The reconciliation rules, exhaustively (plan doc §C item 10 / checklist C.4–C.11):
//   - bad shape, wrong version, or `tiles` not an array           -> defaultLayout(specs)
//   - an entry's id isn't in the registry                         -> drop silently, record it
//   - an entry isn't an object, or its id isn't a string          -> drop
//   - duplicate id                                                -> first occurrence wins
//   - a registry id the stored layout never saw                   -> append at the end,
//     visible:false, EVEN when defaultVisible is true (a curated dashboard must not have a box
//     injected into it on deploy day — brand-new users take the defaultLayout() path above, which
//     DOES honour defaultVisible, so D-1's seven still ship for them)
//   - a tile is visible:true but "looks unavailable" right now    -> never touched (there is no
//     data parameter for this function to consult, so that mistake can't be made — Trap 3)
//   - an unknown width, or one not in that tile's allowedWidths   -> coerce to defaultWidth, KEEP
//     the tile (never lose a tile over a cosmetic field)
//   - visible missing or not a boolean                            -> fall back to defaultVisible
export function reconcileLayout(stored: unknown, specs: readonly LayoutTileSpec[]): ReconcileResult {
  const specById = new Map(specs.map((spec) => [spec.id, spec]));

  if (
    !isPlainObject(stored) ||
    stored.version !== DASHBOARD_LAYOUT_VERSION ||
    !Array.isArray(stored.tiles)
  ) {
    return { layout: defaultLayout(specs), changed: true, droppedTileIds: [], addedTileIds: [] };
  }

  const seen = new Set<string>();
  const droppedTileIds: string[] = [];
  const resultTiles: TilePlacement[] = [];
  let changed = false;

  for (const raw of stored.tiles as unknown[]) {
    if (!isPlainObject(raw) || typeof raw.id !== "string") {
      changed = true;
      continue;
    }
    const { id } = raw;
    const spec = specById.get(id);
    if (!spec) {
      droppedTileIds.push(id);
      changed = true;
      continue;
    }
    if (seen.has(id)) {
      // Duplicate id — first occurrence wins, the rest are dropped silently.
      changed = true;
      continue;
    }
    seen.add(id);

    let width = raw.width;
    if (typeof width !== "string" || !spec.allowedWidths.includes(width as TileWidth)) {
      width = spec.defaultWidth;
      changed = true;
    }

    let visible = raw.visible;
    if (typeof visible !== "boolean") {
      visible = spec.defaultVisible;
      changed = true;
    }

    resultTiles.push({ id, width: width as TileWidth, visible: visible as boolean });
  }

  const addedTileIds: string[] = [];
  const neverSeen = specs
    .filter((spec) => !seen.has(spec.id))
    .sort((a, b) => a.defaultOrder - b.defaultOrder);
  for (const spec of neverSeen) {
    resultTiles.push({ id: spec.id, width: spec.defaultWidth, visible: false });
    addedTileIds.push(spec.id);
    changed = true;
  }

  return {
    layout: { version: DASHBOARD_LAYOUT_VERSION, tiles: resultTiles },
    changed,
    droppedTileIds,
    addedTileIds,
  };
}

function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const copy = items.slice();
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

// 🔑 Reorders within the VISIBLE subsequence and splices the result back into the full array, so
// hidden tiles keep their absolute position. That's what makes re-adding a hidden tile land back
// between the same two neighbours it had before (showTile, below) — if this instead operated on
// the full array, a hidden tile's position would silently drift every time someone dragged
// something else around it.
//
// Returns the SAME object reference on a no-op (same id, or either id not currently visible) so
// callers relying on reference equality (React, this hook's own dirty-check) bail correctly.
export function moveVisibleTile(layout: DashboardLayout, activeId: string, overId: string): DashboardLayout {
  if (activeId === overId) return layout;

  const visibleIndices: number[] = [];
  layout.tiles.forEach((tile, index) => {
    if (tile.visible) visibleIndices.push(index);
  });
  const visibleTiles = visibleIndices.map((index) => layout.tiles[index]);

  const fromPos = visibleTiles.findIndex((tile) => tile.id === activeId);
  const toPos = visibleTiles.findIndex((tile) => tile.id === overId);
  if (fromPos === -1 || toPos === -1 || fromPos === toPos) return layout;

  const reordered = arrayMove(visibleTiles, fromPos, toPos);
  const nextTiles = layout.tiles.slice();
  visibleIndices.forEach((absoluteIndex, k) => {
    nextTiles[absoluteIndex] = reordered[k];
  });

  return { version: layout.version, tiles: nextTiles };
}

export function setTileWidth(
  layout: DashboardLayout,
  id: string,
  width: TileWidth,
  specs: readonly LayoutTileSpec[],
): DashboardLayout {
  const spec = specs.find((s) => s.id === id);
  if (!spec || !spec.allowedWidths.includes(width)) return layout;

  const index = layout.tiles.findIndex((tile) => tile.id === id);
  if (index === -1 || layout.tiles[index].width === width) return layout;

  const nextTiles = layout.tiles.slice();
  nextTiles[index] = { ...nextTiles[index], width };
  return { version: layout.version, tiles: nextTiles };
}

export function hideTile(layout: DashboardLayout, id: string): DashboardLayout {
  const index = layout.tiles.findIndex((tile) => tile.id === id);
  if (index === -1 || !layout.tiles[index].visible) return layout;

  const nextTiles = layout.tiles.slice();
  nextTiles[index] = { ...nextTiles[index], visible: false };
  return { version: layout.version, tiles: nextTiles };
}

// 🔑 Reveals IN PLACE — flips `visible` where the tile already sits in the array — and never
// appends. Appending would destroy "put it back where it was" the moment someone re-adds a tile
// they removed earlier (S.9's own check).
export function showTile(layout: DashboardLayout, id: string): DashboardLayout {
  const index = layout.tiles.findIndex((tile) => tile.id === id);
  if (index === -1 || layout.tiles[index].visible) return layout;

  const nextTiles = layout.tiles.slice();
  nextTiles[index] = { ...nextTiles[index], visible: true };
  return { version: layout.version, tiles: nextTiles };
}

// ---------------------------------------------------------------------------------------------
// The width map — static lookups, never a constructed class string. Tailwind's purger can't see
// `` `lg:col-span-${n}` ``, and a class built that way is dropped from the production CSS (often
// ONLY in a production build — it can look fine under `npm run dev`), leaving an unstyled,
// full-width tile. C.15/tailwind.config.ts's `content` glob already scans this file (E13), so no
// safelist entry is needed as long as every class appears literally, as it does below.
// ---------------------------------------------------------------------------------------------

// 12 columns, not the existing 6 (Dashboard.tsx's old per-section grids). A quarter (`sm`) is
// impossible on a 6-column grid; 12 also reproduces today's chart row exactly
// (`lg:col-span-4` of 6 ≡ 8 of 12), so the default view keeps today's proportions rather than
// merely approximating them. `items-start` is load-bearing (§F item 30's own note): merged into
// one grid, the default `items-stretch` would inflate a 3-column KPI card to match a 280px
// chart's height, since today's separate grids never let that happen.
export const GRID_CONTAINER_CLASS = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-6 items-start";

export const TILE_WIDTH_CLASS: Record<TileWidth, string> = {
  sm: "col-span-1 sm:col-span-1 lg:col-span-3",
  md: "col-span-1 sm:col-span-1 lg:col-span-4",
  lg: "col-span-1 sm:col-span-2 lg:col-span-8",
  full: "col-span-1 sm:col-span-2 lg:col-span-12",
};

// D-3's four snap widths, for the per-tile width menu (§G item 39).
export const TILE_WIDTH_LABEL: Record<TileWidth, string> = {
  sm: "Small · ¼",
  md: "Medium · ⅓",
  lg: "Large · ⅔",
  full: "Full width",
};
