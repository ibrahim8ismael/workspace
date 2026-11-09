/** Opt-in local experiment: real Chromium video through a disposable LiveKit SFU. */
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSignalingGuard } from './signaling-guard.mjs';
import { RetirementStore } from './retirement-store.mjs';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import {
  AccessToken,
  TokenVerifier,
} from '../../apps/api/node_modules/livekit-server-sdk/dist/AccessToken.js';
if (!process.argv.includes('--run-local'))
  throw new Error('Requires --run-local and authorized local Docker');
const context = process.env.CP07_DOCKER_CONTEXT || 'orbstack';
const exec = promisify(execFile);
const docker = async (...args) =>
  (await exec('docker', ['--context', context, ...args], { timeout: 30000 })).stdout.trim();
const image =
  'livekit/livekit-server@sha256:25cd902de7cacbd5f1f779f6a6ac1eae20ba8f56b0935934ce6b0ab80d1e3d20';
const isolated = process.argv.includes('--isolated');
const secret = randomBytes(32).toString('hex');
const config = `port: 7880\nbind_addresses: [${isolated ? '127.0.0.1' : '0.0.0.0'}]\nrtc:\n  tcp_port: 17881\n  node_ip: 127.0.0.1\n  use_external_ip: false\nkeys:\n  fixture: ${secret}\n`;
let id, browser, watchdog, guard, guardId;
const retirementDirectory = await mkdtemp(join(tmpdir(), 'cp07-guard-'));
let retirement;
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
    isolated ? '127.0.0.1:17885:7885' : '127.0.0.1:17880:7880',
    '-p',
    '127.0.0.1:17881:17881',
    '-e',
    `LIVEKIT_CONFIG=${config}`,
    image,
  );
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  for (let i = 0; i < 40; i++) {
    try {
      if (isolated) {
        await new Promise((r) => setTimeout(r, 1000));
        break;
      }
      await fetch('http://127.0.0.1:17880');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const publisher = await browser.newPage();
  const receiver = await browser.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const startGuard = async () => {
    if (isolated) {
      if (guardId) {
        await docker('rm', '-f', guardId);
        guardId = undefined;
      }
      const root = process.cwd();
      guardId = await docker(
        'run',
        '-d',
        '--network',
        `container:${id}`,
        '--read-only',
        '--cap-drop',
        'ALL',
        '-v',
        `${root}/spikes:/workspace/spikes:ro`,
        '-v',
        `${root}/node_modules:/workspace/node_modules:ro`,
        '-v',
        `${root}/apps/api/node_modules:/workspace/apps/api/node_modules:ro`,
        '-v',
        `${retirementDirectory}:/retirements:ro`,
        '-e',
        'CP07_KEY=fixture',
        '-e',
        `CP07_SECRET=${secret}`,
        '-e',
        `CP07_ORIGIN=${origin}`,
        '-e',
        'CP07_RETIREMENTS=/retirements',
        'node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d',
        'node',
        '/workspace/spikes/media-enforcement/guard-process.mjs',
      );
      for (let i = 0; i < 40; i++) {
        try {
          await fetch('http://127.0.0.1:17885');
          return 'ws://127.0.0.1:17885';
        } catch {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      throw new Error('isolated guard did not start');
    }
    retirement = new RetirementStore(retirementDirectory);
    const verifier = new TokenVerifier('fixture', secret);
    guard = createSignalingGuard({
      upstream: 'http://127.0.0.1:17880',
      origin,
      authorize: async (jwt) => {
        const claims = await verifier.verify(jwt, 0);
        return (
          claims.video?.roomJoin === true &&
          claims.video?.room === 'cutoff-fixture' &&
          ['publisher', 'receiver'].includes(claims.sub) &&
          !retirement.has(claims.video.room)
        );
      },
    });
    await new Promise((resolve) => guard.server.listen(0, '127.0.0.1', resolve));
    return `ws://127.0.0.1:${guard.server.address().port}`;
  };
  let signaling = await startGuard();
  if (isolated) {
    let bypassReachable = false;
    try {
      await fetch('http://127.0.0.1:17880', { signal: AbortSignal.timeout(1000) });
      bypassReachable = true;
    } catch {}
    if (bypassReachable) throw new Error('Direct signaling bypass is reachable');
    const ports = JSON.parse(await docker('inspect', id))[0].NetworkSettings.Ports;
    if (ports['7880/tcp']?.length) throw new Error('SFU signaling port published');
  }
  await Promise.all([publisher.goto(origin), receiver.goto(origin)]);
  await Promise.all(
    [publisher, receiver].map((page) =>
      page.evaluate((url) => {
        window.fixtureSocket = url;
      }, signaling),
    ),
  );
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
    window.audioSamples = 0;
    window.lastAudioAt = 0;
    window.framesReceived = 0;
    window.lastFrameAt = 0;
    window.room = new Room();
    window.room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === 'audio') {
        const element = track.attach();
        document.body.append(element);
        element.play();
        const audio = new AudioContext();
        window.receiverAudio = audio;
        const analyser = audio.createAnalyser();
        audio.createMediaStreamSource(new MediaStream([track.mediaStreamTrack])).connect(analyser);
        analyser.connect(audio.destination);
        audio.resume();
        const samples = new Float32Array(analyser.fftSize);
        window.audioMeter = setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          if (samples.some((value) => Math.abs(value) > 0.01)) {
            window.audioSamples++;
            window.lastAudioAt = Date.now();
          }
        }, 20);
        return;
      }
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
    await window.room.connect(window.fixtureSocket, token);
  }, originalReceiverToken);
  await publisher.evaluate(
    async (token) => {
      window.room = new window.LivekitClient.Room();
      await window.room.connect(window.fixtureSocket, token);
      const audio = new AudioContext();
      const destination = audio.createMediaStreamDestination();
      const oscillator = audio.createOscillator();
      oscillator.frequency.value = 660;
      oscillator.connect(destination);
      oscillator.start();
      window.oscillator = oscillator;
      await audio.resume();
      window.fixtureAudio = audio;
      await window.room.localParticipant.publishTrack(destination.stream.getAudioTracks()[0]);
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
  await receiver
    .waitForFunction(() => window.framesReceived >= 20 && window.audioSamples >= 10, null, {
      timeout: 30000,
    })
    .catch(async (error) => {
      console.error(
        await receiver.evaluate(() => ({
          frames: window.framesReceived,
          audioSamples: window.audioSamples,
          audioState: window.receiverAudio?.state,
        })),
      );
      throw error;
    });
  if (isolated) retirement = new RetirementStore(retirementDirectory);
  retirement.retire('cutoff-fixture');
  const freezeGuard = process.argv.includes('--freeze-guard');
  if (freezeGuard) {
    if (!guardId) throw new Error('--freeze-guard requires --isolated');
    await docker('pause', guardId);
  }
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
    audioSamples: window.audioSamples,
    lastAudioAt: window.lastAudioAt,
  }));
  await new Promise((r) => setTimeout(r, 1000));
  const after = await receiver.evaluate(() => window.framesReceived);
  if (after !== final.frames) throw new Error('Media still advancing after shutdown');
  if ((await receiver.evaluate(() => window.audioSamples)) !== final.audioSamples)
    throw new Error('Audio still advancing after shutdown');
  guard?.close();
  await docker('start', id);
  signaling = await startGuard();
  await receiver.evaluate((url) => {
    window.fixtureSocket = url;
  }, signaling);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const staleTokenAcceptedAfterRestart = await receiver.evaluate(async (oldToken) => {
    await window.room.disconnect();
    window.room = new window.LivekitClient.Room();
    try {
      await window.room.connect(window.fixtureSocket, oldToken);
      return true;
    } catch {
      return false;
    }
  }, originalReceiverToken);
  if (staleTokenAcceptedAfterRestart) throw new Error('Retired token accepted by restarted guard');
  console.log(
    JSON.stringify({
      scenario: 'missing-guard-progress',
      isolated,
      freezeGuard,
      staleTokenAcceptedAfterRestart,
      framesReceived: final.frames,
      audioSamples: final.audioSamples,
      lastAudibleSampleAfterStartMs: final.lastAudioAt - startedAt,
      lastDecodedFrameAfterStartMs: final.lastFrameAt - startedAt,
      stableObservationMs: 1000,
      supervisor: result.trim(),
    }),
  );
} finally {
  guard?.close();
  if (guardId) await docker('rm', '-f', guardId);
  watchdog?.kill();
  await browser?.close();
  server.close();
  if (id) await docker('rm', '-f', id);
  await rm(retirementDirectory, { recursive: true, force: true });
}
