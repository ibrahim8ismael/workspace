import { AVATAR_FRAME_URLS } from './avatarSprite';

/** An avatar look: a colour per body zone plus accessories. Zones are found in the base sprite by colour and
    position, and recoloured keeping the pixel art's own shading, so every pose and walk frame stays consistent. */
export type AvatarLook = {
  body: number;
  skin: number;
  hair: number;
  top: number;
  bottom: number;
  shoes: number;
  glasses: number;
  hat: number;
  beard: number;
};
export const DEFAULT_LOOK: AvatarLook = {
  body: 0,
  skin: 1,
  hair: 1,
  top: 0,
  bottom: 0,
  shoes: 0,
  glasses: 0,
  hat: 0,
  beard: 0,
};
/** Base characters. Frames are always looked up by the first body's file names; other bodies swap the folder. */
export const BODIES = [
  {
    label: 'Cuerpo masculino',
    root: '/assets/pixel/cliente-avatar',
    hairRows: 11,
    ref: { skin: '#fac08a', hair: '#361c10', top: '#458791', bottom: '#192436', shoes: '#737a7b' },
  },
  {
    label: 'Cuerpo femenino',
    root: '/assets/pixel/cliente-avatar-mujer',
    hairRows: 27,
    ref: { skin: '#fcbe82', hair: '#412317', top: '#3f808e', bottom: '#213249', shoes: '#6c6864' },
  },
] as const;
const CANONICAL_ROOT = BODIES[0].root;
const bodyUrl = (url: string, body: number) =>
  url.replace(CANONICAL_ROOT, BODIES[body]?.root ?? CANONICAL_ROOT);
type Zone = 'skin' | 'hair' | 'top' | 'bottom' | 'shoes';

/** Palettes; index 0 of each is the base sprite's own colour, except skin which follows the reference's five tones. */
export const PALETTES: Record<Zone, string[]> = {
  skin: ['#ffe0c4', '#fac08a', '#e39a62', '#b8703f', '#7a452a'],
  hair: [
    '#1b1b1f',
    '#361c10',
    '#6b3f22',
    '#a8441c',
    '#d8a74f',
    '#9a9a9a',
    '#e6e6e6',
    '#2d4f9e',
    '#d77aa8',
  ],
  top: [
    '#458791',
    '#c0392b',
    '#3d6fd1',
    '#4f9a52',
    '#e0b53a',
    '#7d55c7',
    '#e07aa0',
    '#e2793a',
    '#2b2b30',
    '#e8e8e8',
    '#8a8f96',
  ],
  bottom: ['#192436', '#1d1d22', '#5b616b', '#a68b5b', '#6b4a2f', '#6f8fbf', '#5d6b3a', '#d9d9d9'],
  shoes: ['#737a7b', '#222226', '#eeeeee', '#6b4228', '#b8322a', '#3459a8'],
};
export const GLASSES = ['Sin gafas', 'Redondas', 'Cuadradas', 'De sol'];
export const HATS = ['Sin sombrero', 'Gorra', 'Gorro de lana', 'Auriculares'];
export const BEARDS = ['Sin vello facial', 'Bigote', 'Barba corta', 'Barba completa'];
const HAT_COLORS = ['#d14b3d', '#3d6fd1', '#2b2b30'];

export const lookKey = (look: AvatarLook) =>
  [
    look.body,
    look.skin,
    look.hair,
    look.top,
    look.bottom,
    look.shoes,
    look.glasses,
    look.hat,
    look.beard,
  ].join('.');
export const isDefaultLook = (look: AvatarLook) => lookKey(look) === lookKey(DEFAULT_LOOK);
/** The body's own colours and no accessories: its original files are used as they are. */
const isBaseColours = (look: AvatarLook) =>
  look.glasses === 0 &&
  look.hat === 0 &&
  look.beard === 0 &&
  look.skin === DEFAULT_LOOK.skin &&
  look.hair === DEFAULT_LOOK.hair &&
  look.top === 0 &&
  look.bottom === 0 &&
  look.shoes === 0;
