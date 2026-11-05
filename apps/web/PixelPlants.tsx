// Original foliage sprites. Geometry is rasterized once onto a one-unit grid;
// rendering uses a handful of SVG paths, rather than one DOM node per pixel.
type Point = { x: number; y: number };
type PixelArt = { color: string; d: string }[];
type FoliagePalette = {
  edge: string;
  dark: string;
  shade: string;
  mid: string;
  light: string;
  bright: string;
};

class PixelSurface {
  private pixels = new Map<string, string>();
  set(x: number, y: number, color: string) {
    this.pixels.set(`${Math.round(x)},${Math.round(y)}`, color);
  }
  get(x: number, y: number) {
    return this.pixels.get(`${x},${y}`);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.set(x, y, color);
      }
    }
  }
  line(a: Point, b: Point, color: string) {
    const count = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let step = 0; step <= count; step++) {
      const t = count === 0 ? 0 : step / count;
      this.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, color);
    }
  }
  paths(): PixelArt {
    const byColor = new Map<string, Map<number, number[]>>();
    for (const [position, color] of this.pixels) {
      const [x, y] = position.split(',').map(Number);
      if (!byColor.has(color)) byColor.set(color, new Map());
      const rows = byColor.get(color)!;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push(x);
    }
    return Array.from(byColor, ([color, rows]) => {
      let d = '';
      for (const [y, columns] of rows) {
        columns.sort((a, b) => a - b);
        for (let i = 0; i < columns.length; i++) {
          const left = columns[i];
          let right = left;
          while (columns[i + 1] === right + 1) right = columns[++i];
          d += `M${left} ${y}h${right - left + 1}v1h${left - right - 1}z`;
        }
      }
      return { color, d };
    });
  }
}

function inside(point: Point, polygon: Point[]) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      result = !result;
  }
  return result;
}

function leaf(
  surface: PixelSurface,
  base: Point,
  tip: Point,
  width: number,
  bend: number,
  front = false,
) {
  const dx = tip.x - base.x,
    dy = tip.y - base.y,
    length = Math.hypot(dx, dy);
  const normal = { x: -dy / length, y: dx / length };
  const centers: Point[] = [];
  const left: Point[] = [],
    right: Point[] = [];
  for (let step = 0; step <= 20; step++) {
    const t = step / 20,
      curve = Math.sin(Math.PI * t);
    const center = {
      x: base.x + dx * t + normal.x * bend * curve,
      y: base.y + dy * t + normal.y * bend * curve,
    };
    const radius = width * Math.pow(curve, 0.85) * (0.55 + t * 0.3);
    centers.push(center);
    left.push({ x: center.x + normal.x * radius, y: center.y + normal.y * radius });
    right.push({ x: center.x - normal.x * radius, y: center.y - normal.y * radius });
  }
  const outline = [...left, ...right.reverse()];
  const mask = new Set<string>();
  const minX = Math.floor(Math.min(...outline.map((p) => p.x))),
    maxX = Math.ceil(Math.max(...outline.map((p) => p.x)));
  const minY = Math.floor(Math.min(...outline.map((p) => p.y))),
    maxY = Math.ceil(Math.max(...outline.map((p) => p.y)));
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      if (inside({ x: x + 0.5, y: y + 0.5 }, outline)) mask.add(`${x},${y}`);
    }
  for (const position of mask) {
    const [x, y] = position.split(',').map(Number);
    const along = Math.max(0, Math.min(1, ((x - base.x) * dx + (y - base.y) * dy) / length ** 2));
    const center = centers[Math.round(along * 20)];
    const side = (x - center.x) * normal.x + (y - center.y) * normal.y;
    const lowerEdge = !mask.has(`${x},${y + 1}`) || !mask.has(`${x + 1},${y}`);
    const upperEdge = !mask.has(`${x},${y - 1}`) || !mask.has(`${x - 1},${y}`);
    let color = side < 0 ? '#3f834f' : '#69a65b';
    if (front) color = side < 0 ? '#4b9252' : '#83ba64';
    if (lowerEdge) color = '#2e453b';
    else if (upperEdge && along > 0.25) color = front ? '#afce77' : '#92b96d';
    surface.set(x, y, color);
  }
  for (let i = 2; i < centers.length - 1; i++) {
    const center = centers[i];
    if (mask.has(`${Math.round(center.x)},${Math.round(center.y)}`))
      surface.set(center.x, center.y, front ? '#bad481' : '#91b969');
  }
  surface.line(base, { x: base.x + dx * 0.3, y: base.y + dy * 0.3 }, '#54733b');
}

