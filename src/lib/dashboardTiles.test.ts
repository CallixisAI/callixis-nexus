import { describe, it, expect } from "vitest";
import { DASHBOARD_TILES, DASHBOARD_TILE_SPECS, DEFAULT_VISIBLE_TILE_IDS, resolveTileVisibility, type TileId } from "./dashboardTiles";

// Dashboard tiles plan §D.11 — parity checks, modelled on src/lib/permissions.parity.test.ts's
// shape but pure (no DB — this registry has no live counterpart to drift against, only itself).

describe("DASHBOARD_TILES — internal consistency", () => {
  const tiles = Object.values(DASHBOARD_TILES);

  it("has exactly 16 tiles", () => {
    expect(tiles).toHaveLength(16);
  });

  it("every Record key matches its own tile's id (catches a copy-paste key/id mismatch)", () => {
    for (const [key, meta] of Object.entries(DASHBOARD_TILES)) {
      expect(meta.id).toBe(key as TileId);
    }
  });

  it("every tile's allowedWidths is non-empty and contains its own defaultWidth", () => {
    for (const meta of tiles) {
      expect(meta.allowedWidths.length).toBeGreaterThan(0);
      expect(meta.allowedWidths).toContain(meta.defaultWidth);
    }
  });

  it("defaultOrder values are unique", () => {
    const orders = tiles.map((t) => t.defaultOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("defaultOrder is spaced by 10, from 10 to 160", () => {
    const orders = tiles.map((t) => t.defaultOrder).sort((a, b) => a - b);
    expect(orders).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160]);
  });

  it("exactly the D-1 seven are defaultVisible — a spec-lock, not derived", () => {
    const actuallyVisible = tiles.filter((t) => t.defaultVisible).map((t) => t.id).sort();
    expect(actuallyVisible).toEqual([...DEFAULT_VISIBLE_TILE_IDS].sort());
    expect(actuallyVisible).toHaveLength(7);
  });

  it("strip.leads-called only allows full width (its resize menu is disabled)", () => {
    expect(DASHBOARD_TILES["strip.leads-called"].allowedWidths).toEqual(["full"]);
  });

  it("no chart-shaped tile ever allows \"sm\" — a quarter-width chart is illegible", () => {
    const chartIds: TileId[] = ["chart.call-volume", "chart.lead-pipeline", "chart.industry-performance"];
    for (const id of chartIds) {
      expect(DASHBOARD_TILES[id].allowedWidths).not.toContain("sm");
    }
  });

  it("every chart tile has a minHeightClass floor (Trap 2's defence)", () => {
    const chartIds: TileId[] = ["chart.call-volume", "chart.lead-pipeline", "chart.industry-performance"];
    for (const id of chartIds) {
      expect(DASHBOARD_TILES[id].minHeightClass).toBeTruthy();
    }
  });

  it("only the two conditional groups (E2) carry isAvailable", () => {
    const withAvailability = tiles.filter((t) => t.isAvailable).map((t) => t.id).sort();
    expect(withAvailability).toEqual(
      [
        "kpi.connect-rate",
        "kpi.avg-call-duration",
        "kpi.qualified-rate",
        "kpi.cost-per-qualified-lead",
        "strip.leads-called",
      ].sort(),
    );
  });

  it("the 4 call-quality KPIs degrade to a placeholder; the leads strip hides entirely", () => {
    const callQualityIds: TileId[] = [
      "kpi.connect-rate",
      "kpi.avg-call-duration",
      "kpi.qualified-rate",
      "kpi.cost-per-qualified-lead",
    ];
    for (const id of callQualityIds) {
      expect(DASHBOARD_TILES[id].whenUnavailable).toBe("placeholder");
      expect(DASHBOARD_TILES[id].isAvailable!({ stats: { totalCalls: 0, leadsTotal: 0 } })).toBe(false);
      expect(DASHBOARD_TILES[id].isAvailable!({ stats: { totalCalls: 1, leadsTotal: 0 } })).toBe(true);
    }
    expect(DASHBOARD_TILES["strip.leads-called"].whenUnavailable).toBe("hide");
    expect(DASHBOARD_TILES["strip.leads-called"].isAvailable!({ stats: { totalCalls: 0, leadsTotal: 0 } })).toBe(false);
    expect(DASHBOARD_TILES["strip.leads-called"].isAvailable!({ stats: { totalCalls: 0, leadsTotal: 1 } })).toBe(true);
  });

  it("groups only ever take the three documented values", () => {
    for (const meta of tiles) {
      expect(["Key numbers", "Charts", "Activity"]).toContain(meta.group);
    }
  });
});

describe("resolveTileVisibility (§D.9 / §F.12)", () => {
  const available = { stats: { totalCalls: 5, leadsTotal: 5 } };
  const unavailable = { stats: { totalCalls: 0, leadsTotal: 0 } };

  it("renders a tile with no isAvailable regardless of data", () => {
    expect(resolveTileVisibility(DASHBOARD_TILES["chart.call-volume"], unavailable, false)).toBe("render");
  });

  it("renders an available conditional tile normally", () => {
    expect(resolveTileVisibility(DASHBOARD_TILES["kpi.connect-rate"], available, false)).toBe("render");
  });

  it("shows a placeholder for an unavailable 'placeholder' tile, in or out of Customize mode", () => {
    expect(resolveTileVisibility(DASHBOARD_TILES["kpi.connect-rate"], unavailable, false)).toBe("placeholder");
    expect(resolveTileVisibility(DASHBOARD_TILES["kpi.connect-rate"], unavailable, true)).toBe("placeholder");
  });

  it("omits an unavailable 'hide' tile outside Customize mode, but placeholders it inside", () => {
    expect(resolveTileVisibility(DASHBOARD_TILES["strip.leads-called"], unavailable, false)).toBe("omit");
    expect(resolveTileVisibility(DASHBOARD_TILES["strip.leads-called"], unavailable, true)).toBe("placeholder");
  });

  it("renders a 'hide' tile normally once it becomes available", () => {
    expect(resolveTileVisibility(DASHBOARD_TILES["strip.leads-called"], available, false)).toBe("render");
  });
});

describe("DASHBOARD_TILE_SPECS — derived, not hand-written twice", () => {
  it("has one spec per tile, matching the registry's own values", () => {
    expect(DASHBOARD_TILE_SPECS).toHaveLength(16);
    for (const spec of DASHBOARD_TILE_SPECS) {
      const meta = DASHBOARD_TILES[spec.id];
      expect(spec.defaultWidth).toBe(meta.defaultWidth);
      expect(spec.allowedWidths).toBe(meta.allowedWidths); // same reference — derived, not copied
      expect(spec.defaultVisible).toBe(meta.defaultVisible);
      expect(spec.defaultOrder).toBe(meta.defaultOrder);
    }
  });
});
