import type { Point } from '../../../navigation';

export type AxisArrival = [boolean, boolean];

export function updateWaypointArrival(
  arrived: AxisArrival,
  previous: Point,
  current: Point,
  target: Point,
  tolerance = 4.8,
): AxisArrival {
  const crossedOrNear = (before: number, now: number, goal: number) =>
    Math.abs(now - goal) <= tolerance || (before - goal) * (now - goal) <= 0;
  return [
    arrived[0] || crossedOrNear(previous.x, current.x, target.x),
    arrived[1] || crossedOrNear(previous.y, current.y, target.y),
  ];
}

export function directionToWaypoint(
  current: Point,
  target: Point,
  arrived: AxisArrival,
): [number, number] {
  return [
    arrived[0] ? 0 : Math.sign(target.x - current.x),
    arrived[1] ? 0 : Math.sign(target.y - current.y),
  ];
}