function makePlant(): PixelArt {
  const surface = new PixelSurface();
  // A tapered ceramic pot: narrow highlight, shaded side, and a stepped oval rim.
  surface.ellipse(1, 2, 19, 3, '#343c4938');
  for (let y = -25; y <= 2; y++) {
    const half = 15 - Math.max(0, y + 22) * 0.23;
    for (let x = -Math.ceil(half); x <= Math.ceil(half); x++) {
      if (Math.abs(x) > half) continue;
      const edge = Math.abs(x) > half - 1 || y === 2;
      const tone =
        x < -half + 3 ? '#d6d6b6' : x < -1 ? '#bec7a3' : x < half - 4 ? '#97ab8b' : '#708373';
      surface.set(x, y, edge ? '#3d4846' : tone);
    }
  }
  surface.ellipse(0, -25, 16, 5, '#3d4846');
  surface.ellipse(0, -26, 14, 4, '#dfd8b6');
  surface.ellipse(0, -26, 11, 3, '#6b513d');
  surface.ellipse(-2, -27, 8, 2, '#3d3933');
  surface.line({ x: -12, y: -13 }, { x: 12, y: -13 }, '#d6d5b2');
  surface.line({ x: -10, y: -3 }, { x: 8, y: -3 }, '#aebc96');
  surface.line({ x: 10, y: -17 }, { x: 8, y: -5 }, '#7b957b');
  const origin = { x: 0, y: -25 };
  // Taller blades behind, then lateral leaves, then the new leaves at the front.
  leaf(surface, origin, { x: -5, y: -64 }, 3.3, -1.8);
  leaf(surface, { x: -1, y: -26 }, { x: -13, y: -57 }, 3.2, 2);
  leaf(surface, { x: 1, y: -26 }, { x: 11, y: -61 }, 3.2, -2.3);
  leaf(surface, origin, { x: -23, y: -47 }, 4.0, 2);
  leaf(surface, origin, { x: 24, y: -48 }, 4.0, -2.5);
  leaf(surface, { x: 1, y: -26 }, { x: -20, y: -35 }, 3.1, 1.8);
  leaf(surface, origin, { x: 22, y: -35 }, 3.0, -1.5);
  leaf(surface, { x: 0, y: -27 }, { x: -9, y: -52 }, 3.0, -1, true);
  leaf(surface, { x: 0, y: -26 }, { x: 12, y: -45 }, 3.1, -2.8, true);
  leaf(surface, { x: -1, y: -26 }, { x: -14, y: -40 }, 3.5, 0.5, true);
  // Tiny soil highlights keep the individual stems readable at their foot point.
  surface.set(-6, -24, '#ac9470');
  surface.set(6, -25, '#aa916d');
  return surface.paths();
}

const GREEN: FoliagePalette = {
  edge: '#397b59',
  dark: '#438d60',
  shade: '#55a974',
  mid: '#78c76d',
  light: '#91d874',
  bright: '#a1e27d',
};
const PINE: FoliagePalette = {
  edge: '#337557',
  dark: '#3b885e',
  shade: '#4b9d6c',
  mid: '#64b878',
  light: '#7aca83',
  bright: '#8ad58e',
};
const AUTUMN: FoliagePalette = {
  edge: '#86623d',
  dark: '#a27842',
  shade: '#bd944f',
  mid: '#d5b25d',
  light: '#e7ca77',
  bright: '#f4dc90',
};