export function sanitizeLook(value: unknown): AvatarLook {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const pick = (key: keyof AvatarLook, size: number): number => {
    const n = Number(source[key]);
    return Number.isInteger(n) && n >= 0 && n < size ? n : DEFAULT_LOOK[key];
  };
  return {
    body: pick('body', BODIES.length),
    skin: pick('skin', PALETTES.skin.length),
    hair: pick('hair', PALETTES.hair.length),
    top: pick('top', PALETTES.top.length),
    bottom: pick('bottom', PALETTES.bottom.length),
    shoes: pick('shoes', PALETTES.shoes.length),
    glasses: pick('glasses', GLASSES.length),
    hat: pick('hat', HATS.length),
    beard: pick('beard', BEARDS.length),
  };
}
export const randomLook = (body = 0): AvatarLook => ({
  body,
  skin: Math.floor(Math.random() * PALETTES.skin.length),
  hair: Math.floor(Math.random() * PALETTES.hair.length),
  top: Math.floor(Math.random() * PALETTES.top.length),
  bottom: Math.floor(Math.random() * PALETTES.bottom.length),
  shoes: Math.floor(Math.random() * PALETTES.shoes.length),
  glasses: Math.random() < 0.35 ? 1 + Math.floor(Math.random() * 3) : 0,
  hat: Math.random() < 0.25 ? 1 + Math.floor(Math.random() * 3) : 0,
  beard: body === 0 && Math.random() < 0.3 ? 1 + Math.floor(Math.random() * 3) : 0,
});

// --- colour maths -------------------------------------------------------------------------------------------
type HSL = [number, number, number];
const hex = (value: string): [number, number, number] => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
];
function toHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min,
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function toRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 1) + 1) % 1;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s,
    p = 2 * l - q;
  const channel = (t: number) => {
    t = ((t % 1) + 1) % 1;
    return t < 1 / 6
      ? p + (q - p) * 6 * t
      : t < 1 / 2
        ? q
        : t < 2 / 3
          ? p + (q - p) * (2 / 3 - t) * 6
          : p;
  };
  return [
    Math.round(channel(h + 1 / 3) * 255),
    Math.round(channel(h) * 255),
    Math.round(channel(h - 1 / 3) * 255),
  ];
}
function toHsv(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  const h =
    d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, max === 0 ? 0 : d / max, max];
}
/** Moves a pixel from the zone's reference colour to the target colour, keeping its relative light and shade. */
function shift(
  r: number,
  g: number,
  b: number,
  _zone: Zone,
  target: string,
  ref: string,
): [number, number, number] {
  const [h0, s0, l0] = toHsl(...hex(ref)),
    [h, s, l] = toHsl(r, g, b),
    [th, ts, tl] = toHsl(...hex(target));
  const nl = l <= l0 ? tl * (l / l0) : tl + (1 - tl) * ((l - l0) / (1 - l0)) * 0.85;
  const ns = s0 > 0.05 ? ts * Math.min(1.25, s / s0) : ts;
  return toRgb(th + (h - h0) * 0.5, ns, nl);
}

