type Point = { x: number; y: number };
type Facing = 'north' | 'east' | 'south' | 'west';

export function playbackFacing(from: Point, to: Point, fallback: Facing): Facing {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 0.01) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'east' : 'west';
  return dy > 0 ? 'south' : 'north';
}
type TimedPoint = Point & { at: number };

const delayMs = 180;
const resumedSegmentMs = 100;
const sampleLimit = 12;

/** Holds only confirmed positions and never predicts movement beyond the latest one. */
export class AvatarPositionPlayback {
  private points: TimedPoint[];

  constructor(position: Point, at: number) {
    this.points = [{ ...position, at }];
  }

  record(position: Point, at: number, snap: boolean) {
    const latest = this.points.at(-1)!;
    if (snap) {
      this.points = [{ ...position, at }];
      return;
    }
    if (latest.x === position.x && latest.y === position.y) return;

    // Resume a small movement segment after an idle or delayed update instead
    // of spreading the segment across the entire pause.
    if (at - latest.at > delayMs) {
      this.points = [{ ...latest, at: at - resumedSegmentMs }];
    }
    this.points.push({ ...position, at: Math.max(at, latest.at + 0.001) });
    if (this.points.length > sampleLimit) this.points.shift();
  }

  latest(): Point {
    return this.points.at(-1)!;
  }

  positionAt(now: number): Point {
    const at = now - delayMs;
    while (this.points.length > 1 && this.points[1]!.at <= at) this.points.shift();
    const [from, to] = this.points;
    if (!to || at <= from!.at) return from!;
    const fraction = (at - from!.at) / (to.at - from!.at);
    return {
      x: from!.x + (to.x - from!.x) * fraction,
      y: from!.y + (to.y - from!.y) * fraction,
    };
  }
}