function treeBase(surface: PixelSurface, small = false) {
  const radius = small ? 18 : 24;
  surface.ellipse(2, 2, radius + 4, 10, '#29494b30');
  surface.ellipse(0, -2, radius, 11, '#9ed6a0');
  surface.ellipse(-2, -3, radius - 3, 9, '#d1ebbf');
  surface.ellipse(1, -4, radius - 6, 7, '#a9db9d');
  for (const [x, y] of [
    [-19, -3],
    [-15, -9],
    [-7, -12],
    [6, -11],
    [17, -7],
    [20, 0],
    [13, 5],
    [-12, 5],
  ]) {
    const dx = small ? Math.round(x * 0.72) : x;
    surface.line({ x: dx, y }, { x: dx + 2, y: y - 3 }, '#cbeab7');
    surface.set(dx + 3, y - 1, '#7ebc86');
  }
  // A short, warm trunk with separated roots. The light comes from upper left.
  for (let y = -48; y <= 1; y++) {
    const half = (small ? 6 : 9) + (y > -12 ? (-12 - y) * -0.27 : 0);
    for (let x = -Math.ceil(half); x <= Math.ceil(half); x++) {
      if (Math.abs(x) > half) continue;
      const edge = Math.abs(x) > half - 1 || y === 1;
      surface.set(x, y, edge ? '#775644' : x < -3 ? '#c99168' : x < 1 ? '#ad7658' : '#8f624d');
    }
  }
  surface.line({ x: -4, y: -24 }, { x: -4, y: -5 }, '#e1ac79');
  surface.line({ x: 3, y: -28 }, { x: 4, y: -8 }, '#724e41');
  surface.line({ x: 2, y: -13 }, { x: 7, y: -3 }, '#b6805c');
  surface.line({ x: -6, y: -9 }, { x: -13, y: 0 }, '#9c6d50');
  surface.line({ x: 6, y: -8 }, { x: 13, y: 0 }, '#795543');
  surface.line({ x: -7, y: -5 }, { x: -12, y: 0 }, '#d29b6b');
}

// The underside of each bough is a hand-placed arc. Tiny overlapping leaf
// shapes follow it; the large illuminated areas above it stay deliberately clear.
function leafArc(
  surface: PixelSurface,
  mask: Set<string>,
  palette: FoliagePalette,
  cx: number,
  cy: number,
  rx: number,
  depth: number,
  heavy = false,
) {
  const paint = (x: number, y: number, color: string) => {
    if (mask.has(`${x},${y}`)) surface.set(x, y, color);
  };
  for (let x = Math.ceil(cx - rx); x <= cx + rx; x++) {
    const t = (x - cx) / rx;
    const y = Math.round(cy + Math.sqrt(Math.max(0, 1 - t * t)) * depth);
    const tooth = [0, 1, 2, 1, 0, -1][((x % 6) + 6) % 6];
    for (let row = 0; row < (heavy ? 6 : 4); row++) {
      paint(x, y + row + tooth, row > (heavy ? 3 : 2) ? palette.dark : palette.shade);
    }
  }
  for (let x = Math.ceil(cx - rx + 3); x < cx + rx - 2; x += 6) {
    const t = (x - cx) / rx;
    const y = Math.round(cy + Math.sqrt(Math.max(0, 1 - t * t)) * depth);
    // Two staggered tips lift from the shadow, with one-pixel light on the left.
    for (const [dx, dy] of [
      [0, -3],
      [0, -2],
      [1, -2],
      [1, -1],
      [2, -1],
      [2, 0],
      [3, 0],
      [3, 1],
      [1, 1],
      [2, 2],
    ])
      paint(x + dx, y + dy, palette.mid);
    paint(x, y - 3, palette.light);
    paint(x + 1, y - 2, palette.light);
    if (heavy) {
      paint(x + 4, y + 3, palette.edge);
      paint(x + 4, y + 4, palette.edge);
    }
  }
}

