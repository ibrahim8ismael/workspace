import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const examplePath = new URL('../.env.local.example', import.meta.url);
const destinationPath = fileURLToPath(new URL('./.env.local', import.meta.url));
const placeholder = '__GENERATE_ON_INIT__';
const example = readFileSync(examplePath, 'utf8');
const placeholderCount = example.split(placeholder).length - 1;
if (placeholderCount !== 1) {
  console.error(
    'The local environment example must contain exactly one encryption-key placeholder.',
  );
  process.exitCode = 1;
} else {
  const key = randomBytes(32).toString('base64');
  const env = example.replace(placeholder, key);
  try {
    writeFileSync(destinationPath, env, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    console.info(
      'Created infra/.env.local with a new private outbox key. Keep this file untracked.',
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      console.error('infra/.env.local already exists. It was not overwritten.');
    } else {
      console.error('Could not create infra/.env.local.');
    }
    process.exitCode = 1;
  }
}