// --- zones --------------------------------------------------------------------------------------------------
type Frame = {
  body: number;
  url: string;
  width: number;
  height: number;
  data: Uint8ClampedArray;
  zones: (Zone | 'hairdark' | 'outline' | null)[];
  facing: string;
  hairTop: number;
  hairBottom: number;
  hairLeft: number;
  hairRight: number;
  eyes: number[][];
};
function classify(
  r: number,
  g: number,
  b: number,
  y: number,
  foot: number,
): Zone | 'outline' | null {
  const [h, s, v] = toHsv(r, g, b);
  if (v < 0.09) return 'outline';
  if (s < 0.18) return y >= foot - 6 && v > 0.15 ? 'shoes' : null;
  if (h >= 165 && h <= 205 && s > 0.35) return 'top';
  if (h > 205 && h <= 250) return 'bottom';
  if (h <= 45 || h >= 340)
    return (v >= 0.62 && s < 0.75) || (v >= 0.6 && s >= 0.75 && h > 12) ? 'skin' : 'hair';
  return null;
}
const bases = new Map<number, Promise<Frame[]>>();
function loadBase(body = 0): Promise<Frame[]> {
  if (bases.has(body)) return bases.get(body)!;
  const base = Promise.all(
    AVATAR_FRAME_URLS.map(
      (url) =>
        new Promise<Frame>((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext('2d', { willReadFrequently: true })!;
            context.drawImage(image, 0, 0);
            const { data } = context.getImageData(0, 0, image.width, image.height);
            const width = image.width,
              height = image.height,
              at = (x: number, y: number) => y * width + x;
            let foot = 0;
            for (let i = 3; i < data.length; i += 4)
              if (data[i] > 128) foot = Math.max(foot, Math.floor((i >> 2) / width));
            const zones: Frame['zones'] = new Array(width * height).fill(null);
            for (let y = 0; y < height; y++)
              for (let x = 0; x < width; x++) {
                const i = at(x, y) * 4;
                if (data[i + 3] > 128)
                  zones[at(x, y)] = classify(data[i], data[i + 1], data[i + 2], y, foot);
              }
            // Eyes and brows share the hair's dark browns; they sit inside the face (skin above, left and right).
            const eyeMarks: number[][] = [];
            const skinAt = (x: number, y: number) =>
              x >= 0 && y >= 0 && x < width && y < height && zones[at(x, y)] === 'skin';
            for (let y = 0; y < height; y++)
              for (let x = 0; x < width; x++) {
                if (zones[at(x, y)] !== 'hair') continue;
                const left = [1, 2, 3].some((d) => skinAt(x - d, y)),
                  right = [1, 2, 3].some((d) => skinAt(x + d, y)),
                  above = [1, 2].some(
                    (d) => skinAt(x, y - d) || skinAt(x - 1, y - d) || skinAt(x + 1, y - d),
                  );
                if (left && right && above) {
                  zones[at(x, y)] = null;
                  eyeMarks.push([x, y]);
                }
              }
            // The head: hair starts at the top; hair-coloured pixels far below it are shaded skin (hands, neck).
            let hairTop = height;
            for (let i = 0; i < zones.length; i++)
              if (zones[i] === 'hair') {
                hairTop = Math.floor(i / width);
                break;
              }
            let hairBottom = -1,
              hairLeft = width,
              hairRight = -1;
            for (let y = 0; y < height; y++)
              for (let x = 0; x < width; x++) {
                if (zones[at(x, y)] !== 'hair') continue;
                if (y > hairTop + BODIES[body].hairRows) {
                  zones[at(x, y)] = 'skin';
                  continue;
                }
                if (y > hairTop + 11) continue; // long hair below the head is hair, but the head box (hats, glasses) stays the head
                hairBottom = Math.max(hairBottom, y);
                hairLeft = Math.min(hairLeft, x);
                hairRight = Math.max(hairRight, x);
              }
            const inside = (x: number, y: number) =>
              x >= 0 && y >= 0 && x < width && y < height && data[at(x, y) * 4 + 3] > 128;
            // Dark shading inside the hair mass belongs to the hair, not to the outline.
            for (let pass = 0; pass < 3; pass++)
              for (let y = 0; y <= hairBottom; y++)
                for (let x = 0; x < width; x++) {
                  if (zones[at(x, y)] !== 'outline') continue;
                  const near = [
                    [1, 0],
                    [-1, 0],
                    [0, 1],
                    [0, -1],
                  ];
                  if (
                    near.every(([dx, dy]) => inside(x + dx, y + dy)) &&
                    near.some(([dx, dy]) =>
                      ['hair', 'hairdark'].includes(zones[at(x + dx, y + dy)] ?? ''),
                    )
                  )
                    zones[at(x, y)] = 'hairdark';
                }
            // Eyes: dark pixels on the face, just below the hair, with skin on both sides within 3 px.
            const eyes: number[][] = eyeMarks.filter(
              ([, y]) => y >= hairTop + 10 && y <= hairTop + 16,
            );
            for (let y = hairTop + 10; y <= Math.min(height - 1, hairTop + 16); y++)
              for (let x = hairLeft; x <= hairRight; x++) {
                if (zones[at(x, y)] !== 'outline') continue;
                if (
                  [1, 2, 3].some((d) => zones[at(x - d, y)] === 'skin') &&
                  [1, 2, 3].some((d) => zones[at(x + d, y)] === 'skin')
                )
                  eyes.push([x, y]);
              }
            const name = url.split('/').pop() ?? '';
            const facing = name.includes('north')
              ? 'north'
              : name.includes('east')
                ? 'east'
                : name.includes('west')
                  ? 'west'
                  : 'south';
            resolve({
              body,
              url,
              width,
              height,
              data,
              zones,
              facing,
              hairTop,
              hairBottom,
              hairLeft,
              hairRight,
              eyes,
            });
          };
          image.onerror = reject;
          image.src = bodyUrl(url, body);
        }),
    ),
  );
  bases.set(body, base);
  return base;
}

