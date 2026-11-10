import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { appearanceSchema, mapManifestSchema, OFFICE_PROTOCOL_VERSION } from '@gather/contracts';
import type { OfficeBootstrapResponse } from '@gather/contracts';
import { COMMONS_GEOMETRY, VIVO_GEOMETRY, validateOfficeGeometry } from '@gather/world';
import commonsManifestJson from '@gather/assets/manifests/commons-map.json' with { type: 'json' };
import vivoManifestJson from '@gather/assets/manifests/vivo-map.json' with { type: 'json' };
import type { OfficeGeometry, OfficeSeatDefinition, ValidatedOfficeGeometry } from '@gather/world';

export interface TrustedOfficeMap {
  readonly manifest: OfficeBootstrapResponse['manifest'];
  readonly geometry: OfficeGeometry;
  readonly validated: ValidatedOfficeGeometry;
  readonly seats: readonly OfficeSeatDefinition[];
  readonly defaultAppearance: ReturnType<typeof appearanceSchema.parse>;
}

function loadTrustedMap(
  manifestSource: unknown,
  expectedGeometry: OfficeGeometry,
): TrustedOfficeMap {
  const manifest = mapManifestSchema.parse(manifestSource);
  const geometryUrl = import.meta.resolve(`@gather/assets${manifest.geometryPath}`);
  const geometryBytes = readFileSync(new URL(geometryUrl));
  const packaged: unknown = JSON.parse(geometryBytes.toString('utf8'));

  if (createHash('sha256').update(geometryBytes).digest('hex') !== manifest.contentHash)
    throw new Error(`Trusted ${manifest.mapId} map content hash mismatch`);
  if (
    !packaged ||
    typeof packaged !== 'object' ||
    !('assetManifestVersion' in packaged) ||
    !('formatVersion' in packaged) ||
    !('coordinateUnits' in packaged)
  ) {
    throw new Error(`Trusted ${manifest.mapId} map envelope is invalid`);
  }
  const { assetManifestVersion, formatVersion, coordinateUnits, ...geometry } = packaged;
  if (
    assetManifestVersion !== manifest.assetManifestVersion ||
    formatVersion !== manifest.formatVersion ||
    coordinateUnits !== manifest.coordinateUnits ||
    !isDeepStrictEqual(geometry, expectedGeometry)
  ) {
    throw new Error(`Trusted ${manifest.mapId} map geometry differs from collision geometry`);
  }

  const artBytes = readFileSync(
    new URL(import.meta.resolve(`@gather/assets/manifests/${manifest.assetManifestVersion}.json`)),
  );
  const artPrefix = `${manifest.mapId}-art-v1-`;
  if (
    !manifest.assetManifestVersion.startsWith(artPrefix) ||
    createHash('sha256').update(artBytes).digest('hex') !==
      manifest.assetManifestVersion.slice(artPrefix.length)
  ) {
    throw new Error(`Trusted ${manifest.mapId} asset manifest hash mismatch`);
  }
  const artManifest: unknown = JSON.parse(artBytes.toString('utf8'));
  if (!artManifest || typeof artManifest !== 'object' || !('defaultAppearance' in artManifest)) {
    throw new Error(`Trusted ${manifest.mapId} default appearance is missing`);
  }
  const validated = validateOfficeGeometry(expectedGeometry);
  if (
    validated.bounds.width !== manifest.bounds.width ||
    validated.bounds.height !== manifest.bounds.height ||
    expectedGeometry.mapId !== manifest.mapId ||
    expectedGeometry.tileSize !== manifest.tileSize ||
    expectedGeometry.spawn.x !== manifest.spawn.x ||
    expectedGeometry.spawn.y !== manifest.spawn.y
  ) {
    throw new Error(`Trusted ${manifest.mapId} manifest does not match validated geometry`);
  }
  return Object.freeze({
    manifest: Object.freeze(manifest),
    geometry: expectedGeometry,
    validated,
    seats: Object.freeze(expectedGeometry.objects.flatMap((object) => object.seats)),
    defaultAppearance: Object.freeze(appearanceSchema.parse(artManifest.defaultAppearance)),
  });
}

const commonsMap = loadTrustedMap(commonsManifestJson, COMMONS_GEOMETRY);
const vivoMap = loadTrustedMap(vivoManifestJson, VIVO_GEOMETRY);
const maps = [commonsMap, vivoMap];
const mapsByVersion = new Map(maps.map((map) => [map.manifest.mapVersion, map]));
const defaultMap = mapsByVersion.get(vivoManifestJson.mapVersion);
if (!defaultMap) throw new Error('The default Vivo office map is not registered');

/** New and migrated workspaces use the trusted Vivo version. */
export const APPROVED_OFFICE_MAP_VERSION = defaultMap.manifest.mapVersion;

/** Exact registered legacy versions that may be migrated to the current default. */
export const LEGACY_OFFICE_MAP_VERSIONS = Object.freeze([commonsMap.manifest.mapVersion]);

export function trustedOfficeMap(version: string): TrustedOfficeMap | null {
  return mapsByVersion.get(version) ?? null;
}

export function trustedOfficeBootstrap(
  officeId: string,
  workspaceId: string,
  version: string,
): OfficeBootstrapResponse | null {
  const map = trustedOfficeMap(version);
  if (!map) return null;
  return {
    officeId,
    workspaceId,
    mapVersion: map.manifest.mapVersion,
    protocolVersion: OFFICE_PROTOCOL_VERSION,
    manifest: map.manifest,
  };
}
