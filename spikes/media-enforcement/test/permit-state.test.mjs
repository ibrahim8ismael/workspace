import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermitState } from '../permit-state.mjs';

const permit = {
  generation: 'g1',
  identity: 'u1',
  room: 'r1',
  version: 1,
  sources: ['microphone'],
};
const query = { ...permit, source: 'microphone' };
function fixture() {
  let now = 0;
  const state = new PermitState('epoch', () => now);
  const install = (sequence, permits = [permit]) => {
    const pull = state.beginPull(`nonce-${sequence}`);
    return state.install({ ...pull, sequence, permits });
  };
  return {
    state,
    install,
    time: (value) => {
      now = value;
    },
  };
}
test('default deny and exact identity, room, source, version binding', () => {
  const { state, install } = fixture();
  assert.equal(state.allows(query), false);
  assert.equal(install(1), true);
  assert.equal(state.allows(query), true);
  for (const field of ['identity', 'room', 'source', 'generation', 'version'])
    assert.equal(state.allows({ ...query, [field]: 'wrong' }), false);
});
test('slow policy responses cannot extend request-start authorization deadlines', () => {
  const { state, time } = fixture();
  const pull = state.beginPull('nonce');
  time(4999);
  assert.equal(state.install({ ...pull, sequence: 1, permits: [permit] }), true);
  time(5000);
  assert.equal(state.allows(query), false);
  const late = state.beginPull('late');
  time(10000);
  assert.equal(state.install({ ...late, sequence: 2, permits: [permit] }), false);
});
test('reject stale sequences, wrong nonce and old guard epoch', () => {
  const { state, install } = fixture();
  assert.equal(install(2), true);
  assert.equal(install(1), false);
  for (const change of [{ nonce: 'wrong' }, { epoch: 'old' }]) {
    const pull = state.beginPull('nonce');
    assert.equal(state.install({ ...pull, sequence: 3, permits: [permit], ...change }), false);
  }
});
test('retired generations cannot be restored by later snapshots', () => {
  const { state, install } = fixture();
  install(1);
  state.retire('g1');
  assert.equal(state.allows(query), false);
  assert.equal(install(2), false);
  assert.equal(install(3, [{ ...permit, generation: 'g2' }]), true);
});
test('invalid snapshots are atomic and empty snapshots revoke existing permits', () => {
  const { state, install } = fixture();
  install(1);
  assert.equal(install(2, [permit, permit]), false);
  assert.equal(state.allows(query), true);
  assert.equal(install(3, []), true);
  assert.equal(state.allows(query), false);
});