// --- accessories --------------------------------------------------------------------------------------------
type Paint = (x: number, y: number, color: string) => void;
function drawGlasses(frame: Frame, style: number, paint: Paint) {
  if (!style || frame.facing === 'north' || (!frame.eyes.length && frame.facing !== 'south'))
    return;
  const xs = [...new Set(frame.eyes.map(([x]) => x))].sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const x of xs) {
    const last = clusters.at(-1);
    if (last && x - last[last.length - 1] <= 1) last.push(x);
    else clusters.push([x]);
  }
  const eyeRows = frame.eyes.map(([, y]) => y);
  let southEyeY: number | null = null;
  const frameColor = style === 3 ? '#151518' : style === 2 ? '#2a2a33' : '#1f1a1d';
  const lens = style === 3 ? '#1d2230' : null;
  const lenses = clusters
    .filter((cluster) => cluster.length >= 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, 2)
    .sort((a, b) => a[0] - b[0])
    .map((cluster) => ({ left: cluster[0] - 1, right: cluster[cluster.length - 1] + 1 }));
  // Facing the viewer, both bodies have their eyes 4 px either side of the face's centre, 13 rows below the top of the hair.
  if (frame.facing === 'south') {
    const mid = Math.round((frame.hairLeft + frame.hairRight) / 2) + 1; // the eyes sit one pixel right of the hair's centre
    lenses.length = 0;
    lenses.push({ left: mid - 6, right: mid - 2 }, { left: mid + 2, right: mid + 6 });
    southEyeY = frame.hairTop + 13;
  }
  const eyeY =
    southEyeY ?? Math.round(eyeRows.reduce((a, b) => a + b, 0) / Math.max(1, eyeRows.length));
  for (const { left, right } of lenses) {
    const top = eyeY - 1,
      bottom = eyeY + 2;
    for (let x = left; x <= right; x++)
      for (let y = top; y <= bottom; y++) {
        const edge = x === left || x === right || y === top || y === bottom;
        const corner = style === 1 && (x === left || x === right) && (y === top || y === bottom);
        if (corner) continue;
        if (edge) paint(x, y, frameColor);
        else if (lens) paint(x, y, lens);
      }
  }
  if (lenses.length === 2)
    for (let x = lenses[0].right + 1; x < lenses[1].left; x++) paint(x, eyeY, frameColor);
  else if (lenses.length === 1) {
    // profile: an arm towards the ear
    const { left, right } = lenses[0],
      back = frame.facing === 'east' ? -1 : 1;
    for (let d = 1; d <= 4; d++) paint(back < 0 ? left - d : right + d, eyeY, frameColor);
  }
}
/** Facial hair in the hair's colour. Both bodies have the mouth 18 rows below the top of the hair; only skin is
    covered, so the mouth, the outline and the neck stay as drawn. */
