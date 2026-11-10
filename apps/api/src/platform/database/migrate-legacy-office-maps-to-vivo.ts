import 'reflect-metadata';
import { createConnection } from 'mongoose';
import { TenancyModels } from '../../modules/tenancy/tenancy.models.js';
import { migrateLegacyOfficeMapsToVivo } from '../../modules/office/migrate-legacy-office-maps.js';

const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--apply') || args.length > 1) {
  console.error('Usage: pnpm --filter @gather/api db:migrate-legacy-office-maps-to-vivo [--apply]');
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
      const result = await migrateLegacyOfficeMapsToVivo(models.offices, args[0] === '--apply');
      console.info(
        `Legacy office map migration ${args[0] === '--apply' ? 'applied' : 'dry-run'}: ` +
          `${result.candidates} candidate(s), ${result.updated} updated, ` +
          `${result.remaining} remaining; target ${result.toMapVersion}.`,
      );
    } catch {
      console.error(
        'Legacy office map migration failed. Check database availability and permissions.',
      );
      process.exitCode = 1;
    } finally {
      await connection.close();
    }
  }
}
