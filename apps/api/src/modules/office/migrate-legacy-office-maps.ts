import type { Model } from 'mongoose';
import type { OfficeRecord } from '../tenancy/tenancy.models.js';
import { APPROVED_OFFICE_MAP_VERSION, LEGACY_OFFICE_MAP_VERSIONS } from './office-map-registry.js';

export interface LegacyOfficeMapMigrationResult {
  fromMapVersions: string[];
  toMapVersion: string;
  candidates: number;
  updated: number;
  remaining: number;
}

/** Dry-run by default; only exact trusted legacy versions are eligible for migration. */
export async function migrateLegacyOfficeMapsToVivo(
  offices: Model<OfficeRecord>,
  apply = false,
): Promise<LegacyOfficeMapMigrationResult> {
  const filter = { mapVersion: { $in: LEGACY_OFFICE_MAP_VERSIONS } };
  const candidates = await offices.countDocuments(filter);
  const updated = apply
    ? (await offices.updateMany(filter, { $set: { mapVersion: APPROVED_OFFICE_MAP_VERSION } }))
        .modifiedCount
    : 0;
  const remaining = await offices.countDocuments(filter);
  return {
    fromMapVersions: [...LEGACY_OFFICE_MAP_VERSIONS],
    toMapVersion: APPROVED_OFFICE_MAP_VERSION,
    candidates,
    updated,
    remaining,
  };
}
