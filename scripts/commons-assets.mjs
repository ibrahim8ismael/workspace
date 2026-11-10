import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMONS_GEOMETRY, validateOfficeGeometry } from '../packages/world/dist/index.js';
import {
  MAP_FORMAT_VERSION,
  MAP_TILE_SIZE,
  appearanceSchema,
  mapManifestSchema,
} from '../packages/contracts/dist/index.js';
import * as source from './commons-source.mjs';

const MODULE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_RELATIVE = 'packages/assets/source/commons';
const SPRITE_RELATIVE = 'packages/assets/sprites';
const MAP_RELATIVE = 'packages/assets/maps';
const MANIFEST_RELATIVE = 'packages/assets/manifests';
const COMMONS_MAP_ID = 'commons';
const POINTER_MANIFEST_RELATIVE = `${MANIFEST_RELATIVE}/commons-map.json`;
const ASSET_MANIFEST_PREFIX = 'commons-art-v1-';
// Fixed trusted sources are single-line, rect-only SVGs. This full grammar describes that shape;
// it is not a general XML sanitizer.
const SVG_ROOT =
  /^<svg\s+xmlns="http:\/\/www\.w3\.org\/2000\/svg"\s+width="(\d+)"\s+height="(\d+)"\s+viewBox="0 0 (\d+) (\d+)"\s+shape-rendering="crispEdges"\s*>([\s\S]*)<\/svg>$/;
const RECT_BODY = new RegExp(
  `^(?:\\s*<rect\\s+x="\\d+"\\s+y="\\d+"\\s+width="[1-9]\\d*"\\s+height="[1-9]\\d*"\\s+fill="(?:${[...source.PALETTE].join('|')})"\\s*/>)+\\s*$`,
);

const invariant = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');
const artifact = (digest, version, relativePath, bytes) => ({
  digest,
  version,
  relativePath,
  bytes,
});

function sortRecord(value) {
  if (Array.isArray(value)) return value.map(sortRecord);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortRecord(value[key])]),
  );
}

function readSprite(root, file, { width, height, footOrigin }) {
  const relativePath = `${SOURCE_RELATIVE}/${file}`;
  const bytes = readFileSync(join(root, relativePath));
  const svg = SVG_ROOT.exec(bytes.toString('utf8').trim());
  invariant(svg !== null, `${relativePath} must be one rect-only SVG root`);
  invariant(
    Number(svg[1]) === width &&
      Number(svg[2]) === height &&
      Number(svg[3]) === width &&
      Number(svg[4]) === height,
    `${relativePath} must declare ${width} x ${height} dimensions and viewBox`,
  );
  invariant(
    footOrigin.x >= 0 && footOrigin.x < width && footOrigin.y >= 0 && footOrigin.y < height,
    `${relativePath} footOrigin must be a point inside its ${width} x ${height} canvas`,
  );
  const body = svg[5];
  invariant(
    RECT_BODY.test(body),
    `${relativePath} must contain only integer rects from the approved palette`,
  );
  invariant(
    !new RegExp(`<rect\\s+x="0"\\s+y="0"\\s+width="${width}"\\s+height="${height}"`).test(body),
    `${relativePath} must not paint a full-canvas background`,
  );
  return { bytes, sha256: sha256Hex(bytes) };
}

function loadRecord(root, file, record, sprites) {
  const { bytes, sha256 } = readSprite(root, file, record);
  sprites.push({ relativePath: `${SPRITE_RELATIVE}/${sha256}.svg`, bytes });
  return { ...record, sha256, path: `/sprites/${sha256}.svg` };
}

