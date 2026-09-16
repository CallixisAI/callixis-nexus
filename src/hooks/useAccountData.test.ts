import { describe, it, expect, vi } from "vitest";
import { fetchAllRows, PAGE_SIZE } from "./useAccountData";

// lead-enrichment plan — added 2026-09-16 after a real account's `leads` table (2,101 rows) was
// silently truncated to 1,000 by this project's Supabase/PostgREST default row cap. fetchAllRows
// is the fix: page with .range() until a short page proves there's nothing left, rather than
// trusting a single unpaginated request to return everything.

function makePages<T>(pages: T[][]) {
  const calls: Array<[number, number]> = [];
  const page = vi.fn(async (from: number, to: number) => {
    calls.push([from, to]);
    const index = Math.floor(from / PAGE_SIZE);
    return { data: pages[index] ?? [], error: null };
  });
  return { page, calls };
}

describe("fetchAllRows", () => {
  it("returns everything in a single short page without a second request", async () => {
    const { page, calls } = makePages([[{ id: 1 }, { id: 2 }, { id: 3 }]]);
    const rows = await fetchAllRows(page);
    expect(rows).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(calls).toEqual([[0, PAGE_SIZE - 1]]);
  });

  it("keeps paging while a page comes back exactly full, stopping on the first short page", async () => {
    const fullPage = Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i }));
    const lastPage = [{ id: PAGE_SIZE }, { id: PAGE_SIZE + 1 }]; // the real-world 2,101 shape (2×1000 + 101 rounded down for this test)
    const { page, calls } = makePages([fullPage, lastPage]);
    const rows = await fetchAllRows(page);
    expect(rows).toHaveLength(PAGE_SIZE + 2);
    expect(calls).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, PAGE_SIZE * 2 - 1],
    ]);
  });

  it("stops immediately on an empty first page rather than looping forever", async () => {
    const { page, calls } = makePages([[]]);
    const rows = await fetchAllRows(page);
    expect(rows).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("propagates an error instead of silently returning a partial result", async () => {
    const page = vi.fn(async () => ({ data: null, error: { message: "boom", details: "", hint: "", code: "500", name: "PostgrestError" } }));
    await expect(fetchAllRows(page)).rejects.toMatchObject({ message: "boom" });
  });

  it("stops exactly at a page boundary (a total that's an exact multiple of PAGE_SIZE)", async () => {
    const fullPage = Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i }));
    const { page, calls } = makePages([fullPage, []]);
    const rows = await fetchAllRows(page);
    expect(rows).toHaveLength(PAGE_SIZE);
    expect(calls).toHaveLength(2); // the empty second page is what proves there's nothing more
  });
});
