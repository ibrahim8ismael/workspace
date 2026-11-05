import { type PixelSprite } from './pixel';
import { spritePaths } from './pixel';
import { REFERENCE_FLOORS } from './referenceArt';
import { artPack } from './artPack';

/** Floor textures of the reference office, 32 × 32 tiles. Keys follow the area data (`floor` + `floorColor`). */
/** Lawn with texture: a mid green base, darker tufts and light blade tips, tileable at 32 px. */
function lawn(): PixelSprite {
  const rows: string[] = [];
  const tufts = [
    [3, 2],
    [14, 5],
    [25, 3],
    [8, 11],
    [20, 13],
    [29, 10],
    [2, 19],
    [12, 22],
    [23, 20],
    [6, 28],
    [17, 29],
    [28, 26],
  ];
  const blades = [
    [9, 1],
    [19, 3],
    [30, 7],
    [1, 8],
    [16, 9],
    [27, 16],
    [5, 15],
    [11, 18],
    [22, 24],
    [0, 25],
    [14, 26],
    [31, 29],
    [8, 31],
    [24, 31],
  ];
  for (let y = 0; y < 32; y++) {
    let row = '';
    for (let x = 0; x < 32; x++) {
      let ch = (x * 7 + y * 13) % 11 === 0 ? 'm' : 'b';
      for (const [tx, ty] of tufts) {
        const dx = x - tx,
          dy = y - ty;
        if (
          (dx === 0 && dy >= -1 && dy <= 1) ||
          (dy === 1 && Math.abs(dx) === 1) ||
          (dy === 0 && Math.abs(dx) === 1)
        )
          ch = 'd';
        if (dx === 0 && dy === -2) ch = 'l';
      }
      for (const [bx, by] of blades) if (x === bx && y === by) ch = 'l';
      row += ch;
    }
    rows.push(row);
  }
  return {
    w: 32,
    h: 32,
    palette: { b: '#4e8a48', m: '#478040', d: '#3d7239', l: '#69a65c' },
    rows,
  };
}
const grass = lawn();

function slats(base: string, seam: string): PixelSprite {
  // Horizontal planks, 8 px tall, with staggered vertical joints.
  const rows: string[] = [];
  for (let y = 0; y < 32; y++) {
    const plank = Math.floor(y / 8);
    const joint = [6, 22, 14, 30][plank];
    let row = '';
    for (let x = 0; x < 32; x++) row += y % 8 === 7 ? 's' : x === joint ? 's' : 'b';
    rows.push(row);
  }
  return { w: 32, h: 32, palette: { b: base, s: seam }, rows };
}
const woodLight = slats('#a27f6b', '#98735f');
const wood = slats('#98735f', '#8f6b59');

/** Offset blocks: 16 × 8 bricks that step half a block left and right row by row, with a 1 px saw edge. */
function steps(base: string, block: string): PixelSprite {
  const rows: string[] = [];
  const shift = [0, 8, 0, 24];
  for (let y = 0; y < 32; y++) {
    const start = shift[Math.floor(y / 8)] + (y % 2);
    let row = '';
    for (let x = 0; x < 32; x++) row += (x - start + 32) % 32 < 16 ? 'w' : 'b';
    rows.push(row);
  }
  return { w: 32, h: 32, palette: { b: base, w: block }, rows };
}
const carpetWavyBlue = steps('#465368', '#536176');
const carpetWavyGray = steps('#616670', '#6a6d77');

/** Wide vertical bands, 16 px each, with a 1 px saw edge. */
function stripe(base: string, line: string): PixelSprite {
  const rows: string[] = [];
  for (let y = 0; y < 32; y++) {
    let row = '';
    for (let x = 0; x < 32; x++) row += (x - 8 + (y % 2 ? 1 : 0) + 32) % 32 < 17 ? 'l' : 'b';
    rows.push(row);
  }
  return { w: 32, h: 32, palette: { b: base, l: line }, rows };
}
const carpetStripeGray = stripe('#616670', '#6a6d77');

/** A medallion carpet: a ring with a cross and a centre stone in every tile, quarter flowers at the corners. */
function couture(base: string, motif: string): PixelSprite {
  const rows: string[] = [];
  for (let y = 0; y < 32; y++) {
    let row = '';
    for (let x = 0; x < 32; x++) {
      const dx = x - 15.5,
        dy = y - 15.5,
        r = Math.hypot(dx, dy);
      const cx = Math.min(x, 31 - x),
        cy = Math.min(y, 31 - y),
        corner = Math.hypot(cx, cy);
      const ring = r > 8.5 && r < 11.5;
      const cross = (Math.abs(dx) < 1.5 && r < 8) || (Math.abs(dy) < 1.5 && r < 8);
      const stone = r < 3;
      const petals = corner < 6.5 && !(corner < 3.5 && corner > 2);
      const dots = Math.abs(Math.abs(dx) - Math.abs(dy)) < 1 && r > 12.5 && r < 14.5;
      row += ring || cross || stone || petals || dots ? 'm' : 'b';
    }
    rows.push(row);
  }
  return { w: 32, h: 32, palette: { b: base, m: motif }, rows };
}
const carpetCoutureWhite = couture('#8e8d9b', '#8b8596');

