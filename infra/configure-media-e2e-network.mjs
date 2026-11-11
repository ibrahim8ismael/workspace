import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const envPath = fileURLToPath(new URL('./.env.media-e2e', import.meta.url));
const args = process.argv.slice(2);
const check = args.includes('--check');
const [bindIp, context = 'orbstack'] = args.filter((arg) => arg !== '--check');

function privateIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [first, second] = address.split('.').map(Number);
  return (
    first === 127 ||
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function docker(...command) {
  return execFileSync('docker', ['--context', context, ...command], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

try {
  const hostAddresses = Object.values(networkInterfaces())
    .flat()
    .filter(Boolean)
    .map((entry) => entry.address);
  if (!privateIPv4(bindIp) || !hostAddresses.includes(bindIp)) {
    throw new Error('Choose a private IPv4 address assigned to this host.');
  }
  const container = docker(
    'compose',
    '--env-file',
    envPath,
    '-f',
    'infra/compose.yaml',
    '-f',
    'infra/compose.media-e2e.yaml',
    '--profile',
    'app',
    '--profile',
    'media-e2e',
    'ps',
    '-q',
    'media-livekit',
  );
  if (!container || container.includes('\n')) {
    throw new Error('Start exactly one media-livekit container first.');
  }
  const networks = JSON.parse(
    docker('inspect', '--format', '{{json .NetworkSettings.Networks}}', container),
  );
  const internalIps = Object.values(networks).map((network) => network.IPAddress);
  if (!internalIps.length || internalIps.some((ip) => !privateIPv4(ip))) {
    throw new Error('LiveKit must have private IPv4 Docker network addresses.');
  }
  const peers = [...new Set([bindIp, ...internalIps])]
    .sort()
    .map((ip) => `${ip}/32`)
    .join(',');
  const settings = { MEDIA_BIND_IP: bindIp, MEDIA_TURN_PEER_CIDRS: peers };
  let contents = readFileSync(envPath, 'utf8');
  for (const [key, value] of Object.entries(settings)) {
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    if (check) {
      if (contents.match(pattern)?.[0] !== `${key}=${value}`) {
        throw new Error(
          'Media network settings are stale. Rerun without --check, recreate LiveKit, then check again.',
        );
      }
    } else {
      contents = pattern.test(contents)
        ? contents.replace(pattern, `${key}=${value}`)
        : `${contents.trimEnd()}\n${key}=${value}\n`;
    }
  }
  if (check) {
    const published = JSON.parse(
      docker('inspect', '--format', '{{json .NetworkSettings.Ports}}', container),
    );
    const required = ['17881/tcp', ...Array.from({ length: 18 }, (_, i) => `${17882 + i}/udp`)];
    if (
      required.some(
        (port) =>
          !published[port]?.some(
            (binding) => binding.HostIp === bindIp && binding.HostPort === port.split('/')[0],
          ),
      )
    ) {
      throw new Error('Media port bindings are not applied. Recreate LiveKit, then run --check.');
    }
  }
  if (!check) writeFileSync(envPath, contents, { mode: 0o600 });
  console.info(
    check
      ? 'Local media network settings match the host and running SFU.'
      : 'Updated private media settings with one host address and exact SFU TURN peers. Recreate LiveKit, then run --check.',
  );
} catch (error) {
  // Docker output and the private env file can contain secrets; do not echo either.
  console.error(
    error instanceof Error && !('status' in error)
      ? error.message
      : 'Could not inspect the local Docker media fixture.',
  );
  process.exitCode = 1;
}
