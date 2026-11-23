import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import {
  appearanceSchema,
  mapManifestSchema,
  workspaceGeometrySchema,
  OFFICE_PROTOCOL_VERSION,
  MAP_FORMAT_VERSION,
} from '@gather/contracts';
import type {
  OfficeBootstrapResponse,
  WorkspaceLayoutPlacementDto,
  WorkspaceLayoutPreset,
} from '@gather/contracts';
import {
  COMMONS_GEOMETRY,
  VIVO_GEOMETRY,
  generateWorkspaceOfficeGeometry,
  compileWorkspaceLayout,
  validateOfficeGeometry,
} from '@gather/world';
import commonsManifestJson from '@gather/assets/manifests/commons-map.json' with { type: 'json' };
import vivoManifestJson from '@gather/assets/manifests/vivo-map.json' with { type: 'json' };
import type { OfficeGeometry, OfficeSeatDefinition, ValidatedOfficeGeometry } from '@gather/world';

export interface TrustedOfficeMap {
  readonly layoutPreset?: WorkspaceLayoutPreset;
  readonly layout?: WorkspaceLayoutPlacementDto[];
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
const generatedMapsByVersion = new Map<string, TrustedOfficeMap>();
const defaultMap = mapsByVersion.get(vivoManifestJson.mapVersion);
if (!defaultMap) throw new Error('The default Vivo office map is not registered');

/** New and migrated workspaces use the trusted Vivo version. */
export const APPROVED_OFFICE_MAP_VERSION = defaultMap.manifest.mapVersion;

/** Exact registered legacy versions that may be migrated to the current default. */
export const LEGACY_OFFICE_MAP_VERSIONS = Object.freeze([commonsMap.manifest.mapVersion]);

const editedMapsByVersion = new Map<string, TrustedOfficeMap>();
const maxCachedEditedMaps = 64;

export function workspaceLayoutOfficeMap(
  layout: WorkspaceLayoutPlacementDto[],
  layoutPreset?: WorkspaceLayoutPreset,
): TrustedOfficeMap {
  // Mongoose field ordering can differ from input ordering after a restart.
  layout = layout.map(({ id, name, templateId, origin: { tx, ty } }) => ({
    id,
    ...(name && { name }),
    templateId,
    origin: { tx, ty },
  }));
  const { geometry, validated } = compileWorkspaceLayout(layout, layoutPreset);
  const assetManifestVersion = commonsMap.manifest.assetManifestVersion;
  const contentHash = createHash('sha256')
    .update(
      JSON.stringify({
        assetManifestVersion,
        formatVersion: MAP_FORMAT_VERSION,
        coordinateUnits: 'pixels',
        layout,
        ...(layoutPreset && { layoutPreset }),
        geometry,
      }),
    )
    .digest('hex');
  const roomCount = geometry.zones.length;
  const mapVersion = `workspace-v1-${roomCount}-${contentHash}`;
  const manifest = mapManifestSchema.parse({
    formatVersion: MAP_FORMAT_VERSION,
    mapId: 'workspace',
    mapVersion,
    contentHash,
    coordinateUnits: 'pixels',
    tileSize: geometry.tileSize,
    bounds: validated.bounds,
    spawn: geometry.spawn,
    geometryPath: `/maps/${mapVersion}.json`,
    roomCount,
    assetManifestVersion,
  });
  return Object.freeze({
    layout,
    ...(layoutPreset && { layoutPreset }),
    manifest: Object.freeze(manifest),
    geometry,
    validated,
    seats: Object.freeze(geometry.objects.flatMap((object) => object.seats)),
    defaultAppearance: commonsMap.defaultAppearance,
  });
}

export function trustedOfficeMap(
  version: string,
  layout?: WorkspaceLayoutPlacementDto[],
  layoutPreset?: WorkspaceLayoutPreset,
): TrustedOfficeMap | null {
  if (layout) {
    const cached = editedMapsByVersion.get(version);
    if (cached && cached.layoutPreset === layoutPreset && isDeepStrictEqual(cached.layout, layout))
      return cached;
    const map = workspaceLayoutOfficeMap(layout, layoutPreset);
    if (map.manifest.mapVersion !== version) return null;
    if (editedMapsByVersion.size >= maxCachedEditedMaps) {
      const oldest = editedMapsByVersion.keys().next().value;
      if (oldest !== undefined) editedMapsByVersion.delete(oldest);
    }
    editedMapsByVersion.set(version, map);
    return map;
  }
  const registered = mapsByVersion.get(version);
  if (registered) return registered;
  const match = /^workspace-v1-([1-9][0-9]?|100)-([a-f0-9]{64})$/.exec(version);
  if (!match) return null;
  const cached = generatedMapsByVersion.get(version);
  if (cached) return cached;
  const roomCount = Number(match[1]);
  const geometry = generateWorkspaceOfficeGeometry(roomCount);
  const assetManifestVersion = commonsMap.manifest.assetManifestVersion;
  const envelope = {
    assetManifestVersion,
    coordinateUnits: 'pixels' as const,
    formatVersion: MAP_FORMAT_VERSION,
    ...geometry,
  };
  const bytes = Buffer.from(JSON.stringify(envelope));
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  if (contentHash !== match[2]) return null;
  const manifest = mapManifestSchema.parse({
    formatVersion: MAP_FORMAT_VERSION,
    mapId: 'workspace',
    mapVersion: version,
    contentHash,
    coordinateUnits: 'pixels',
    tileSize: geometry.tileSize,
    bounds: {
      width: geometry.widthTiles * geometry.tileSize,
      height: geometry.heightTiles * geometry.tileSize,
    },
    spawn: geometry.spawn,
    geometryPath: `/maps/${version}.json`,
    roomCount,
    assetManifestVersion,
  });
  const trusted = Object.freeze({
    manifest: Object.freeze(manifest),
    geometry,
    validated: validateOfficeGeometry(geometry),
    seats: Object.freeze([]),
    defaultAppearance: commonsMap.defaultAppearance,
  });
  generatedMapsByVersion.set(version, trusted);
  return trusted;
}

export function trustedOfficeBootstrap(
  officeId: string,
  workspaceId: string,
  version: string,
  layout?: WorkspaceLayoutPlacementDto[],
  layoutPreset?: WorkspaceLayoutPreset,
): OfficeBootstrapResponse | null {
  const map = trustedOfficeMap(version, layout, layoutPreset);
  if (!map) return null;
  return {
    officeId,
    workspaceId,
    mapVersion: map.manifest.mapVersion,
    protocolVersion: OFFICE_PROTOCOL_VERSION,
    manifest: map.manifest,
    ...(map.manifest.mapId === 'workspace'
      ? { geometry: workspaceGeometrySchema.parse(map.geometry) }
      : {}),
    ...(map.layout ? { layout: map.layout } : {}),
    ...(map.layoutPreset && { layoutPreset: map.layoutPreset }),
  };
}

/** Build a generated map identity with the same canonical envelope used by trustedOfficeMap. */
export function workspaceOfficeMapVersion(roomCount: number): string {
  const geometry = generateWorkspaceOfficeGeometry(roomCount);
  const envelope = {
    assetManifestVersion: commonsMap.manifest.assetManifestVersion,
    coordinateUnits: 'pixels' as const,
    formatVersion: MAP_FORMAT_VERSION,
    ...geometry,
  };
  const hash = createHash('sha256')
    .update(Buffer.from(JSON.stringify(envelope)))
    .digest('hex');
  return `workspace-v1-${roomCount}-${hash}`;
}
