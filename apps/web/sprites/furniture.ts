import { surface, Surface } from './draw.ts';
import type { PixelSprite } from './pixel.ts';

export type Facing = 'Up' | 'Down' | 'Left' | 'Right';
type Maker = (color: string, facing: Facing) => Surface | null;
const cache = new Map<string, PixelSprite | null>();

const P = {
  outline: '#20242e',
  white: '#f0f1fb',
  whiteEdge: '#c9cde0',
  whiteSide: '#aeb5cb',
  dark: '#2f3542',
  grey: '#8b93a8',
  greyDark: '#5a6275',
  red: '#e4484f',
  redDark: '#b8323c',
  redLight: '#f07076',
  redOutline: '#7a1f26',
  frame: '#3a4556',
  frameLight: '#55637a',
  black: '#343b4d',
  blackLight: '#4a5466',
  blackHi: '#6f7b92',
};
const GLASS: Record<string, [string, string]> = {
  green: ['#9ae0c6', '#c8f1e4'],
  blue: ['#5cc0f0', '#9ee2ff'],
  lightblue: ['#a8e4f6', '#d6f4ff'],
};
const BOOKS = [
  '#e05a5a',
  '#4e8fd6',
  '#f2c14e',
  '#5fb86a',
  '#f08b4b',
  '#9b6fd6',
  '#e6e8f2',
  '#3a4556',
];

function books(s: Surface, x: number, y: number, w: number, h: number, seed: number) {
  let i = x,
    n = seed;
  while (i < x + w) {
    const bw = 2 + (n % 2);
    const color = BOOKS[n % BOOKS.length];
    s.rect(i, y + (n % 3 === 0 ? 1 : 0), Math.min(bw, x + w - i), h - (n % 3 === 0 ? 1 : 0), color);
    i += bw + (n % 4 === 0 ? 1 : 0);
    n += 7;
  }
}

