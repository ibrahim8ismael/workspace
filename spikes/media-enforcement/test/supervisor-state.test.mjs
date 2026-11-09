import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SupervisorState } from '../supervisor-state.mjs';
function fixture(stop = async () => true) {
  let now = 0;
  const state = new SupervisorState({ epoch: 'guard-1', clock: () => now, stop });
  return {
    state,
    time: (value) => {
      now = value;
    },
  };
}
test('cold start without installation progress trips at the deadline', async () => {
  let calls = 0;
  const { state, time } = fixture(async () => {
    calls++;
    return true;
  });
  time(2999);
  assert.equal(await state.check(), 'healthy');
  time(3000);
  assert.equal(await state.check(), 'stopped');
  assert.equal(calls, 1);
  assert.equal(state.expectInstallation({ nonce: 'n', version: 1 }), false);
});
test('only exact installation ACKs renew progress; replay and wrong epochs fail', async () => {
  const { state, time } = fixture();
  state.expectInstallation({ nonce: 'n', version: 2 });
  const ack = { epoch: 'guard-1', nonce: 'n', version: 2, sequence: 1 };
  for (const change of [{ epoch: 'old' }, { nonce: 'wrong' }, { version: 1 }])
    assert.equal(state.acknowledge({ ...ack, ...change }), false);
  time(2000);
  assert.equal(state.acknowledge(ack), true);
  assert.equal(state.acknowledge(ack), false);
  time(5000);
  assert.equal(await state.check(), 'stopped');
});
test('late acknowledgements cannot revive a stalled guard', async () => {
  const { state, time } = fixture();
  state.expectInstallation({ nonce: 'n', version: 1 });
  time(3000);
  assert.equal(state.acknowledge({ epoch: 'guard-1', nonce: 'n', version: 1, sequence: 1 }), false);
  assert.equal(await state.check(), 'stopped');
});
test('failed stops remain latched and retry until independently confirmed', async () => {
  let calls = 0;
  const { state, time } = fixture(async () => {
    if (++calls === 1) throw new Error('unavailable');
    return calls > 2;
  });
  time(3000);
  assert.equal(await state.check(), 'stop-unconfirmed');
  assert.equal(await state.check(), 'stop-unconfirmed');
  assert.equal(await state.check(), 'stopped');
  assert.equal(await state.check(), 'stopped');
  assert.equal(calls, 3);
});
