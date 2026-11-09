/** Opt-in local experiment: real Chromium video through a disposable LiveKit SFU. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { AccessToken } from '../../apps/api/node_modules/livekit-server-sdk/dist/AccessToken.js';
if (!process.argv.includes('--run-local'))
  throw new Error('Requires --run-local and authorized local Docker');
const context = process.env.CP07_DOCKER_CONTEXT || 'orbstack';
const exec = promisify(execFile);
const docker = async (...args) =>
  (await exec('docker', ['--context', context, ...args], { timeout: 30000 })).stdout.trim();
const image =
  'livekit/livekit-server@sha256:25cd902de7cacbd5f1f779f6a6ac1eae20ba8f56b0935934ce6b0ab80d1e3d20';
const secret = randomBytes(32).toString('hex');
const config = `port: 7880\nbind_addresses: [0.0.0.0]\nrtc:\n  tcp_port: 17881\n  node_ip: 127.0.0.1\n  use_external_ip: false\nkeys:\n  fixture: ${secret}\n`;
let id, browser, watchdog;
const server = createServer(async (req, res) => {
  if (req.url === '/sdk.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(
      await readFile(
        new URL(
          '../../apps/web/node_modules/livekit-client/dist/livekit-client.umd.js',
          import.meta.url,
        ),
      ),
    );
  } else res.end('<script src="/sdk.js"></script>');
});
try {
  id = await docker(
    'run',
    '-d',
    '--restart',
    'no',
    '--label',
    'gather.cp07.fixture=true',
    '-p',
    '127.0.0.1:17880:7880',
    '-p',
    '127.0.0.1:17881:17881',
    '-e',
    `LIVEKIT_CONFIG=${config}`,
    image,
  );
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  for (let i = 0; i < 40; i++) {
    try {
      await fetch('http://127.0.0.1:17880');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  browser = await chromium.launch({ headless: true });
  const publisher = await browser.newPage();
  const receiver = await browser.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  await Promise.all([publisher.goto(origin), receiver.goto(origin)]);
  const token = async (identity) => {
    const grant = new AccessToken('fixture', secret, { identity, ttl: '2m' });
    grant.addGrant({
      roomJoin: true,
      room: 'cutoff-fixture',
      canPublish: identity === 'publisher',
      canSubscribe: identity === 'receiver',
    });
    return grant.toJwt();
  };
  const originalReceiverToken = await token('receiver');
  await receiver.evaluate(async (token) => {
    const { Room, RoomEvent } = window.LivekitClient;
    window.framesReceived = 0;
    window.lastFrameAt = 0;
    window.room = new Room();
    window.room.on(RoomEvent.TrackSubscribed, (track) => {
      const video = track.attach();
      video.muted = true;
      video.autoplay = true;
      document.body.append(video);
      const frame = () => {
        window.framesReceived++;
        window.lastFrameAt = Date.now();
        video.requestVideoFrameCallback(frame);
      };
      video.requestVideoFrameCallback(frame);
    });
    await window.room.connect('ws://127.0.0.1:17880', token);
  }, originalReceiverToken);
  await publisher.evaluate(
    async (token) => {
      window.room = new window.LivekitClient.Room();
      await window.room.connect('ws://127.0.0.1:17880', token);
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      let n = 0;
      window.paint = setInterval(() => {
        ctx.fillStyle = `hsl(${n++ % 360},100%,50%)`;
        ctx.fillRect(0, 0, 320, 240);
        ctx.fillStyle = 'black';
        ctx.fillText(String(n), 20, 20);
      }, 50);
      await window.room.localParticipant.publishTrack(canvas.captureStream(20).getVideoTracks()[0]);
    },
    await token('publisher'),
  );
  await receiver.waitForFunction(() => window.framesReceived >= 20, null, { timeout: 30000 });
  const startedAt = Date.now();
  watchdog = spawn(
    process.execPath,
    ['spikes/media-enforcement/supervisor-process.mjs', context, id, 'media-fixture'],
    { stdio: ['pipe', 'pipe', 'inherit'] },
  );
  let result = '';
  watchdog.stdout.on('data', (chunk) => {
    result += chunk;
  });
  const code = await new Promise((resolve, reject) => {
    watchdog.on('exit', resolve);
    watchdog.on('error', reject);
  });
  if (code !== 0) throw new Error('Supervisor failed');
  await new Promise((r) => setTimeout(r, 2000));
  const final = await receiver.evaluate(() => ({
    frames: window.framesReceived,
    lastFrameAt: window.lastFrameAt,
  }));
  await new Promise((r) => setTimeout(r, 1000));
  const after = await receiver.evaluate(() => window.framesReceived);
  if (after !== final.frames) throw new Error('Media still advancing after shutdown');
  await docker('start', id);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const staleTokenAcceptedAfterRestart = await receiver.evaluate(async (oldToken) => {
    await window.room.disconnect();
    window.room = new window.LivekitClient.Room();
    try {
      await window.room.connect('ws://127.0.0.1:17880', oldToken);
      return true;
    } catch {
      return false;
    }
  }, originalReceiverToken);
  console.log(
    JSON.stringify({
      scenario: 'missing-guard-progress',
      staleTokenAcceptedAfterRestart,
      framesReceived: final.frames,
      lastDecodedFrameAfterStartMs: final.lastFrameAt - startedAt,
      stableObservationMs: 1000,
      supervisor: result.trim(),
    }),
  );
} finally {
  watchdog?.kill();
  await browser?.close();
  server.close();
  if (id) await docker('rm', '-f', id);
}