function drawBeard(frame: Frame, style: number, paint: Paint, hairColor: string) {
  if (!style || frame.facing === 'north' || frame.hairBottom < 0) return;
  const [h, s, l] = toHsl(...hex(hairColor));
  const base = `rgb(${toRgb(h, s, Math.max(0.08, l * 0.9)).join(',')})`,
    shade = `rgb(${toRgb(h, s, l * 0.6).join(',')})`;
  const mouthY = frame.hairTop + 18,
    at = (x: number, y: number) => y * frame.width + x;
  const skin = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < frame.width && y < frame.height && frame.zones[at(x, y)] === 'skin';
  const left = frame.hairLeft - 1,
    right = frame.hairRight + 1;
  const rowSkin = (y: number) => {
    const xs: number[] = [];
    for (let x = left; x <= right; x++) if (skin(x, y)) xs.push(x);
    return xs;
  };
  // Moustache: the row above the mouth, centred on the face (or at its front in profile).
  const above = rowSkin(mouthY - 1);
  if (above.length) {
    const centre =
      frame.facing === 'south'
        ? Math.round((frame.hairLeft + frame.hairRight) / 2) + 1
        : frame.facing === 'east'
          ? (above[above.length - 2] ?? above[0])
          : (above[1] ?? above[0]);
    for (let x = centre - 2; x <= centre + 2; x++)
      if (skin(x, mouthY - 1)) paint(x, mouthY - 1, base);
    if (frame.facing === 'south')
      for (const x of [centre - 3, centre + 3]) if (skin(x, mouthY)) paint(x, mouthY, shade); // the tips, either side of the mouth
  }
  if (style === 1) return;
  // Short beard: the chin under the mouth. Full beard: the whole chin plus the jaw line up to the cheeks.
  const centre =
    frame.facing === 'south' ? Math.round((frame.hairLeft + frame.hairRight) / 2) + 1 : null;
  const front = (xs: number[]) => (frame.facing === 'east' ? xs.slice(-4) : xs.slice(0, 4));
  const to = mouthY + 3;
  for (let y = style === 3 ? mouthY - 3 : mouthY + 1; y <= to; y++) {
    let xs = rowSkin(y);
    if (!xs.length) continue;
    if (y <= mouthY)
      xs = xs.filter((x) => !skin(x - 2, y) || !skin(x + 2, y)); // jaw line only, above the chin
    else if (style === 2)
      xs = centre === null ? front(xs) : xs.filter((x) => Math.abs(x - centre) <= 3);
    for (const x of xs) paint(x, y, y === to || !skin(x, y + 1) ? shade : base);
  }
}
function drawHeadphones(frame: Frame, paint: Paint) {
  const band = '#2b2b30',
    cup = '#4a4a55',
    outline = '#0b0b0e',
    left = frame.hairLeft,
    right = frame.hairRight;
  const opaque = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < frame.width &&
    y < frame.height &&
    frame.data[(y * frame.width + x) * 4 + 3] > 128;
  const profile = frame.facing === 'east' || frame.facing === 'west';
  const cups = profile
    ? [Math.round((left + right) / 2) + (frame.facing === 'east' ? -2 : 2)]
    : [left, right];
  // The band hugs the top of the head: over each column's first opaque pixel, then down the sides to the cups.
  const from = profile ? cups[0] : left + 1,
    until = profile ? cups[0] : right - 1;
  for (let x = Math.min(from, until); x <= Math.max(from, until); x++) {
    let y = frame.hairTop - 2;
    while (y < frame.hairTop + 8 && !opaque(x, y)) y++;
    if (!profile) paint(x, y - 1, outline);
    paint(x, y, band);
  }
  const cupTop = frame.hairTop + 9,
    cupBottom = frame.hairTop + 13;
  for (const cx of cups) {
    if (profile) {
      let y = frame.hairTop - 2;
      while (y < cupTop && !opaque(cx, y)) y++;
      for (; y < cupTop; y++) paint(cx, y, band);
    } else
      for (let y = frame.hairTop; y < cupTop; y++) {
        // follow the head's silhouette on that side
        let x = cx === left ? left - 2 : right + 2;
        const step = cx === left ? 1 : -1;
        while (x !== cx + step * 4 && !opaque(x, y)) x += step;
        if (opaque(x, y)) paint(x, y, band);
      }
    for (let y = cupTop; y <= cupBottom; y++)
      for (let x = cx - 1; x <= cx + 1; x++)
        paint(
          x,
          y,
          x === cx - 1 || x === cx + 1 || y === cupTop || y === cupBottom ? outline : cup,
        );
  }
}
function drawHat(frame: Frame, style: number, paint: Paint, color: string) {
  if (!style || frame.hairBottom < 0) return;
  if (style === 3) {
    drawHeadphones(frame, paint);
    return;
  }
  const [r, g, b] = hex(color),
    [h, s, l] = toHsl(r, g, b);
  const dark = `rgb(${toRgb(h, s, l * 0.62).join(',')})`,
    light = `rgb(${toRgb(h, s, Math.min(0.92, l * 1.25)).join(',')})`,
    outline = '#0b0b0e';
  const left = frame.hairLeft,
    right = frame.hairRight,
    top = frame.hairTop - (style === 2 ? 2 : 1);
  const crownBottom = frame.hairTop + (style === 2 ? 6 : 4);
  for (let y = top; y <= crownBottom; y++) {
    const inset = y === top ? 3 : y === top + 1 ? 1 : 0;
    for (let x = left + inset; x <= right - inset; x++) {
      const edge = x === left + inset || x === right - inset || y === top;
      paint(
        x,
        y,
        edge
          ? outline
          : style === 2 && y >= crownBottom - 1
            ? dark
            : x < left + (right - left) / 3 && y < top + 3
              ? light
              : color,
      );
    }
  }
  if (style === 2) {
    for (let x = left; x <= right; x++) paint(x, crownBottom + 1, outline);
    return;
  }
  // Cap brim, on the side the avatar faces.
  const brimY = crownBottom + 1;
  if (frame.facing === 'south')
    for (let x = left - 1; x <= right + 1; x++) {
      paint(x, brimY, x === left - 1 || x === right + 1 ? outline : dark);
      paint(x, brimY + 1, outline);
    }
  else if (frame.facing === 'east')
    for (let x = right - 2; x <= right + 4; x++) {
      paint(x, brimY, dark);
      paint(x, brimY + 1, outline);
    }
  else if (frame.facing === 'west')
    for (let x = left - 4; x <= left + 2; x++) {
      paint(x, brimY, dark);
      paint(x, brimY + 1, outline);
    }
  else for (let x = left; x <= right; x++) paint(x, brimY, outline);
}

