import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { PermitState } from '../permit-state.mjs';
import {
  acknowledgePolicyInstallation,
  decodePolicyKey,
  pullPolicy,
  policySignature,
  validPolicySignature,
} from '../policy-pull.mjs';
const key = Buffer.alloc(32, 0x6b).toString('base64');
const permit = { generation: 'g', identity: 'u', room: 'r', sources: ['microphone'], version: 1 };
function transport(change = (body) => body, signingKey = key) {
  return async (_endpoint, request) => {
    assert.equal(
      validPolicySignature(key, request.body, request.headers['X-CP07-Signature']),
      true,
    );
    const body = JSON.stringify(
      change({ ...JSON.parse(request.body), sequence: 1, permits: [permit] }),
    );
    return new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'X-CP07-Signature': policySignature(signingKey, body),
      },
    });
  };
}
test('authenticated challenge-bound snapshot installs an exact permit', async () => {
  const state = new PermitState('epoch', () => 0);
  assert.equal(
    await pullPolicy({ endpoint: 'http://fixture', key, state, fetchImpl: transport() }),
    true,
  );
  assert.equal(state.allows({ ...permit, source: 'microphone' }), true);
});
test('wrong signatures, substituted challenges and unknown signed fields fail closed', async () => {
  for (const fetchImpl of [
    transport((b) => b, 'bad'),
    transport((b) => ({ ...b, nonce: 'old' })),
    transport((b) => ({ ...b, epoch: 'old' })),
    transport((b) => ({ ...b, extra: true })),
    transport((b) => ({ ...b, permits: [{ ...permit, role: 'owner' }] })),
  ]) {
    const state = new PermitState('epoch', () => 0);
    assert.equal(await pullPolicy({ endpoint: 'http://fixture', key, state, fetchImpl }), false);
    assert.equal(state.allows({ ...permit, source: 'microphone' }), false);
  }
});
test('successful earlier permits expire when controller becomes unavailable', async () => {
  let now = 0;
  const state = new PermitState('epoch', () => now);
  await pullPolicy({ endpoint: 'http://fixture', key, state, fetchImpl: transport() });
  now = 4999;
  assert.equal(
    await pullPolicy({
      endpoint: 'http://fixture',
      key,
      state,
      fetchImpl: async () => {
        throw Error('controller lost');
      },
    }),
    false,
  );
  now = 5000;
  assert.equal(state.allows({ ...permit, source: 'microphone' }), false);
});
test('oversized authenticated responses cannot install policy', async () => {
  const state = new PermitState('epoch', () => 0);
  assert.equal(
    await pullPolicy({
      endpoint: 'http://fixture',
      key,
      state,
      fetchImpl: async () =>
        new Response('x'.repeat(65537), { headers: { 'Content-Type': 'application/json' } }),
    }),
    false,
  );
});

test('installation acknowledgement is emitted only after authenticated successful install', async () => {
  const events = [];
  const state = new PermitState('epoch', () => 0);
  const options = {
    endpoint: 'http://fixture',
    key,
    state,
    onRequest: (challenge) => events.push(['request', challenge.nonce]),
    onInstalled: (snapshot) => events.push(['installed', snapshot.nonce]),
  };
  assert.equal(
    await pullPolicy({ ...options, fetchImpl: transport((b) => b, 'wrong-key') }),
    false,
  );
  assert.deepEqual(
    events.map((event) => event[0]),
    ['request'],
  );
  events.length = 0;
  assert.equal(await pullPolicy({ ...options, fetchImpl: transport() }), true);
  assert.deepEqual(
    events.map((event) => event[0]),
    ['request', 'installed'],
  );
  assert.equal(events[0][1], events[1][1]);
});

test('application install ACK is signed and progress is reported only after acceptance', async () => {
  const state = new PermitState('epoch', () => 0);
  const events = [];
  let challenge;
  const fetchImpl = async (endpoint, request) => {
    assert.equal(
      validPolicySignature(key, request.body, request.headers['X-CP07-Signature']),
      true,
    );
    if (endpoint.endsWith('/pull')) {
      challenge = JSON.parse(request.body);
      const body = JSON.stringify({ ...challenge, sequence: 7, permits: [permit] });
      return new Response(body, {
        headers: {
          'Content-Type': 'application/json',
          'X-CP07-Signature': policySignature(key, body),
        },
      });
    }

    const body = JSON.stringify({
      epoch: 'epoch',
      nonce: challenge.nonce,
      sequence: 7,
    });
    assert.equal(request.body, body);
    events.push('application-ack');
    const ackBody = JSON.stringify({ acknowledged: true, sequence: 7 });
    return new Response(ackBody, {
      headers: {
        'Content-Type': 'application/json',
        'X-CP07-Signature': policySignature(key, ackBody),
      },
    });
  };

  const installed = await pullPolicy({
    endpoint: 'http://fixture/pull',
    ackEndpoint: 'http://fixture/ack',
    key,
    state,
    fetchImpl,
    onInstalled: () => events.push('supervisor-progress'),
  });

  assert.equal(installed, true);
  assert.deepEqual(events, ['application-ack', 'supervisor-progress']);
  assert.equal(state.allows({ ...permit, source: 'microphone' }), true);
});

test('application ACK rejection suppresses supervisor progress and requires canonical 32-byte keys', async () => {
  const state = new PermitState('epoch', () => 0);
  let reportedProgress = false;
  const failedAckFetch = async (endpoint, request) => {
    if (endpoint.endsWith('/pull')) return transport()(endpoint, request);
    return new Response(JSON.stringify({ acknowledged: false, sequence: 1 }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  assert.equal(
    await pullPolicy({
      endpoint: 'http://fixture/pull',
      ackEndpoint: 'http://fixture/ack',
      key,
      state,
      fetchImpl: failedAckFetch,
      onInstalled: () => {
        reportedProgress = true;
      },
    }),
    false,
  );
  assert.equal(reportedProgress, false);
  assert.throws(() => decodePolicyKey('k'.repeat(32)));
  assert.throws(() => decodePolicyKey(Buffer.alloc(31).toString('base64')));
  assert.equal(decodePolicyKey(key).length, 32);
  const message = 'same raw key bytes in the API and guard';
  assert.equal(
    policySignature(key, message),
    createHmac('sha256', Buffer.alloc(32, 0x6b)).update(message).digest('hex'),
  );
});

test('standalone application acknowledgement rejects stale or malformed response bodies', async () => {
  const snapshot = { epoch: 'e'.repeat(64), nonce: 'a'.repeat(64), sequence: 3 };
  for (const value of [
    { acknowledged: true, sequence: 2 },
    { acknowledged: true, sequence: 3, extra: true },
    { acknowledged: false, sequence: 3 },
  ]) {
    assert.equal(
      await acknowledgePolicyInstallation({
        endpoint: 'http://fixture/ack',
        key,
        snapshot,
        fetchImpl: async (_endpoint, request) => {
          assert.equal(
            validPolicySignature(key, request.body, request.headers['X-CP07-Signature']),
            true,
          );
          const body = JSON.stringify(value);
          return new Response(body, {
            headers: {
              'Content-Type': 'application/json',
              'X-CP07-Signature': policySignature(key, body),
            },
          });
        },
      }),
      false,
    );
  }
});
