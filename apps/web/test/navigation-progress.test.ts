import { describe, expect, it } from 'vitest';
import {
  directionToWaypoint,
  updateWaypointArrival,
} from '../src/features/office/navigation-progress';
import { findReachableAdjacentPath } from '../navigation';

describe('authoritative route waypoint progress', () => {
  it('routes to a reachable free tile beside a participant without overlapping them', () => {
    const path = findReachableAdjacentPath(
      { tx: 4, ty: 4 },
      { tx: 8, ty: 4 },
      new Set(),
      new Set(['8/4', '7/4']),
    );
    expect(path).not.toBeNull();
    expect(path?.at(-1)).not.toEqual({ tx: 8, ty: 4 });
    expect(path?.at(-1)).not.toEqual({ tx: 7, ty: 4 });
  });

  it('reports no adjacent destination when every neighboring tile is occupied', () => {
    const occupied = new Set(
      [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
        [1, -1],
        [1, 1],
        [-1, 1],
        [-1, -1],
      ].map(([dx, dy]) => `${8 + dx}/${4 + dy}`),
    );
    expect(
      findReachableAdjacentPath({ tx: 4, ty: 4 }, { tx: 8, ty: 4 }, new Set(), occupied),
    ).toBeNull();
  });

  it('can step away when the two participants currently share a tile', () => {
    expect(
      findReachableAdjacentPath({ tx: 8, ty: 4 }, { tx: 8, ty: 4 }, new Set(), new Set(['8/4'])),
    ).not.toBeNull();
  });

  it('does not turn diagonally for a small fractional orthogonal residual', () => {
    const current = { x: 656.25, y: 1267.375 };
    const target = { x: 688, y: 1264 };
    const arrived: [boolean, boolean] = [false, Math.abs(target.y - current.y) <= 4.8];

    expect(directionToWaypoint(current, target, arrived)).toEqual([1, 0]);
  });

  it('carries fractional-axis arrival into the next waypoint without a diagonal pulse', () => {
    const currentAtPreviousWaypoint = { x: 688, y: 1267.375 };
    const nextTarget = { x: 720, y: 1264 };
    const nextArrival = updateWaypointArrival(
      [false, false],
      currentAtPreviousWaypoint,
      currentAtPreviousWaypoint,
      nextTarget,
    );

    expect(nextArrival).toEqual([false, true]);
    expect(directionToWaypoint(currentAtPreviousWaypoint, nextTarget, nextArrival)).toEqual([1, 0]);
  });

  it('latches axis crossings when the two snapshot samples cross at different times', () => {
    const target = { x: 10, y: 10 };
    const afterX = updateWaypointArrival([false, false], { x: 0, y: 0 }, { x: 12, y: 0 }, target);
    expect(afterX).toEqual([true, false]);
    const afterY = updateWaypointArrival(afterX, { x: 12, y: 0 }, { x: 12, y: 12 }, target);
    expect(afterY).toEqual([true, true]);
    expect(directionToWaypoint({ x: 12, y: 12 }, target, afterY)).toEqual([0, 0]);
  });
});
