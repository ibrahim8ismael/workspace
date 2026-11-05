import * as vivo from './vivo.js';
import { composeMap } from './compose.js';

/** Office maps. Studio and Campus reuse Vivo's own rooms and furniture, then add their own grounds: stone paths,
    a plaza, gardens and a beach by the sea. Every outdoor piece is listed as [kind, colour, tile x, tile y]. */

const ground = (name, floor, floorColor, x, y, w, h, extra = {}) => ({
  name,
  floor,
  floorColor,
  x,
  y,
  w,
  h,
  ...extra,
});
const path = (x, y, w, h) => ground('Camino', 'StonePath', 'Grey', x, y, w, h);
/** A beach from row `top` to the bottom of the map: an uneven line of dunes biting into the lawn (skipping the `gaps`,
    where paths come down), wide sand, a frothy shore and the sea getting deeper. The sea continues past the map edge. */
const beach = (cols, top, rows, gaps = []) => {
  const shoreRow = rows - 10,
    bumps = [];
  // Dune bumps of varying width and height: a natural coastline instead of a ruler-straight edge.
  const widths = [5, 3, 6, 4, 7, 3, 5, 4],
    heights = [2, 1, 0, 2, 1, 2, 0, 1];
  for (let x = 0, i = 0; x < cols; i++) {
    const w = Math.min(widths[i % widths.length], cols - x),
      h = heights[i % heights.length];
    if (h && !gaps.some(([from, to]) => x < to && x + w > from))
      bumps.push(ground('Dunas', 'Dune', 'Beige', x, top - h, w, h));
    x += w;
  }
  return [
    ...bumps,
    ground('Dunas', 'Dune', 'Beige', 0, top, cols, 1),
    ground('Playa', 'Sand', 'Beige', 0, top + 1, cols, shoreRow - top - 1),
    ground('Orilla', 'Shore', 'Foam', 0, shoreRow, cols, 1, { blocked: true }),
    ground('Mar', 'Water', 'Shallow', 0, shoreRow + 1, cols, 3, { blocked: true }),
    ground('Mar abierto', 'Water', 'Deep', 0, shoreRow + 4, cols, rows - shoreRow - 4, {
      blocked: true,
    }),
  ];
};
/** A pier three tiles wide from the shore out to sea: planks, beams with posts on both sides and a beam at the end. */
const pier = (x, top, length) => [
  ground('Muelle', 'Pier', 'Left', x, top, 1, length - 1, { depth: 3 }),
  ground('Muelle', 'Pier', 'Center', x + 1, top, 1, length - 1, { depth: 3 }),
  ground('Muelle', 'Pier', 'Right', x + 2, top, 1, length - 1, { depth: 3 }),
  ground('Muelle', 'Pier', 'EndLeft', x, top + length - 1, 1, 1, { depth: 3 }),
  ground('Muelle', 'Pier', 'EndCenter', x + 1, top + length - 1, 1, 1, { depth: 3 }),
  ground('Muelle', 'Pier', 'EndRight', x + 2, top + length - 1, 1, 1, { depth: 3 }),
];
const every = (from, to, step, make) => {
  const out = [];
  for (let v = from; v <= to; v += step) out.push(...make(v));
  return out;
};
/** An umbrella with two loungers and a towel beside it, standing on the tile (x, y). */
const sunSpot = (x, y, color) => [
  ['beach-umbrella', color, x, y],
  ['sun-lounger', 'white', x - 1, y + 2],
  ['sun-lounger', 'white', x + 1, y + 2],
  ['beach-towel', 'yellow', x + 3, y + 2],
];

// ---------------------------------------------------------------------------------------------------------------
// Studio: the lobby, the team hall and the media room on a city street, with a garden walk down to the pavement,
// a zebra crossing, traffic in both directions and a small park across the road.
const STUDIO_COLS = 40,
  STUDIO_ROWS = 52;