function makeRoundTree(palette: FoliagePalette): PixelArt {
  const surface = new PixelSurface();
  treeBase(surface);
  const lobes = [
    [0, -136, 35, 29],
    [-17, -110, 38, 35],
    [24, -106, 36, 36],
    [0, -77, 72, 45],
  ];
  const mask = new Set<string>();
  for (let y = -166; y <= -30; y++)
    for (let x = -74; x <= 74; x++) {
      if (lobes.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1))
        mask.add(`${x},${y}`);
    }
  // A few connected leaf tips soften the oval geometry without noisy fills.
  for (let y = -156, row = 0; y < -39; y += [6, 8, 5, 7][row++ % 4]) {
    const rowPixels = Array.from({ length: 149 }, (_, i) => i - 74).filter((x) =>
      mask.has(`${x},${y}`),
    );
    if (!rowPixels.length) continue;
    for (const [x, side] of [
      [rowPixels[0], -1],
      [rowPixels.at(-1)!, 1],
    ]) {
      for (const [dx, dy] of [
        [0, 0],
        [1, 1],
        [2, 1],
        [2, 2],
        [1, 3],
        [0, 3],
      ])
        mask.add(`${x + dx * side},${y + dy}`);
    }
  }
  for (const position of mask) {
    const [x, y] = position.split(',').map(Number);
    const underside = !mask.has(`${x},${y + 2}`);
    const fringe = !mask.has(`${x},${y + 7}`);
    const transition = !mask.has(`${x},${y + 12}`);
    const color = underside
      ? palette.dark
      : fringe
        ? palette.shade
        : transition
          ? palette.mid
          : palette.light;
    surface.set(x, y, color);
  }
  leafArc(surface, mask, palette, -22, -130, 18, 8);
  leafArc(surface, mask, palette, 23, -130, 20, 10);
  leafArc(surface, mask, palette, -39, -99, 23, 12);
  leafArc(surface, mask, palette, 43, -97, 20, 10);
  leafArc(surface, mask, palette, 0, -53, 68, 16, true);
  // Sparse silhouette tufts, all attached to the lower edge of the crown.
  for (let x = -65; x <= 65; x += 7) {
    let y = -30;
    while (y > -130 && !mask.has(`${x},${y}`)) y--;
    if (y === -130) continue;
    surface.set(x, y + 1, palette.dark);
    surface.set(x + 1, y + 1, palette.shade);
    surface.set(x + 2, y, palette.mid);
    surface.set(x + 2, y - 1, palette.light);
  }
  return surface.paths();
}

function makePineTree(palette: FoliagePalette): PixelArt {
  const surface = new PixelSurface();
  treeBase(surface, true);
  // Branch tiers overlap from the bottom up, with generous flat green faces.
  const tiers = [
    { top: -102, base: -31, half: 47, depth: 11 },
    { top: -127, base: -58, half: 40, depth: 10 },
    { top: -148, base: -84, half: 32, depth: 9 },
    { top: -165, base: -110, half: 23, depth: 7 },
    { top: -172, base: -138, half: 13, depth: 5 },
  ];
  for (const { top, base, half, depth } of tiers) {
    const mask = new Set<string>();
    for (let y = top; y <= base + depth; y++)
      for (let x = -half - 2; x <= half + 2; x++) {
        const taper = (y - top) / (base - top);
        const branchWidth = Math.min(half, half * Math.pow(Math.max(0, taper), 0.88));
        const lower = base + depth * Math.sqrt(Math.max(0, 1 - (x / half) ** 2));
        if (Math.abs(x) <= branchWidth && y <= lower) mask.add(`${x},${y}`);
      }
    for (const position of mask) {
      const [x, y] = position.split(',').map(Number);
      const lower = !mask.has(`${x},${y + 4}`),
        edge = !mask.has(`${x},${y + 1}`);
      surface.set(
        x,
        y,
        edge ? palette.edge : lower ? palette.dark : x > half * 0.55 ? palette.shade : palette.mid,
      );
    }
    leafArc(surface, mask, palette, 0, base - 4, half - 1, depth, true);
    // Short needles along the sloping silhouette. Their spacing follows the
    // branch geometry and never fills the canopy with an all-over noise texture.
    for (let y = top + 10; y < base - 3; y += 8) {
      const width = Math.floor(half * Math.pow((y - top) / (base - top), 0.88));
      for (const side of [-1, 1]) {
        surface.set(side * width, y, palette.light);
        surface.set(side * (width + 1), y + 1, palette.shade);
        surface.set(side * (width + 2), y + 2, palette.dark);
        surface.set(side * width, y + 2, palette.mid);
      }
    }
  }
  return surface.paths();
}

