import type { Facing } from './types';

const root = '/assets/pixel/cliente-avatar';
export const AVATAR_DIRECTIONS: readonly Facing[] = ['south', 'north', 'east', 'west'];

// Keep the complete source canvas: all poses share the same ground anchor.
// The reference avatars have a ~20 × 34 px body; the user chose to keep
// Cliente Avatar at its native 21 × 46 px body (1:1 on the grid) even though
// that makes it taller next to the furniture than in the reference.
export const AVATAR_SPRITE = {
  canvasSize: 92,
  foot: { x: 46, y: 69 },
  renderScale: 1,
  nameplateY: -58,
  walkFrames: 6,
  frameDurationMs: 110,
} as const;

export function walkFrameAt(time: number): number {
  return Math.floor(time / AVATAR_SPRITE.frameDurationMs) % AVATAR_SPRITE.walkFrames;
}

export function avatarFrame(facing: Facing, walking: boolean, frame = 0, seated = false): string {
  if (seated) return `${root}/sit-${facing}.png`;
  return walking
    ? `${root}/walk-${facing}-${frame % AVATAR_SPRITE.walkFrames}.png`
    : `${root}/${facing}.png`;
}

export const AVATAR_FRAME_URLS = AVATAR_DIRECTIONS.flatMap((direction) => [
  avatarFrame(direction, false),
  avatarFrame(direction, false, 0, true),
  ...Array.from({ length: AVATAR_SPRITE.walkFrames }, (_, frame) =>
    avatarFrame(direction, true, frame),
  ),
]);