export function buildCommonsAssets(root = MODULE_ROOT) {
  invariant(
    COMMONS_GEOMETRY.mapId === COMMONS_MAP_ID && COMMONS_GEOMETRY.tileSize === MAP_TILE_SIZE,
    `world geometry must use mapId "${COMMONS_MAP_ID}" and tileSize ${MAP_TILE_SIZE}`,
  );
  const validated = validateOfficeGeometry(COMMONS_GEOMETRY);
  const defaultAppearance = appearanceSchema.parse({
    bodyId: source.BODY_ID,
    paletteId: source.PALETTE_ID,
  });

  const sprites = [];
  const frames = source.POSES.flatMap(([pose, stem]) =>
    source.DIRECTIONS.map((direction) =>
      loadRecord(
        root,
        `avatar-${stem}-${direction}.svg`,
        {
          frameId: `${defaultAppearance.bodyId}-${stem}-${direction}`,
          pose,
          direction,
          ...source.AVATAR,
        },
        sprites,
      ),
    ),
  );
  const objects = source.OBJECTS.map(({ source: file, ...definition }) =>
    loadRecord(root, file, definition, sprites),
  );

  const [table, chair] = objects;
  const tableObjectIds = COMMONS_GEOMETRY.objects.map(({ objectId }) => objectId);
  invariant(tableObjectIds.length === 2, 'Commons geometry must define exactly two tables');
  for (const { objectId, blockedTiles } of COMMONS_GEOMETRY.objects) {
    const columns = blockedTiles.map(({ tx }) => tx);
    const rows = blockedTiles.map(({ ty }) => ty);
    invariant(
      table.width === (Math.max(...columns) - Math.min(...columns) + 1) * MAP_TILE_SIZE &&
        table.height === (Math.max(...rows) - Math.min(...rows) + 1) * MAP_TILE_SIZE,
      `${table.spriteId} must match the ${objectId} footprint`,
    );
  }
  invariant(
    chair.width === MAP_TILE_SIZE && chair.height === MAP_TILE_SIZE,
    `${chair.spriteId} must cover one ${MAP_TILE_SIZE}px tile`,
  );

  const catalog = {
    formatVersion: MAP_FORMAT_VERSION,
    mapId: COMMONS_MAP_ID,
    appearances: [{ ...defaultAppearance }],
    defaultAppearance,
    directions: [...source.DIRECTIONS],
    usage: 'static-pose-reference',
    avatar: {
      canvas: { width: source.AVATAR.width, height: source.AVATAR.height },
      footOrigin: { ...source.AVATAR.footOrigin },
      frames,
    },
    objects,
    bindings: {
      tableObjectIds,
      tableSpriteId: table.spriteId,
      chairBackrestSpriteId: chair.spriteId,
    },
    drawOrder: [...source.DRAW_ORDER],
    source: { ...source.ARTWORK },
  };
  const catalogBytes = Buffer.from(JSON.stringify(sortRecord(catalog)), 'utf8');
  const catalogDigest = sha256Hex(catalogBytes);
  const assetManifestVersion = `${ASSET_MANIFEST_PREFIX}${catalogDigest}`;
  const catalogRelativePath = `${MANIFEST_RELATIVE}/${assetManifestVersion}.json`;

  const geometry = {
    ...COMMONS_GEOMETRY,
    formatVersion: MAP_FORMAT_VERSION,
    coordinateUnits: 'pixels',
    assetManifestVersion,
  };
  const geometryBytes = Buffer.from(JSON.stringify(sortRecord(geometry)), 'utf8');
  const geometryDigest = sha256Hex(geometryBytes);
  const mapVersion = `${COMMONS_MAP_ID}-v1-${geometryDigest}`;
  const geometryRelativePath = `${MAP_RELATIVE}/${mapVersion}.json`;

  const manifest = {
    formatVersion: MAP_FORMAT_VERSION,
    mapId: COMMONS_MAP_ID,
    mapVersion,
    contentHash: geometryDigest,
    coordinateUnits: 'pixels',
    tileSize: MAP_TILE_SIZE,
    bounds: validated.bounds,
    spawn: { ...COMMONS_GEOMETRY.spawn },
    geometryPath: `/maps/${mapVersion}.json`,
    assetManifestVersion,
  };
  mapManifestSchema.parse(manifest);
  const manifestBytes = Buffer.from(`${JSON.stringify(sortRecord(manifest), null, 2)}\n`, 'utf8');

  const immutableOutputs = [
    ...sprites,
    { relativePath: catalogRelativePath, bytes: catalogBytes },
    { relativePath: geometryRelativePath, bytes: geometryBytes },
  ];
  return {
    catalog: artifact(catalogDigest, assetManifestVersion, catalogRelativePath, catalogBytes),
    geometry: artifact(geometryDigest, mapVersion, geometryRelativePath, geometryBytes),
    sprites,
    manifest: { relativePath: POINTER_MANIFEST_RELATIVE, bytes: manifestBytes },
    immutableOutputs,
  };
}

export function checkCommonsAssets(root = MODULE_ROOT) {
  const expected = buildCommonsAssets(root);
  const errors = [];
  for (const output of [...expected.immutableOutputs, expected.manifest]) {
    try {
      const actual = readFileSync(join(root, output.relativePath));
      if (!actual.equals(output.bytes)) errors.push(`drifted ${output.relativePath}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      errors.push(`missing ${output.relativePath}`);
    }
  }
  return { errors, expected };
}

function writeExclusive(fullPath, bytes) {
  mkdirSync(dirname(fullPath), { recursive: true });
  try {
    writeFileSync(fullPath, bytes, { flag: 'wx' });
    return 1;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  invariant(
    readFileSync(fullPath).equals(bytes),
    `refusing to overwrite conflicting immutable artifact ${fullPath}`,
  );
  return 0;
}

export function writeCommonsAssets(root = MODULE_ROOT) {
  const expected = buildCommonsAssets(root);
  let written = 0;
  for (const output of expected.immutableOutputs) {
    written += writeExclusive(join(root, output.relativePath), output.bytes);
  }

  const manifestPath = join(root, expected.manifest.relativePath);
  let current = null;
  try {
    current = readFileSync(manifestPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (current === null || !current.equals(expected.manifest.bytes)) {
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, expected.manifest.bytes);
    written += 1;
  }
  return { expected, written };
}