const ROAD = 40; // first row of the road
const studio = composeMap(vivo, {
  cols: STUDIO_COLS,
  rows: STUDIO_ROWS,
  spawn: { tx: 10, ty: 27 },
  stamps: [
    { rect: { x: 13, y: 20, w: 27, h: 23 }, dx: -10, dy: -12 }, // lobby, main hall with six desks, kitchen, lounge and media room
    { rect: { x: 22, y: 11, w: 7, h: 7 }, dx: -10, dy: -11 }, // the koi pond behind the hall
  ],
  areas: [
    path(10, 31, 2, 4), // from the lobby door
    path(2, 34, 36, 2), // the garden walk
    path(32, 8, 2, 26), // along the east side of the building
    path(15, 6, 2, 2), // from the hall's garden door to the pond
    ground('Plaza', 'StonePath', 'Grey', 31, 2, 8, 6),
    path(19, 36, 3, 2), // down to the pavement
    // The street: pavement, kerb, two lanes with a dashed centre line, kerb and pavement again.
    ground('Acera', 'Sidewalk', 'Grey', 0, ROAD - 2, STUDIO_COLS, 1),
    ground('Acera', 'Sidewalk', 'CurbBottom', 0, ROAD - 1, STUDIO_COLS, 1),
    ground('Calle', 'Road', 'Asphalt', 0, ROAD, STUDIO_COLS, 4, { blocked: true }),
    ground('Calle', 'Road', 'Line', 0, ROAD + 1, STUDIO_COLS, 1, { blocked: true, depth: 3 }),
    ground('Paso de peatones', 'Road', 'Zebra', 19, ROAD, 3, 4, { depth: 4 }),
    ground('Acera', 'Sidewalk', 'CurbTop', 0, ROAD + 4, STUDIO_COLS, 1),
    ground('Acera', 'Sidewalk', 'Grey', 0, ROAD + 5, STUDIO_COLS, 1),
    // The park across the street.
    path(19, ROAD + 6, 3, 3),
    path(3, ROAD + 8, 34, 2),
  ],
  objects: [
    // Garden along the walk: hedges with gaps, flower beds, benches and lamps.
    ['hedge', 'green', 2, 32],
    ['hedge', 'green', 4, 32],
    ['flower-bed', 'pink', 6, 32],
    ['hedge', 'green', 13, 32],
    ['flower-bed', 'pink', 15, 32],
    ['hedge', 'green', 17, 32],
    ['hedge', 'green', 22, 32],
    ['flower-bed', 'pink', 24, 32],
    ['hedge', 'green', 26, 32],
    ['hedge', 'green', 28, 32],
    ['park-bench', 'wood', 5, 36],
    ['park-bench', 'wood', 25, 36],
    ['park-bench', 'wood', 33, 36],
    ...[3, 14, 24, 30, 37].map((x) => ['street-lamp', 'black', x, 33]),
    // The plaza with a fountain, benches and greenery.
    ['fountain', 'stone', 34, 3],
    ['park-bench', 'wood', 31, 2],
    ['park-bench', 'wood', 36, 2],
    ['street-tree', 'green', 38, 3],
    ['street-tree', 'green', 38, 7],
    ['flower-bed', 'pink', 31, 7],
    // Trees around the building.
    ['pine-tree-small', 'green', 1, 10],
    ['pine-tree-large', 'green', 1, 18],
    ['maple-tree', 'lightgreen', 1, 25],
    ['birch-tree', 'lightgreen', 36, 14],
    ['pine-tree-small', 'green', 37, 21],
    ['maple-tree', 'green', 36, 28],
    ['pine-tree-small', 'green', 5, 2],
    ['birch-tree', 'lightgreen', 24, 3],
    ['pine-tree-large', 'green', 28, 1],
    // Near pavement: street trees, lamps, the bus stop, bins, bikes, a hydrant and traffic lights at the crossing.
    ['street-tree', 'green', 2, ROAD - 2],
    ['street-tree', 'green', 11, ROAD - 2],
    ['street-tree', 'green', 27, ROAD - 2],
    ['street-tree', 'green', 38, ROAD - 2],
    ['bus-stop', 'glass', 32, ROAD - 2],
    ['bike-rack', 'grey', 6, ROAD - 2],
    ['trash-bin', 'green', 16, ROAD - 2],
    ['trash-bin', 'green', 30, ROAD - 2],
    ['fire-hydrant', 'red', 24, ROAD - 1],
    ['traffic-light', 'black', 18, ROAD - 1],
    ['traffic-light', 'black', 22, ROAD - 1],
    // Far pavement.
    ['traffic-light', 'black', 18, ROAD + 4],
    ['traffic-light', 'black', 22, ROAD + 4],
    ['street-tree', 'green', 4, ROAD + 5],
    ['street-tree', 'green', 13, ROAD + 5],
    ['street-tree', 'green', 29, ROAD + 5],
    ['street-tree', 'green', 36, ROAD + 5],
    ['food-cart', 'red', 25, ROAD + 5],
    ['trash-bin', 'green', 9, ROAD + 5],
    ['fire-hydrant', 'red', 33, ROAD + 4],
    // The park.
    ['park-bench', 'wood', 6, ROAD + 7],
    ['park-bench', 'wood', 13, ROAD + 7],
    ['park-bench', 'wood', 25, ROAD + 7],
    ['park-bench', 'wood', 32, ROAD + 7],
    ['flower-bed', 'pink', 9, ROAD + 7],
    ['flower-bed', 'pink', 28, ROAD + 7],
    ['maple-tree', 'lightgreen', 2, ROAD + 11],
    ['pine-tree-small', 'green', 10, ROAD + 11],
    ['birch-tree', 'lightgreen', 17, ROAD + 11],
    ['pine-tree-large', 'green', 25, ROAD + 11],
    ['maple-tree', 'green', 32, ROAD + 11],
    ['pine-tree-small', 'green', 38, ROAD + 10],
  ],
  traffic: [
    {
      row: ROAD + 1,
      direction: 1,
      speed: 80,
      vehicles: ['car-red', 'car-taxi', 'van-white', 'car-green', 'city-bus', 'car-blue'],
    },
    {
      row: ROAD + 3,
      direction: -1,
      speed: 70,
      vehicles: ['car-blue', 'city-bus', 'car-green', 'car-taxi', 'car-red', 'van-white'],
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Campus: two buildings joined by a promenade and a fountain plaza, gardens in between and a long beach.
const CAMPUS_COLS = 92,
  CAMPUS_ROWS = 78,
  CAMPUS_SAND = 59;
const campus = composeMap(vivo, {
  cols: CAMPUS_COLS,
  rows: CAMPUS_ROWS,
  spawn: { tx: 20, ty: 39 },
  stamps: [
    { rect: { x: 0, y: 0, w: 46, h: 44 } }, // the whole office
    { rect: { x: 6, y: 0, w: 46, h: 44 }, dx: 40, suffix: '-b', label: '2' }, // and a second building beside it
  ],
  areas: [
    path(20, 43, 2, 5),
    path(60, 43, 2, 5), // from each lobby door
    path(4, 47, 84, 2), // the promenade joining both buildings
    path(44, 8, 3, 39), // the garden alley between the buildings, up to the northern walk
    path(24, 8, 44, 2), // the northern walk past both koi ponds
    ground('Plaza', 'StonePath', 'Grey', 39, 49, 14, 7),
    path(44, 56, 3, 3), // down to the sand
    ...beach(CAMPUS_COLS, CAMPUS_SAND, CAMPUS_ROWS, [[38, 54]]),
    ...pier(72, CAMPUS_ROWS - 10, 8),
    ...pier(16, CAMPUS_ROWS - 10, 8),
  ],
  objects: [
    // Hedges and flower beds along the promenade, open in front of the doors, the alley and the plaza.
    ...every(4, 36, 4, (x) =>
      x >= 18 && x <= 22
        ? []
        : [[x % 8 === 0 ? 'flower-bed' : 'hedge', x % 8 === 0 ? 'pink' : 'green', x, 45]],
    ),
    ...every(52, 84, 4, (x) =>
      x >= 58 && x <= 62
        ? []
        : [[x % 8 === 0 ? 'flower-bed' : 'hedge', x % 8 === 0 ? 'pink' : 'green', x, 45]],
    ),
    ...every(6, 34, 7, (x) => [['street-lamp', 'black', x, 49]]),
    ...every(56, 86, 7, (x) => [['street-lamp', 'black', x, 49]]),
    ['park-bench', 'wood', 10, 50],
    ['park-bench', 'wood', 28, 50],
    ['park-bench', 'wood', 64, 50],
    ['park-bench', 'wood', 80, 50],
    // The plaza: fountain, benches around it, flowers and palms at the corners.
    ['fountain', 'stone', 44, 51],
    ['park-bench', 'wood', 40, 50],
    ['park-bench', 'wood', 49, 50],
    ['park-bench', 'wood', 40, 54],
    ['park-bench', 'wood', 49, 54],
    ['palm-tree-short', 'green', 39, 49],
    ['palm-tree-short', 'green', 52, 49],
    ['flower-bed', 'pink', 39, 55],
    ['flower-bed', 'pink', 51, 55],
    // The alley between the buildings: lamps, benches and a little greenery.
    ...every(21, 41, 6, (y) => [
      ['street-lamp', 'black', 43, y],
      ['street-lamp', 'black', 47, y],
    ]),
    ['park-bench', 'wood', 44, 30],
    ['flower-bed', 'pink', 41, 26],
    ['flower-bed', 'pink', 41, 34],
    // Northern walk: lamps between the ponds.
    ...every(30, 64, 8, (x) => [['street-lamp', 'black', x, 7]]),
    // Gardens south of the buildings.
    ['pine-tree-large', 'green', 2, 50],
    ['maple-tree', 'lightgreen', 8, 52],
    ['birch-tree', 'lightgreen', 30, 52],
    ['pine-tree-small', 'green', 35, 50],
    ['pine-tree-small', 'green', 56, 50],
    ['birch-tree', 'lightgreen', 62, 53],
    ['maple-tree', 'green', 76, 52],
    ['pine-tree-large', 'green', 88, 50],
    // The beach.
    ...every(1, 90, 6, (x) => (x >= 42 && x <= 48 ? [] : [['palm-tree', 'green', x, CAMPUS_SAND]])),
    ...sunSpot(6, CAMPUS_SAND + 3, 'red'),
    ...sunSpot(24, CAMPUS_SAND + 4, 'blue'),
    ...sunSpot(34, CAMPUS_SAND + 3, 'red'),
    ...sunSpot(54, CAMPUS_SAND + 3, 'blue'),
    ...sunSpot(64, CAMPUS_SAND + 4, 'red'),
    ...sunSpot(82, CAMPUS_SAND + 3, 'blue'),
    ['lifeguard-tower', 'white', 44, CAMPUS_SAND + 5],
    ['surfboard', 'white', 69, CAMPUS_SAND + 6],
    ['surfboard', 'white', 70, CAMPUS_SAND + 6],
    ['surfboard', 'white', 13, CAMPUS_SAND + 6],
    ['sandcastle', 'sand', 30, CAMPUS_SAND + 7],
    ['sandcastle', 'sand', 58, CAMPUS_SAND + 7],
    ['beach-ball', 'red', 50, CAMPUS_SAND + 7],
    ['beach-ball', 'red', 18, CAMPUS_SAND + 2],
    ['beach-rocks', 'grey', 2, CAMPUS_SAND + 7],
    ['beach-rocks', 'grey', 40, CAMPUS_SAND + 7],
    ['beach-rocks', 'grey', 89, CAMPUS_SAND + 7],
    ['rowboat', 'wood', 76, CAMPUS_SAND + 5],
    ['rowboat', 'wood', 20, CAMPUS_SAND + 5],
  ],
});

export const MAPS = { vivo: { ...vivo }, studio, campus };
export const MAP_IDS = Object.keys(MAPS);
