/* global DOMException, navigator, window, location */
import { createInterface } from 'node:readline';
import { chromium } from '@playwright/test';

const FIXTURE_ARGS = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];

async function readObservations(page) {
  return page.evaluate(() => ({ ...window.__mediaFixture }));
}

function withoutRefreshedToken(observation) {
  const safe = { ...observation };
  delete safe.refreshedToken;
  return safe;
}

function safeDiagnostic(value) {
  return String(value)
    .replace(/([?&]access_token=)[^&\s]*/gi, '$1[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-jwt]');
}

export async function startApplicationMediaClient({
  fixtureUrl,
  grants,
  denyMicrophoneIndex,
  forceRelay = false,
  deferPeerReadiness = false,
}) {
  if (
    typeof fixtureUrl !== 'string' ||
    !fixtureUrl.startsWith('http://127.0.0.1:') ||
    !Array.isArray(grants) ||
    grants.length < 1 ||
    grants.length > 6 ||
    typeof forceRelay !== 'boolean' ||
    typeof deferPeerReadiness !== 'boolean' ||
    (denyMicrophoneIndex !== undefined &&
      (!Number.isInteger(denyMicrophoneIndex) ||
        denyMicrophoneIndex < 0 ||
        denyMicrophoneIndex >= grants.length)) ||
    new Set(grants.map((grant) => grant?.identity)).size !== grants.length ||
    grants.some(
      (grant) =>
        !grant ||
        typeof grant.serverUrl !== 'string' ||
        !grant.serverUrl.startsWith('ws://127.0.0.1:') ||
        typeof grant.identity !== 'string' ||
        typeof grant.token !== 'string' ||
        typeof grant.conversationVersion !== 'number' ||
        typeof grant.generation !== 'string',
    )
  )
    throw new Error('invalid application media fixture input');

  const browser = await chromium.launch({
    headless: true,
    args: [...FIXTURE_ARGS, '--autoplay-policy=no-user-gesture-required'],
  });
  try {
    const pages = await Promise.all(grants.map(() => browser.newPage()));
    if (denyMicrophoneIndex !== undefined) {
      await pages[denyMicrophoneIndex].addInitScript(() => {
        const mediaDevices = navigator.mediaDevices;
        const getUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
        Object.defineProperty(mediaDevices, 'getUserMedia', {
          configurable: true,
          value: async (constraints) => {
            if (constraints?.audio)
              throw new DOMException(
                'Microphone permission denied by the browser',
                'NotAllowedError',
              );
            return getUserMedia(constraints);
          },
        });
      });
    }
    const browserErrors = [];
    for (const page of pages) {
      page.on('pageerror', (error) => browserErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') browserErrors.push(message.text().slice(0, 300));
      });
      page.on('requestfailed', (request) => {
        const url = new URL(request.url());
        if (url.pathname.startsWith('/rtc'))
          browserErrors.push(`request failed ${url.pathname}: ${request.failure()?.errorText}`);
      });
      page.on('websocket', (socket) => {
        const path = new URL(socket.url()).pathname;
        socket.on('socketerror', () => browserErrors.push(`websocket error ${path}`));
        socket.on('close', () => browserErrors.push(`websocket closed ${path}`));
      });
    }
    const mediaFixtureUrl = new URL(fixtureUrl);
    if (forceRelay) mediaFixtureUrl.searchParams.set('ice', 'relay');
    await Promise.all(pages.map((page) => page.goto(mediaFixtureUrl.toString())));
    await Promise.all(
      pages.map((page, index) =>
        page.evaluate(
          (grant) => window.postMessage({ kind: 'start', grant }, location.origin),
          grants[index],
        ),
      ),
    );
    try {
      await Promise.all(
        pages.map((page, index) =>
          page.waitForFunction(
            ({ denied }) =>
              denied
                ? ['muted', 'error'].includes(window.__mediaFixture.status)
                : ['live', 'error'].includes(window.__mediaFixture.status),
            { denied: index === denyMicrophoneIndex },
            { timeout: 25000 },
          ),
        ),
      );
    } catch (error) {
      const observations = await Promise.all(pages.map(readObservations));
      throw new Error(
        `application media clients did not reach live/error: ${JSON.stringify({
          observations: observations.map(withoutRefreshedToken),
          browserErrors: browserErrors.map(safeDiagnostic),
        })}`,
        { cause: error },
      );
    }
    const initial = await Promise.all(pages.map(readObservations));
    if (denyMicrophoneIndex !== undefined) {
      const denied = initial[denyMicrophoneIndex];
      const allowed = initial[denyMicrophoneIndex === 0 ? 1 : 0];
      if (
        denied?.status !== 'muted' ||
        !denied.error.includes('Microphone access was denied') ||
        allowed?.status !== 'live'
      )
        throw new Error(
          `microphone denial did not isolate the affected session: ${JSON.stringify({ initial: initial.map(withoutRefreshedToken), browserErrors })}`,
        );
    } else if (initial.some(({ status }) => status !== 'live'))
      throw new Error(
        `application grant failed to join LiveKit: ${JSON.stringify({ initial: initial.map(withoutRefreshedToken), browserErrors })}`,
      );
    if (denyMicrophoneIndex === undefined && grants.length > 1 && !deferPeerReadiness) {
      try {
        await Promise.all(
          pages.map((page, index) =>
            page.waitForFunction(
              (peerIdentities) =>
                window.__mediaFixture.status === 'live' &&
                window.__mediaFixture.remoteIdentities.length === peerIdentities.length &&
                window.__mediaFixture.remoteTrackIdentities.length === peerIdentities.length &&
                peerIdentities.every(
                  (identity) =>
                    window.__mediaFixture.remoteIdentities.includes(identity) &&
                    window.__mediaFixture.remoteTrackIdentities.includes(identity),
                ) &&
                window.__mediaFixture.activeAudioSamples >= 10,
              grants.filter((_, peerIndex) => peerIndex !== index).map(({ identity }) => identity),
              { timeout: 15000 },
            ),
          ),
        );
      } catch {
        const observations = await Promise.all(pages.map(readObservations));
        throw new Error(
          `application LiveKit audio was not mutual and active: ${JSON.stringify({ observations: observations.map(withoutRefreshedToken), browserErrors })}`,
        );
      }
      if (forceRelay) {
        const observations = await Promise.all(pages.map(readObservations));
        const relayOnlyAudio = observations.every(
          (
            {
              gatheredCandidateTypes,
              iceStates,
              activeAudioSamples,
              remoteIdentities,
              remoteTrackIdentities,
            },
            index,
          ) =>
            gatheredCandidateTypes.length > 0 &&
            gatheredCandidateTypes.every((candidateType) => candidateType === 'relay') &&
            iceStates.includes('connection:connected') &&
            activeAudioSamples >= 10 &&
            remoteIdentities.length === grants.length - 1 &&
            remoteTrackIdentities.length === grants.length - 1 &&
            grants
              .filter((_, peerIndex) => peerIndex !== index)
              .every(
                ({ identity }) =>
                  remoteIdentities.includes(identity) && remoteTrackIdentities.includes(identity),
              ),
        );
        if (!relayOnlyAudio)
          throw new Error(
            `TURN-only audio did not remain on connected relay candidates: ${JSON.stringify(observations.map(withoutRefreshedToken))}`,
          );
      }
    }
    const observations = (await Promise.all(pages.map(readObservations))).map(
      withoutRefreshedToken,
    );
    return {
      observations,
      pages,
      grants,
      browserErrors: () => browserErrors.map(safeDiagnostic),
      exerciseWeakNetwork: async () => {
        const before = await Promise.all(pages.map(readObservations));
        await Promise.all(
          pages.map((page, index) =>
            page.waitForFunction(
              ({ previousSamples, peerIdentities }) =>
                window.__mediaFixture.status === 'live' &&
                window.__mediaFixture.iceStates.includes('connection:connected') &&
                peerIdentities.length === window.__mediaFixture.remoteIdentities.length &&
                peerIdentities.length === window.__mediaFixture.remoteTrackIdentities.length &&
                peerIdentities.every(
                  (identity) =>
                    window.__mediaFixture.remoteIdentities.includes(identity) &&
                    window.__mediaFixture.remoteTrackIdentities.includes(identity),
                ) &&
                window.__mediaFixture.activeAudioSamples >= previousSamples + 60,
              {
                previousSamples: before[index].activeAudioSamples,
                peerIdentities: grants
                  .filter((_, peerIndex) => peerIndex !== index)
                  .map(({ identity }) => identity),
              },
              { timeout: 15000 },
            ),
          ),
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const after = await Promise.all(pages.map(readObservations));
        const report = after.map((observation, index) => ({
          status: observation.status,
          connected: observation.iceStates.includes('connection:connected'),
          peerPresent:
            observation.remoteIdentities.length === grants.length - 1 &&
            observation.remoteTrackIdentities.length === grants.length - 1 &&
            grants
              .filter((_, peerIndex) => peerIndex !== index)
              .every(
                ({ identity }) =>
                  observation.remoteIdentities.includes(identity) &&
                  observation.remoteTrackIdentities.includes(identity),
              ),
          remoteTrackCount: observation.remoteTrackIdentities.length,
          audioSampleDelta: observation.activeAudioSamples - before[index].activeAudioSamples,
          sawReconnect: observation.statusHistory.includes('reconnecting'),
        }));
        if (
          report.some(
            (client) =>
              client.status !== 'live' ||
              !client.connected ||
              !client.peerPresent ||
              client.audioSampleDelta < 60 ||
              client.sawReconnect,
          )
        )
          throw new Error(
            `media did not remain healthy under packet loss and jitter: ${JSON.stringify(report)}`,
          );
        return { durationMs: 3000, clients: report };
      },
      exerciseMuteUnmute: async () => {
        const sender = pages[0];
        const receivers = pages.slice(1);
        const muteRequestedAt = Date.now();
        await sender.evaluate(() =>
          window.postMessage({ kind: 'toggle-microphone' }, location.origin),
        );
        await sender.waitForFunction(() => window.__mediaFixture.status === 'muted', null, {
          timeout: 5000,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
        const muted = await Promise.all(receivers.map(readObservations));
        await new Promise((resolve) => setTimeout(resolve, 500));
        const mutedAfterQuiet = await Promise.all(receivers.map(readObservations));
        const muteStable = muted.every(
          (value, index) => value.activeAudioSamples === mutedAfterQuiet[index].activeAudioSamples,
        );

        const unmuteRequestedAt = Date.now();
        await sender.evaluate(() =>
          window.postMessage({ kind: 'toggle-microphone' }, location.origin),
        );
        await sender.waitForFunction(() => window.__mediaFixture.status === 'live', null, {
          timeout: 5000,
        });
        await Promise.all(
          receivers.map((receiver, index) =>
            receiver.waitForFunction(
              ({ identity, samples }) =>
                window.__mediaFixture.remoteIdentities.includes(identity) &&
                window.__mediaFixture.activeAudioSamples > samples + 5,
              {
                identity: grants[0].identity,
                samples: mutedAfterQuiet[index].activeAudioSamples,
              },
              { timeout: 12000 },
            ),
          ),
        );
        const resumed = await Promise.all(receivers.map(readObservations));
        const result = {
          muteCutoffMs: Math.max(
            0,
            Math.max(...muted.map(({ lastActiveAudioAt }) => lastActiveAudioAt)) - muteRequestedAt,
          ),
          mutedSampleCount: Math.min(
            ...mutedAfterQuiet.map(({ activeAudioSamples }) => activeAudioSamples),
          ),
          muteStable,
          unmuteObservedMs: Math.max(
            0,
            Math.max(...resumed.map(({ lastActiveAudioAt }) => lastActiveAudioAt)) -
              unmuteRequestedAt,
          ),
          resumedSampleCount: Math.min(
            ...resumed.map(({ activeAudioSamples }) => activeAudioSamples),
          ),
          resumed: resumed.every(({ remoteIdentities }) =>
            remoteIdentities.includes(grants[0].identity),
          ),
        };
        if (
          !result.muteStable ||
          !result.resumed ||
          result.muteCutoffMs > 8000 ||
          result.unmuteObservedMs > 8000
        )
          throw new Error(`real media mute/unmute failed: ${JSON.stringify(result)}`);
        return result;
      },
      exerciseReconnect: async () => {
        const baseline = await Promise.all(pages.map(readObservations));
        await Promise.all(
          pages.map((page) =>
            page.waitForFunction(
              () => window.__mediaFixture.statusHistory.includes('reconnecting'),
              null,
              { timeout: 15000 },
            ),
          ),
        );
        await Promise.all(
          pages.map((page, index) =>
            page.waitForFunction(
              ({ sampleCount, peerIdentities }) =>
                window.__mediaFixture.status === 'live' &&
                peerIdentities.length === window.__mediaFixture.remoteIdentities.length &&
                peerIdentities.length === window.__mediaFixture.remoteTrackIdentities.length &&
                peerIdentities.every(
                  (identity) =>
                    window.__mediaFixture.remoteIdentities.includes(identity) &&
                    window.__mediaFixture.remoteTrackIdentities.includes(identity),
                ) &&
                window.__mediaFixture.activeAudioSamples > sampleCount + 5,
              {
                sampleCount: baseline[index].activeAudioSamples,
                peerIdentities: grants
                  .filter((_, peerIndex) => peerIndex !== index)
                  .map(({ identity }) => identity),
              },
              { timeout: 20000 },
            ),
          ),
        );
        const observations = await Promise.all(pages.map(readObservations));
        return {
          reconnecting: observations.every(({ statusHistory }) =>
            statusHistory.includes('reconnecting'),
          ),
          live: observations.every(({ status }) => status === 'live'),
          activeAudioSamples: observations.map(({ activeAudioSamples }) => activeAudioSamples),
          statuses: observations.map(({ status }) => status),
        };
      },
      exerciseServerCutoff: async (requestedAt = Date.now()) => {
        if (
          !Number.isFinite(requestedAt) ||
          requestedAt > Date.now() ||
          Date.now() - requestedAt > 60000
        )
          throw new Error('invalid authoritative media-revocation start time');
        try {
          await Promise.all(
            pages.map((page) =>
              page.waitForFunction(
                (startedAt) => {
                  const fixture = window.__mediaFixture;
                  const detached =
                    fixture.status !== 'live' && fixture.remoteTrackIdentities.length === 0;
                  const decodedAudioStopped =
                    fixture.lastDecodedAudioAt > 0 &&
                    Date.now() - fixture.lastDecodedAudioAt >= 300;
                  return Date.now() >= startedAt && (detached || decodedAudioStopped);
                },
                requestedAt,
                { timeout: 12000 },
              ),
            ),
          );
        } catch (error) {
          const observations = await Promise.all(pages.map(readObservations));
          throw new Error(
            `server forwarding did not stop before cutoff deadline: ${JSON.stringify({
              observations: observations.map(
                ({
                  status,
                  remoteTrackIdentities,
                  decodedAudioSamples,
                  lastDecodedAudioAt,
                  iceStates,
                }) => ({
                  status,
                  remoteTrackCount: remoteTrackIdentities.length,
                  decodedAudioSamples,
                  lastDecodedAudioAt,
                  iceStates,
                }),
              ),
              requestedAt,
              observedAt: Date.now(),
              cause: error instanceof Error ? error.message : 'unknown',
            })}`,
            { cause: error },
          );
        }
        const after = await Promise.all(pages.map(readObservations));
        await new Promise((resolve) => setTimeout(resolve, 300));
        const settled = await Promise.all(pages.map(readObservations));
        const lastDecodedAudioAt = Math.max(
          ...settled.map(({ lastDecodedAudioAt }) => lastDecodedAudioAt),
        );
        return {
          cutoffMs: Math.max(0, lastDecodedAudioAt - requestedAt),
          observations: after.map(withoutRefreshedToken),
          remoteTracks: after.map(({ remoteTrackIdentities }) => remoteTrackIdentities.length),
          remoteAudioDecodedSamples: after.map(({ decodedAudioSamples }) => decodedAudioSamples),
          settledDecodedAudioSamples: settled.map(({ decodedAudioSamples }) => decodedAudioSamples),
          statuses: after.map(({ status }) => status),
          lastDecodedAudioAt,
          observedAt: Date.now(),
          stable: after.every(
            (observation, index) =>
              observation.decodedAudioSamples === settled[index].decodedAudioSamples,
          ),
        };
      },
      stop: async () => {
        const requestedAt = Date.now();
        await Promise.all(
          pages.map((page) =>
            page.evaluate(() => window.postMessage({ kind: 'stop' }, location.origin)),
          ),
        );
        await Promise.all(
          pages.map((page) =>
            page.waitForFunction(() => window.__mediaFixture.status === 'off', null, {
              timeout: 5000,
            }),
          ),
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const settled = await Promise.all(pages.map(readObservations));
        await new Promise((resolve) => setTimeout(resolve, 250));
        const final = await Promise.all(pages.map(readObservations));
        return {
          requestedAt,
          observations: final.map(withoutRefreshedToken),
          lastActiveAudioAt: Math.max(...final.map(({ lastActiveAudioAt }) => lastActiveAudioAt)),
          cutoffMs: Math.max(
            0,
            Math.max(...final.map(({ lastActiveAudioAt }) => lastActiveAudioAt)) - requestedAt,
          ),
          stable: final.every(
            (value, index) => value.activeAudioSamples === settled[index].activeAudioSamples,
          ),
        };
      },
      close: async () => {
        await browser.close();
      },
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

export async function runApplicationMediaCutoffCli() {
  const input = createInterface({ input: process.stdin });
  const iterator = input[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done || first.value.length > 16384) throw new Error('missing fixture input');
  const config = JSON.parse(first.value);
  const client = await startApplicationMediaClient(config);
  process.stdout.write(
    JSON.stringify({ kind: 'connected', observations: client.observations }) + '\n',
  );
  try {
    for await (const line of { [Symbol.asyncIterator]: () => iterator }) {
      if (line.length > 4096) continue;
      let command;
      try {
        command = JSON.parse(line);
      } catch {
        continue;
      }
      if (command.kind === 'exercise-mute-unmute') {
        const result = await client.exerciseMuteUnmute();
        process.stdout.write(JSON.stringify({ kind: 'media-controls', ...result }) + '\n');
        continue;
      }
      if (command.kind === 'exercise-weak-network') {
        const result = await client.exerciseWeakNetwork();
        process.stdout.write(JSON.stringify({ kind: 'weak-network', ...result }) + '\n');
        continue;
      }
      if (command.kind === 'exercise-reconnect') {
        process.stdout.write(JSON.stringify({ kind: 'reconnect-armed' }) + '\n');
        const result = await client.exerciseReconnect();
        process.stdout.write(JSON.stringify({ kind: 'media-reconnect', ...result }) + '\n');
        continue;
      }
      if (command.kind === 'expect-server-cutoff') {
        const result = await client.exerciseServerCutoff(command.startedAt);
        process.stdout.write(JSON.stringify({ kind: 'server-cutoff', ...result }) + '\n');
        continue;
      }
      if (command.kind === 'expect-audio-advancing') {
        const before = await Promise.all(client.pages.map(readObservations));
        await new Promise((resolve) => setTimeout(resolve, 300));
        const after = await Promise.all(client.pages.map(readObservations));
        const decodedAudioSampleDeltas = after.map(
          (observation, index) =>
            observation.decodedAudioSamples - before[index].decodedAudioSamples,
        );
        if (decodedAudioSampleDeltas.some((delta) => delta <= 0))
          throw new Error(
            `decoded audio stopped advancing: ${JSON.stringify(decodedAudioSampleDeltas)}`,
          );
        process.stdout.write(
          JSON.stringify({ kind: 'audio-advancing', decodedAudioSampleDeltas }) + '\n',
        );
        continue;
      }
      if (command.kind === 'expect-room-peers') {
        const peerIdentities = command.peerIdentities;
        if (
          !Array.isArray(peerIdentities) ||
          peerIdentities.length < 1 ||
          peerIdentities.length > 20 ||
          peerIdentities.some((identity) => typeof identity !== 'string' || identity.length > 128)
        )
          throw new Error('invalid room peer expectation');
        try {
          await Promise.all(
            client.pages.map((page, index) =>
              page.waitForFunction(
                ({ identities, ownIdentity }) => {
                  const expected = identities.filter((identity) => identity !== ownIdentity);
                  const fixture = window.__mediaFixture;
                  return (
                    fixture.status === 'live' &&
                    fixture.remoteIdentities.length === expected.length &&
                    fixture.remoteTrackIdentities.length === expected.length &&
                    expected.every(
                      (identity) =>
                        fixture.remoteIdentities.includes(identity) &&
                        fixture.remoteTrackIdentities.includes(identity),
                    ) &&
                    fixture.activeAudioSamples >= 10
                  );
                },
                { identities: peerIdentities, ownIdentity: client.grants[index].identity },
                { timeout: 45000 },
              ),
            ),
          );
        } catch (error) {
          const observations = await Promise.all(client.pages.map(readObservations));
          throw new Error(
            `meeting room peer/audio set was incomplete: ${JSON.stringify({
              expectedRoomSize: peerIdentities.length,
              pages: observations.map((observation, index) => {
                const expected = peerIdentities.filter(
                  (identity) => identity !== client.grants[index].identity,
                );
                return {
                  status: observation.status,
                  expectedRemotePeers: expected.length,
                  receivedRemotePeers: observation.remoteIdentities.length,
                  receivedRemoteAudioTracks: observation.remoteTrackIdentities.length,
                  missingRemotePeers: expected.filter(
                    (identity) => !observation.remoteIdentities.includes(identity),
                  ).length,
                  missingRemoteAudioTracks: expected.filter(
                    (identity) => !observation.remoteTrackIdentities.includes(identity),
                  ).length,
                  activeAudioSamples: observation.activeAudioSamples,
                  decodedAudioSamples: observation.decodedAudioSamples,
                  iceStates: observation.iceStates,
                  statusHistory: observation.statusHistory,
                };
              }),
              browserErrors: client.browserErrors(),
            })}`,
            { cause: error },
          );
        }
        const observations = await Promise.all(client.pages.map(readObservations));
        process.stdout.write(
          JSON.stringify({
            kind: 'room-peer-set-ready',
            pages: observations.length,
            remoteTrackCounts: observations.map(
              ({ remoteTrackIdentities }) => remoteTrackIdentities.length,
            ),
            activeAudioSamples: observations.map(({ activeAudioSamples }) => activeAudioSamples),
          }) + '\n',
        );
        continue;
      }
      if (command.kind === 'read-refreshed-token') {
        if (!Number.isInteger(command.afterCount) || command.afterCount < 0)
          throw new Error('invalid token refresh baseline');
        const page = client.pages[1];
        await page.waitForFunction(
          (afterCount) => window.__mediaFixture.tokenRefreshCount > afterCount,
          command.afterCount,
          { timeout: 10000 },
        );
        const refreshed = await page.evaluate(() => ({
          token: window.__mediaFixture.refreshedToken,
          count: window.__mediaFixture.tokenRefreshCount,
        }));
        process.stdout.write(JSON.stringify({ kind: 'refreshed-token', ...refreshed }) + '\n');
        continue;
      }
      if (command.kind === 'token-refresh-count') {
        const page = client.pages[1];
        const count = await page.evaluate(() => window.__mediaFixture.tokenRefreshCount);
        process.stdout.write(JSON.stringify({ kind: 'token-refresh-count', count }) + '\n');
        continue;
      }
      if (command.kind === 'exercise-token-reconnect') {
        if (typeof command.token !== 'string' || command.token.length > 8192)
          throw new Error('invalid refreshed media token');
        const receiver = client.pages[1];
        const peerIdentities = client.grants
          .filter((_, peerIndex) => peerIndex !== 1)
          .map(({ identity }) => identity);
        const before = await readObservations(receiver);
        const peerBefore = await readObservations(client.pages[0]);
        await receiver.evaluate(() => window.postMessage({ kind: 'stop' }, location.origin));
        await receiver.waitForFunction(() => window.__mediaFixture.status === 'off', null, {
          timeout: 5000,
        });
        await receiver.evaluate(
          (grant) => window.postMessage({ kind: 'start', grant }, location.origin),
          { ...client.grants[1], token: command.token },
        );
        try {
          await receiver.waitForFunction(
            () => ['live', 'muted', 'error'].includes(window.__mediaFixture.status),
            null,
            { timeout: 10000 },
          );
        } catch (error) {
          const observation = withoutRefreshedToken(await readObservations(receiver));
          throw new Error(
            `refreshed LiveKit grant did not reach a terminal connection state: ${JSON.stringify({
              observation,
              expectedPeerIdentities: peerIdentities,
              browserErrors: client.browserErrors(),
              cause: error instanceof Error ? error.message : 'unknown',
            })}`,
            { cause: error },
          );
        }
        const admittedMuted = withoutRefreshedToken(await readObservations(receiver));
        if (admittedMuted.status !== 'muted')
          throw new Error(
            `a fresh media session did not require explicit microphone intent: ${JSON.stringify({
              observation: admittedMuted,
              browserErrors: client.browserErrors(),
            })}`,
          );
        try {
          await receiver.waitForFunction(
            ({ identities, samples }) =>
              window.__mediaFixture.status === 'muted' &&
              identities.length === window.__mediaFixture.remoteIdentities.length &&
              identities.length === window.__mediaFixture.remoteTrackIdentities.length &&
              identities.every(
                (identity) =>
                  window.__mediaFixture.remoteIdentities.includes(identity) &&
                  window.__mediaFixture.remoteTrackIdentities.includes(identity),
              ) &&
              window.__mediaFixture.activeAudioSamples > samples + 5,
            { identities: peerIdentities, samples: before.activeAudioSamples },
            { timeout: 10000 },
          );
        } catch (error) {
          const observation = withoutRefreshedToken(await readObservations(receiver));
          throw new Error(
            `refreshed LiveKit grant did not restore muted-listener audio: ${JSON.stringify({
              observation,
              expectedPeerIdentities: peerIdentities,
              browserErrors: client.browserErrors(),
              cause: error instanceof Error ? error.message : 'unknown',
            })}`,
            { cause: error },
          );
        }
        const listening = await readObservations(receiver);
        await receiver.evaluate(() =>
          window.postMessage({ kind: 'toggle-microphone' }, location.origin),
        );
        await receiver.waitForFunction(() => window.__mediaFixture.status === 'live', null, {
          timeout: 10000,
        });
        await client.pages[0].waitForFunction(
          (samples) => window.__mediaFixture.activeAudioSamples > samples + 5,
          peerBefore.activeAudioSamples,
          { timeout: 10000 },
        );
        const observation = await readObservations(receiver);
        const resumedPeer = await readObservations(client.pages[0]);
        process.stdout.write(
          JSON.stringify({
            kind: 'token-reconnect',
            live: observation.status === 'live',
            resumedSamples: observation.activeAudioSamples - before.activeAudioSamples,
            mutedBeforeExplicitIntent: admittedMuted.status === 'muted',
            decodedWhileMuted: listening.activeAudioSamples > before.activeAudioSamples,
            peerResumedSamples: resumedPeer.activeAudioSamples - peerBefore.activeAudioSamples,
            remoteIdentityPresent: peerIdentities.every(
              (identity) =>
                observation.remoteIdentities.includes(identity) &&
                observation.remoteTrackIdentities.includes(identity),
            ),
          }) + '\n',
        );
        continue;
      }
      if (command.kind !== 'stop') continue;
      const result = await client.stop();
      if (!result.stable || result.cutoffMs > 8000)
        throw new Error('application-grant audio cutoff exceeded the eight-second budget');
      process.stdout.write(JSON.stringify({ kind: 'cutoff', ...result }) + '\n');
      return;
    }
  } finally {
    await client.close();
    input.close();
  }
  throw new Error('fixture input closed before cutoff measurement');
}
