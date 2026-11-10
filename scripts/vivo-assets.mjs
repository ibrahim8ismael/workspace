import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIVO_GEOMETRY } from '../packages/world/dist/index.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)), 'packages/assets');
const check = process.argv.includes('--check');
const upstream = {
  repository: 'https://github.com/VictorSandovalDev/OpenOfficeForAll',
  commit: '23d6b8999396f9e9d51291bf85bd7b72161f833f',
};
const defaultAppearance = { bodyId: 'commons-worker', paletteId: 'teal' };
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const expected = new Map();

const catalog = { mapId: 'vivo', formatVersion: 1, defaultAppearance, upstream };
const catalogBytes = Buffer.from(JSON.stringify(catalog));
const assetManifestVersion = `vivo-art-v1-${digest(catalogBytes)}`;
expected.set(resolve(root, `manifests/${assetManifestVersion}.json`), catalogBytes);

const geometry = {
  assetManifestVersion,
  ...VIVO_GEOMETRY,
  formatVersion: 1,
  coordinateUnits: 'pixels',
};
const geometryBytes = Buffer.from(JSON.stringify(geometry));
const contentHash = digest(geometryBytes);
const mapVersion = `vivo-v1-${contentHash}`;
expected.set(resolve(root, `maps/${mapVersion}.json`), geometryBytes);

const manifest = {
  assetManifestVersion,
  bounds: {
    width: VIVO_GEOMETRY.widthTiles * VIVO_GEOMETRY.tileSize,
    height: VIVO_GEOMETRY.heightTiles * VIVO_GEOMETRY.tileSize,
  },
  contentHash,
  coordinateUnits: 'pixels',
  formatVersion: 1,
  geometryPath: `/maps/${mapVersion}.json`,
  mapId: 'vivo',
  mapVersion,
  spawn: VIVO_GEOMETRY.spawn,
  tileSize: VIVO_GEOMETRY.tileSize,
};
expected.set(
  resolve(root, 'manifests/vivo-map.json'),
  Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
);

let drift = false;
for (const [path, bytes] of expected) {
  let actual;
  try {
    actual = readFileSync(path);
  } catch {
    actual = null;
  }
  if (!actual || !actual.equals(bytes)) {
    drift = true;
    if (!check) writeFileSync(path, bytes);
    else console.error(`Vivo map artifact differs: ${path}`);
  }
}
if (check && drift) process.exitCode = 1;
else
  console.info(
    `${check ? 'Verified' : 'Wrote'} Vivo map ${mapVersion} with ${VIVO_GEOMETRY.objects.length} objects and ${VIVO_GEOMETRY.blockedTiles?.length ?? 0} blocked tiles`,
  );