// --- rendering ----------------------------------------------------------------------------------------------
/** Paints one base frame with a look (zone colours, then hat and glasses). */
function paintFrame(frame: Frame, look: AvatarLook): HTMLCanvasElement {
  const out = new Uint8ClampedArray(frame.data);
  const targets: Record<Zone, string> = {
    skin: PALETTES.skin[look.skin],
    hair: PALETTES.hair[look.hair],
    top: PALETTES.top[look.top],
    bottom: PALETTES.bottom[look.bottom],
    shoes: PALETTES.shoes[look.shoes],
  };
  for (let i = 0; i < frame.zones.length; i++) {
    const zone = frame.zones[i];
    if (!zone || zone === 'outline') continue;
    const p = i * 4;
    const [r, g, b] =
      zone === 'hairdark'
        ? (() => {
            const [h, s, l] = toHsl(...hex(targets.hair));
            return toRgb(h, s, l * 0.45);
          })()
        : targets[zone] === BODIES[frame.body].ref[zone]
          ? [out[p], out[p + 1], out[p + 2]]
          : shift(
              out[p],
              out[p + 1],
              out[p + 2],
              zone,
              targets[zone],
              BODIES[frame.body].ref[zone],
            );
    out[p] = r;
    out[p + 1] = g;
    out[p + 2] = b;
  }
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext('2d')!;
  context.putImageData(new ImageData(out, frame.width, frame.height), 0, 0);
  const paint: Paint = (x, y, color) => {
    context.fillStyle = color;
    context.fillRect(x, y, 1, 1);
  };
  drawHat(frame, look.hat, paint, HAT_COLORS[(look.top + look.hat) % HAT_COLORS.length]);
  drawBeard(frame, look.beard, paint, PALETTES.hair[look.hair]);
  drawGlasses(frame, look.glasses, paint);
  return canvas;
}

