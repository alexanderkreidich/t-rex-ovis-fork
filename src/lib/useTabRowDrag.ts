import { useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { TabMoved, TabTransferred } from "../../shared/protocol.ts";
import { adjacentTabBoundary, movedTabOrder, rowDropBoundary } from "./tabOrder.ts";
import { edgeScrollStep } from "./touchReorder.ts";

/** where a dragged row would go: a boundary in herdr's order of a workspace's tabs */
export interface TabRowTarget { workspaceId: string; boundary: number }
export interface TabRowDrag { tabId: string; workspaceId: string; target: TabRowTarget | null }
type Press = { tabId: string; workspaceId: string; pointerId: number; element: HTMLElement; x: number; y: number; startX: number; startY: number; started: boolean };
type Operation = { workspaceId: string; expected: string | null; settled: boolean; timer?: number };

/**
 * Focus mode's tab rows (Sidebar) move as the strip's pills do (lib/useTabReorder.ts): a mouse drag
 * previews an insertion line, and herdr's next snapshot owns the order. The drag belongs to the
 * whole list, one at a time: a row dropped among another workspace's rows, or on its name (before
 * its first tab), goes into that workspace. Touch keeps its scroll; a row's menu has the moves
 * within its workspace.
 */
export function useTabRowDrag({ owner, root, tabs, moveTab, transferTab, transferred, failed, stale }: {
  owner: string;
  /** the sidebar's workspace list: `.workspace-group[data-workspace]` rows, their tab rows `.workspace-tabs > .workspace-tab[data-index]` */
  root: RefObject<HTMLElement | null>;
  /** each workspace's tab ids, in herdr's order */
  tabs: ReadonlyMap<string, readonly string[]>;
  moveTab: (tabId: string, boundary: number) => Promise<TabMoved>;
  transferTab: (tabId: string, workspaceId: string, boundary: number) => Promise<TabTransferred>;
  /** herdr's answer to a move into another workspace: the panes there have new ids */
  transferred: (result: TabTransferred) => void;
  failed: (error: unknown, workspaceId: string) => void;
  stale: (workspaceId: string) => void;
}) {
  const [drag, setDrag] = useState<TabRowDrag | null>(null);
  const [moving, setMoving] = useState(false);
  const key = JSON.stringify([...tabs]);
  const current = useRef({ owner, key, tabs, moveTab, transferTab, transferred, failed, stale });
  current.current = { owner, key, tabs, moveTab, transferTab, transferred, failed, stale };
  const press = useRef<Press | null>(null);
  const operation = useRef<Operation | null>(null);
  const suppressClick = useRef(false);
  const animation = useRef<number | null>(null);
  const orderOf = (workspaceId: string): string => JSON.stringify(current.current.tabs.get(workspaceId) ?? []);

  const cancelDrag = (): void => {
    const held = press.current;
    press.current = null;
    if (held?.started) suppressClick.current = true;
    if (held?.element.hasPointerCapture(held.pointerId)) held.element.releasePointerCapture(held.pointerId);
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
    setDrag(null);
  };
  const finishOperation = (op: Operation): void => {
    if (operation.current !== op) return;
    if (op.timer !== undefined) window.clearTimeout(op.timer);
    operation.current = null;
    setMoving(false);
  };

  /** whether a move to `target` changes anything: a drop beside the row itself goes nowhere, and no line says it would */
  const moves = (tabId: string, from: string, target: TabRowTarget): boolean => target.workspaceId === from
    ? movedTabOrder(current.current.tabs.get(from) ?? [], tabId, target.boundary) !== null
    : target.boundary <= (current.current.tabs.get(target.workspaceId)?.length ?? -1);
  const targetAt = (held: Press): TabRowTarget | null => {
    const side = root.current?.getBoundingClientRect();
    if (!side || held.x < side.left || held.x > side.right) return null;
    // the workspace under the pointer, its name row and its tab rows, or the nearest one just beside it
    let near: { group: HTMLElement; list: HTMLElement; distance: number } | null = null;
    for (const group of root.current?.querySelectorAll<HTMLElement>(".workspace-group[data-workspace]") ?? []) {
      const list = group.querySelector<HTMLElement>(":scope > .workspace-tabs");
      const box = group.getBoundingClientRect();
      if (!list || box.height === 0) continue;
      const distance = held.y < box.top ? box.top - held.y : Math.max(0, held.y - box.bottom);
      if (distance <= 12 && (!near || distance < near.distance)) near = { group, list, distance };
    }
    const workspaceId = near?.group.dataset["workspace"];
    if (!near || !workspaceId) return null;
    const rows = [...near.list.querySelectorAll<HTMLElement>(":scope > .workspace-tab[data-index]")].map((row) => {
      const rect = row.getBoundingClientRect();
      return { index: Number(row.dataset["index"]), top: rect.top, bottom: rect.bottom };
    });
    // on the workspace's name: before its first tab
    const boundary = held.y < near.list.getBoundingClientRect().top ? 0 : rowDropBoundary(rows, held.y);
    const target = boundary === null ? null : { workspaceId, boundary };
    return target && moves(held.tabId, held.workspaceId, target) ? target : null;
  };
  const paintDrag = (held: Press): void => {
    const target = targetAt(held);
    setDrag((old) => old?.tabId === held.tabId && old.target?.workspaceId === target?.workspaceId && old.target?.boundary === target?.boundary
      ? old : { tabId: held.tabId, workspaceId: held.workspaceId, target });
  };

  useLayoutEffect(() => {
    return () => {
      cancelDrag();
      const op = operation.current;
      if (op?.timer !== undefined) window.clearTimeout(op.timer);
      operation.current = null;
    };
  }, [owner]);
  useLayoutEffect(() => {
    setMoving(false);
    suppressClick.current = false;
  }, [owner]);
  useLayoutEffect(() => {
    // the rows moved under a held one (a tab made or closed elsewhere): the line is drawn again
    // over the rows as they are now, and a drag whose tab has gone ends
    const held = press.current;
    if (held?.started) {
      if (current.current.tabs.get(held.workspaceId)?.includes(held.tabId)) paintDrag(held); else cancelDrag();
    }
    // A sent move holds the gate until the order in its answer has been seen: a snapshot that came
    // before the answer is not one, and must not let another move go with stale places.
    const op = operation.current;
    if (op?.settled && orderOf(op.workspaceId) === op.expected) finishOperation(op);
  }, [key, owner]);

  const requestMove = (tabId: string, from: string, target: TabRowTarget): void => {
    if (operation.current || !moves(tabId, from, target)) return;
    cancelDrag();
    const saved = current.current;
    const { workspaceId, boundary } = target;
    const op: Operation = { workspaceId, expected: null, settled: false };
    operation.current = op;
    setMoving(true);
    const sent = workspaceId === from ? saved.moveTab(tabId, boundary) : saved.transferTab(tabId, workspaceId, boundary).then((result) => {
      if (current.current.owner === saved.owner) saved.transferred(result);
      return result;
    });
    void sent.then((result) => {
      if (operation.current !== op || current.current.owner !== saved.owner) return;
      op.expected = JSON.stringify(result.tabs.map((tab) => tab.tab_id));
      op.settled = true;
      if (orderOf(workspaceId) === op.expected) finishOperation(op);
      // an edit made elsewhere meanwhile may replace this order before it shows: the gate gives
      // up after a while and says the order never came
      else op.timer = window.setTimeout(() => {
        if (operation.current !== op) return;
        finishOperation(op);
        current.current.stale(workspaceId);
      }, 8000);
    }).catch((reason: unknown) => {
      if (operation.current !== op || current.current.owner !== saved.owner) return;
      finishOperation(op);
      saved.failed(reason, from);
    });
  };
  const moveAdjacent = (tabId: string, workspaceId: string, direction: -1 | 1): void => {
    const boundary = adjacentTabBoundary(current.current.tabs.get(workspaceId) ?? [], tabId, direction);
    if (boundary !== null) requestMove(tabId, workspaceId, { workspaceId, boundary });
  };

  // near the list's top or bottom edge the list scrolls under the held row, as under a finger's (lib/touchReorder.ts)
  const tick = (): void => {
    const held = press.current;
    const scroller = root.current?.closest<HTMLElement>(".machine-list");
    if (!held?.started || !scroller) { animation.current = null; return; }
    const box = scroller.getBoundingClientRect();
    const step = held.x >= box.left && held.x <= box.right ? edgeScrollStep(held.y, box.top, box.bottom) : 0;
    if (step !== 0) { scroller.scrollTop += step; paintDrag(held); }
    animation.current = requestAnimationFrame(tick);
  };
  const onPointerDown = (event: PointerEvent<HTMLElement>, tabId: string, workspaceId: string): void => {
    if (event.pointerType !== "mouse" || event.button !== 0 || event.ctrlKey || !event.isPrimary) return;
    suppressClick.current = false;
    // a lone tab can still go to another workspace
    if (operation.current || ((current.current.tabs.get(workspaceId)?.length ?? 0) < 2 && current.current.tabs.size < 2)) return;
    const element = event.currentTarget;
    press.current = { tabId, workspaceId, pointerId: event.pointerId, element, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, started: false };
    element.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>): void => {
    const held = press.current;
    if (!held || event.pointerId !== held.pointerId) return;
    held.x = event.clientX; held.y = event.clientY;
    if (!held.started) {
      if (Math.hypot(held.x - held.startX, held.y - held.startY) < 6) return;
      held.started = true;
      suppressClick.current = true;
      animation.current = requestAnimationFrame(tick);
    }
    paintDrag(held);
  };
  const onPointerUp = (event: PointerEvent<HTMLElement>): void => {
    const held = press.current;
    if (!held || event.pointerId !== held.pointerId) return;
    held.x = event.clientX; held.y = event.clientY;
    const target = held.started ? targetAt(held) : null;
    cancelDrag();
    if (target) requestMove(held.tabId, held.workspaceId, target);
  };
  useLayoutEffect(() => {
    if (!drag) return;
    const escape = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); cancelDrag();
    };
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", cancelDrag);
    return () => { window.removeEventListener("keydown", escape, true); window.removeEventListener("blur", cancelDrag); };
  }, [drag?.tabId]);

  return { drag, moving, moveAdjacent, cancelDrag, onPointerDown, onPointerMove, onPointerUp,
    consumeClick: (detail: number): boolean => { const suppress = detail !== 0 && suppressClick.current; suppressClick.current = false; return suppress; } };
}
