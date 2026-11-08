import type { Model } from 'mongoose';
import type { OfficeRecord } from '../tenancy/tenancy.models.js';
import { APPROVED_OFFICE_MAP_VERSION } from './commons-registry.js';

export interface OfficeMapBackfillResult {
  pending: number;
  updated: number;
  remaining: number;
}

/** Dry-run by default; apply changes only records still marked pending at update time. */
export async function backfillOfficeMap(
  offices: Model<OfficeRecord>,
  apply = false,
): Promise<OfficeMapBackfillResult> {
  const filter = { mapVersion: 'pending-m0' };
  const pending = await offices.countDocuments(filter);
  const updated = apply
    ? (await offices.updateMany(filter, { $set: { mapVersion: APPROVED_OFFICE_MAP_VERSION } }))
        .modifiedCount
    : 0;
  const remaining = await offices.countDocuments(filter);
  return { pending, updated, remaining };
}