const cache = new Map<string, Promise<Record<string, string>>>();
/** Frame URL → object URL of the recoloured frame, for a look. The default look maps to the original files. */
export function lookFrames(look: AvatarLook): Promise<Record<string, string>> {
  const key = lookKey(look);
  if (isDefaultLook(look))
    return Promise.resolve(Object.fromEntries(AVATAR_FRAME_URLS.map((url) => [url, url])));
  if (isBaseColours(look))
    return Promise.resolve(
      Object.fromEntries(AVATAR_FRAME_URLS.map((url) => [url, bodyUrl(url, look.body)])),
    );
  let pending = cache.get(key);
  if (pending) return pending;
  pending = loadBase(look.body)
    .then((frames) =>
      Promise.all(
        frames.map(
          (frame) =>
            new Promise<[string, string]>((resolve) => {
              paintFrame(frame, look).toBlob(
                (blob) => resolve([frame.url, blob ? URL.createObjectURL(blob) : frame.url]),
                'image/png',
              );
            }),
        ),
      ),
    )
    .then((entries) => Object.fromEntries(entries));
  cache.set(key, pending);
  if (cache.size > 40) {
    const oldest = cache.keys().next().value;
    if (oldest) {
      const old = cache.get(oldest);
      cache.delete(oldest);
      void old?.then((map) =>
        Object.values(map).forEach((url) => url.startsWith('blob:') && URL.revokeObjectURL(url)),
      );
    }
  }
  return pending;
}
/** Development aid: zone anchors of one base frame. */
export async function frameAnchors(url: string) {
  const frame = (await loadBase()).find((candidate) => candidate.url === url);
  return (
    frame && {
      hairTop: frame.hairTop,
      hairBottom: frame.hairBottom,
      hairLeft: frame.hairLeft,
      hairRight: frame.hairRight,
      eyes: frame.eyes,
    }
  );
}

const single = new Map<string, Promise<string>>();
/** One frame of a look as a data URL, for previews and thumbnails (cheap: no other frames are painted). */
export function lookFrame(look: AvatarLook, file = 'south.png'): Promise<string> {
  const key = `${lookKey(look)}:${file}`;
  let pending = single.get(key);
  if (!pending) {
    pending = loadBase(look.body).then((frames) => {
      const frame = frames.find((candidate) => candidate.url.endsWith(`/${file}`)) ?? frames[0];
      return paintFrame(frame, look).toDataURL('image/png');
    });
    single.set(key, pending);
    if (single.size > 400) single.delete(single.keys().next().value!);
  }
  return pending;
}
