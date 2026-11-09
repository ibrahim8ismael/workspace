import { appearanceSchema, mapManifestSchema } from '@gather/contracts';
import { validateOfficeGeometry } from '@gather/world';
import type { OfficeGeometry, WorldPoint } from '@gather/world';
import manifestJson from '../../../packages/assets/manifests/commons-map.json';

type Pose = 'standing' | 'sitting';
interface Sprite {
  path: string;
  width: number;
  height: number;
  footOrigin: WorldPoint;
}
interface Catalog {
  mapId: string;
  formatVersion: number;
  defaultAppearance: { bodyId: string; paletteId: string };
  drawOrder: string[];
  bindings: {
    tableObjectIds: string[];
    tableSpriteId: string;
    chairBackrestSpriteId: string;
  };
  avatar: { frames: (Sprite & { frameId: string; pose: Pose; direction: string })[] };
  objects: (Sprite & { spriteId: string; role: string })[];
}
type Geometry = OfficeGeometry & { formatVersion: number; assetManifestVersion: string };
const maps = import.meta.glob<Geometry>('../../../packages/assets/maps/commons-v1-*.json', {
  eager: true,
  import: 'default',
});
const catalogs = import.meta.glob<Catalog>(
  '../../../packages/assets/manifests/commons-art-v1-*.json',
  { eager: true, import: 'default' },
);
const urls = import.meta.glob<string>('../../../packages/assets/sprites/*.svg', {
  eager: true,
  import: 'default',
  query: '?url&no-inline',
});

export function readPreview() {
  const manifest = mapManifestSchema.parse(manifestJson);
  const geometry = maps[`../../../packages/assets${manifest.geometryPath}`];
  const catalog =
    catalogs[`../../../packages/assets/manifests/${manifest.assetManifestVersion}.json`];
  if (
    !geometry ||
    !catalog ||
    geometry.assetManifestVersion !== manifest.assetManifestVersion ||
    geometry.formatVersion !== manifest.formatVersion ||
    catalog.formatVersion !== manifest.formatVersion ||
    geometry.mapId !== manifest.mapId ||
    catalog.mapId !== manifest.mapId ||
    geometry.tileSize !== manifest.tileSize ||
    geometry.spawn.x !== manifest.spawn.x ||
    geometry.spawn.y !== manifest.spawn.y
  )
    throw new Error('Commons manifest and preview files disagree');
  const { bounds } = validateOfficeGeometry(geometry);
  if (bounds.width !== manifest.bounds.width || bounds.height !== manifest.bounds.height)
    throw new Error('Commons preview bounds disagree');

  const table = geometry.objects.find(
    ({ objectId }) => objectId === catalog.bindings.tableObjectIds[0],
  );
  const seat = table?.seats[0];
  if (!table || !seat || table.blockedTiles.length === 0)
    throw new Error('Commons preview furniture is missing');
  const room = geometry.zones.find(
    ({ kind, bounds: { tx, ty, width, height } }) =>
      kind === 'meeting' &&
      seat.tile.tx >= tx &&
      seat.tile.tx < tx + width &&
      seat.tile.ty >= ty &&
      seat.tile.ty < ty + height,
  );
  if (!room) throw new Error('Commons preview chair is outside a meeting room');

  function frame<T extends Sprite>(key: string, sprite: T | undefined, layer: string) {
    const url = sprite && urls[`../../../packages/assets${sprite.path}`];
    const depth = catalog.drawOrder.indexOf(layer);
    if (!sprite || !url || depth < 0) throw new Error(`Missing Commons preview texture: ${key}`);
    return { key, url, depth, ...sprite } as T & { key: string; url: string; depth: number };
  }
  const tableArt = catalog.objects.find(
    ({ spriteId }) => spriteId === catalog.bindings.tableSpriteId,
  );
  const chairArt = catalog.objects.find(
    ({ spriteId }) => spriteId === catalog.bindings.chairBackrestSpriteId,
  );
  const { bodyId } = appearanceSchema.parse(catalog.defaultAppearance);
  const avatar = (pose: Pose) => {
    const poseId = pose === 'standing' ? 'stand' : 'sit';
    return catalog.avatar.frames.find(
      (sprite) =>
        sprite.frameId === `${bodyId}-${poseId}-south` &&
        sprite.pose === pose &&
        sprite.direction === 'south',
    );
  };
  const standing = frame('standing', avatar('standing'), 'avatar');
  const sitting = frame('sitting', avatar('sitting'), 'avatar');
  const avatarFrames = catalog.avatar.frames.map((sprite) =>
    frame(sprite.frameId, sprite, 'avatar'),
  );
  const objectFrames = catalog.objects.map((sprite) => frame(sprite.spriteId, sprite, sprite.role));
  if (!tableArt || !chairArt) throw new Error('Commons preview object art is missing');
  return {
    manifest,
    geometry,
    catalog,
    avatarFrames,
    objectFrames,
    room,
    table,
    seat,
    standing,
    sitting,
    tableArt: frame('table', tableArt, tableArt.role),
    chairArt: frame('chair', chairArt, chairArt.role),
  };
}
