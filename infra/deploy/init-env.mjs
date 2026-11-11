import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const [hostname, origin = hostname ? `https://${hostname}` : undefined] = process.argv.slice(2);
const validLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

if (
  !hostname ||
  hostname.length > 253 ||
  !hostname.split('.').every((label) => validLabel.test(label)) ||
  !origin
) {
  console.error('Usage: node infra/deploy/init-env.mjs <hostname> [https://origin[:port]]');
  process.exit(2);
}

let parsedOrigin;
try {
  parsedOrigin = new URL(origin);
} catch {
  console.error('Origin must be a valid HTTPS origin.');
  process.exit(2);
}

if (
  parsedOrigin.protocol !== 'https:' ||
  parsedOrigin.origin !== origin ||
  parsedOrigin.hostname.toLowerCase() !== hostname.toLowerCase()
) {
  console.error('Origin must be HTTPS and use the supplied hostname without a path.');
  process.exit(2);
}

const files = [
  ['.env.example', '.env'],
  ['api.env.example', 'api.env'],
  ['worker.env.example', 'worker.env'],
];
const targets = files.map(([, destination]) => resolve(directory, destination));
if (targets.some(existsSync)) {
  console.error('A deployment env file already exists; refusing to overwrite it.');
  process.exit(1);
}

const release = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
  cwd: resolve(directory, '../..'),
  encoding: 'utf8',
}).trim();
const outboxKey = randomBytes(32).toString('base64');

for (const [source, destination] of files) {
  let content = readFileSync(resolve(directory, source), 'utf8');
  content = content
    .replaceAll('replace-with-approved-hostname', hostname)
    .replaceAll(`APP_ORIGIN=https://${hostname}`, `APP_ORIGIN=${origin}`)
    .replaceAll('replace-with-32-random-bytes-base64', outboxKey)
    .replaceAll('replace-with-same-key-as-api', outboxKey)
    .replaceAll('gather-lite-api:pilot', `gather-lite-api:${release}`)
    .replaceAll('gather-lite-web:pilot', `gather-lite-web:${release}`)
    .replaceAll('gather-lite-worker:pilot', `gather-lite-worker:${release}`);
  const path = resolve(directory, destination);
  writeFileSync(path, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  chmodSync(path, 0o600);
}

console.log(
  `Created protected deployment env files for revision ${release}; secret values were not displayed.`,
);
