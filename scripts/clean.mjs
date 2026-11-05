import { rm } from 'node:fs/promises';

const outputs = [
  'apps/web/dist',
  'apps/api/dist',
  'apps/worker/dist',
  'packages/contracts/dist',
  'packages/world/dist',
  'packages/delivery/dist',
];

await Promise.all(
  outputs.map((path) =>
    rm(new URL(`../${path}`, import.meta.url), { recursive: true, force: true }),
  ),
);
console.info('Removed workspace build outputs.');
