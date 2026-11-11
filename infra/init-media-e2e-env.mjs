import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const destinationPath = fileURLToPath(new URL('./.env.media-e2e', import.meta.url));
const settings = [
  '# Local-only CP08 browser media test secrets. Keep this file private.',
  `MEDIA_MACHINE_KEY=${randomBytes(32).toString('base64')}`,
  `LIVEKIT_API_KEY=gather_${randomBytes(16).toString('hex')}`,
  `LIVEKIT_API_SECRET=${randomBytes(32).toString('hex')}`,
  '',
].join('\n');

try {
  writeFileSync(destinationPath, settings, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  console.info('Created infra/.env.media-e2e with private random media credentials.');
} catch (error) {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
    console.error('infra/.env.media-e2e already exists. It was not overwritten.');
  } else {
    console.error('Could not create infra/.env.media-e2e.');
  }
  process.exitCode = 1;
}
