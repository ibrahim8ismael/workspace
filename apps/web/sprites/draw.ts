import type { PixelSprite } from './pixel.ts';

/** A tiny raster to author sprites in code: every call paints whole pixels. */
export class Surface {
  readonly w: number;
  readonly h: number;
  readonly rows: string[][];
  readonly palette: Record<string, string> = {};
  private keys = new Map<string, string>();
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.rows = Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
  }
  private key(color: string) {
    let key = this.keys.get(color);
    if (!key) {
      key = String.fromCharCode(65 + this.keys.size);
      this.keys.set(color, key);
      this.palette[key] = color;
    }
    return key;
  }
  px(x: number, y: number, color: string) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.rows[y][x] = this.key(color);
    return this;
  }
  rect(x: number, y: number, w: number, h: number, color: string) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, color);
    return this;
  }
  frame(x: number, y: number, w: number, h: number, color: string) {
    return this.hline(x, y, w, color)
      .hline(x, y + h - 1, w, color)
      .vline(x, y, h, color)
      .vline(x + w - 1, y, h, color);
  }
  hline(x: number, y: number, w: number, color: string) {
    return this.rect(x, y, w, 1, color);
  }
  vline(x: number, y: number, h: number, color: string) {
    return this.rect(x, y, 1, h, color);
  }
  /** Rounded rectangle with 1-px corner cuts (r = 1) or 2-px (r = 2). */
  rounded(x: number, y: number, w: number, h: number, color: string, r = 1) {
    this.rect(x + r, y, w - 2 * r, h, color).rect(x, y + r, w, h - 2 * r, color);
    if (r === 2) {
      this.rect(x + 1, y + 1, w - 2, h - 2, color);
    }
    return this;
  }
  /** Filled ellipse inside the box. */
  ellipse(x: number, y: number, w: number, h: number, color: string) {
    const rx = w / 2,
      ry = h / 2,
      cx = x + rx,
      cy = y + ry;
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) {
        const dx = (i + 0.5 - cx) / rx,
          dy = (j + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(i, j, color);
      }
    return this;
  }
  /** Dotted pattern: paints every other pixel. */
  checker(x: number, y: number, w: number, h: number, color: string, phase = 0) {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) if ((i + j + phase) % 2 === 0) this.px(i, j, color);
    return this;
  }
  flipX() {
    const surface = new Surface(this.w, this.h);
    Object.assign(surface.palette, this.palette);
    (surface as unknown as { keys: Map<string, string> }).keys = new Map(this.keys);
    this.rows.forEach((row, y) =>
      row
        .slice()
        .reverse()
        .forEach((key, x) => {
          surface.rows[y][x] = key;
        }),
    );
    return surface;
  }
  sprite(): PixelSprite {
    return {
      w: this.w,
      h: this.h,
      palette: { ...this.palette },
      rows: this.rows.map((row) => row.join('')),
    };
  }
}
export const surface = (w: number, h: number) => new Surface(w, h);
