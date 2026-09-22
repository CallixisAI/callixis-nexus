import { describe, it, expect } from "vitest";
import {
  DASHBOARD_LAYOUT_VERSION,
  defaultLayout,
  reconcileLayout,
  moveVisibleTile,
  setTileWidth,
  hideTile,
  showTile,
  type DashboardLayout,
  type LayoutTileSpec,
} from "./dashboardLayout";

// A small, fake 4-tile registry — never the real 16-tile one (src/lib/dashboardTiles.ts). This is
// the whole point of reconcileLayout taking `specs` as a parameter (Trap 3): these tests never
// import recharts or lucide, and never touch live data.
const specs: LayoutTileSpec[] = [
  { id: "a", defaultWidth: "sm", allowedWidths: ["sm", "md"], defaultVisible: true, defaultOrder: 10 },
  { id: "b", defaultWidth: "sm", allowedWidths: ["sm", "md"], defaultVisible: true, defaultOrder: 20 },
  { id: "c", defaultWidth: "md", allowedWidths: ["sm", "md", "lg"], defaultVisible: false, defaultOrder: 30 },
  { id: "d", defaultWidth: "full", allowedWidths: ["full"], defaultVisible: false, defaultOrder: 40 },
];

describe("defaultLayout", () => {
  it("orders tiles by defaultOrder and carries each spec's default width/visibility", () => {
    const layout = defaultLayout(specs);
    expect(layout.version).toBe(DASHBOARD_LAYOUT_VERSION);
    expect(layout.tiles).toEqual([
      { id: "a", width: "sm", visible: true },
      { id: "b", width: "sm", visible: true },
      { id: "c", width: "md", visible: false },
      { id: "d", width: "full", visible: false },
    ]);
  });

  it("orders correctly even when specs are passed out of order", () => {
    const shuffled = [specs[3], specs[0], specs[2], specs[1]];
    expect(defaultLayout(shuffled).tiles.map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("reconcileLayout — corrupt / bad shapes fall back to defaultLayout", () => {
  const bad = [null, undefined, "a string", 42, {}, [], { version: 1 }, { tiles: [] }] as const;

  for (const value of bad) {
    it(`treats ${JSON.stringify(value)} as absent and returns defaultLayout`, () => {
      const result = reconcileLayout(value, specs);
      expect(result.layout).toEqual(defaultLayout(specs));
      expect(result.changed).toBe(true);
      expect(result.droppedTileIds).toEqual([]);
      expect(result.addedTileIds).toEqual([]);
    });
  }

  it("falls back when version doesn't match, even with an otherwise-valid tiles array", () => {
    const result = reconcileLayout({ version: 999, tiles: [{ id: "a", width: "sm", visible: true }] }, specs);
    expect(result.layout).toEqual(defaultLayout(specs));
    expect(result.changed).toBe(true);
  });

  it("falls back when tiles is not an array", () => {
    const result = reconcileLayout({ version: DASHBOARD_LAYOUT_VERSION, tiles: "nope" }, specs);
    expect(result.layout).toEqual(defaultLayout(specs));
  });
});

describe("reconcileLayout — round-trip idempotence", () => {
  it("a layout that's already fully valid comes back unchanged", () => {
    const stored: DashboardLayout = {
      version: DASHBOARD_LAYOUT_VERSION,
      tiles: [
        { id: "b", width: "md", visible: true },
        { id: "a", width: "sm", visible: false },
        { id: "c", width: "lg", visible: true },
        { id: "d", width: "full", visible: false },
      ],
    };
    const result = reconcileLayout(stored, specs);
    expect(result.layout).toEqual(stored);
    expect(result.changed).toBe(false);
    expect(result.droppedTileIds).toEqual([]);
    expect(result.addedTileIds).toEqual([]);
  });

  it("reconciling twice in a row is idempotent", () => {
    const stored = { version: DASHBOARD_LAYOUT_VERSION, tiles: [{ id: "a", width: "bogus", visible: "nope" }] };
    const once = reconcileLayout(stored, specs);
    const twice = reconcileLayout(once.layout, specs);
    expect(twice.layout).toEqual(once.layout);
    expect(twice.changed).toBe(false);
  });
});

describe("reconcileLayout — a fully-reordered layout survives verbatim", () => {
  it("preserves a custom order for all four tiles", () => {
    const stored: DashboardLayout = {
      version: DASHBOARD_LAYOUT_VERSION,
      tiles: [
        { id: "d", width: "full", visible: true },
        { id: "c", width: "sm", visible: true },
        { id: "b", width: "sm", visible: true },
        { id: "a", width: "md", visible: true },
      ],
    };
    const result = reconcileLayout(stored, specs);
    expect(result.layout.tiles.map((t) => t.id)).toEqual(["d", "c", "b", "a"]);
    expect(result.changed).toBe(false);
  });
});

describe("reconcileLayout — unknown / retired ids", () => {
  it("drops an id not in the registry silently and records it in droppedTileIds", () => {
    const stored = {
      version: DASHBOARD_LAYOUT_VERSION,
      tiles: [
        { id: "a", width: "sm", visible: true },
        { id: "retired-tile", width: "sm", visible: true },
      ],
    };
    const result = reconcileLayout(stored, specs);
    expect(result.layout.tiles.some((t) => t.id === "retired-tile")).toBe(false);
    expect(result.droppedTileIds).toEqual(["retired-tile"]);
    expect(result.changed).toBe(true);
  });
});

describe("reconcileLayout — never-seen registry ids are appended hidden", () => {
  it("appends a new tile at the end with visible:false even though its spec says defaultVisible: true", () => {
    // Only "b" ever existed in this stored layout — "a" (defaultVisible: true), "c", "d" are new.
    const stored = { version: DASHBOARD_LAYOUT_VERSION, tiles: [{ id: "b", width: "sm", visible: true }] };
    const result = reconcileLayout(stored, specs);
    const a = result.layout.tiles.find((t) => t.id === "a");
    expect(a).toEqual({ id: "a", width: "sm", visible: false });
    expect(result.layout.tiles[0]).toEqual({ id: "b", width: "sm", visible: true });
  });

  it("appends multiple new ids in defaultOrder, not stored order", () => {
    const stored = { version: DASHBOARD_LAYOUT_VERSION, tiles: [{ id: "b", width: "sm", visible: true }] };
    const result = reconcileLayout(stored, specs);
    // "b" first (it was already there), then the never-seen ones in defaultOrder: a(10), c(30), d(40).
    expect(result.layout.tiles.map((t) => t.id)).toEqual(["b", "a", "c", "d"]);
    expect(result.addedTileIds).toEqual(["a", "c", "d"]);
    expect(result.changed).toBe(true);
  });
});

describe("reconcileLayout — a visible tile is never touched regardless of \"availability\"", () => {
  it("has no data parameter at all — the signature itself makes Trap 3's mistake unrepresentable", () => {
    // reconcileLayout(stored, specs) — two parameters, neither of which is live data. A tile
    // marked visible:true here survives reconciliation completely unexamined; there is nothing
    // this function could consult to decide otherwise.
    expect(reconcileLayout.length).toBe(2);
    const stored = { version: DASHBOARD_LAYOUT_VERSION, tiles: [{ id: "d", width: "full", visible: true }] };
    const result = reconcileLayout(stored, specs);
    expect(result.layout.tiles[0]).toEqual({ id: "d", width: "full", visible: true });
  });
});

describe("reconcileLayout — partially-corrupt entries", () => {
  it("drops an entry that isn't an object", () => {
    const stored = { version: DASHBOARD_LAYOUT_VERSION, tiles: ["not-an-object", 5, null] };
    const result = reconcileLayout(stored, specs);
    // Every entry was junk, so the result is just the never-seen tiles appended in defaultOrder.
    expect(result.layout.tiles.map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
    expect(result.layout.tiles.every((t) => t.visible === false)).toBe(true);
  });

  it("drops an entry whose id isn't a string", () => {
    const stored = { version: DASHBOARD_LAYOUT_VERSION, tiles: [{ id: 42, width: "sm", visible: true }] };
    const result = reconcileLayout(stored, specs);
    expect(result.layout.tiles.find((t) => t.id === "a")?.visible).toBe(false); // appended, not from the bad entry
  });
});

describe("reconcileLayout — bad width is coerced, never dropped", () => {
  it("falls back to defaultWidth when the stored width isn't a known TileWidth", () => {
    const stored = { version: DASHBOARD_LAYOUT_VERSION, tiles: [{ id: "a", width: "huge", visible: true }] };
    const result = reconcileLayout(stored, specs);
    expect(result.layout.tiles[0]).toEqual({ id: "a", width: "sm", visible: true });
    expect(result.changed).toBe(true);
  });

  it("falls back to defaultWidth when the width isn't in that tile's allowedWidths", () => {
    // "d" only allows "full".
    const stored = { version: DASHBOARD_LAYOUT_VERSION, tiles: [{ id: "d", width: "sm", visible: true }] };
    const result = reconcileLayout(stored, specs);
    expect(result.layout.tiles[0]).toEqual({ id: "d", width: "full", visible: true });
  });
});

describe("reconcileLayout — duplicate ids", () => {
  it("keeps only the first occurrence", () => {
    const stored = {
      version: DASHBOARD_LAYOUT_VERSION,
      tiles: [
        { id: "a", width: "sm", visible: true },
        { id: "a", width: "md", visible: false },
      ],
    };
    const result = reconcileLayout(stored, specs);
    expect(result.layout.tiles.filter((t) => t.id === "a")).toEqual([{ id: "a", width: "sm", visible: true }]);
    expect(result.changed).toBe(true);
  });
});

describe("reconcileLayout — missing visible", () => {
  it("falls back to the spec's defaultVisible when visible is absent", () => {
    const stored = { version: DASHBOARD_LAYOUT_VERSION, tiles: [{ id: "c", width: "md" }] };
    const result = reconcileLayout(stored, specs);
    expect(result.layout.tiles[0]).toEqual({ id: "c", width: "md", visible: false }); // spec c: defaultVisible false
  });

  it("falls back to defaultVisible when visible is present but not a boolean", () => {
    const stored = { version: DASHBOARD_LAYOUT_VERSION, tiles: [{ id: "a", width: "sm", visible: "yes" }] };
    const result = reconcileLayout(stored, specs);
    expect(result.layout.tiles[0]).toEqual({ id: "a", width: "sm", visible: true }); // spec a: defaultVisible true
  });
});

describe("moveVisibleTile", () => {
  const layout: DashboardLayout = {
    version: DASHBOARD_LAYOUT_VERSION,
    tiles: [
      { id: "a", width: "sm", visible: true },
      { id: "c", width: "md", visible: false },
      { id: "b", width: "sm", visible: true },
      { id: "d", width: "full", visible: true },
    ],
  };

  it("reorders within the visible subsequence, keeping the hidden tile anchored at its absolute position", () => {
    // Visible order is a, b, d. Move "d" to where "a" is.
    const next = moveVisibleTile(layout, "d", "a");
    expect(next.tiles.map((t) => t.id)).toEqual(["d", "c", "a", "b"]);
    // "c" (hidden) never moved from absolute index 1.
    expect(next.tiles[1]).toEqual({ id: "c", width: "md", visible: false });
  });

  it("returns the same reference on a no-op (same id)", () => {
    expect(moveVisibleTile(layout, "a", "a")).toBe(layout);
  });

  it("returns the same reference when either id isn't currently visible", () => {
    expect(moveVisibleTile(layout, "a", "c")).toBe(layout);
    expect(moveVisibleTile(layout, "c", "a")).toBe(layout);
  });
});

describe("setTileWidth", () => {
  const layout = defaultLayout(specs);

  it("sets an allowed width", () => {
    const next = setTileWidth(layout, "a", "md", specs);
    expect(next.tiles.find((t) => t.id === "a")?.width).toBe("md");
  });

  it("is a no-op (same reference) for a width not in allowedWidths", () => {
    expect(setTileWidth(layout, "d", "sm", specs)).toBe(layout); // "d" only allows "full"
  });

  it("is a no-op for an unknown tile id", () => {
    expect(setTileWidth(layout, "nope", "sm", specs)).toBe(layout);
  });

  it("is a no-op when the width is already set", () => {
    expect(setTileWidth(layout, "a", "sm", specs)).toBe(layout);
  });
});

describe("hideTile / showTile", () => {
  it("hideTile flips visible to false and is a no-op if already hidden", () => {
    const layout = defaultLayout(specs);
    const hidden = hideTile(layout, "a");
    expect(hidden.tiles.find((t) => t.id === "a")?.visible).toBe(false);
    expect(hideTile(hidden, "a")).toBe(hidden);
  });

  it("showTile reveals IN PLACE rather than appending, and is a no-op if already visible", () => {
    const layout = defaultLayout(specs); // c and d start hidden, at positions 2 and 3
    const shown = showTile(layout, "c");
    expect(shown.tiles.map((t) => t.id)).toEqual(["a", "b", "c", "d"]); // position unchanged
    expect(shown.tiles[2]).toEqual({ id: "c", width: "md", visible: true });
    expect(showTile(shown, "c")).toBe(shown);
  });

  it("showTile on an unknown id is a no-op", () => {
    const layout = defaultLayout(specs);
    expect(showTile(layout, "nope")).toBe(layout);
  });
});

describe("all four mutation helpers return the same reference on a no-op", () => {
  it("so React can bail the render", () => {
    const layout = defaultLayout(specs);
    expect(setTileWidth(layout, "a", "sm", specs)).toBe(layout);
    expect(hideTile(layout, "a") === layout).toBe(false); // "a" starts visible, so this IS a change
    expect(showTile(layout, "a")).toBe(layout); // "a" already visible
    expect(moveVisibleTile(layout, "a", "a")).toBe(layout);
  });
});