const MAKERS: Record<string, Maker> = {
  'office-desk': () => {
    const s = surface(92, 41);
    s.rect(0, 0, 92, 28, P.whiteEdge).rect(1, 1, 90, 26, P.white).hline(1, 27, 90, P.whiteEdge);
    s.rect(0, 28, 92, 3, P.whiteSide).rect(0, 31, 92, 10, P.dark);
    s.rect(2, 31, 30, 10, P.grey)
      .frame(2, 31, 30, 10, P.greyDark)
      .hline(3, 35, 28, P.greyDark)
      .rect(14, 33, 6, 1, P.whiteEdge)
      .rect(14, 37, 6, 1, P.whiteEdge);
    s.rect(86, 31, 4, 10, P.grey).rect(40, 31, 4, 10, P.grey);
    return s;
  },
  'oval-desk': () => {
    const s = surface(92, 43);
    s.ellipse(0, 0, 92, 30, P.whiteEdge)
      .ellipse(1, 1, 90, 28, P.white)
      .rect(10, 24, 72, 8, P.whiteSide)
      .rect(0, 30, 92, 2, P.whiteSide);
    s.rect(6, 31, 80, 12, P.dark).rect(20, 31, 52, 12, P.grey).rect(26, 33, 40, 6, P.dark);
    return s;
  },
  'simple-table-2x3': () => {
    const s = surface(96, 74);
    s.rect(0, 0, 96, 64, P.whiteEdge).rect(1, 1, 94, 62, P.white).rect(0, 62, 96, 3, P.whiteSide);
    s.rect(2, 65, 8, 9, P.grey)
      .rect(86, 65, 8, 9, P.grey)
      .rect(3, 65, 2, 9, P.whiteEdge)
      .rect(87, 65, 2, 9, P.whiteEdge);
    return s;
  },
  'aeron-chair': (_color, facing) => {
    const s = surface(24, 23);
    if (facing === 'Up') {
      s.rounded(2, 1, 20, 15, P.outline, 2)
        .rounded(3, 2, 18, 13, P.black, 2)
        .rect(5, 4, 14, 9, P.blackLight)
        .checker(6, 5, 12, 7, P.blackHi);
      s.rect(0, 6, 3, 7, P.outline)
        .rect(21, 6, 3, 7, P.outline)
        .rect(1, 7, 1, 5, P.blackHi)
        .rect(22, 7, 1, 5, P.blackHi);
      s.rect(11, 16, 2, 3, P.outline)
        .rect(4, 19, 16, 2, P.outline)
        .rect(6, 21, 3, 2, P.outline)
        .rect(15, 21, 3, 2, P.outline)
        .rect(11, 21, 2, 2, P.outline);
    } else if (facing === 'Down') {
      s.rounded(2, 0, 20, 8, P.outline, 2)
        .rounded(3, 1, 18, 6, P.black, 2)
        .rect(5, 2, 14, 3, P.blackHi);
      s.rounded(3, 7, 18, 9, P.outline, 2).rounded(4, 8, 16, 7, P.blackLight, 2);
      s.rect(0, 5, 3, 7, P.outline).rect(21, 5, 3, 7, P.outline);
      s.rect(11, 16, 2, 3, P.outline)
        .rect(4, 19, 16, 2, P.outline)
        .rect(6, 21, 3, 2, P.outline)
        .rect(15, 21, 3, 2, P.outline)
        .rect(11, 21, 2, 2, P.outline);
    } else {
      s.rounded(3, 0, 8, 16, P.outline, 2)
        .rounded(4, 1, 6, 14, P.black, 2)
        .checker(5, 2, 4, 12, P.blackHi);
      s.rounded(9, 8, 12, 8, P.outline, 2)
        .rounded(10, 9, 10, 6, P.blackLight, 2)
        .rect(8, 6, 12, 2, P.outline);
      s.rect(11, 16, 2, 3, P.outline)
        .rect(4, 19, 16, 2, P.outline)
        .rect(6, 21, 3, 2, P.outline)
        .rect(15, 21, 3, 2, P.outline)
        .rect(11, 21, 2, 2, P.outline);
      if (facing === 'Left') return s.flipX();
    }
    return s;
  },
  'space-chair': (_color, facing) => {
    if (facing === 'Down') {
      const s = surface(24, 28);
      s.rounded(1, 0, 22, 12, P.redOutline, 2)
        .rounded(2, 1, 20, 10, P.red, 2)
        .rect(4, 2, 16, 3, P.redLight);
      s.rounded(0, 9, 7, 13, P.redOutline, 2)
        .rounded(1, 10, 5, 11, P.redDark, 2)
        .rounded(17, 9, 7, 13, P.redOutline, 2)
        .rounded(18, 10, 5, 11, P.redDark, 2);
      s.rounded(5, 12, 14, 11, P.redOutline, 2)
        .rounded(6, 13, 12, 9, P.red, 2)
        .rect(7, 14, 10, 2, P.redLight);
      s.rect(3, 23, 3, 5, P.outline)
        .rect(18, 23, 3, 5, P.outline)
        .rect(4, 23, 1, 4, P.greyDark)
        .rect(19, 23, 1, 4, P.greyDark);
      return s;
    }
    if (facing === 'Up') {
      const s = surface(22, 19);
      s.rounded(1, 0, 20, 14, P.redOutline, 2)
        .rounded(2, 1, 18, 12, P.red, 2)
        .rect(4, 2, 14, 2, P.redLight)
        .rect(3, 9, 16, 4, P.redDark);
      s.rounded(0, 5, 5, 10, P.redOutline, 2)
        .rounded(1, 6, 3, 8, P.redDark, 2)
        .rounded(17, 5, 5, 10, P.redOutline, 2)
        .rounded(18, 6, 3, 8, P.redDark, 2);
      s.rect(3, 14, 3, 5, P.outline).rect(16, 14, 3, 5, P.outline);
      return s;
    }
    const s = surface(21, 28);
    s.rounded(0, 0, 9, 22, P.redOutline, 2)
      .rounded(1, 1, 7, 20, P.red, 2)
      .rect(2, 2, 2, 18, P.redLight);
    s.rounded(6, 10, 15, 12, P.redOutline, 2)
      .rounded(7, 11, 13, 10, P.red, 2)
      .rect(8, 12, 11, 2, P.redLight);
    s.rounded(14, 6, 7, 8, P.redOutline, 2).rounded(15, 7, 5, 6, P.redDark, 2);
    s.rect(3, 22, 3, 6, P.outline).rect(16, 22, 3, 6, P.outline);
    return facing === 'Left' ? s.flipX() : s;
  },
  'window-modern': (color) => {
    const [glass, light] = GLASS[color] ?? GLASS.blue;
    const s = surface(100, 58);
    s.rect(0, 0, 100, 58, P.frame).rect(1, 1, 98, 56, P.frameLight).rect(2, 2, 96, 54, P.frame);
    const cols = [
        [4, 28],
        [36, 28],
        [68, 28],
      ],
      rows = [
        [4, 12],
        [20, 20],
        [44, 10],
      ];
    for (const [x, w] of cols)
      for (const [y, h] of rows)
        s.rect(x, y, w, h, glass).rect(x, y, w, 2, light).rect(x, y, 2, h, light);
    return s;
  },
  'bookcase-tall': (color) => {
    const s = surface(59, 59);
    const frame = color === 'white' ? '#e3e6ef' : '#3f4759',
      edge = color === 'white' ? '#b9c0d2' : '#2a3040',
      inner = color === 'white' ? '#cfd4e2' : '#2f3747';
    s.rect(0, 0, 59, 59, edge)
      .rect(1, 1, 57, 57, frame)
      .rect(1, 1, 57, 11, color === 'white' ? '#f3f4fa' : '#4a5468');
    for (const y of [13, 27, 41]) {
      s.rect(3, y, 53, 12, inner);
      books(s, 5, y + 1, 49, 10, y);
      s.hline(3, y + 12, 53, edge);
    }
    s.rect(0, 55, 59, 4, edge);
    return s;
  },
  'cubicle-shelves': (color) => {
    const s = surface(72, 54);
    const frame = color === 'white' ? '#e3e6ef' : '#3f4759',
      edge = color === 'white' ? '#b9c0d2' : '#2a3040',
      inner = color === 'white' ? '#d6dae6' : '#2f3747';
    s.rect(0, 0, 72, 54, edge)
      .rect(1, 1, 70, 52, frame)
      .rect(1, 1, 70, 12, color === 'white' ? '#f3f4fa' : '#4a5468');
    const items = [
      '#e6e8f2',
      '#4e8fd6',
      '#5fb86a',
      '#f2c14e',
      '#9b6fd6',
      '#e05a5a',
      '#f08b4b',
      '#aeb5cb',
      '#3fb0c0',
      '#e6e8f2',
      '#5fb86a',
      '#4e8fd6',
    ];
    let n = 0;
    for (const y of [14, 27, 40])
      for (const x of [3, 20, 37, 54]) {
        s.rect(x, y, 15, 11, inner);
        s.rect(x + 4, y + 3, 7, 7, items[n++ % items.length]);
        s.rect(x + 4, y + 3, 7, 1, '#ffffff40');
      }
    return s;
  },
  'kitchen-cabinet-large': (color) => {
    const s = surface(64, 32);
    const body = color === 'grey' ? '#8b93a8' : '#3f4759',
      edge = color === 'grey' ? '#5a6275' : '#2a3040';
    s.rect(0, 0, 64, 20, P.whiteEdge).rect(1, 1, 62, 18, P.white).rect(0, 18, 64, 3, P.whiteSide);
    s.rect(0, 21, 64, 11, edge).rect(1, 22, 62, 10, body).vline(32, 22, 10, edge);
    for (const x of [12, 20, 42, 50]) s.rect(x, 25, 3, 2, P.whiteEdge);
    return s;
  },
  'mini-fridge': () => {
    const s = surface(24, 38);
    s.rect(0, 0, 24, 38, P.whiteEdge)
      .rect(1, 1, 22, 36, P.white)
      .rect(2, 2, 20, 6, '#dfe3ee')
      .rect(3, 11, 18, 24, '#9ad8f0')
      .rect(3, 11, 18, 2, '#bfe8f8');
    for (const [y, c] of [
      [15, '#e05a5a'],
      [20, '#5fb86a'],
      [25, '#f2c14e'],
      [30, '#4e8fd6'],
    ] as const)
      s.rect(5, y, 14, 3, c).rect(5, y + 3, 14, 1, '#7bc0dc');
    s.rect(17, 3, 4, 2, P.grey);
    return s;
  },
  'wall-cabinet': () =>
    surface(32, 24)
      .rect(0, 0, 32, 24, '#2a3040')
      .rect(1, 1, 30, 22, '#3f4759')
      .rect(1, 1, 30, 8, '#8b93a8')
      .vline(16, 9, 14, '#2a3040')
      .rect(12, 14, 2, 3, P.whiteEdge)
      .rect(18, 14, 2, 3, P.whiteEdge),
  'television-screen-wall': () =>
    surface(47, 31)
      .rect(0, 0, 47, 31, P.frame)
      .rect(1, 1, 45, 29, '#8b93a8')
      .rect(3, 3, 41, 25, '#30374a')
      .rect(4, 4, 39, 23, '#3d4660')
      .rect(5, 5, 37, 1, '#5a6480'),
  whiteboard: () => {
    const s = surface(62, 51);
    s.rect(2, 0, 58, 42, '#aeb5cb')
      .rect(3, 1, 56, 40, '#f6f7fb')
      .rect(8, 6, 10, 7, '#5cc0f0')
      .rect(20, 8, 16, 1, '#4e8fd6')
      .rect(20, 11, 12, 1, '#4e8fd6')
      .rect(40, 5, 8, 6, '#f2c14e')
      .rect(10, 20, 8, 7, '#5fb86a')
      .rect(22, 20, 24, 1, '#4e8fd6')
      .rect(22, 24, 18, 1, '#4e8fd6')
      .rect(36, 30, 14, 4, '#3a4556');
    s.rect(0, 42, 62, 2, P.greyDark)
      .rect(4, 44, 3, 7, P.grey)
      .rect(55, 44, 3, 7, P.grey)
      .rect(1, 49, 10, 2, P.greyDark)
      .rect(51, 49, 10, 2, P.greyDark);
    return s;
  },
  'abstract-painting-rectangles': () =>
    surface(30, 45)
      .rect(0, 0, 30, 45, '#aeb5cb')
      .rect(1, 1, 28, 43, '#f0f1fb')
      .rect(3, 3, 12, 10, '#f08b4b')
      .rect(16, 3, 11, 7, '#e05a5a')
      .rect(3, 15, 7, 27, '#4e8fd6')
      .rect(12, 12, 15, 9, '#5fb86a')
      .rect(12, 23, 8, 19, '#3fb0c0')
      .rect(22, 23, 5, 19, '#f2c14e'),
  'mondrian-painting': () =>
    surface(50, 43)
      .rect(0, 0, 50, 43, '#2a3040')
      .rect(2, 2, 46, 39, '#f0f1fb')
      .rect(10, 6, 18, 18, '#e05a5a')
      .rect(32, 4, 12, 8, '#f2c14e')
      .rect(4, 28, 10, 10, '#2f3eb8')
      .rect(36, 30, 10, 8, '#f2c14e')
      .vline(8, 2, 39, '#2a3040')
      .vline(30, 2, 39, '#2a3040')
      .hline(2, 26, 46, '#2a3040')
      .hline(2, 14, 46, '#2a3040'),
  'hip-wall-art': () => {
    const s = surface(96, 60).rect(0, 0, 96, 60, '#b9c0d2').rect(2, 2, 92, 56, '#eef0f6');
    for (let i = 0; i < 14; i++) {
      const x = 6 + (i % 5) * 18,
        y = 6 + Math.floor(i / 5) * 18,
        c = i % 3 ? '#4e8fd6' : '#8fa0b8';
      s.rect(x, y, 10, 3, c)
        .rect(x + 7, y + 3, 3, 6, c)
        .rect(x + 2, y + 9, 8, 3, c)
        .rect(x, y + 5, 3, 7, i % 2 ? c : '#b9c0d2');
    }
    return s;
  },
  'office-cabinet': () =>
    surface(32, 58)
      .rect(0, 0, 32, 58, '#2a3040')
      .rect(1, 1, 30, 56, '#3f4759')
      .rect(1, 1, 30, 10, '#8b93a8')
      .vline(16, 11, 47, '#2a3040')
      .rect(12, 36, 2, 4, P.whiteEdge)
      .rect(18, 36, 2, 4, P.whiteEdge),
  'filing-cabinet': (color) => {
    const body = color === 'grey' ? '#8b93a8' : '#3f4759',
      edge = color === 'grey' ? '#5a6275' : '#2a3040',
      top = color === 'grey' ? '#aeb5cb' : '#4a5468';
    const s = surface(30, 42)
      .rect(0, 0, 30, 42, edge)
      .rect(1, 1, 28, 40, body)
      .rect(1, 1, 28, 11, top);
    for (const y of [14, 23, 32]) s.hline(1, y, 28, edge).rect(10, y + 3, 10, 2, P.whiteEdge);
    return s;
  },
  'portfolio-drawers': () => {
    const s = surface(48, 35)
      .rect(0, 0, 48, 35, '#5d3a8f')
      .rect(1, 1, 46, 33, '#9b5cd6')
      .rect(1, 1, 46, 8, '#b98ae6');
    for (const y of [11, 19, 27]) s.hline(1, y, 46, '#5d3a8f').rect(18, y + 3, 12, 2, '#e0d2f5');
    s.rect(2, 32, 4, 3, '#2a3040').rect(42, 32, 4, 3, '#2a3040');
    return s;
  },
  'round-table': () =>
    surface(28, 31)
      .ellipse(0, 0, 28, 20, '#8b93a8')
      .ellipse(1, 1, 26, 18, '#aeb5cb')
      .ellipse(0, 6, 28, 16, '#8b93a8')
      .rect(12, 20, 4, 7, '#5a6275')
      .rect(8, 26, 12, 5, '#8b93a8')
      .rect(9, 27, 10, 3, '#5a6275'),
  'mid-century-side-table': () =>
    surface(24, 24)
      .rect(1, 0, 22, 12, '#f0cfa2')
      .rect(0, 2, 24, 10, '#e2b98b')
      .rect(1, 0, 22, 2, '#f7dfbc')
      .rect(0, 12, 24, 2, '#c99a6a')
      .rect(2, 14, 3, 10, '#b5804e')
      .rect(19, 14, 3, 10, '#b5804e')
      .rect(5, 14, 14, 2, '#c99a6a'),
  'round-coffee-table': () =>
    surface(54, 37)
      .ellipse(0, 0, 54, 26, '#c99a6a')
      .ellipse(1, 1, 52, 24, '#f0cfa2')
      .ellipse(2, 2, 50, 20, '#f7dfbc')
      .ellipse(0, 8, 54, 20, '#e2b98b')
      .rect(6, 26, 4, 8, '#b5804e')
      .rect(44, 26, 4, 8, '#b5804e')
      .rect(12, 30, 30, 7, '#00000030'),
  'simple-coffee-table': () =>
    surface(54, 30)
      .rect(0, 0, 54, 22, '#aeb5cb')
      .rect(1, 1, 52, 20, '#8b93a8')
      .rect(1, 1, 52, 4, '#c3c8d8')
      .rect(0, 22, 54, 3, '#5a6275')
      .rect(2, 25, 4, 5, '#5a6275')
      .rect(48, 25, 4, 5, '#5a6275')
      .rect(6, 25, 42, 2, '#3f4759'),
  'mid-century-leather-couch': (_c, facing) => {
    const s = surface(64, facing === 'Up' ? 28 : 37);
    const leather = '#d08a5c',
      light = '#e8a677',
      dark = '#a9623c',
      edge = '#6f3d22';
    if (facing === 'Up') {
      s.rect(0, 0, 64, 24, edge)
        .rect(1, 1, 62, 22, leather)
        .rect(2, 2, 60, 6, light)
        .rect(2, 9, 60, 12, dark)
        .vline(32, 9, 12, edge)
        .rect(0, 24, 64, 1, edge)
        .rect(4, 25, 4, 3, edge)
        .rect(56, 25, 4, 3, edge);
      return s;
    }
    s.rect(0, 0, 64, 10, edge)
      .rect(1, 1, 62, 8, leather)
      .rect(2, 2, 60, 3, light)
      .vline(32, 1, 8, edge);
    s.rect(0, 10, 64, 20, edge)
      .rect(1, 11, 62, 18, leather)
      .rect(3, 12, 28, 12, light)
      .rect(33, 12, 28, 12, light)
      .rect(3, 24, 58, 4, dark);
    s.rect(0, 8, 7, 24, edge)
      .rect(1, 9, 5, 22, dark)
      .rect(57, 8, 7, 24, edge)
      .rect(58, 9, 5, 22, dark);
    s.rect(6, 6, 12, 12, '#8b93a8')
      .rect(7, 7, 10, 10, '#d9dde8')
      .rect(9, 9, 6, 6, '#8b93a8')
      .rect(46, 6, 12, 12, '#8b93a8')
      .rect(47, 7, 10, 10, '#d9dde8')
      .rect(49, 9, 6, 6, '#8b93a8');
    s.rect(17, 3, 6, 7, '#f08b4b').rect(23, 5, 2, 3, '#f08b4b').rect(18, 4, 2, 1, '#ffb27c');
    s.rect(0, 32, 64, 1, edge).rect(3, 33, 4, 4, edge).rect(57, 33, 4, 4, edge);
    return s;
  },
  'modular-couch-segment': (_c, facing) => {
    const blue = '#3f7fd8',
      light = '#6ea4ee',
      dark = '#2a5db0',
      edge = '#1b3f7a';
    if (facing === 'Right' || facing === 'Left') {
      const s = surface(20, 46)
        .rect(0, 0, 20, 44, edge)
        .rect(1, 1, 18, 42, blue)
        .rect(2, 2, 6, 40, light)
        .rect(9, 3, 9, 38, dark)
        .rect(10, 4, 7, 36, blue)
        .rect(2, 44, 16, 2, edge);
      return facing === 'Left' ? s.flipX() : s;
    }
    return surface(34, 31)
      .rect(0, 0, 34, 29, edge)
      .rect(1, 1, 32, 27, blue)
      .rect(2, 2, 30, 8, light)
      .rect(2, 11, 30, 10, dark)
      .rect(3, 12, 28, 8, blue)
      .rect(2, 22, 30, 6, light)
      .rect(2, 29, 30, 2, edge);
  },
  'modular-couch-corner': () =>
    surface(64, 31)
      .rect(0, 0, 64, 29, '#1b3f7a')
      .rect(1, 1, 30, 27, '#dfe3ee')
      .rect(2, 2, 28, 25, '#f0f1fb')
      .rect(31, 1, 32, 27, '#3f7fd8')
      .rect(32, 2, 30, 8, '#6ea4ee')
      .rect(32, 11, 30, 10, '#2a5db0')
      .rect(33, 12, 28, 8, '#3f7fd8')
      .rect(32, 22, 30, 6, '#6ea4ee')
      .rect(2, 29, 60, 2, '#1b3f7a'),
  'beanbag-chair': (color) => {
    const base = { blue: '#2f7fd8', purple: '#9b5cd6', pink: '#ee6fa6' }[color] ?? '#2f7fd8';
    const s = surface(23, 23)
      .ellipse(1, 2, 21, 21, '#1b2a44')
      .ellipse(2, 3, 19, 19, base)
      .ellipse(4, 4, 13, 10, '#ffffff33')
      .ellipse(8, 10, 9, 9, '#00000022');
    return s;
  },
  'simple-chair': (_c, facing) => {
    const wood = '#d9a070',
      light = '#efc08f',
      dark = '#a9714b',
      edge = '#6f4528';
    if (facing === 'Down')
      return surface(20, 29)
        .rect(1, 0, 18, 10, edge)
        .rect(2, 1, 16, 8, wood)
        .rect(3, 2, 14, 2, light)
        .rect(0, 10, 20, 12, edge)
        .rect(1, 11, 18, 10, wood)
        .rect(2, 12, 16, 3, light)
        .rect(2, 22, 3, 7, edge)
        .rect(15, 22, 3, 7, edge)
        .rect(3, 22, 1, 6, dark)
        .rect(16, 22, 1, 6, dark);
    if (facing === 'Up')
      return surface(20, 21)
        .rect(0, 0, 20, 14, edge)
        .rect(1, 1, 18, 12, wood)
        .rect(2, 2, 16, 2, light)
        .rect(2, 8, 16, 4, dark)
        .rect(2, 14, 3, 7, edge)
        .rect(15, 14, 3, 7, edge);
    const s = surface(22, 31)
      .rect(0, 0, 8, 22, edge)
      .rect(1, 1, 6, 20, wood)
      .rect(2, 2, 2, 18, light)
      .rect(6, 10, 16, 12, edge)
      .rect(7, 11, 14, 10, wood)
      .rect(8, 12, 12, 3, light)
      .rect(3, 22, 3, 9, edge)
      .rect(17, 22, 3, 9, edge)
      .rect(18, 4, 4, 2, edge);
    return facing === 'Left' ? s.flipX() : s;
  },
  'lawn-chair': (_c, facing) => {
    const blue = '#4e8fd6',
      light = '#8ec0f0',
      weave = '#2f6ab0',
      edge = '#1b3f7a',
      frame = '#e8ecf4';
    if (facing === 'Down') {
      const s = surface(24, 38)
        .rect(2, 0, 20, 18, edge)
        .rect(3, 1, 18, 16, blue)
        .checker(4, 2, 16, 14, light);
      s.rect(0, 18, 24, 12, edge).rect(1, 19, 22, 10, blue).checker(2, 20, 20, 8, weave, 1);
      s.rect(0, 8, 2, 24, frame)
        .rect(22, 8, 2, 24, frame)
        .rect(2, 30, 4, 8, frame)
        .rect(18, 30, 4, 8, frame);
      return s;
    }
    return surface(24, 27)
      .rect(0, 0, 24, 20, edge)
      .rect(1, 1, 22, 18, blue)
      .checker(2, 2, 20, 16, light)
      .rect(2, 14, 20, 4, weave)
      .rect(0, 6, 2, 16, frame)
      .rect(22, 6, 2, 16, frame)
      .rect(2, 20, 4, 7, frame)
      .rect(18, 20, 4, 7, frame);
  },
  'barcelona-chair': (_c, facing) => {
    const teal = '#3aa6b5',
      light = '#7ad4df',
      dark = '#247c8a',
      edge = '#135560',
      chrome = '#c9cde0';
    if (facing === 'Down')
      return surface(23, 36)
        .rect(1, 0, 21, 14, edge)
        .rect(2, 1, 19, 12, teal)
        .checker(3, 2, 17, 10, light)
        .rect(0, 14, 23, 16, edge)
        .rect(1, 15, 21, 14, teal)
        .checker(2, 16, 19, 12, dark, 1)
        .rect(1, 30, 4, 6, chrome)
        .rect(18, 30, 4, 6, chrome);
    if (facing === 'Up')
      return surface(22, 23)
        .rect(0, 0, 22, 18, edge)
        .rect(1, 1, 20, 16, teal)
        .checker(2, 2, 18, 14, light)
        .rect(2, 12, 18, 4, dark)
        .rect(1, 18, 4, 5, chrome)
        .rect(17, 18, 4, 5, chrome);
    const s = surface(22, 33)
      .rect(0, 0, 9, 24, edge)
      .rect(1, 1, 7, 22, teal)
      .checker(2, 2, 5, 20, light)
      .rect(7, 14, 15, 12, edge)
      .rect(8, 15, 13, 10, teal)
      .checker(9, 16, 11, 8, dark)
      .rect(2, 24, 3, 9, chrome)
      .rect(17, 26, 3, 7, chrome);
    return facing === 'Left' ? s.flipX() : s;
  },
  'pp501-chair': (_c, facing) => {
    const wood = '#b5804e',
      light = '#d9a070',
      edge = '#6f4528',
      seat = '#3f7fd8',
      seatLight = '#6ea4ee';
    if (facing === 'Down')
      return surface(22, 27)
        .rect(1, 0, 20, 8, edge)
        .rect(2, 1, 18, 6, wood)
        .rect(3, 2, 16, 2, light)
        .rect(0, 8, 22, 12, edge)
        .rect(1, 9, 20, 10, seat)
        .rect(2, 10, 18, 3, seatLight)
        .rect(2, 20, 3, 7, edge)
        .rect(17, 20, 3, 7, edge)
        .rect(0, 4, 2, 10, edge)
        .rect(20, 4, 2, 10, edge);
    if (facing === 'Up')
      return surface(24, 22)
        .rect(0, 0, 24, 10, edge)
        .rect(1, 1, 22, 8, wood)
        .rect(2, 2, 20, 2, light)
        .rect(2, 10, 20, 6, seat)
        .rect(0, 6, 3, 10, edge)
        .rect(21, 6, 3, 10, edge)
        .rect(3, 16, 3, 6, edge)
        .rect(18, 16, 3, 6, edge);
    const s = surface(18, 27)
      .rect(0, 0, 7, 20, edge)
      .rect(1, 1, 5, 18, wood)
      .rect(2, 2, 2, 16, light)
      .rect(5, 10, 13, 10, edge)
      .rect(6, 11, 11, 8, seat)
      .rect(7, 12, 9, 2, seatLight)
      .rect(2, 20, 3, 7, edge)
      .rect(13, 20, 3, 7, edge)
      .rect(13, 5, 5, 2, edge);
    return facing === 'Left' ? s.flipX() : s;
  },
  'z-chair': (_c, facing) => {
    const wood = '#b5804e',
      edge = '#6f4528',
      seat = '#3f7fd8',
      seatLight = '#6ea4ee',
      seatDark = '#2a5db0';
    if (facing === 'Down')
      return surface(20, 28)
        .rect(1, 0, 18, 10, seatDark)
        .rect(2, 1, 16, 8, seat)
        .rect(3, 2, 14, 2, seatLight)
        .rect(0, 10, 20, 11, seatDark)
        .rect(1, 11, 18, 9, seat)
        .rect(2, 12, 16, 3, seatLight)
        .rect(2, 21, 3, 7, edge)
        .rect(15, 21, 3, 7, edge)
        .rect(0, 4, 2, 12, wood)
        .rect(18, 4, 2, 12, wood);
    if (facing === 'Up')
      return surface(20, 18)
        .rect(0, 0, 20, 12, seatDark)
        .rect(1, 1, 18, 10, seat)
        .rect(2, 2, 16, 2, seatLight)
        .rect(0, 12, 3, 6, edge)
        .rect(17, 12, 3, 6, edge)
        .rect(3, 12, 14, 3, wood);
    const s = surface(17, 26)
      .rect(0, 0, 7, 19, seatDark)
      .rect(1, 1, 5, 17, seat)
      .rect(2, 2, 2, 15, seatLight)
      .rect(5, 10, 12, 9, seatDark)
      .rect(6, 11, 10, 7, seat)
      .rect(7, 12, 8, 2, seatLight)
      .rect(2, 19, 3, 7, edge)
      .rect(12, 19, 3, 7, edge)
      .rect(11, 6, 6, 2, wood);
    return facing === 'Left' ? s.flipX() : s;
  },
  'gamer-chair': () =>
    surface(28, 43)
      .rounded(4, 0, 20, 20, '#1b3f7a', 2)
      .rounded(5, 1, 18, 18, '#3f7fd8', 2)
      .rect(8, 3, 12, 14, '#2f3542')
      .rect(10, 5, 8, 2, '#6ea4ee')
      .rect(10, 10, 8, 6, '#3f4759')
      .rounded(3, 20, 22, 12, '#1b3f7a', 2)
      .rounded(4, 21, 20, 10, '#3f7fd8', 2)
      .rect(6, 22, 16, 3, '#6ea4ee')
      .rect(0, 14, 4, 12, '#2f3542')
      .rect(24, 14, 4, 12, '#2f3542')
      .rect(13, 32, 2, 5, '#2f3542')
      .rect(4, 37, 20, 2, '#2f3542')
      .rect(5, 39, 4, 4, '#2f3542')
      .rect(19, 39, 4, 4, '#2f3542')
      .rect(12, 39, 4, 4, '#2f3542'),
  'u-shaped-armchair': (_c, facing) => {
    const dark = '#3a4150',
      light = '#58627a',
      edge = '#20242e';
    if (facing === 'Up')
      return surface(26, 29)
        .rounded(0, 0, 26, 22, edge, 2)
        .rounded(1, 1, 24, 20, dark, 2)
        .rect(3, 3, 20, 4, light)
        .rect(4, 12, 18, 8, light)
        .rect(3, 22, 4, 7, '#b5804e')
        .rect(19, 22, 4, 7, '#b5804e');
    const s = surface(21, 33)
      .rounded(0, 0, 21, 26, edge, 2)
      .rounded(1, 1, 19, 24, dark, 2)
      .rect(2, 2, 4, 22, light)
      .rect(8, 10, 11, 12, light)
      .rect(3, 26, 4, 7, '#b5804e')
      .rect(14, 26, 4, 7, '#b5804e');
    return facing === 'Left' ? s.flipX() : s;
  },
  'molecular-lamp': () => {
    const s = surface(23, 51)
      .rect(11, 6, 2, 38, '#5a6275')
      .ellipse(6, 44, 11, 7, '#5a6275')
      .ellipse(7, 45, 9, 4, '#8b93a8');
    for (const [x, y] of [
      [2, 4],
      [13, 0],
      [15, 10],
      [3, 16],
      [12, 22],
    ] as const)
      s.rect(x + 2, y + 3, 7 - 3, 1, '#5a6275')
        .ellipse(x, y, 8, 8, '#f7e39a')
        .ellipse(x + 2, y + 1, 4, 3, '#fff6cc');
    return s;
  },
  'floating-bookshelf': () => {
    const s = surface(44, 21).rect(0, 14, 44, 5, '#3f4759').rect(0, 19, 44, 2, '#2a3040');
    books(s, 3, 3, 38, 11, 3);
    return s;
  },
  'small-fishtank': () =>
    surface(29, 40)
      .rect(0, 0, 29, 22, '#aeb5cb')
      .rect(1, 1, 27, 20, '#5cc0f0')
      .rect(2, 2, 25, 4, '#9ee2ff')
      .rect(5, 12, 6, 3, '#f08b4b')
      .rect(16, 8, 6, 3, '#f2c14e')
      .rect(20, 16, 4, 4, '#5fb86a')
      .rect(0, 22, 29, 18, '#5a6275')
      .rect(1, 23, 27, 16, '#8b93a8')
      .rect(1, 23, 27, 3, '#aeb5cb'),
  'water-cooler': () =>
    surface(20, 48)
      .ellipse(2, 0, 16, 10, '#9ee2ff')
      .rect(2, 5, 16, 16, '#5cc0f0')
      .rect(4, 7, 4, 12, '#9ee2ff')
      .rect(0, 21, 20, 4, '#aeb5cb')
      .rect(0, 25, 20, 23, '#dfe3ee')
      .rect(1, 26, 18, 21, '#f0f1fb')
      .rect(4, 30, 5, 5, '#5cc0f0')
      .rect(11, 30, 5, 5, '#e05a5a')
      .rect(6, 38, 8, 6, '#8b93a8'),
  'arcade-machine': () =>
    surface(32, 67)
      .rect(0, 0, 32, 67, '#5a6275')
      .rect(1, 1, 30, 65, '#dfe3ee')
      .rect(3, 3, 26, 10, '#2f3542')
      .rect(5, 5, 22, 6, '#f2c14e')
      .rect(3, 15, 26, 22, '#2f3542')
      .rect(5, 17, 22, 18, '#1b3f7a')
      .rect(8, 20, 16, 4, '#f2c14e')
      .rect(10, 26, 12, 6, '#e05a5a')
      .rect(3, 39, 26, 8, '#8b93a8')
      .rect(6, 41, 5, 4, '#e05a5a')
      .rect(13, 41, 5, 4, '#5fb86a')
      .rect(20, 41, 5, 4, '#4e8fd6')
      .rect(3, 49, 26, 14, '#3f4759')
      .rect(10, 54, 12, 5, '#8b93a8'),
  'espresso-machine': () =>
    surface(30, 39)
      .rect(2, 0, 26, 10, '#dfe3ee')
      .rect(3, 1, 24, 8, '#8b93a8')
      .rect(0, 10, 30, 29, '#5a6275')
      .rect(1, 11, 28, 27, '#8b93a8')
      .rect(3, 13, 24, 6, '#3f4759')
      .rect(5, 14, 6, 4, '#e05a5a')
      .rect(13, 14, 10, 4, '#f0f1fb')
      .rect(4, 22, 22, 10, '#5a6275')
      .rect(10, 24, 10, 6, '#f0f1fb')
      .rect(1, 34, 28, 4, '#3f4759'),
  'single-coffee-machine': () =>
    surface(22, 32)
      .rect(3, 0, 16, 6, '#5d3a8f')
      .rect(4, 1, 14, 4, '#9b5cd6')
      .rect(0, 6, 22, 26, '#3f4759')
      .rect(1, 7, 20, 24, '#5a6275')
      .rect(4, 10, 14, 8, '#9b5cd6')
      .rect(6, 12, 10, 4, '#b98ae6')
      .rect(7, 20, 8, 8, '#f0f1fb')
      .rect(1, 29, 20, 2, '#2a3040'),
  'mug-wide': (color) => {
    const c = { purple: '#9b5cd6', coffee: '#c99a6a' }[color] ?? '#9b5cd6';
    return surface(14, 12)
      .rect(1, 2, 10, 9, c)
      .rect(2, 3, 8, 2, '#ffffff66')
      .rect(11, 4, 3, 5, c)
      .rect(12, 5, 1, 3, '#00000000')
      .rect(1, 1, 10, 2, '#5a3a2a');
  },
  'mug-regular': (color) => {
    const c = { blue: '#3f7fd8', black: '#5a6275' }[color] ?? '#5a6275';
    return surface(12, 14)
      .rect(1, 2, 8, 11, c)
      .rect(2, 3, 6, 2, '#ffffff66')
      .rect(9, 5, 3, 5, c)
      .rect(1, 1, 8, 2, '#5a3a2a');
  },
  'laptop-computer': (_c, facing) =>
    facing === 'Up'
      ? surface(20, 17)
          .rect(0, 10, 20, 7, '#dfe3ee')
          .rect(1, 11, 18, 5, '#aeb5cb')
          .rect(1, 0, 18, 11, '#aeb5cb')
          .rect(2, 1, 16, 9, '#dfe3ee')
      : surface(20, 28)
          .rect(1, 0, 18, 18, '#aeb5cb')
          .rect(2, 1, 16, 16, '#dfe3ee')
          .rect(3, 2, 14, 12, '#5cc0f0')
          .rect(4, 3, 12, 3, '#9ee2ff')
          .rect(0, 18, 20, 10, '#dfe3ee')
          .rect(1, 19, 18, 8, '#aeb5cb')
          .rect(3, 21, 14, 4, '#dfe3ee'),
  'tablet-and-phone': (color) => {
    const c = color === 'grey' ? '#8b93a8' : '#dfe3ee';
    return surface(22, 19)
      .rect(0, 0, 14, 19, '#5a6275')
      .rect(1, 1, 12, 17, c)
      .rect(2, 3, 10, 12, '#f0f1fb')
      .rect(16, 6, 6, 12, '#5a6275')
      .rect(17, 7, 4, 10, c)
      .rect(17, 8, 4, 7, '#f0f1fb');
  },
  'hardware-dev-computer': (color) => {
    const c = color === 'blue' ? '#3f7fd8' : '#8b93a8';
    return surface(49, 38)
      .rect(0, 2, 24, 20, '#5a6275')
      .rect(1, 3, 22, 18, '#dfe3ee')
      .rect(3, 5, 18, 14, '#2f3542')
      .rect(4, 6, 16, 3, '#e05a5a')
      .rect(4, 10, 10, 2, '#5fb86a')
      .rect(4, 13, 14, 2, '#f2c14e')
      .rect(8, 22, 8, 4, '#5a6275')
      .rect(27, 8, 22, 26, '#5a6275')
      .rect(28, 9, 20, 24, c)
      .rect(30, 11, 16, 6, '#f0f1fb')
      .rect(30, 19, 16, 10, '#2f3542')
      .rect(2, 28, 20, 8, '#5fb86a')
      .rect(4, 30, 16, 4, '#f2c14e')
      .rect(22, 30, 6, 2, '#e05a5a');
  },
  'digital-artist-computer': () =>
    surface(37, 33)
      .rect(0, 0, 30, 18, '#5a6275')
      .rect(1, 1, 28, 16, '#8b93a8')
      .rect(3, 3, 24, 12, '#2f3542')
      .rect(5, 5, 20, 2, '#5cc0f0')
      .rect(5, 8, 12, 5, '#8b93a8')
      .rect(2, 22, 24, 8, '#8b93a8')
      .rect(3, 23, 22, 6, '#dfe3ee')
      .rect(31, 20, 6, 9, '#5a6275')
      .rect(32, 21, 4, 7, '#8b93a8'),
  'book-closed': (color) => {
    const c = color === 'green' ? '#5fb86a' : '#8b93a8';
    return surface(14, 16)
      .rect(0, 0, 14, 16, '#2f3542')
      .rect(1, 1, 12, 14, c)
      .rect(2, 2, 10, 2, '#ffffff55')
      .rect(3, 7, 8, 1, '#ffffff66')
      .rect(3, 10, 8, 1, '#ffffff66');
  },
  'book-open': () =>
    surface(25, 14)
      .rect(0, 2, 25, 12, '#3f7fd8')
      .rect(1, 1, 11, 12, '#f0f1fb')
      .rect(13, 1, 11, 12, '#f0f1fb')
      .rect(3, 4, 7, 1, '#aeb5cb')
      .rect(3, 7, 7, 1, '#aeb5cb')
      .rect(15, 4, 7, 1, '#aeb5cb')
      .rect(15, 7, 7, 1, '#aeb5cb'),
  'document-single': () =>
    surface(13, 13)
      .rect(0, 0, 13, 13, '#aeb5cb')
      .rect(1, 1, 11, 11, '#f0f1fb')
      .rect(3, 3, 7, 1, '#8b93a8')
      .rect(3, 6, 7, 1, '#8b93a8')
      .rect(3, 9, 5, 1, '#8b93a8'),
  'inkpen-notes': () =>
    surface(22, 17)
      .rect(0, 0, 14, 16, '#aeb5cb')
      .rect(1, 1, 12, 14, '#f0f1fb')
      .rect(3, 3, 8, 1, '#4e8fd6')
      .rect(3, 6, 8, 1, '#4e8fd6')
      .rect(3, 9, 6, 1, '#4e8fd6')
      .rect(17, 2, 3, 14, '#3f7fd8')
      .rect(17, 14, 3, 3, '#2f3542'),
  'wall-clock-minimal-face': () =>
    surface(21, 21)
      .ellipse(0, 0, 21, 21, '#5a6275')
      .ellipse(1, 1, 19, 19, '#f0f1fb')
      .rect(10, 4, 1, 7, '#2f3542')
      .rect(10, 10, 5, 1, '#2f3542')
      .rect(10, 10, 1, 1, '#e05a5a'),
  globe: () =>
    surface(23, 29)
      .ellipse(1, 0, 20, 20, '#2f3542')
      .ellipse(2, 1, 18, 18, '#3fb0c0')
      .rect(5, 5, 6, 4, '#5fb86a')
      .rect(12, 9, 5, 6, '#5fb86a')
      .rect(6, 12, 4, 3, '#5fb86a')
      .rect(10, 20, 3, 5, '#5a6275')
      .rect(6, 25, 11, 4, '#8b93a8'),
  'rubber-ducky': () =>
    surface(13, 10)
      .ellipse(2, 3, 11, 7, '#f2c14e')
      .ellipse(0, 0, 7, 7, '#f2c14e')
      .rect(5, 3, 3, 2, '#f08b4b')
      .rect(2, 2, 1, 1, '#2f3542'),
  'poster-easel': (_c, facing) => {
    const s = surface(32, 42)
      .rect(2, 0, 28, 28, '#5a6275')
      .rect(3, 1, 26, 26, '#f0f1fb')
      .rect(6, 8, 4, 14, '#3fb0c0')
      .rect(12, 4, 4, 18, '#3fb0c0')
      .rect(18, 12, 4, 10, '#3fb0c0')
      .rect(24, 6, 3, 16, '#3fb0c0')
      .rect(5, 23, 22, 1, '#8b93a8')
      .rect(1, 28, 30, 2, '#3f4759')
      .rect(3, 30, 3, 12, '#3f4759')
      .rect(26, 30, 3, 12, '#3f4759')
      .rect(14, 30, 3, 10, '#3f4759');
    return facing === 'Left' ? s.flipX() : s;
  },
};

