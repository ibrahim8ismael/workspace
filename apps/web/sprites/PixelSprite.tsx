import { memo } from 'react';
import { spritePaths, type PixelSprite } from './pixel';

/** Draws a pixel sprite with its top-left corner at (x, y) in world units (1 unit = 1 source pixel). */
export const Pixel = memo(function Pixel({
  sprite,
  x = 0,
  y = 0,
  opacity,
}: {
  sprite: PixelSprite;
  x?: number;
  y?: number;
  opacity?: number;
}) {
  return (
    <g transform={x || y ? `translate(${x} ${y})` : undefined} opacity={opacity}>
      {spritePaths(sprite).map((path) => (
        <path key={path.color} d={path.d} fill={path.color} />
      ))}
    </g>
  );
});
