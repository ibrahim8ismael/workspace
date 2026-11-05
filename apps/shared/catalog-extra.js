// Outdoor and beach objects drawn for Open Office (PixelLab, in the project's own style). Same shape as the main
// catalog: the sprite's top-left pixel is tile * 32 + offset, and blocks/seat are tiles from the top-left tile.
function entry(kind, color, family, w, h, { cols = 1, rows = 1, blocks = [], seat = [] } = {}) {
  const offLeft = Math.round((cols * 32 - w) / 2),
    offTop = rows * 32 - h - 2;
  return [
    `${kind}/${color}`,
    {
      kind,
      color,
      family,
      facings: {
        Down: { w, h, originX: Math.round(w / 2), originY: h - 4, offLeft, offTop, blocks, seat },
      },
    },
  ];
}
export const EXTRA_CATALOG = Object.fromEntries([
  entry('palm-tree', 'green', 'Palm Tree', 64, 96, { blocks: [[0, 0]] }),
  entry('palm-tree-short', 'green', 'Palm Tree', 56, 72, { blocks: [[0, 0]] }),
  entry('beach-umbrella', 'red', 'Beach Umbrella', 56, 64, { blocks: [[0, 0]] }),
  entry('beach-umbrella', 'blue', 'Beach Umbrella', 56, 64, { blocks: [[0, 0]] }),
  entry('sun-lounger', 'white', 'Beach Seat', 28, 52, {
    rows: 2,
    seat: [[0, 1]],
    blocks: [[0, 0]],
  }),
  entry('beach-towel', 'yellow', 'Beach Decor', 28, 48, { rows: 2 }),
  entry('surfboard', 'white', 'Beach Decor', 20, 56, { blocks: [[0, 0]] }),
  entry('sandcastle', 'sand', 'Beach Decor', 36, 32, { blocks: [[0, 0]] }),
  entry('beach-ball', 'red', 'Beach Decor', 16, 16),
  entry('lifeguard-tower', 'white', 'Beach Decor', 48, 84, {
    cols: 2,
    blocks: [
      [0, 0],
      [1, 0],
    ],
  }),
  entry('rowboat', 'wood', 'Beach Decor', 40, 64, {
    rows: 2,
    blocks: [
      [0, 0],
      [0, 1],
    ],
  }),
  entry('beach-rocks', 'grey', 'Beach Decor', 40, 28, { blocks: [[0, 0]] }),
  entry('hedge', 'green', 'Garden', 64, 40, {
    cols: 2,
    blocks: [
      [0, 0],
      [1, 0],
    ],
  }),
  entry('flower-bed', 'pink', 'Garden', 64, 32, {
    cols: 2,
    blocks: [
      [0, 0],
      [1, 0],
    ],
  }),
  entry('park-bench', 'wood', 'Garden Seat', 64, 40, {
    cols: 2,
    seat: [
      [0, 0],
      [1, 0],
    ],
  }),
  entry('street-lamp', 'black', 'Street Lamp', 24, 72, { blocks: [[0, 0]] }),
  entry('fountain', 'stone', 'Fountain', 96, 80, {
    cols: 3,
    rows: 2,
    blocks: [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
  }),
  // Street furniture
  entry('bus-stop', 'glass', 'Street', 80, 64, {
    cols: 3,
    blocks: [
      [0, 0],
      [2, 0],
    ],
    seat: [[1, 0]],
  }),
  entry('traffic-light', 'black', 'Street', 20, 72, { blocks: [[0, 0]] }),
  entry('fire-hydrant', 'red', 'Street', 16, 22, { blocks: [[0, 0]] }),
  entry('bike-rack', 'grey', 'Street', 64, 40, {
    cols: 2,
    blocks: [
      [0, 0],
      [1, 0],
    ],
  }),
  entry('trash-bin', 'green', 'Street', 20, 32, { blocks: [[0, 0]] }),
  entry('street-tree', 'green', 'Street', 48, 80, { blocks: [[0, 0]] }),
  entry('food-cart', 'red', 'Street', 56, 56, {
    cols: 2,
    blocks: [
      [0, 0],
      [1, 0],
    ],
  }),
]);
