// Builds a new office map by reusing whole pieces of another: rooms (areas with their walls, floors and doors) and the
// furniture standing in them. Doors that led into a walled room that was not copied are closed.
import { CATALOG } from '../vivo-catalog.js';

const TILE = 32;
const inside = (rect, x, y) =>
  x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
const containsArea = (rect, area) =>
  area.x >= rect.x &&
  area.y >= rect.y &&
  area.x + area.w <= rect.x + rect.w &&
  area.y + area.h <= rect.y + rect.h;

export function composeMap(
  base,
  { cols, rows, stamps, spawn, areas: extraAreas = [], objects: placements = [], traffic = [] },
) {
  const root = {
    id: 'root',
    name: 'Public area',
    type: 'Public',
    parent: null,
    x: 0,
    y: 0,
    w: cols,
    h: rows,
    depth: 1,
    capacity: null,
    floor: 'NewStyleGrass',
    floorColor: 'Green',
    walls: null,
    doorways: [],
  };
  const areas = [root],
    objects = [],
    extras = [];
  const walled = base.AREAS.filter((area) => area.walls);
  for (const { rect, dx = 0, dy = 0, suffix = '', label = '' } of stamps) {
    const copied = base.AREAS.filter((area) => area.parent !== null && containsArea(rect, area));
    const copiedIds = new Set(copied.map((area) => area.id));
    // Furniture comes along when it stands inside the stamp and its room (the deepest area under it) comes too.
    const roomOf = (tx, ty) =>
      base.AREAS.filter((area) => area.parent !== null && inside(area, tx, ty)).sort(
        (a, b) => b.depth - a.depth,
      )[0] ?? null;
    const objectIds = new Set(
      [...base.OBJECTS, ...base.EXTRA_OBJECTS]
        .filter((o) => {
          const tx = Math.floor(o.x / TILE),
            ty = Math.floor(o.y / TILE),
            room = roomOf(tx, ty);
          return inside(rect, tx, ty) && (!room || copiedIds.has(room.id));
        })
        .map((o) => o.id),
    );
    const id = (value) =>
      value === null
        ? null
        : copiedIds.has(value) || objectIds.has(value)
          ? value + suffix
          : 'root';
    for (const area of copied) {
      const doorways = area.doorways.filter((door) => {
        const tx = area.x + door.x,
          ty = area.y + door.y;
        const [ox, oy] =
          door.orientation === 'Horizontal'
            ? [tx, door.y === 0 ? ty - 1 : ty + 1]
            : [door.x === 0 ? tx - 1 : tx + 1, ty];
        const target = walled.find(
          (other) =>
            other.id !== area.id &&
            inside(other, ox, oy) &&
            !(
              other.x <= area.x &&
              other.y <= area.y &&
              other.x + other.w >= area.x + area.w &&
              other.y + other.h >= area.y + area.h
            ),
        );
        return !target || copiedIds.has(target.id);
      });
      const name =
        label && area.type !== 'Desk' && area.type !== 'Public'
          ? `${area.name} ${label}`
          : area.name;
      areas.push({
        ...area,
        id: area.id + suffix,
        name,
        parent: id(area.parent),
        x: area.x + dx,
        y: area.y + dy,
        doorways,
      });
    }
    const move = (o) => ({
      ...o,
      id: o.id + suffix,
      parent: id(o.parent),
      x: o.x + dx * TILE,
      y: o.y + dy * TILE,
      ...(o.blocks ? { blocks: o.blocks.map(([x, y]) => [x + dx, y + dy]) } : {}),
      ...(o.seat ? { seat: o.seat.map(([x, y]) => [x + dx, y + dy]) } : {}),
    });
    for (const o of base.OBJECTS) if (objectIds.has(o.id)) objects.push(move(o));
    for (const o of base.EXTRA_OBJECTS) if (objectIds.has(o.id)) extras.push(move(o));
  }
  // New ground: paths, plazas, sand, sea and piers. Copied furniture standing on a cleared area (paths, sand, water) is
  // removed so it never blocks the way; then the new pieces are placed by tile.
  extraAreas.forEach((spec, index) =>
    areas.push({
      id: `ground-${index}`,
      name: spec.name,
      type: 'Public',
      parent: 'root',
      x: spec.x,
      y: spec.y,
      w: spec.w,
      h: spec.h,
      depth: spec.depth ?? 2,
      capacity: null,
      floor: spec.floor,
      floorColor: spec.floorColor,
      walls: null,
      doorways: [],
      ...(spec.blocked ? { blocked: true } : {}),
    }),
  );
  const cleared = extraAreas.filter((spec) => spec.clear !== false);
  const onCleared = (tiles) => tiles.some(([x, y]) => cleared.some((spec) => inside(spec, x, y)));
  const keep = (o) =>
    !onCleared([
      [Math.floor(o.x / TILE), Math.floor(o.y / TILE)],
      ...(o.blocks ?? []),
      ...(o.seat ?? []),
    ]);
  for (const list of [objects, extras]) {
    const kept = list.filter(keep);
    list.length = 0;
    list.push(...kept);
  }
  placements.forEach(([kind, color, ax, ay], index) => {
    const entry = CATALOG[`${kind}/${color}`];
    if (!entry) throw new Error(`Unknown catalog piece ${kind}/${color}`);
    const variant = entry.facings.Down ?? Object.values(entry.facings)[0];
    const facing = entry.facings.Down ? 'Down' : Object.keys(entry.facings)[0];
    const [px, py] = variant.seat[0] ?? variant.blocks[0] ?? [0, 0];
    const tx = ax - px,
      ty = ay - py; // (ax, ay) is the tile the piece stands on
    objects.push({
      id: `placed-${index}`,
      parent: 'root',
      kind,
      family: entry.family,
      color,
      facing,
      w: variant.w,
      h: variant.h,
      originX: variant.originX,
      originY: variant.originY,
      x: tx * TILE + variant.offLeft + variant.originX,
      y: ty * TILE + variant.offTop + variant.originY,
      ...(variant.blocks.length
        ? { blocks: variant.blocks.map(([x, y]) => [tx + x, ty + y]) }
        : {}),
      ...(variant.seat.length ? { seat: variant.seat.map(([x, y]) => [tx + x, ty + y]) } : {}),
    });
  });
  return {
    TILE,
    WORLD: Object.freeze({ cols, rows, width: cols * TILE, height: rows * TILE }),
    AREAS: areas,
    OBJECTS: objects,
    EXTRA_OBJECTS: extras,
    SPAWN_TILE: Object.freeze(spawn),
    TRAFFIC: traffic,
  };
}
