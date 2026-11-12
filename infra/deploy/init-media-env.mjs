import { randomBytes } from 'node:crypto';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { isIPv4 } from 'node:net';
import { fileURLToPath } from 'node:url';

const [publicIp, domain = 'gather.imtelak.com', requestedRevision] = process.argv.slice(2);
if (!isIPv4(publicIp ?? '') || domain !== 'gather.imtelak.com') {
  console.error('Usage: node infra/deploy/init-media-env.mjs <public-ip> gather.imtelak.com [revision]');
  process.exit(2);
}

const path = fileURLToPath(new URL('./.env', import.meta.url));
let contents = readFileSync(path, 'utf8');
const read = (key) => contents.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1] ?? '';
if (read('APP_DOMAIN') !== domain) throw new Error('APP_DOMAIN must already match the deployed host');
const currentIp = read('MEDIA_PUBLIC_IP');
if (currentIp && currentIp !== publicIp) throw new Error('MEDIA_PUBLIC_IP already differs; review it before changing');
const currentUrl = read('LIVEKIT_URL');
if (currentUrl && currentUrl !== `wss://${domain}`)
  throw new Error('LIVEKIT_URL already differs; review it before changing');

const revision = requestedRevision ?? read('GATHER_API_IMAGE').split(':').at(-1);
if (!/^[a-f0-9]{7,40}(?:-r[0-9]+)?$/.test(revision ?? ''))
  throw new Error('Provide the current deployment revision as the final argument');
const values = {
  LIVEKIT_URL: `wss://${domain}`,
  LIVEKIT_API_KEY: read('LIVEKIT_API_KEY') || `gather_${randomBytes(12).toString('hex')}`,
  LIVEKIT_API_SECRET: read('LIVEKIT_API_SECRET') || randomBytes(32).toString('hex'),
  MEDIA_MACHINE_KEY: read('MEDIA_MACHINE_KEY') || randomBytes(32).toString('base64'),
  MEDIA_PUBLIC_IP: publicIp,
  MEDIA_SFU_EPOCH: read('MEDIA_SFU_EPOCH') || randomBytes(32).toString('hex'),
  GATHER_WEB_IMAGE: `gather-lite-web:${revision}-media-pilot`,
  GATHER_MEDIA_GUARD_IMAGE: `gather-lite-media-guard:${revision}-media-pilot`,
};

for (const [key, value] of Object.entries(values)) {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  contents = pattern.test(contents)
    ? contents.replace(pattern, `${key}=${value}`)
    : `${contents.trimEnd()}\n${key}=${value}\n`;
}
writeFileSync(path, contents, { mode: 0o600 });
chmodSync(path, 0o600);
console.log('Same-domain LiveKit settings initialized; secret values were not printed.');
