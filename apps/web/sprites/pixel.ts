/** Pixel sprites authored as character rows; each character maps to a palette colour, '.' is transparent. */
export type PixelSprite = { w: number; h: number; palette: Record<string, string>; rows: string[] };

const cache = new WeakMap<PixelSprite, { color: string; d: string }[]>();

/** One SVG path per colour, with horizontal runs merged, so a sprite stays a handful of nodes. */
export function spritePaths(sprite: PixelSprite): { color: string; d: string }[] {
  const cached = cache.get(sprite);
  if (cached) return cached;
  const parts = new Map<string, string[]>();
  sprite.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const char = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === char) end++;
      if (char !== '.' && char !== ' ') {
        const color = sprite.palette[char];
        if (color) {
          if (!parts.has(color)) parts.set(color, []);
          parts.get(color)!.push(`M${x} ${y}h${end - x}v1h${x - end}z`);
        }
      }
      x = end;
    }
  });
  const paths = [...parts].map(([color, d]) => ({ color, d: d.join('') }));
  cache.set(sprite, paths);
  return paths;
}

/** Build a sprite from a template literal: leading/trailing blank lines and common indentation are stripped. */
export function px(palette: Record<string, string>, art: string): PixelSprite {
  const lines = art.replace(/^\n+|\n+$/g, '').split('\n');
  const indent = Math.min(
    ...lines.filter((line) => line.trim()).map((line) => line.match(/^ */)![0].length),
  );
  const rows = lines.map((line) => line.slice(indent));
  return { w: Math.max(...rows.map((row) => row.length)), h: rows.length, palette, rows };
}

/** Mirror horizontally (for west/east variants drawn once). */
export function flipX(sprite: PixelSprite): PixelSprite {
  return {
    ...sprite,
    rows: sprite.rows.map((row) => row.padEnd(sprite.w, '.').split('').reverse().join('')),
  };
}

/** Shade a hex colour by a factor (<1 darker, >1 lighter). */
export function shade(hex: string, factor: number): string {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((value >> shift) & 255) * factor)));
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}
