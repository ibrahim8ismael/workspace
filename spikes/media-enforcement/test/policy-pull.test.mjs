import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermitState } from '../permit-state.mjs';
import { pullPolicy, policySignature, validPolicySignature } from '../policy-pull.mjs';
const key = 'k'.repeat(32);
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
