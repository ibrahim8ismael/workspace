/* global window, location */
import { createInterface } from 'node:readline';
import { chromium } from '@playwright/test';

const FIXTURE_ARGS = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];

async function readObservations(page) {
  return page.evaluate(() => ({ ...window.__mediaFixture }));
}

export async function startApplicationMediaClient({ fixtureUrl, grants }) {
  if (
    typeof fixtureUrl !== 'string' ||
    !fixtureUrl.startsWith('http://127.0.0.1:') ||
    !Array.isArray(grants) ||
    grants.length !== 2 ||
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
    const pages = await Promise.all([browser.newPage(), browser.newPage()]);
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
    await Promise.all(pages.map((page) => page.goto(fixtureUrl)));
    await Promise.all(
      pages.map((page, index) =>
        page.evaluate(
          (grant) => window.postMessage({ kind: 'start', grant }, location.origin),
          grants[index],
        ),
      ),
    );
    await Promise.all(
      pages.map((page) =>
        page.waitForFunction(() => ['live', 'error'].includes(window.__mediaFixture.status), null, {
          timeout: 25000,
        }),
      ),
    );
    const initial = await Promise.all(pages.map(readObservations));
    if (initial.some(({ status }) => status !== 'live'))
      throw new Error(
        `application grant failed to join LiveKit: ${JSON.stringify({ initial, browserErrors })}`,
      );
    try {
      await Promise.all(
        pages.map((page, index) =>
          page.waitForFunction(
            (peerIdentity) =>
              window.__mediaFixture.status === 'live' &&
              window.__mediaFixture.remoteIdentities.includes(peerIdentity) &&
              window.__mediaFixture.activeAudioSamples >= 10,
            grants[index === 0 ? 1 : 0].identity,
            { timeout: 15000 },
          ),
        ),
      );
    } catch {
      const observations = await Promise.all(pages.map(readObservations));
      throw new Error(
        `application LiveKit audio was not mutual and active: ${JSON.stringify({ observations, browserErrors })}`,
      );
    }
    const observations = await Promise.all(pages.map(readObservations));
    return {
      observations,
      pages,
      grants,
      exerciseMuteUnmute: async () => {
        const sender = pages[0];
        const receiver = pages[1];
        const peerIdentity = grants[0].identity;
        const muteRequestedAt = Date.now();
        await sender.evaluate(() =>
          window.postMessage({ kind: 'toggle-microphone' }, location.origin),
        );
        await sender.waitForFunction(() => window.__mediaFixture.status === 'muted', null, {
          timeout: 5000,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
        const muted = await readObservations(receiver);
        await new Promise((resolve) => setTimeout(resolve, 500));
        const mutedAfterQuiet = await readObservations(receiver);
        const muteStable = muted.activeAudioSamples === mutedAfterQuiet.activeAudioSamples;

        const unmuteRequestedAt = Date.now();
        await sender.evaluate(() =>
          window.postMessage({ kind: 'toggle-microphone' }, location.origin),
        );
        await sender.waitForFunction(() => window.__mediaFixture.status === 'live', null, {
          timeout: 5000,
        });
        await receiver.waitForFunction(
          ({ identity, samples }) =>
            window.__mediaFixture.remoteIdentities.includes(identity) &&
            window.__mediaFixture.activeAudioSamples > samples + 5,
          { identity: peerIdentity, samples: mutedAfterQuiet.activeAudioSamples },
          { timeout: 8000 },
        );
        const resumed = await readObservations(receiver);
        const result = {
          muteCutoffMs: Math.max(0, muted.lastActiveAudioAt - muteRequestedAt),
          mutedSampleCount: mutedAfterQuiet.activeAudioSamples,
          muteStable,
          unmuteObservedMs: Math.max(0, resumed.lastActiveAudioAt - unmuteRequestedAt),
          resumedSampleCount: resumed.activeAudioSamples,
          resumed: resumed.remoteIdentities.includes(peerIdentity),
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
              (sampleCount) =>
                window.__mediaFixture.status === 'live' &&
                window.__mediaFixture.activeAudioSamples > sampleCount + 5,
              baseline[index].activeAudioSamples,
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
          observations: final,
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
      if (command.kind === 'exercise-reconnect') {
        process.stdout.write(JSON.stringify({ kind: 'reconnect-armed' }) + '\n');
        const result = await client.exerciseReconnect();
        process.stdout.write(JSON.stringify({ kind: 'media-reconnect', ...result }) + '\n');
        continue;
      }
      if (command.kind === 'read-refreshed-token') {
        const page = client.pages[1];
        await page.waitForFunction(() => window.__mediaFixture.refreshedToken.length > 0, null, {
          timeout: 10000,
        });
        const token = await page.evaluate(() => window.__mediaFixture.refreshedToken);
        process.stdout.write(JSON.stringify({ kind: 'refreshed-token', token }) + '\n');
        continue;
      }
      if (command.kind === 'exercise-token-reconnect') {
        if (typeof command.token !== 'string' || command.token.length > 8192)
          throw new Error('invalid refreshed media token');
        const receiver = client.pages[1];
        const peerIdentity = client.grants[0].identity;
        const before = await readObservations(receiver);
        await receiver.evaluate(() => window.postMessage({ kind: 'stop' }, location.origin));
        await receiver.waitForFunction(() => window.__mediaFixture.status === 'off', null, {
          timeout: 5000,
        });
        await receiver.evaluate(
          (grant) => window.postMessage({ kind: 'start', grant }, location.origin),
          { ...client.grants[1], token: command.token },
        );
        await receiver.waitForFunction(
          () => ['live', 'error'].includes(window.__mediaFixture.status),
          null,
          { timeout: 10000 },
        );
        await receiver.waitForFunction(
          ({ identity, samples }) =>
            window.__mediaFixture.status === 'live' &&
            window.__mediaFixture.remoteIdentities.includes(identity) &&
            window.__mediaFixture.activeAudioSamples > samples + 5,
          { identity: peerIdentity, samples: before.activeAudioSamples },
          { timeout: 10000 },
        );
        const observation = await readObservations(receiver);
        process.stdout.write(
          JSON.stringify({
            kind: 'token-reconnect',
            live: observation.status === 'live',
            resumedSamples: observation.activeAudioSamples - before.activeAudioSamples,
            remoteIdentityPresent: observation.remoteIdentities.includes(peerIdentity),
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
