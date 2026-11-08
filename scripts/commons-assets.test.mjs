import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { COMMONS_GEOMETRY, validateOfficeGeometry } from '../packages/world/dist/index.js';
import { MAP_TILE_SIZE, MVP_MAP_ID, mapManifestSchema } from '../packages/contracts/dist/index.js';
import { buildCommonsAssets, checkCommonsAssets, writeCommonsAssets } from './commons-assets.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_RELATIVE = 'packages/assets/source/commons';

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertSortedKeys(value) {
  if (Array.isArray(value)) {
    for (const entry of value) assertSortedKeys(entry);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const keys = Object.keys(value);
  assert.deepEqual(keys, [...keys].sort());
  for (const key of keys) assertSortedKeys(value[key]);
}

async function makeFixtureRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'gather-commons-assets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(join(REPO_ROOT, SOURCE_RELATIVE), join(root, SOURCE_RELATIVE), { recursive: true });
  return root;
}

test('catalog output is deterministic with sorted keys and fixed array order', () => {
  const first = buildCommonsAssets();
  const second = buildCommonsAssets();

  assert.deepEqual(first.catalog.bytes, second.catalog.bytes);
  assert.deepEqual(first.geometry.bytes, second.geometry.bytes);
  assert.notEqual(first.catalog.bytes.at(-1), 0x0a);
  assert.notEqual(first.geometry.bytes.at(-1), 0x0a);

  const catalog = JSON.parse(first.catalog.bytes.toString('utf8'));
  assertSortedKeys(catalog);
  assert.deepEqual(catalog.directions, ['north', 'east', 'south', 'west']);
  assert.deepEqual(
    catalog.avatar.frames.map(({ frameId }) => frameId),
    [
      'commons-worker-stand-north',
      'commons-worker-stand-east',
      'commons-worker-stand-south',
      'commons-worker-stand-west',
      'commons-worker-sit-north',
      'commons-worker-sit-east',
      'commons-worker-sit-south',
      'commons-worker-sit-west',
    ],
  );
});

test('changed asset bytes propagate through catalog, geometry, sprites and versions', async (t) => {
  const root = await makeFixtureRoot(t);
  const original = buildCommonsAssets(root);
  const sourcePath = join(root, SOURCE_RELATIVE, 'avatar-stand-north.svg');
  const changed = (await readFile(sourcePath, 'utf8')).replace('#2F6F6A', '#1D4B47');
  await writeFile(sourcePath, changed);

  const modified = buildCommonsAssets(root);

  assert.notEqual(modified.catalog.digest, original.catalog.digest);
  assert.notEqual(modified.catalog.version, original.catalog.version);
  assert.notEqual(modified.geometry.digest, original.geometry.digest);
  assert.notEqual(modified.geometry.version, original.geometry.version);
  assert.notDeepEqual(
    modified.sprites.map(({ relativePath }) => relativePath),
    original.sprites.map(({ relativePath }) => relativePath),
  );
});

test('production manifest is schema-valid and independently matches every artifact', async () => {
  const expected = buildCommonsAssets();
  const manifestBytes = await readFile(join(REPO_ROOT, expected.manifest.relativePath));
  assert.deepEqual(manifestBytes, expected.manifest.bytes);

  const manifest = mapManifestSchema.parse(JSON.parse(manifestBytes.toString('utf8')));
  assert.equal(manifest.mapId, MVP_MAP_ID);
  assert.equal(manifest.tileSize, MAP_TILE_SIZE);
  assert.equal(manifest.assetManifestVersion, `commons-art-v1-${expected.catalog.digest}`);
  assert.equal(manifest.assetManifestVersion.length, 79);
  assert.equal(manifest.contentHash, expected.geometry.digest);
  assert.equal(manifest.geometryPath, `/maps/${expected.geometry.version}.json`);
  assert.deepEqual(manifest.bounds, validateOfficeGeometry(COMMONS_GEOMETRY).bounds);

  for (const artifact of [expected.catalog, expected.geometry]) {
    const bytes = await readFile(join(REPO_ROOT, artifact.relativePath));
    assert.equal(sha256Hex(bytes), artifact.digest);
    assert.ok(artifact.relativePath.includes(artifact.digest));
  }
  for (const output of expected.immutableOutputs) {
    assert.deepEqual(await readFile(join(REPO_ROOT, output.relativePath)), output.bytes);
  }

  const catalog = JSON.parse(expected.catalog.bytes.toString('utf8'));
  assert.equal(catalog.usage, 'static-pose-reference');
  assert.deepEqual(catalog.drawOrder, ['table/base', 'avatar', 'chair/foreground']);
  assert.deepEqual(catalog.bindings.tableObjectIds, [
    'commons-northwest-table',
    'commons-southeast-table',
  ]);
  assert.equal(catalog.avatar.frames.length, 8);
  for (const frame of catalog.avatar.frames) {
    assert.deepEqual(frame.footOrigin, { x: 12, y: 31 });
    assert.equal(frame.width, 24);
    assert.equal(frame.height, 32);
  }
  assert.equal(expected.sprites.length, 10);
  for (const sprite of expected.sprites) {
    const bytes = await readFile(join(REPO_ROOT, sprite.relativePath));
    assert.equal(sha256Hex(bytes), sprite.relativePath.split('/').at(-1).replace('.svg', ''));
  }
});

test('check reports missing and drifted outputs without writing', async (t) => {
  const root = await makeFixtureRoot(t);
  const generated = writeCommonsAssets(root);
  assert.deepEqual(checkCommonsAssets(root).errors, []);

  const catalogPath = join(root, generated.expected.catalog.relativePath);
  await writeFile(catalogPath, 'drifted');
  let result = checkCommonsAssets(root);
  assert.deepEqual(result.errors, [`drifted ${generated.expected.catalog.relativePath}`]);
  assert.equal(await readFile(catalogPath, 'utf8'), 'drifted');

  const spritePath = join(root, generated.expected.sprites[0].relativePath);
  await rm(spritePath);
  result = checkCommonsAssets(root);
  assert.ok(result.errors.includes(`missing ${generated.expected.sprites[0].relativePath}`));
  await assert.rejects(readFile(spritePath));
});

test('generation keeps equal artifacts and refuses conflicting immutable bytes', async (t) => {
  const root = await makeFixtureRoot(t);
  const generated = writeCommonsAssets(root);
  assert.equal(writeCommonsAssets(root).written, 0);

  const geometryPath = join(root, generated.expected.geometry.relativePath);
  const manifestPath = join(root, generated.expected.manifest.relativePath);
  const manifestBefore = await readFile(manifestPath);
  await writeFile(geometryPath, 'conflict');

  assert.throws(() => writeCommonsAssets(root), /conflicting immutable artifact/);
  assert.equal(await readFile(geometryPath, 'utf8'), 'conflict');
  assert.deepEqual(await readFile(manifestPath), manifestBefore);
});