function makeBirchTree(): PixelArt {
  const surface = new PixelSurface();
  treeBase(surface);
  // A pale forked trunk stays exposed between the separated leaf crowns.
  for (let y = -110; y <= 1; y++) {
    const bend = Math.round(Math.sin((y + 30) / 26) * 4);
    for (let x = -7; x <= 7; x++)
      surface.set(x + bend, y, x > 4 ? '#8ea3a3' : x < -4 ? '#c6d3c5' : '#e6ebd6');
  }
  for (const direction of [-1, 1])
    for (let width = -4; width <= 5; width++) {
      surface.line(
        { x: width, y: -56 },
        { x: direction * 37 + width, y: -112 },
        width > 2 ? '#99afaa' : '#e4e9d4',
      );
    }
  for (const [x, y, w] of [
    [-4, -17, 7],
    [0, -28, 8],
    [-7, -42, 6],
    [-1, -58, 7],
    [-5, -73, 5],
    [3, -91, 4],
  ]) {
    surface.line({ x, y }, { x: x + w, y: y + 1 }, '#728f8e');
    surface.line({ x: x + 1, y: y - 1 }, { x: x + w - 2, y: y - 1 }, '#becdc2');
  }
  const palette = {
    ...GREEN,
    light: '#9edb69',
    mid: '#7ac861',
    shade: '#59b268',
    dark: '#429b61',
    edge: '#438f5c',
  };
  for (const [cx, cy, rx, ry] of [
    [-33, -130, 34, 25],
    [16, -145, 37, 28],
    [42, -111, 31, 24],
    [-32, -88, 33, 24],
    [12, -82, 35, 26],
  ]) {
    const mask = new Set<string>();
    for (let y = cy - ry; y <= cy + ry; y++)
      for (let x = cx - rx; x <= cx + rx; x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) mask.add(`${x},${y}`);
      }
    for (const position of mask) {
      const [x, y] = position.split(',').map(Number);
      const color = !mask.has(`${x},${y + 2}`)
        ? palette.dark
        : !mask.has(`${x},${y + 7}`)
          ? palette.shade
          : !mask.has(`${x},${y + 11}`)
            ? palette.mid
            : palette.light;
      surface.set(x, y, color);
    }
    leafArc(surface, mask, palette, cx, cy + ry - 12, rx - 3, 7, true);
  }
  return surface.paths();
}

const PLANT = makePlant();
const TREE = makeRoundTree(GREEN);
const AUTUMN_TREE = makeRoundTree(AUTUMN);
const PINE_TREE = makePineTree(PINE);
const AUTUMN_PINE_TREE = makePineTree(AUTUMN);
const BIRCH_TREE = makeBirchTree();

function PixelPaths({ art }: { art: PixelArt }) {
  return (
    <>
      {art.map(({ color, d }) => (
        <path
          key={color}
          d={d}
          fill={color.slice(0, 7)}
          opacity={color.length === 9 ? parseInt(color.slice(7), 16) / 255 : undefined}
        />
      ))}
    </>
  );
}

export function PixelPlant({ large = false }: { large?: boolean }) {
  if (large)
    return (
      <image
        href="/assets/pixel/dracaena.png"
        x="-40"
        y="-106"
        width="80"
        height="112"
        className="pixel-resource"
      />
    );
  return (
    <g shapeRendering="crispEdges">
      <PixelPaths art={PLANT} />
    </g>
  );
}

export function PixelTree({
  autumn = false,
  variant = 'round',
}: {
  autumn?: boolean;
  variant?: 'round' | 'pine' | 'birch';
}) {
  const art =
    variant === 'birch'
      ? BIRCH_TREE
      : variant === 'pine'
        ? autumn
          ? AUTUMN_PINE_TREE
          : PINE_TREE
        : autumn
          ? AUTUMN_TREE
          : TREE;
  return (
    <g shapeRendering="crispEdges">
      <PixelPaths art={art} />
    </g>
  );
}
