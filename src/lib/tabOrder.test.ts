import { describe, expect, it } from "bun:test";
import { adjacentTabBoundary, movedTabOrder, rowDropBoundary, tabDropBoundary } from "./tabOrder.ts";

describe("native tab insertion boundaries", () => {
  const ids = ["a", "b", "c", "d"];
  it("moves in both directions, including the first and last gaps", () => {
    expect(movedTabOrder(ids, "a", 4)).toEqual(["b", "c", "d", "a"]);
    expect(movedTabOrder(ids, "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(movedTabOrder(ids, "b", 3)).toEqual(["a", "c", "b", "d"]);
    expect(movedTabOrder(ids, "c", 1)).toEqual(["a", "c", "b", "d"]);
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });
  it("ignores both gaps beside the source and refuses stale sources/invalid boundaries", () => {
    for (const index of [1, 2, -1, 5, 1.5, NaN]) expect(movedTabOrder(ids, "b", index)).toBeNull();
    expect(movedTabOrder(ids, "closed", 0)).toBeNull();
    expect(movedTabOrder([], "a", 0)).toBeNull();
  });
  it("keyboard and touch moves share the native coordinates without wrapping", () => {
    expect(adjacentTabBoundary(ids, "b", -1)).toBe(0);
    expect(adjacentTabBoundary(ids, "b", 1)).toBe(3);
    expect(adjacentTabBoundary(ids, "a", -1)).toBeNull();
    expect(adjacentTabBoundary(ids, "d", 1)).toBeNull();
    expect(adjacentTabBoundary(ids, "closed", 1)).toBeNull();
  });
  it("uses each tab midpoint, including clipped tabs in a scrolled strip", () => {
    const rects = [{ left: -80, right: 20 }, { left: 24, right: 144 }, { left: 148, right: 208 }];
    expect(tabDropBoundary(rects, -90)).toBe(0);
    expect(tabDropBoundary(rects, 0)).toBe(1);
    expect(tabDropBoundary(rects, 85)).toBe(2);
    expect(tabDropBoundary(rects, 208)).toBe(3);
  });
  it("points a column of rows at the boundary above the first row whose middle is below", () => {
    const rows = [{ index: 0, top: 0, bottom: 28 }, { index: 1, top: 28, bottom: 56 }, { index: 3, top: 56, bottom: 84 }];
    expect(rowDropBoundary(rows, -10)).toBe(0);
    expect(rowDropBoundary(rows, 20)).toBe(1);
    // a tab with no row of its own (index 2) keeps its place in herdr's order
    expect(rowDropBoundary(rows, 50)).toBe(3);
    expect(rowDropBoundary(rows, 80)).toBe(4);
    expect(rowDropBoundary([], 10)).toBeNull();
  });
});
