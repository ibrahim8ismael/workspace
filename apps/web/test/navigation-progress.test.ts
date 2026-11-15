import { describe, expect, it } from 'vitest';
import {
  directionToWaypoint,
  updateWaypointArrival,
} from '../src/features/office/navigation-progress';

describe('authoritative route waypoint progress', () => {
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