/** Second pass: closer silhouettes, outlines and shading for the most visible pieces. */
Object.assign(MAKERS, {
  'office-desk': () => {
    const s = surface(92, 41);
    const top = '#f3f4fc',
      edge = '#d3d7e6',
      side = '#aeb5cb',
      line = '#8d95ad';
    s.rect(0, 1, 92, 27, line)
      .rect(1, 0, 90, 28, line)
      .rect(1, 1, 90, 25, top)
      .rect(2, 26, 88, 2, edge);
    s.rect(1, 28, 90, 3, side).rect(0, 31, 92, 1, '#6b7389');
    s.rect(0, 32, 92, 9, '#2d3340');
    s.rect(2, 32, 32, 9, '#4d5569')
      .rect(3, 33, 30, 7, '#5f6880')
      .hline(3, 36, 30, '#4d5569')
      .rect(15, 34, 6, 1, '#c9cde0')
      .rect(15, 38, 6, 1, '#c9cde0');
    s.rect(36, 32, 2, 9, '#4d5569').rect(88, 32, 3, 9, '#4d5569');
    return s;
  },
  'aeron-chair': (_c: string, facing: Facing) => {
    const s = surface(24, 23);
    const o = '#1d2029',
      body = '#2f3647',
      mesh = '#3c4458',
      hi = '#5c6782',
      arm = '#262c3a';
    if (facing === 'Up') {
      s.rounded(4, 0, 16, 4, o, 1).rect(6, 1, 12, 2, body);
      s.rounded(2, 3, 20, 14, o, 2).rounded(3, 4, 18, 12, body, 2).rect(5, 5, 14, 10, mesh);
      for (let y = 6; y < 15; y += 2)
        for (let x = 6; x < 18; x += 3) s.px(x + (y % 4 === 0 ? 1 : 0), y, hi);
      s.rect(0, 7, 3, 7, arm).rect(21, 7, 3, 7, arm).rect(1, 8, 1, 5, hi).rect(22, 8, 1, 5, hi);
      s.rect(11, 17, 2, 2, o)
        .rect(5, 19, 14, 2, o)
        .rect(5, 21, 3, 2, o)
        .rect(16, 21, 3, 2, o)
        .rect(11, 21, 2, 2, o);
      return s;
    }
    if (facing === 'Down') {
      s.rounded(2, 0, 20, 7, o, 2).rounded(3, 1, 18, 5, body, 2).rect(5, 2, 14, 2, hi);
      s.rounded(3, 6, 18, 10, o, 2).rounded(4, 7, 16, 8, mesh, 2).rect(5, 8, 14, 2, hi);
      s.rect(0, 5, 3, 8, arm).rect(21, 5, 3, 8, arm);
      s.rect(11, 16, 2, 3, o)
        .rect(5, 19, 14, 2, o)
        .rect(5, 21, 3, 2, o)
        .rect(16, 21, 3, 2, o)
        .rect(11, 21, 2, 2, o);
      return s;
    }
    s.rounded(2, 0, 9, 16, o, 2).rounded(3, 1, 7, 14, body, 2).rect(4, 2, 5, 12, mesh);
    s.rounded(8, 8, 14, 8, o, 2)
      .rounded(9, 9, 12, 6, mesh, 2)
      .rect(10, 10, 10, 2, hi)
      .rect(9, 6, 11, 2, arm);
    s.rect(11, 16, 2, 3, o)
      .rect(5, 19, 14, 2, o)
      .rect(5, 21, 3, 2, o)
      .rect(16, 21, 3, 2, o)
      .rect(11, 21, 2, 2, o);
    return facing === 'Left' ? s.flipX() : s;
  },
  'space-chair': (_c: string, facing: Facing) => {
    const o = '#7a1f26',
      red = '#e4484f',
      light = '#f27b80',
      dark = '#bf353d',
      leg = '#2a2d36';
    if (facing === 'Down') {
      const s = surface(24, 28);
      s.rounded(2, 0, 20, 11, o, 2)
        .rounded(3, 1, 18, 9, red, 2)
        .rect(5, 2, 14, 2, light)
        .rect(5, 8, 14, 2, dark);
      s.rounded(0, 8, 8, 14, o, 2).rounded(1, 9, 6, 12, red, 2).rect(2, 10, 2, 9, light);
      s.rounded(16, 8, 8, 14, o, 2).rounded(17, 9, 6, 12, red, 2).rect(20, 10, 2, 9, dark);
      s.rounded(6, 12, 12, 11, o, 2)
        .rounded(7, 13, 10, 9, red, 2)
        .rect(8, 14, 8, 2, light)
        .rect(8, 20, 8, 2, dark);
      s.rect(3, 23, 3, 5, leg).rect(18, 23, 3, 5, leg).px(4, 23, '#5a6275').px(19, 23, '#5a6275');
      return s;
    }
    if (facing === 'Up') {
      const s = surface(22, 19);
      s.rounded(1, 0, 20, 15, o, 2)
        .rounded(2, 1, 18, 13, red, 2)
        .rect(4, 2, 14, 2, light)
        .rect(3, 10, 16, 3, dark);
      s.rounded(0, 4, 5, 11, o, 2)
        .rounded(1, 5, 3, 9, dark, 1)
        .rounded(17, 4, 5, 11, o, 2)
        .rounded(18, 5, 3, 9, dark, 1);
      s.rect(3, 15, 3, 4, leg).rect(16, 15, 3, 4, leg);
      return s;
    }
    const s = surface(21, 28);
    s.rounded(0, 0, 10, 23, o, 2)
      .rounded(1, 1, 8, 21, red, 2)
      .rect(2, 2, 2, 19, light)
      .rect(7, 3, 2, 18, dark);
    s.rounded(7, 11, 14, 12, o, 2)
      .rounded(8, 12, 12, 10, red, 2)
      .rect(9, 13, 10, 2, light)
      .rect(9, 20, 10, 2, dark);
    s.rounded(14, 5, 7, 9, o, 2).rounded(15, 6, 5, 7, dark, 1);
    s.rect(3, 23, 3, 5, leg).rect(15, 23, 3, 5, leg);
    return facing === 'Left' ? s.flipX() : s;
  },
  'window-modern': (color: string) => {
    const [glass, light] = GLASS[color] ?? GLASS.blue;
    const s = surface(100, 58);
    const frame = '#2f3a4c',
      inner = '#48546a',
      sill = '#55637a';
    s.rect(0, 0, 100, 58, frame).rect(2, 2, 96, 54, inner);
    const cols = [
        [5, 27],
        [37, 27],
        [69, 27],
      ],
      rows = [
        [5, 11],
        [21, 20],
        [46, 8],
      ];
    for (const [x, w] of cols)
      for (const [y, h] of rows) {
        s.rect(x, y, w, h, glass)
          .rect(x, y, w, 1, light)
          .rect(x, y, 1, h, light)
          .rect(x + w - 2, y + 1, 1, h - 2, '#ffffff55');
      }
    s.rect(0, 56, 100, 2, sill);
    return s;
  },
  'bookcase-tall': (color: string) => {
    const s = surface(59, 59);
    const white = color === 'white';
    const frame = white ? '#e6e9f1' : '#3f4759',
      edge = white ? '#aeb5cb' : '#20242e',
      inner = white ? '#c6ccdb' : '#262d3b',
      top = white ? '#f7f8fc' : '#4f586c';
    s.rect(0, 0, 59, 59, edge)
      .rect(1, 1, 57, 57, frame)
      .rect(1, 1, 57, 10, top)
      .hline(1, 10, 57, edge);
    for (const y of [12, 26, 40]) {
      s.rect(3, y, 53, 12, inner);
      books(s, 5, y + 1, 49, 10, y * 3);
      s.hline(3, y + 12, 53, edge);
      s.hline(3, y + 13, 53, white ? '#f7f8fc' : '#4f586c');
    }
    s.rect(0, 55, 59, 4, edge).rect(1, 55, 57, 1, frame);
    return s;
  },
  'cubicle-shelves': (color: string) => {
    const s = surface(72, 54);
    const white = color === 'white';
    const frame = white ? '#e6e9f1' : '#3f4759',
      edge = white ? '#aeb5cb' : '#20242e',
      inner = white ? '#d0d5e2' : '#262d3b',
      top = white ? '#f7f8fc' : '#4f586c';
    s.rect(0, 0, 72, 54, edge)
      .rect(1, 1, 70, 52, frame)
      .rect(1, 1, 70, 11, top)
      .hline(1, 11, 70, edge);
    const items = [
      ['#e6e8f2', 'cup'],
      ['#4e8fd6', 'box'],
      ['#5fb86a', 'plant'],
      ['#f2c14e', 'book'],
      ['#9b6fd6', 'box'],
      ['#e05a5a', 'book'],
      ['#f08b4b', 'cup'],
      ['#aeb5cb', 'box'],
      ['#3fb0c0', 'book'],
      ['#e6e8f2', 'plant'],
      ['#5fb86a', 'cup'],
      ['#4e8fd6', 'book'],
    ];
    let n = 0;
    for (const y of [13, 26, 39])
      for (const x of [3, 20, 37, 54]) {
        s.rect(x, y, 15, 12, inner);
        const [c, kind] = items[n++ % items.length];
        if (kind === 'book') {
          s.rect(x + 3, y + 3, 3, 8, c)
            .rect(x + 7, y + 2, 3, 9, '#e6e8f2')
            .rect(x + 11, y + 4, 2, 7, c);
        } else if (kind === 'plant') {
          s.rect(x + 5, y + 7, 6, 4, '#aeb5cb')
            .rect(x + 4, y + 3, 8, 4, '#5fb86a')
            .rect(x + 6, y + 2, 4, 2, '#86d26a');
        } else if (kind === 'cup') {
          s.rect(x + 5, y + 4, 6, 7, c).rect(x + 11, y + 6, 2, 3, c);
        } else {
          s.rect(x + 3, y + 4, 9, 7, c).rect(x + 3, y + 4, 9, 2, '#ffffff55');
        }
      }
    return s;
  },
  'kitchen-cabinet-large': (color: string) => {
    const s = surface(64, 32);
    const grey = color === 'grey';
    const body = grey ? '#8b93a8' : '#3f4759',
      edge = grey ? '#5a6275' : '#20242e',
      door = grey ? '#9aa2b6' : '#4a5468';
    s.rect(0, 0, 64, 21, '#d3d7e6')
      .rect(1, 1, 62, 18, '#f3f4fc')
      .rect(1, 18, 62, 2, '#c9cde0')
      .rect(0, 20, 64, 2, '#aeb5cb');
    s.rect(0, 22, 64, 10, edge).rect(1, 23, 62, 9, body);
    for (const x of [2, 33]) {
      s.rect(x, 24, 29, 7, door)
        .rect(x + 12, 26, 2, 3, '#e6e8f2')
        .rect(x + 15, 26, 2, 3, '#e6e8f2');
    }
    s.vline(32, 23, 9, edge);
    return s;
  },
  'television-screen-wall': () =>
    surface(47, 31)
      .rect(0, 0, 47, 31, '#2f3a4c')
      .rect(1, 1, 45, 29, '#9aa2b6')
      .rect(2, 2, 43, 27, '#55637a')
      .rect(3, 3, 41, 25, '#2a3140')
      .rect(4, 4, 39, 23, '#394257')
      .rect(5, 5, 37, 2, '#50607c')
      .rect(20, 28, 7, 2, '#c9cde0'),
  'simple-table-2x3': () => {
    const s = surface(96, 74);
    s.rect(0, 1, 96, 64, '#8d95ad')
      .rect(1, 0, 94, 66, '#8d95ad')
      .rect(1, 1, 94, 62, '#f3f4fc')
      .rect(2, 63, 92, 2, '#d3d7e6')
      .rect(1, 65, 94, 2, '#aeb5cb');
    s.rect(3, 67, 8, 7, '#6b7389')
      .rect(85, 67, 8, 7, '#6b7389')
      .rect(4, 67, 3, 6, '#aeb5cb')
      .rect(86, 67, 3, 6, '#aeb5cb');
    return s;
  },
  'mid-century-leather-couch': (_c: string, facing: Facing) => {
    const leather = '#d0895a',
      light = '#e9a975',
      dark = '#b06d43',
      edge = '#5c3118',
      seam = '#c27b4e';
    if (facing === 'Up') {
      const s = surface(64, 28);
      s.rounded(0, 0, 64, 24, edge, 2)
        .rounded(1, 1, 62, 22, leather, 2)
        .rect(2, 2, 60, 5, light)
        .rect(2, 8, 60, 13, dark)
        .rect(3, 9, 58, 2, seam)
        .vline(32, 8, 13, edge);
      s.rect(0, 24, 64, 1, edge).rect(4, 25, 4, 3, edge).rect(56, 25, 4, 3, edge);
      return s;
    }
    const s = surface(64, 37);
    s.rounded(0, 0, 64, 11, edge, 2)
      .rounded(1, 1, 62, 9, leather, 2)
      .rect(2, 2, 60, 3, light)
      .vline(32, 1, 9, edge);
    s.rounded(0, 10, 64, 21, edge, 2).rounded(1, 11, 62, 19, leather, 2);
    s.rect(3, 12, 28, 12, light)
      .rect(33, 12, 28, 12, light)
      .rect(3, 23, 58, 1, seam)
      .rect(3, 24, 58, 5, dark);
    s.rounded(0, 7, 7, 25, edge, 2)
      .rounded(1, 8, 5, 23, dark, 1)
      .rect(2, 9, 2, 20, leather)
      .rounded(57, 7, 7, 25, edge, 2)
      .rounded(58, 8, 5, 23, dark, 1)
      .rect(60, 9, 2, 20, leather);
    for (const x of [6, 46]) {
      s.rect(x, 5, 13, 13, '#6b7389')
        .rect(x + 1, 6, 11, 11, '#dde1ec')
        .rect(x + 3, 8, 7, 7, '#9aa2b6')
        .rect(x + 5, 10, 3, 3, '#dde1ec');
    }
    s.rect(17, 3, 6, 7, '#f08b4b')
      .rect(23, 5, 2, 3, '#f08b4b')
      .rect(18, 4, 2, 1, '#ffb27c')
      .rect(18, 3, 4, 1, '#5a3a2a');
    s.rect(0, 31, 64, 1, edge).rect(3, 32, 4, 5, edge).rect(57, 32, 4, 5, edge);
    return s;
  },
  'round-coffee-table': () =>
    surface(54, 37)
      .ellipse(0, 1, 54, 25, '#b5804e')
      .ellipse(1, 1, 52, 23, '#f0cfa2')
      .ellipse(2, 2, 50, 19, '#f7dfbc')
      .ellipse(1, 7, 52, 20, '#e2b98b')
      .ellipse(2, 8, 50, 17, '#f0cfa2')
      .rect(6, 26, 4, 8, '#8e5a30')
      .rect(44, 26, 4, 8, '#8e5a30')
      .rect(25, 27, 4, 7, '#8e5a30')
      .ellipse(8, 31, 38, 6, '#00000033'),
  'beanbag-chair': (color: string) => {
    const base =
      ({ blue: '#2f7fd8', purple: '#9b5cd6', pink: '#ee6fa6' } as Record<string, string>)[color] ??
      '#2f7fd8';
    const dark = shadeHex(base, 0.72),
      light = shadeHex(base, 1.25),
      outline = shadeHex(base, 0.45);
    return surface(23, 23)
      .ellipse(1, 3, 21, 20, outline)
      .ellipse(2, 4, 19, 18, base)
      .ellipse(3, 5, 17, 10, light)
      .ellipse(6, 11, 13, 10, dark)
      .ellipse(8, 7, 7, 4, '#ffffff55');
  },
});
function shadeHex(hex: string, factor: number) {
  const v = parseInt(hex.slice(1), 16);
  const ch = (s: number) =>
    Math.max(0, Math.min(255, Math.round(((v >> s) & 255) * factor)))
      .toString(16)
      .padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** Sprite for an object kind, colour and facing, or null when no artwork exists yet. */
export function furnitureSprite(kind: string, color: string, facing: Facing): PixelSprite | null {
  const key = `${kind}/${color}/${facing}`;
  if (cache.has(key)) return cache.get(key)!;
  const maker = MAKERS[kind];
  let sprite: PixelSprite | null;
  try {
    sprite = maker ? (maker(color, facing)?.sprite() ?? null) : null;
  } catch {
    sprite = null;
  }
  cache.set(key, sprite);
  return sprite;
}
export const FURNITURE_KINDS = Object.keys(MAKERS);
