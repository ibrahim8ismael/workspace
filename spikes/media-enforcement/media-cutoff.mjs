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
const policyLoss = process.argv.includes('--policy-loss');
const companies = process.argv.includes('--company-isolation');
if (companies && !policyLoss) throw new Error('--company-isolation requires --policy-loss');
if (policyLoss && !isolated) throw new Error('--policy-loss requires --isolated');
const policyKey = randomBytes(32).toString('hex');
const secret = randomBytes(32).toString('hex');
const config = `port: 7880\nbind_addresses: [${isolated ? '127.0.0.1' : '0.0.0.0'}]\nrtc:\n  tcp_port: 17881\n  node_ip: 127.0.0.1\n  use_external_ip: false\nkeys:\n  fixture: ${secret}\n`;
let id, browser, watchdog, guard, guardId, progressTimer, policyId, progressLogs;
const retirementDirectory = await mkdtemp(join(tmpdir(), 'cp07-guard-'));
let retirement, secondReceiver, companyIsolationResult;
let guardEpoch;
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
    guardEpoch = randomBytes(32).toString('hex');
    if (isolated) {
      if (guardId) {
        await docker('rm', '-f', guardId);
        guardId = undefined;
      }
      const root = process.cwd();
      if (policyLoss && !policyId) {
        policyId = await docker(
          'run',
          '-d',
          '--network',
          `container:${id}`,
          '--read-only',
          '--cap-drop',
          'ALL',
          '-v',
          `${root}/spikes:/workspace/spikes:ro`,
          '-e',
          `CP07_POLICY_KEY=${policyKey}`,
          ...(companies ? ['-e', 'CP07_COMPANIES=1'] : []),
          'node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d',
          'node',
          '/workspace/spikes/media-enforcement/policy-process.mjs',
        );
      }

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
        `CP07_GUARD_EPOCH=${guardEpoch}`,
        '-e',
        `CP07_SECRET=${secret}`,
        '-e',
        `CP07_ORIGIN=${origin}`,
        '-e',
        'CP07_RETIREMENTS=/retirements',
        ...(companies ? ['-e', 'CP07_COMPANIES=1'] : []),
        ...(policyLoss
          ? [
              '-e',
              'CP07_POLICY_ENDPOINT=http://127.0.0.1:7886/policy',
              '-e',
              `CP07_POLICY_KEY=${policyKey}`,
              ...(companies ? ['-e', 'CP07_COMPANIES=1'] : []),
            ]
          : []),
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
      canPublishSources: identity === 'publisher' ? [1, 2] : [],
      canSubscribe: identity === 'receiver',
    });
    return grant.toJwt();
  };
  let sourcePermissionResult = null;
  if (process.argv.includes('--source-permissions')) {
    if (!isolated) throw new Error('--source-permissions requires --isolated');
    const limited = new AccessToken('fixture', secret, { identity: 'publisher', ttl: '2m' });
    limited.addGrant({
      roomJoin: true,
      room: 'cutoff-fixture',
      canPublish: true,
      canSubscribe: false,
      canPublishSources: [2],
    });
    sourcePermissionResult = await publisher.evaluate(
      async (jwt) => {
        const room = new window.LivekitClient.Room();
        await room.connect(window.fixtureSocket, jwt);
        // Bypass the SDK permission check deliberately: the server JWT remains microphone-only.
        room.localParticipant.permissions.canPublish = true;
        room.localParticipant.permissions.canPublishSources = [];
        const rejected = [];
        let microphonePublished = false;
        try {
          for (const source of [
            window.LivekitClient.Track.Source.Camera,
            window.LivekitClient.Track.Source.ScreenShare,
          ]) {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const stream = canvas.captureStream(5);
            try {
              await room.localParticipant.publishTrack(stream.getVideoTracks()[0], { source });
              rejected.push(false);
            } catch {
              rejected.push(true);
            } finally {
              stream.getTracks().forEach((track) => track.stop());
            }
          }
          const audio = new AudioContext();
          try {
            const destination = audio.createMediaStreamDestination();
            const oscillator = audio.createOscillator();
            oscillator.connect(destination);
            oscillator.start();
            await audio.resume();
            const publication = await room.localParticipant.publishTrack(
              destination.stream.getAudioTracks()[0],
              { source: window.LivekitClient.Track.Source.Microphone },
            );
            microphonePublished = Boolean(publication.trackSid) && room.state === 'connected';
          } finally {
            await audio.close();
          }
        } finally {
          await room.disconnect();
        }
        return {
          cameraRejected: rejected[0],
          screenShareRejected: rejected[1],
          microphonePublished,
        };
      },
      await limited.toJwt(),
    );
    if (
      !sourcePermissionResult.cameraRejected ||
      !sourcePermissionResult.screenShareRejected ||
      !sourcePermissionResult.microphonePublished
    )
      throw new Error('SFU source permission bypass');
    const foreign = new AccessToken('fixture', secret, { identity: 'receiver', ttl: '2m' });
    foreign.addGrant({
      roomJoin: true,
      room: 'another-company-room',
      canPublish: false,
      canSubscribe: true,
    });
    const foreignAccepted = await publisher.evaluate(
      async (jwt) => {
        const room = new window.LivekitClient.Room();
        try {
          await room.connect(window.fixtureSocket, jwt);
          return true;
        } catch {
          return false;
        } finally {
          await room.disconnect();
        }
      },
      await foreign.toJwt(),
    );
    if (foreignAccepted) throw new Error('Cross-room guard scope bypass');
    sourcePermissionResult.foreignRoomRejected = true;
  }
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
      await window.room.localParticipant.publishTrack(destination.stream.getAudioTracks()[0], {
        source: window.LivekitClient.Track.Source.Microphone,
      });
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
      await window.room.localParticipant.publishTrack(
        canvas.captureStream(20).getVideoTracks()[0],
        { source: window.LivekitClient.Track.Source.Camera },
      );
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
  if (companies) {
    secondReceiver = await browser.newPage();
    const secondPublisher = await browser.newPage();
    await Promise.all([secondReceiver.goto(origin), secondPublisher.goto(origin)]);
    const secondToken = async (identity) => {
      const grant = new AccessToken('fixture', secret, { identity, ttl: '2m' });
      grant.addGrant({
        roomJoin: true,
        room: 'company-b-fixture',
        canPublish: identity === 'publisher-b',
        canPublishSources: identity === 'publisher-b' ? [1] : [],
        canSubscribe: identity === 'receiver-b',
      });
      return grant.toJwt();
    };
    await secondReceiver.evaluate(
      async ({ jwt, url }) => {
        window.companyFrames = 0;
        window.companyLastFrameAt = 0;
        window.companyTrackOwners = [];
        window.room = new window.LivekitClient.Room();
        window.room.on(
          window.LivekitClient.RoomEvent.TrackSubscribed,
          (track, _publication, participant) => {
            window.companyTrackOwners.push(participant.identity);
            const video = track.attach();
            video.muted = true;
            video.autoplay = true;
            document.body.append(video);
            const sample = () => {
              window.companyFrames++;
              window.companyLastFrameAt = Date.now();
              video.requestVideoFrameCallback(sample);
            };
            video.requestVideoFrameCallback(sample);
          },
        );
        await window.room.connect(url, jwt);
      },
      { jwt: await secondToken('receiver-b'), url: signaling },
    );
    await secondPublisher.evaluate(
      async ({ jwt, url }) => {
        window.room = new window.LivekitClient.Room();
        await window.room.connect(url, jwt);
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 120;
        const ctx = canvas.getContext('2d');
        let frame = 0;
        window.paint = setInterval(() => {
          ctx.fillStyle = `hsl(${frame++ % 360},90%,50%)`;
          ctx.fillRect(0, 0, 160, 120);
        }, 50);
        await window.room.localParticipant.publishTrack(
          canvas.captureStream(20).getVideoTracks()[0],
          { source: window.LivekitClient.Track.Source.Camera },
        );
      },
      { jwt: await secondToken('publisher-b'), url: signaling },
    );
    await secondReceiver.waitForFunction(() => window.companyFrames >= 20, null, {
      timeout: 30000,
    });
    const firstPeers = await receiver.evaluate(() =>
      Array.from(window.room.remoteParticipants.values())
        .map((p) => p.identity)
        .sort(),
    );
    const secondPeers = await secondReceiver.evaluate(() =>
      Array.from(window.room.remoteParticipants.values())
        .map((p) => p.identity)
        .sort(),
    );
    const owners = await secondReceiver.evaluate(() => window.companyTrackOwners);
    if (
      JSON.stringify(firstPeers) !== JSON.stringify(['publisher']) ||
      JSON.stringify(secondPeers) !== JSON.stringify(['publisher-b']) ||
      owners.some((owner) => owner !== 'publisher-b')
    )
      throw new Error('Cross-company participant or track leak');
    companyIsolationResult = { firstPeers, secondPeers, secondTrackOwners: owners };
  }
  let refreshedReceiverToken;
  if (isolated) {
    await docker(
      'exec',
      guardId,
      'node',
      '--input-type=module',
      '-e',
      "import {RoomServiceClient} from '/workspace/apps/api/node_modules/livekit-server-sdk/dist/RoomServiceClient.js'; const c=new RoomServiceClient('http://127.0.0.1:7880',process.env.CP07_KEY,process.env.CP07_SECRET); await c.updateParticipant('cutoff-fixture','receiver',{metadata:'refresh-fixture'});",
    );
    await receiver.waitForFunction(
      (original) => window.room.engine?.token && window.room.engine.token !== original,
      originalReceiverToken,
      { timeout: 10000 },
    );
    refreshedReceiverToken = await receiver.evaluate(() => window.room.engine.token);
    const claims = await new TokenVerifier('fixture', secret).verify(refreshedReceiverToken, 0);
    if (claims.sub !== 'receiver' || claims.video?.room !== 'cutoff-fixture')
      throw new Error('Invalid refreshed fixture token');
  }
  if (isolated) retirement = new RetirementStore(retirementDirectory);
  const progressStall = policyLoss || process.argv.includes('--progress-stall');
  if (!progressStall) retirement.retire('cutoff-fixture');
  const freezeGuard = process.argv.includes('--freeze-guard');
  if (freezeGuard && !progressStall) {
    if (!guardId) throw new Error('--freeze-guard requires --isolated');
    await docker('pause', guardId);
  }
  let startedAt = Date.now();
  const guardedSupervisor = process.argv.includes('--guarded-supervisor');
  let workerPid;
  watchdog = spawn(
    process.execPath,
    [
      guardedSupervisor
        ? 'spikes/media-enforcement/supervisor-guardian.mjs'
        : 'spikes/media-enforcement/supervisor-process.mjs',
      context,
      id,
      guardEpoch,
      ...(process.argv.includes('--deny-primary-stop') ? ['--deny-primary-stop'] : []),
    ],
    { stdio: ['pipe', 'pipe', 'inherit'] },
  );
  let result = '';
  let statusLines = '';
  const watchdogExited = new Promise((resolve, reject) => {
    watchdog.on('exit', resolve);
    watchdog.on('error', reject);
  });
  watchdog.stdout.on('data', (chunk) => {
    result += chunk;
    statusLines += chunk.toString();
    const lines = statusLines.split('\n');
    statusLines = lines.pop();
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.kind === 'worker-started') workerPid = event.pid;
      } catch {}
    }
  });
  if (progressStall) {
    const before = await receiver.evaluate(() => ({
      frames: window.framesReceived,
      audio: window.audioSamples,
    }));
    let sequence = 0;
    const progress = () => {
      const nonce = randomBytes(16).toString('hex');
      const version = ++sequence;
      watchdog.stdin.write(JSON.stringify({ kind: 'expect', nonce, version }) + '\n');
      watchdog.stdin.write(
        JSON.stringify({ kind: 'ack', epoch: guardEpoch, nonce, version, sequence }) + '\n',
      );
    };
    watchdog.stdin.on('error', () => {});
    if (policyLoss) {
      progressLogs = spawn(
        'docker',
        ['--context', context, 'logs', '--follow', '--tail', '0', guardId],
        { stdio: ['ignore', 'pipe', 'ignore'] },
      );
      let pending = '';
      progressLogs.stdout.on('data', (chunk) => {
        pending += chunk.toString();
        const lines = pending.split('\n');
        pending = lines.pop();
        for (const line of lines) {
          try {
            const message = JSON.parse(line);
            if (['expect', 'ack'].includes(message.kind))
              watchdog.stdin.write(JSON.stringify(message) + '\n');
          } catch {}
        }
      });
    } else {
      progress();
      progressTimer = setInterval(progress, 500);
    }
    await new Promise((resolve) => setTimeout(resolve, 4000));
    clearInterval(progressTimer);
    if (watchdog.exitCode !== null) throw new Error('Supervisor stopped during valid progress');
    const healthy = await receiver.evaluate(() => ({
      frames: window.framesReceived,
      audio: window.audioSamples,
    }));
    if (healthy.frames <= before.frames || healthy.audio <= before.audio)
      throw new Error('Media did not continue during healthy progress');
    if (policyLoss) {
      await docker('rm', '-f', policyId);
      policyId = undefined;
    }
    retirement.retire('cutoff-fixture');
    if (freezeGuard) await docker('pause', guardId);
    startedAt = Date.now();
  }
  if (process.argv.includes('--supervisor-crash') && guardedSupervisor) {
    if (!workerPid) throw new Error('Guardian did not identify its child');
    process.kill(workerPid, 'SIGKILL');
  }
  if (process.argv.includes('--supervisor-crash') && !guardedSupervisor) {
    if (!policyLoss) throw new Error('--supervisor-crash requires --policy-loss');
    const beforeCrash = await receiver.evaluate(() => ({
      frames: window.framesReceived,
      audio: window.audioSamples,
    }));
    watchdog.kill('SIGKILL');
    await new Promise((resolve) => setTimeout(resolve, 8500));
    const afterCrash = await receiver.evaluate(() => ({
      frames: window.framesReceived,
      audio: window.audioSamples,
    }));
    const forwardingContinued =
      afterCrash.frames > beforeCrash.frames && afterCrash.audio > beforeCrash.audio;
    console.log(
      JSON.stringify({
        scenario: 'supervisor-crash-after-controller-loss',
        observationMs: 8500,
        forwardingContinued,
        additionalFrames: afterCrash.frames - beforeCrash.frames,
        additionalAudioSamples: afterCrash.audio - beforeCrash.audio,
        securityGatePassed: !forwardingContinued,
      }),
    );
    // This is a negative acceptance experiment; cleanup does not count as automatic enforcement.
    if (forwardingContinued)
      throw new Error(
        'CP07 cutoff failed: supervisor crash leaves media forwarding beyond eight seconds',
      );
    throw new Error(
      'Unexpected media cessation: investigate before claiming supervisor-crash enforcement',
    );
  }
  const code = await watchdogExited;
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
  if (secondReceiver) {
    const first = await secondReceiver.evaluate(() => ({
      frames: window.companyFrames,
      lastFrameAt: window.companyLastFrameAt,
    }));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if ((await secondReceiver.evaluate(() => window.companyFrames)) !== first.frames)
      throw new Error('Second company still forwarding after shared-node shutdown');
    companyIsolationResult.frames = first.frames;
    companyIsolationResult.lastFrameAfterFaultMs = first.lastFrameAt - startedAt;
    companyIsolationResult.sharedNodeShutdownInterruptedSecondCompany = true;
  }
  guard?.close();
  await docker('start', id);
  const previousGuardEpoch = guardEpoch;
  signaling = await startGuard();
  if (previousGuardEpoch === guardEpoch) throw new Error('Guard reused its boot epoch');
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
  let refreshedTokenAcceptedAfterRestart = null;
  if (refreshedReceiverToken) {
    refreshedTokenAcceptedAfterRestart = await receiver.evaluate(async (token) => {
      await window.room.disconnect();
      window.room = new window.LivekitClient.Room();
      try {
        await window.room.connect(window.fixtureSocket, token);
        return true;
      } catch {
        return false;
      }
    }, refreshedReceiverToken);
    if (refreshedTokenAcceptedAfterRestart) throw new Error('Refreshed retired token accepted');
  }

  console.log(
    JSON.stringify({
      scenario: policyLoss
        ? 'authenticated-controller-loss'
        : progressStall
          ? 'fixture-install-progress-then-stall'
          : 'missing-guard-progress',
      isolated,
      guardedSupervisor,
      guardEpochChanged: previousGuardEpoch !== guardEpoch,
      sourcePermissionResult,
      companyIsolationResult,
      freezeGuard,
      staleTokenAcceptedAfterRestart,
      refreshedTokenAcceptedAfterRestart,
      framesReceived: final.frames,
      audioSamples: final.audioSamples,
      lastAudibleSampleAfterStartMs: final.lastAudioAt - startedAt,
      lastDecodedFrameAfterStartMs: final.lastFrameAt - startedAt,
      stableObservationMs: 1000,
      supervisor: result.trim(),
    }),
  );
} finally {
  clearInterval(progressTimer);
  progressLogs?.kill();
  if (policyId) await docker('rm', '-f', policyId);
  guard?.close();
  if (guardId) await docker('rm', '-f', guardId);
  watchdog?.kill();
  await browser?.close();
  server.close();
  if (id) await docker('rm', '-f', id);
  await rm(retirementDirectory, { recursive: true, force: true });
}
