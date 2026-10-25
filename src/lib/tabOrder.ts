/** herdr's tab.move counts insertion boundaries before removing the source tab. */
export function movedTabOrder(ids: readonly string[], tabId: string, insertIndex: number): string[] | null {
  const source = ids.indexOf(tabId);
  if (source < 0 || !Number.isInteger(insertIndex) || insertIndex < 0 || insertIndex > ids.length) return null;
  const target = insertIndex > source ? insertIndex - 1 : insertIndex;
  if (target === source) return null;
  const order = [...ids];
  order.splice(source, 1);
  order.splice(target, 0, tabId);
  return order;
}

/** One adjacent move, expressed in native insertion-boundary coordinates. */
export function adjacentTabBoundary(ids: readonly string[], tabId: string, direction: -1 | 1): number | null {
  const source = ids.indexOf(tabId);
  if (source < 0 || source + direction < 0 || source + direction >= ids.length) return null;
  return direction < 0 ? source - 1 : source + 2;
}

/** DOM hit rectangles stay in snapshot order, including the source tab. */
export function tabDropBoundary(rects: readonly { left: number; right: number }[], x: number): number {
  const before = rects.findIndex((rect) => x < (rect.left + rect.right) / 2);
  return before < 0 ? rects.length : before;
}

/**
 * The boundary a pointer at height `y` points to in a column of tab rows (the sidebar's), each
 * row with its place in herdr's order: a row not drawn leaves its place out, not the count.
 */
export function rowDropBoundary(rows: readonly { index: number; top: number; bottom: number }[], y: number): number | null {
  const before = rows.find((row) => y < (row.top + row.bottom) / 2);
  return before ? before.index : rows.length > 0 ? rows[rows.length - 1]!.index + 1 : null;
}
