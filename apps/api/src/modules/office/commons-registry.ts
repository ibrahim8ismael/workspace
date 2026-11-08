import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { mapManifestSchema, OFFICE_PROTOCOL_VERSION } from '@gather/contracts';
import { COMMONS_GEOMETRY, validateOfficeGeometry } from '@gather/world';
import manifestJson from '@gather/assets/manifests/commons-map.json' with { type: 'json' };
import type { OfficeBootstrapResponse } from '@gather/contracts';

const manifest = mapManifestSchema.parse(manifestJson);
const geometryUrl = import.meta.resolve(`@gather/assets${manifest.geometryPath}`);
const geometryBytes = readFileSync(new URL(geometryUrl));
const packaged: unknown = JSON.parse(geometryBytes.toString('utf8'));

if (createHash('sha256').update(geometryBytes).digest('hex') !== manifest.contentHash) {
  throw new Error('Trusted Commons map content hash mismatch');
}
if (
  !packaged ||
  typeof packaged !== 'object' ||
  !('assetManifestVersion' in packaged) ||
  !('formatVersion' in packaged) ||
  !('coordinateUnits' in packaged)
) {
  throw new Error('Trusted Commons map envelope is invalid');
}
const { assetManifestVersion, formatVersion, coordinateUnits, ...geometry } = packaged;
if (
  assetManifestVersion !== manifest.assetManifestVersion ||
  formatVersion !== manifest.formatVersion ||
  coordinateUnits !== manifest.coordinateUnits ||
  !isDeepStrictEqual(geometry, COMMONS_GEOMETRY)
) {
  throw new Error('Trusted Commons map geometry differs from collision geometry');
}
const artBytes = readFileSync(
  new URL(import.meta.resolve(`@gather/assets/manifests/${manifest.assetManifestVersion}.json`)),
);
if (
  !manifest.assetManifestVersion.startsWith('commons-art-v1-') ||
  createHash('sha256').update(artBytes).digest('hex') !==
    manifest.assetManifestVersion.slice('commons-art-v1-'.length)
) {
  throw new Error('Trusted Commons asset manifest hash mismatch');
}
const validated = validateOfficeGeometry(COMMONS_GEOMETRY);
if (
  validated.bounds.width !== manifest.bounds.width ||
  validated.bounds.height !== manifest.bounds.height ||
  COMMONS_GEOMETRY.mapId !== manifest.mapId ||
  COMMONS_GEOMETRY.tileSize !== manifest.tileSize ||
  COMMONS_GEOMETRY.spawn.x !== manifest.spawn.x ||
  COMMONS_GEOMETRY.spawn.y !== manifest.spawn.y
) {
  throw new Error('Trusted Commons manifest does not match validated geometry');
}

const approved = Object.freeze(manifest);

export const APPROVED_OFFICE_MAP_VERSION = approved.mapVersion;

export function trustedOfficeBootstrap(
  officeId: string,
  workspaceId: string,
  version: string,
): OfficeBootstrapResponse | null {
  if (version !== approved.mapVersion) return null;
  return {
    officeId,
    workspaceId,
    mapVersion: approved.mapVersion,
    protocolVersion: OFFICE_PROTOCOL_VERSION,
    manifest: approved,
  };
}
