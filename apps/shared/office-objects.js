import { EXTRA_OBJECTS, OBJECTS, TILE } from './vivo-map.js';
import { CATALOG } from './vivo-catalog.js';

/** Editor objects keep the short kinds of the first prototype as aliases of catalog entries. */
export const LEGACY_KINDS = Object.freeze({
  plant: 'ficus/black',
  chair: 'space-chair/red',
  table: 'simple-coffee-table/black',
  lamp: 'molecular-lamp/grey',
});
export const FACINGS = ['Up', 'Right', 'Down', 'Left'];

export const anchorOf = (variant) => variant.seat[0] ?? variant.blocks[0] ?? [0, 0];

export function catalogEntry(object) {
  const key =
    LEGACY_KINDS[object.kind] ??
    (object.color
      ? `${object.kind}/${object.color}`
      : Object.keys(CATALOG).find((candidate) => candidate.startsWith(`${object.kind}/`)));
  return key ? (CATALOG[key] ?? null) : null;
}

/** Resolve an editor object (kind, optional color/facing, x/y) to a concrete catalog variant and anchor tile. */
export function resolveObject(object) {
  const entry = catalogEntry(object);
  if (!entry) return null;
  const facing = entry.facings[object.facing] ? object.facing : Object.keys(entry.facings)[0];
  const variant = entry.facings[facing];
  // The editor's tile is where the object stands (its first seat or collision tile); the sprite's top-left tile follows from it.
  const [ax, ay] = anchorOf(variant);
  const tx = Math.floor(object.x / TILE) - ax,
    ty = Math.floor(object.y / TILE) - ay;
  return { entry, facing, variant, tx, ty };
}

/** The next facing available for this object in the catalog, clockwise. */
export function nextFacing(object) {
  const resolved = resolveObject(object);
  if (!resolved) return null;
  const available = FACINGS.filter((facing) => resolved.entry.facings[facing]);
  return available[(available.indexOf(resolved.facing) + 1) % available.length];
}

export function officeObjectTiles(object) {
  const resolved = resolveObject(object);
  if (!resolved) return [];
  return resolved.variant.blocks.map(([dx, dy]) => [resolved.tx + dx, resolved.ty + dy]);
}

/** Adapt an editor object to the map object shape used by the shared geometry and the renderer.
    The editor object's (x, y) selects its top-left tile; the sprite sits at tile*32 + offset like in the reference. */
export function asMapObject(object, id = `object:${object.id}`) {
  const resolved = resolveObject(object);
  if (!resolved)
    return {
      id,
      kind: object.kind,
      color: object.color ?? '',
      facing: 'Down',
      x: object.x,
      y: object.y,
      w: 32,
      h: 32,
      originX: 16,
      originY: 32,
    };
  const { entry, facing, variant, tx, ty } = resolved;
  // Freely placed objects keep their exact offset from the centre of the tile they stand on; collisions stay per tile.
  const shiftX = object.free ? object.x - (Math.floor(object.x / TILE) * TILE + TILE / 2) : 0;
  const shiftY = object.free ? object.y - (Math.floor(object.y / TILE) * TILE + TILE / 2) : 0;
  const blocks = variant.blocks.map(([dx, dy]) => [tx + dx, ty + dy]);
  const seat = variant.seat.map(([dx, dy]) => [tx + dx, ty + dy]);
  return {
    id,
    parent: null,
    kind: entry.kind,
    family: entry.family,
    color: entry.color,
    facing,
    x: tx * TILE + variant.offLeft + variant.originX + shiftX,
    y: ty * TILE + variant.offTop + variant.originY + shiftY,
    w: variant.w,
    h: variant.h,
    originX: variant.originX,
    originY: variant.originY,
    blocks: blocks.length ? blocks : undefined,
    seat: seat.length ? seat : undefined,
  };
}

/** Test only the new object's footprint, not unrelated walls or map boundaries. */
export function officeObjectBlocksPoint(object, point) {
  const px = Math.floor(point.x / TILE),
    py = Math.floor(point.y / TILE);
  return officeObjectTiles(object).some(([tx, ty]) => tx === px && ty === py);
}

export const BASE_OBJECTS = Object.freeze([...OBJECTS, ...EXTRA_OBJECTS]);
const BASE_BY_ID = new Map(BASE_OBJECTS.map((object) => [object.id, object]));
export const isBaseObjectId = (id) => BASE_BY_ID.has(id);
export const baseObject = (id) => BASE_BY_ID.get(id) ?? null;

/** Valid override for a base object: a new facing from its catalog entry and/or a new position. */
export function validOverride(id, override) {
  const base = BASE_BY_ID.get(id);
  if (!base || !override || typeof override !== 'object') return false;
  if (override.removed !== undefined && typeof override.removed !== 'boolean') return false;
  if (override.free !== undefined && typeof override.free !== 'boolean') return false;
  if (override.facing !== undefined && !catalogEntry(base)?.facings[override.facing]) return false;
  if (
    (override.x !== undefined || override.y !== undefined) &&
    !(Number.isFinite(override.x) && Number.isFinite(override.y))
  )
    return false;
  return true;
}

/** Base map objects with the room's overrides applied (rotated, moved or removed pieces). */
export function effectiveBaseObjects(overrides = {}) {
  return BASE_OBJECTS.flatMap((base) => {
    const override = overrides[base.id];
    if (!override) return [base];
    if (override.removed) return [];
    if (override.facing === undefined && override.x === undefined) return [base];
    const moved = asMapObject(baseAsEditorObject(base.id, overrides), base.id);
    return [{ ...moved, parent: base.parent, family: base.family }];
  });
}

/** Editor view of a base object (kind, colour, facing, top-left tile centre), with overrides applied. */
export function baseAsEditorObject(id, overrides = {}) {
  const base = BASE_BY_ID.get(id);
  if (!base) return null;
  const override = overrides[id] ?? {};
  if (override.x !== undefined)
    return {
      id,
      kind: base.kind,
      color: base.color,
      facing: override.facing ?? base.facing,
      x: override.x,
      y: override.y,
      ...(override.free ? { free: true } : {}),
    };
  const variant = catalogEntry(base)?.facings[base.facing];
  const [ax, ay] = variant ? anchorOf(variant) : [0, 0];
  const tx =
    (variant
      ? Math.round((base.x - base.originX - variant.offLeft) / TILE)
      : Math.floor(base.x / TILE)) + ax;
  const ty =
    (variant
      ? Math.round((base.y - base.originY - variant.offTop) / TILE)
      : Math.floor(base.y / TILE)) + ay;
  return {
    id,
    kind: base.kind,
    color: base.color,
    facing: override.facing ?? base.facing,
    x: tx * TILE + TILE / 2,
    y: ty * TILE + TILE / 2,
  };
}
