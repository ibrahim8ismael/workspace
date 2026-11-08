import { checkCommonsAssets, writeCommonsAssets } from './commons-assets.mjs';

function printVersions(expected) {
  console.info(`geometrySha256: ${expected.geometry.digest}`);
  console.info(`catalogSha256: ${expected.catalog.digest}`);
  console.info(`mapVersion: ${expected.geometry.version}`);
  console.info(`assetManifestVersion: ${expected.catalog.version}`);
}

const [arg, ...extra] = process.argv.slice(2);
if (arg === '--check' && extra.length === 0) {
  const { errors, expected } = checkCommonsAssets();
  if (errors.length > 0) {
    console.error(`Commons asset check failed:\n- ${errors.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.info('Commons assets are up to date.');
    printVersions(expected);
  }
} else if (arg !== undefined) {
  console.error('Usage: node scripts/commons-assets-cli.mjs [--check]');
  process.exitCode = 2;
} else {
  try {
    const { expected, written } = writeCommonsAssets();
    console.info(`Commons assets generated (${written} files written).`);
    printVersions(expected);
    console.info(`geometry: ${expected.geometry.relativePath}`);
    console.info(`catalog: ${expected.catalog.relativePath}`);
    console.info(`manifest: ${expected.manifest.relativePath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