/** A diamond lattice drawn with double lines along both diagonals. */
function diamond(base: string, line: string): PixelSprite {
  const rows: string[] = [];
  const band = (v: number) => [1, 2, 3, 6, 7, 8].includes(v);
  for (let y = 0; y < 32; y++) {
    let row = '';
    for (let x = 0; x < 32; x++)
      row += band((x + y + 4) % 32) || band((x - y + 36) % 32) ? 'l' : 'b';
    rows.push(row);
  }
  return { w: 32, h: 32, palette: { b: base, l: line }, rows };
}
const carpetDiamondWhite = diamond('#9c949f', '#8e8d9b');

/** Outdoor floors: deterministic noise so every tile matches its neighbours. */
const noise = (x: number, y: number, seed: number) => {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
function sand(): PixelSprite {
  const rows: string[] = [];
  for (let y = 0; y < 32; y++) {
    let row = '';
    for (let x = 0; x < 32; x++) {
      const n = noise(x, y, 3);
      row += n > 0.94 ? 'd' : n > 0.88 ? 'l' : n < 0.04 ? 'p' : 'b';
    }
    rows.push(row);
  }
  return {
    w: 32,
    h: 32,
    palette: { b: '#e9d3a2', d: '#cfb37f', l: '#f6e6bf', p: '#d9a98a' },
    rows,
  };
}
/** Water, one frame of four: the ripples drift to the right and bob a pixel, so the sea moves. */
function water(base: string, ripple: string, light: string, frame = 0): PixelSprite {
  const rows: string[] = [];
  for (let y = 0; y < 32; y++) {
    let row = '';
    for (let x = 0; x < 32; x++) {
      const bob = frame % 2;
      const wave =
        (x - frame * 4 + Math.round(Math.sin(((y + frame * 2) / 32) * Math.PI * 2) * 3) + 64) % 16;
      const band = (y + bob) % 8 === 3 && wave < 5;
      const glint = (y + bob) % 8 === 4 && wave >= 1 && wave < 3;
      row += band ? 'r' : glint ? 'l' : noise((x - frame * 4 + 64) % 32, y, 7) > 0.975 ? 'l' : 'b';
    }
    rows.push(row);
  }
  return { w: 32, h: 32, palette: { b: base, r: ripple, l: light }, rows };
}
/** The shore, one frame of four: the foam line washes up the sand and back. */
function shore(frame = 0): PixelSprite {
  const reach = [0, 2, 4, 2][frame];
  const rows: string[] = [];
  for (let y = 0; y < 32; y++) {
    let row = '';
    for (let x = 0; x < 32; x++) {
      const edge = 16 - reach + Math.round(Math.sin(((x + frame * 3) / 32) * Math.PI * 2) * 2);
      row +=
        y < edge - 3
          ? noise(x, y, 3) > 0.92
            ? 'd'
            : y >= edge - 5 && reach < 2
              ? 'm'
              : 's'
          : y < edge - 1
            ? 'w'
            : y < edge + 1
              ? (x + frame) % 5 === 0
                ? 'f'
                : 'w'
              : y < edge + 3
                ? 'f'
                : noise(x, (y + frame) % 32, 9) > 0.95
                  ? 'l'
                  : 'b';
    }
    rows.push(row);
  }
  return {
    w: 32,
    h: 32,
    palette: {
      s: '#e9d3a2',
      d: '#d4b986',
      m: '#d8bf8f',
      w: '#f4f1e8',
      f: '#bfe6ea',
      b: '#5fb6c9',
      l: '#8fd3df',
    },
    rows,
  };
}
/** Dunes: sand with tufts of beach grass, between the lawn and the beach. */
function dune(): PixelSprite {
  const rows: string[] = [];
  const tufts = [
    [4, 6],
    [19, 3],
    [27, 14],
    [9, 20],
    [23, 25],
    [13, 11],
    [2, 28],
    [30, 22],
  ];
  for (let y = 0; y < 32; y++) {
    let row = '';
    for (let x = 0; x < 32; x++) {
      let ch = noise(x, y, 3) > 0.93 ? 'd' : 's';
      for (const [tx, ty] of tufts) {
        const dx = x - tx,
          dy = y - ty;
        if (dy >= -3 && dy <= 0 && Math.abs(dx) <= (dy === 0 ? 2 : dy === -1 ? 1 : 0))
          ch = dy === 0 ? 'g' : 'h';
        if (dy === -3 && Math.abs(dx) === 2) ch = 'h';
      }
      row += ch;
    }
    rows.push(row);
  }
  return {
    w: 32,
    h: 32,
    palette: { s: '#e6cd98', d: '#cfb37f', g: '#5f9a4f', h: '#7cb562' },
    rows,
  };
}
/** A pier tile: planks across the pier, a dark beam with round posts on the open sides and a beam at the end. */
function pier({ left = false, right = false, end = false } = {}): PixelSprite {
  const rows: string[] = [];
  for (let y = 0; y < 32; y++) {
    let row = '';
    for (let x = 0; x < 32; x++) {
      const outer = (left && x < 4) || (right && x > 27) || (end && y > 27);
      const post =
        (((left && x < 6) || (right && x > 25)) && y % 16 >= 5 && y % 16 <= 10) ||
        (end && y > 25 && x % 16 >= 5 && x % 16 <= 10);
      const postTop =
        post &&
        (((left || right) && (y % 16 === 5 || y % 16 === 6)) || (end && (y === 26 || y === 27)));
      if (post) row += postTop ? 'q' : 'p';
      else if (outer)
        row += (left && x === 3) || (right && x === 28) || (end && y === 28) ? 'e' : 'k';
      else {
        const gap = y % 6 === 5,
          plank = Math.floor(y / 6);
        const nail =
          !gap && y % 6 === 2 && (x === 6 + (plank % 2) * 2 || x === 25 - (plank % 2) * 2);
        row += gap
          ? 'g'
          : nail
            ? 'n'
            : noise(Math.floor(x / 11) + plank * 3, plank, 4) > 0.5
              ? 'b'
              : 'c';
      }
    }
    rows.push(row);
  }
  return {
    w: 32,
    h: 32,
    palette: {
      b: '#c39a6b',
      c: '#b38a5d',
      g: '#6e5038',
      n: '#7b5c43',
      k: '#5a3f2c',
      e: '#3f2b1f',
      p: '#6b4a33',
      q: '#9a7350',
    },
    rows,
  };
}
/** Asphalt; `line` paints the dashed centre line along the tile's bottom edge, `zebra` the crossing stripes. */
function asphalt({ line = false, zebra = false } = {}): PixelSprite {
  const rows: string[] = [];
  for (let y = 0; y < 32; y++) {
    let row = '';
    for (let x = 0; x < 32; x++) {
      const dash = line && y >= 29 && x % 32 < 18 && x % 32 >= 2;
      const stripe = zebra && x % 16 >= 3 && x % 16 < 12 && y >= 2 && y < 30;
      const n = noise(x, y, 11);
      row += dash ? 'y' : stripe ? (n > 0.9 ? 'z' : 'w') : n > 0.93 ? 'l' : n < 0.06 ? 'd' : 'b';
    }
    rows.push(row);
  }
  return {
    w: 32,
    h: 32,
    palette: { b: '#4b4f57', l: '#5a5e66', d: '#3f4249', y: '#f2c94c', w: '#e9e9e4', z: '#cfcfca' },
    rows,
  };
}
/** Sidewalk slabs; `curb` adds the kerb along the side that meets the road ('top' or 'bottom'). */
function sidewalk(curb: '' | 'top' | 'bottom' = ''): PixelSprite {
  const rows: string[] = [];
  for (let y = 0; y < 32; y++) {
    let row = '';
    for (let x = 0; x < 32; x++) {
      const kerb = (curb === 'bottom' && y >= 27) || (curb === 'top' && y < 5);
      const kerbEdge = (curb === 'bottom' && y === 27) || (curb === 'top' && y === 4);
      const kerbShade = (curb === 'bottom' && y >= 30) || (curb === 'top' && y < 2);
      const joint = x % 16 === 15 || y % 16 === 15;
      row += kerb
        ? kerbEdge
          ? 'e'
          : kerbShade
            ? 's'
            : 'k'
        : joint
          ? 'j'
          : noise(Math.floor(x / 16), Math.floor(y / 16), 6) > 0.5
            ? 'b'
            : 'c';
    }
    rows.push(row);
  }
  return {
    w: 32,
    h: 32,
    palette: { b: '#c9c6bf', c: '#c1beb6', j: '#a9a59d', k: '#b3b0a9', e: '#dedbd4', s: '#8d8a83' },
    rows,
  };
}
function cobbles(): PixelSprite {
  const rows: string[] = [];
  for (let y = 0; y < 32; y++) {
    let row = '';
    for (let x = 0; x < 32; x++) {
      const by = Math.floor(y / 8),
        offset = by % 2 ? 6 : 0,
        bx = (x + offset) % 12;
      const joint = y % 8 === 7 || bx === 11;
      row += joint
        ? 'j'
        : y % 8 === 0 || bx === 0
          ? 'l'
          : noise(Math.floor((x + offset) / 12), by, 5) > 0.5
            ? 'b'
            : 'c';
    }
    rows.push(row);
  }
  return {
    w: 32,
    h: 32,
    palette: { b: '#b6b2a8', c: '#a7a399', l: '#cdc9be', j: '#8a867c' },
    rows,
  };
}

/** The project's own floor drawings, used by the original art pack. */
export const ORIGINAL_FLOOR_TILES: Record<string, PixelSprite> = {
  'NewStyleGrass/Green': grass,
  'WoodSlatsLt/LightWood': woodLight,
  'WoodSlats/Wood': wood,
  'CarpetWave/Blue': carpetWavyBlue,
  'CarpetWaveGray/LightGray': carpetWavyGray,
  'CarpetStripeGray/LightGray': carpetStripeGray,
  'CarpetCouture/White': carpetCoutureWhite,
  'CarpetDiamond/LightWhite': carpetDiamondWhite,
  'Sand/Beige': sand(),
  'Shore/Foam': shore(),
  'Water/Shallow': water('#5fb6c9', '#8fd3df', '#c3ecf2'),
  'Water/Deep': water('#3a8fb3', '#5aa9c8', '#8fd3df'),
  'Dune/Beige': dune(),
  'Pier/Center': pier(),
  'Pier/Left': pier({ left: true }),
  'Pier/Right': pier({ right: true }),
  'Pier/EndCenter': pier({ end: true }),
  'Pier/EndLeft': pier({ left: true, end: true }),
  'Pier/EndRight': pier({ right: true, end: true }),
  'StonePath/Grey': cobbles(),
  'Road/Asphalt': asphalt(),
  'Road/Line': asphalt({ line: true }),
  'Road/Zebra': asphalt({ zebra: true }),
  'Sidewalk/Grey': sidewalk(),
  'Sidewalk/CurbBottom': sidewalk('bottom'),
  'Sidewalk/CurbTop': sidewalk('top'),
};
export const FLOOR_TILES: Record<string, PixelSprite> = {
  ...ORIGINAL_FLOOR_TILES,
  ...REFERENCE_FLOORS,
};
export const floorKey = (texture: string, color: string) => `${texture}/${color}`;
export const floorPatternId = (key: string) =>
  `floor-${key.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;

/** SVG pattern definitions for every floor tile. */
/** Floors that move: the sea and the shore cycle through four frames. */
const FRAMES = [0, 1, 2, 3];
const ANIMATED_FLOORS: Record<string, { frames: PixelSprite[]; duration: number }> = {
  'Water/Shallow': {
    frames: FRAMES.map((f) => water('#5fb6c9', '#8fd3df', '#c3ecf2', f)),
    duration: 1.6,
  },
  'Water/Deep': {
    frames: FRAMES.map((f) => water('#3a8fb3', '#5aa9c8', '#8fd3df', f)),
    duration: 2.2,
  },
  'Shore/Foam': { frames: FRAMES.map((f) => shore(f)), duration: 2.4 },
};
const reducedMotion = () => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
function SpriteGroup({ sprite }: { sprite: PixelSprite }) {
  return (
    <>
      {spritePaths(sprite).map((path) => (
        <path key={path.color} d={path.d} fill={path.color} />
      ))}
    </>
  );
}

export function FloorPatterns() {
  const still = reducedMotion();
  return (
    <defs>
      {Object.entries(artPack() === 'reference' ? FLOOR_TILES : ORIGINAL_FLOOR_TILES).map(
        ([key, sprite]) => {
          const animated = !still && ANIMATED_FLOORS[key];
          return (
            <pattern
              key={key}
              id={floorPatternId(key)}
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              {animated ? (
                animated.frames.map((frame, index) => (
                  <g key={index} opacity={index === 0 ? 1 : 0}>
                    <SpriteGroup sprite={frame} />
                    <animate
                      attributeName="opacity"
                      dur={`${animated.duration}s`}
                      repeatCount="indefinite"
                      calcMode="discrete"
                      values={FRAMES.map((f) => (f === index ? 1 : 0)).join(';')}
                    />
                  </g>
                ))
              ) : (
                <SpriteGroup sprite={sprite} />
              )}
            </pattern>
          );
        },
      )}
    </defs>
  );
}
