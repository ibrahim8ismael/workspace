import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { createHash } from 'node:crypto';

const sharedDirectory = fileURLToPath(new URL('../', import.meta.url));
const webDirectory = resolve(sharedDirectory, '../web');

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = await Promise.all(
    entries.map(async (entry) => {
      if (['node_modules', 'dist', 'public'].includes(entry.name)) return [];
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
    }),
  );
  return results.flat();
}

test('web shared imports resolve and provide their requested runtime exports', async () => {
  let count = 0;
  for (const file of await sourceFiles(webDirectory)) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(
      /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]*shared\/[^'"]+)['"]/g,
    )) {
      const module = await import(pathToFileURL(resolve(dirname(file), match[2])).href);
      for (const binding of match[1]
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)) {
        if (binding.startsWith('type ')) continue;
        const name = binding.split(/\s+as\s+/)[0];
        assert.ok(name in module, `${file}: missing export ${name} from ${match[2]}`);
      }
      count++;
    }
  }
  assert.ok(count >= 20, 'Expected all imported office/map helpers to be exercised');
});

for (const map of ['vivo', 'studio', 'campus']) {
  test(`${map} map can initialize in a fresh process with valid spawn and unique seat IDs`, () => {
    const script = `
      import assert from 'node:assert/strict';
      globalThis.__OFFICE_MAP__ = ${JSON.stringify(map)};
      const map = await import(${JSON.stringify(pathToFileURL(resolve(sharedDirectory, 'vivo-map.js')).href)});
      const world = await import(${JSON.stringify(pathToFileURL(resolve(sharedDirectory, 'office-world.js')).href)});
      const seats = await import(${JSON.stringify(pathToFileURL(resolve(sharedDirectory, 'office-seats.js')).href)});
      assert.equal(map.MAP_ID, ${JSON.stringify(map)});
    `;
    // Isolate map selection: the imported legacy helpers cache their active map per process.
    const checks =
      script +
      `
      assert.ok(map.WORLD.width > 0 && map.WORLD.height > 0);
      assert.ok(world.SPAWN.x >= 0 && world.SPAWN.x < map.WORLD.width);
      assert.ok(world.SPAWN.y >= 0 && world.SPAWN.y < map.WORLD.height);
      const allSeats = seats.getOfficeSeats();
      assert.ok(allSeats.length > 0);
      assert.equal(new Set(allSeats.map(seat => seat.id)).size, allSeats.length);
    `;
    execFileSync(process.execPath, ['--input-type=module', '-e', checks]);
  });
}

test('all pinned public files are present and match their imported Git blob hashes', async () => {
  const root = resolve(sharedDirectory, '../..');
  const manifest = JSON.parse(
    await readFile(resolve(root, 'docs/migration/UPSTREAM_IMPORT.json'), 'utf8'),
  );
  assert.ok(manifest.publicAssets.length > 0);
  for (const entry of manifest.publicAssets) {
    const bytes = await readFile(resolve(root, entry.path));
    const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    assert.equal(sha, entry.upstreamBlobSha, entry.path);
  }
});
