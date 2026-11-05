import { useCallback, useEffect, useRef, useState } from 'react';
import { baseAsEditorObject, isBaseObjectId } from '../shared/office-objects.js';
import type { OfficeObject, Send } from './types';

type Pose = { x: number; y: number; facing?: string; original?: boolean; free?: boolean };
type Placed = {
  kind: string;
  color?: string;
  facing?: string;
  x: number;
  y: number;
  free?: boolean;
};
/** One decorator change and what is needed to revert or repeat it. Placed objects get a new id every time they are
    re-created, so `id` is updated when the server confirms the object. */
type Entry =
  | { type: 'add'; id: string | null; object: Placed }
  | { type: 'update'; id: string; before: Pose; after: Pose | null }
  | { type: 'remove'; id: string | null; object: Placed }
  | { type: 'remove-base'; id: string; before: Pose };

const LIMIT = 100;

/** Undo and redo for the decorator: every change is replayed through the server, which validates it like any edit. */
export function useEditHistory({
  objects,
  overrides,
  send,
}: {
  objects: OfficeObject[];
  overrides: Record<string, unknown>;
  send: Send;
}) {
  const past = useRef<Entry[]>([]),
    future = useRef<Entry[]>([]);
  const awaitingId = useRef<Entry[]>([]); // entries whose re-created object id is not known yet, oldest first
  const knownIds = useRef(new Set(objects.map((object) => object.id)));
  const state = useRef({ objects, overrides });
  state.current = { objects, overrides };
  const [, bump] = useState(0);
  const refresh = () => bump((value) => value + 1);

  // A newly confirmed object belongs to the oldest change waiting for one.
  useEffect(() => {
    for (const object of objects) {
      if (knownIds.current.has(object.id)) continue;
      const entry = awaitingId.current.shift();
      if (entry && (entry.type === 'add' || entry.type === 'remove')) entry.id = object.id;
    }
    knownIds.current = new Set(objects.map((object) => object.id));
  }, [objects]);

  const pose = (id: string): Pose | null => {
    if (isBaseObjectId(id)) {
      const base = baseAsEditorObject(id, state.current.overrides as never);
      return base
        ? {
            x: base.x,
            y: base.y,
            facing: base.facing,
            free: (base as { free?: boolean }).free,
            original: !(id in state.current.overrides),
          }
        : null;
    }
    const placed = state.current.objects.find((object) => object.id === id);
    return placed
      ? {
          x: placed.x,
          y: placed.y,
          facing: placed.facing,
          free: (placed as { free?: boolean }).free,
        }
      : null;
  };
  const push = (entry: Entry) => {
    past.current.push(entry);
    if (past.current.length > LIMIT) past.current.shift();
    future.current = [];
    refresh();
  };
  /** Puts an object back in a pose; an untouched map object is reset to its exact original placement. */
  const restore = (id: string, target: Pose) =>
    send(
      target.original
        ? { type: 'object:update', id, reset: true }
        : {
            type: 'object:update',
            id,
            x: target.x,
            y: target.y,
            facing: target.facing,
            free: !!target.free,
          },
    );
  const addObject = (entry: Entry & { object: Placed }) => {
    awaitingId.current.push(entry);
    entry.id = null;
    send({ type: 'object:add', ...entry.object });
  };

  /** Records a change just before it is sent. */
  const record = {
    add: (object: Placed) => {
      const entry: Entry = { type: 'add', id: null, object };
      awaitingId.current.push(entry);
      push(entry);
    },
    update: (id: string) => {
      const before = pose(id);
      if (before) push({ type: 'update', id, before, after: null });
    },
    remove: (id: string) => {
      if (isBaseObjectId(id)) {
        const before = pose(id);
        if (before) push({ type: 'remove-base', id, before });
        return;
      }
      const placed = state.current.objects.find((object) => object.id === id);
      if (placed)
        push({
          type: 'remove',
          id,
          object: {
            kind: placed.kind,
            color: placed.color,
            facing: placed.facing,
            x: placed.x,
            y: placed.y,
          },
        });
    },
  };

  const undo = useCallback(() => {
    const entry = past.current.pop();
    if (!entry) return false;
    if (entry.type === 'add') {
      if (entry.id) send({ type: 'object:remove', id: entry.id });
    } else if (entry.type === 'update') {
      entry.after = pose(entry.id);
      restore(entry.id, entry.before);
    } else if (entry.type === 'remove') addObject(entry);
    else restore(entry.id, entry.before);
    future.current.push(entry);
    refresh();
    return true;
  }, [send]);
  const redo = useCallback(() => {
    const entry = future.current.pop();
    if (!entry) return false;
    if (entry.type === 'add') addObject(entry);
    else if (entry.type === 'update') {
      if (entry.after) restore(entry.id, entry.after);
    } else if (entry.type === 'remove') {
      if (entry.id) send({ type: 'object:remove', id: entry.id });
    } else send({ type: 'object:remove', id: entry.id });
    past.current.push(entry);
    refresh();
    return true;
  }, [send]);

  return {
    record,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
