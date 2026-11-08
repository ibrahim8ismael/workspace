import 'reflect-metadata';
import { createConnection } from 'mongoose';
import { TenancyModels } from '../../modules/tenancy/tenancy.models.js';
import { backfillOfficeMap } from '../../modules/office/backfill-office-map.js';

const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--apply') || args.length > 1) {
  console.error('Usage: pnpm --filter @gather/api db:backfill-office-map [--apply]');
  process.exitCode = 2;
} else {
  const uri = process.env['MONGODB_URI'];
  if (!uri) {
    console.error('MONGODB_URI is required');
    process.exitCode = 1;
  } else {
    const connection = createConnection(uri, {
      autoIndex: false,
      serverSelectionTimeoutMS: 5000,
    });
    try {
      await connection.asPromise();
      const models = new TenancyModels(connection);
      const result = await backfillOfficeMap(models.offices, args[0] === '--apply');
      console.info(
        `Office map backfill ${args[0] === '--apply' ? 'applied' : 'dry-run'}: ` +
          `${result.pending} pending, ${result.updated} updated, ${result.remaining} remaining.`,
      );
    } catch {
      console.error('Office map backfill failed. Check database availability and permissions.');
      process.exitCode = 1;
    } finally {
      await connection.close();
    }
  }
}
