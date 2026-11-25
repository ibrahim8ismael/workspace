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

test('replacement policy waits for the old generation forwarding cutoff', async () => {
  const { state } = fixture();
  const replacement = { ...permit, generation: 'g2', room: 'r2' };
  const firstPull = state.beginPull('initial');
  assert.equal(
    await state.installWithRetirement(
      { ...firstPull, sequence: 1, permits: [permit] },
      async () => true,
    ),
    true,
  );
  assert.equal(state.allows(query), true);

  const nextPull = state.beginPull('replacement');
  let roomWasClosed = false;
  assert.equal(
    await state.installWithRetirement(
      { ...nextPull, sequence: 2, permits: [replacement] },
      async (generation) => {
        assert.equal(generation, 'g1');
        assert.equal(state.allows(query), false);
        assert.equal(state.allows({ ...replacement, source: 'microphone' }), false);
        roomWasClosed = true;
        return true;
      },
    ),
    true,
  );
  assert.equal(roomWasClosed, true);
  assert.equal(state.allows({ ...replacement, source: 'microphone' }), true);
  assert.equal(state.allows(query), false);

  const replay = state.beginPull('replay-retired');
  assert.equal(
    await state.installWithRetirement(
      { ...replay, sequence: 3, permits: [permit] },
      async () => true,
    ),
    false,
  );
});

test('failed room retirement leaves the guard denied and does not install replacement permits', async () => {
  const { state } = fixture();
  const firstPull = state.beginPull('initial');
  assert.equal(state.install({ ...firstPull, sequence: 1, permits: [permit] }), true);
  const replacement = { ...permit, generation: 'g2', room: 'r2' };
  const failedPull = state.beginPull('failed-retirement');
  assert.equal(
    await state.installWithRetirement(
      { ...failedPull, sequence: 2, permits: [replacement] },
      async () => false,
    ),
    false,
  );
  assert.equal(state.allows(query), false);
  assert.equal(state.allows({ ...replacement, source: 'microphone' }), false);

  const retry = state.beginPull('retry-retirement');
  assert.equal(
    await state.installWithRetirement(
      { ...retry, sequence: 3, permits: [replacement] },
      async (generation) => generation === 'g1',
    ),
    true,
  );
  assert.equal(state.allows({ ...replacement, source: 'microphone' }), true);
});

test('membership changes cannot narrow permits inside a still-active generation', async () => {
  const { state } = fixture();
  const firstPull = state.beginPull('initial');
  assert.equal(state.install({ ...firstPull, sequence: 1, permits: [permit] }), true);
  const changedRoster = { ...permit, identity: 'u2' };
  const update = state.beginPull('same-generation-roster-change');
  assert.equal(
    await state.installWithRetirement(
      { ...update, sequence: 2, permits: [permit, changedRoster] },
      async (generation) => generation === 'g1',
    ),
    false,
  );
  assert.equal(state.allows(query), false);
  assert.equal(state.allows({ ...changedRoster, source: 'microphone' }), false);
});

test('stable meeting room roster changes install in place and retire only after final departure', async () => {
  const { state } = fixture();
  const first = { ...permit, roomLifecycle: 'stable' };
  const second = { ...first, identity: 'u2' };
  const reconciledRosters = [];
  let sequence = 1;
  const install = async (permits) => {
    const pull = state.beginPull('stable-' + sequence);
    const current = sequence++;
    return state.installWithRetirement(
      { ...pull, sequence: current, permits },
      async () => assert.fail('a non-empty stable meeting must not retire its room'),
      async (generation, meetingPermits) => {
        assert.equal(generation, first.generation);
        reconciledRosters.push(meetingPermits.map(({ identity }) => identity));
        return true;
      },
    );
  };

  assert.equal(await install([first]), true);
  assert.deepEqual(reconciledRosters, [['u1']]);
  assert.equal(await install([first, second]), true);
  assert.deepEqual(reconciledRosters, [['u1'], ['u1', 'u2']]);
  assert.equal(state.allows({ ...first, source: 'microphone' }), true);
  assert.equal(state.allows({ ...second, source: 'microphone' }), true);

  assert.equal(await install([second]), true);
  assert.deepEqual(reconciledRosters, [['u1'], ['u1', 'u2'], ['u2']]);
  assert.equal(state.allows({ ...first, source: 'microphone' }), false);
  assert.equal(state.allows({ ...second, source: 'microphone' }), true);

  const finalPull = state.beginPull('stable-final');
  assert.equal(
    await state.installWithRetirement(
      { ...finalPull, sequence, permits: [] },
      async (generation) => generation === 'g1',
    ),
    true,
  );
  assert.equal(state.allows({ ...second, source: 'microphone' }), false);
  const replay = state.beginPull('stable-replay');
  assert.equal(
    await state.installWithRetirement(
      { ...replay, sequence: sequence + 1, permits: [first] },
      async () => true,
    ),
    false,
  );
});

test('stable roster reconciliation denies a removed identity while preserving survivors on failure', async () => {
  const { state } = fixture();
  const first = {
    ...permit,
    roomLifecycle: 'stable',
    sources: ['microphone', 'screen_share'],
  };
  const second = { ...first, identity: 'u2' };
  const install = async (sequence, permits, reconcile = async () => true) => {
    const pull = state.beginPull('stable-revoke-' + sequence);
    return state.installWithRetirement(
      { ...pull, sequence, permits },
      async () => assert.fail('a stable room roster update cannot retire the room'),
      reconcile,
    );
  };

  assert.equal(await install(1, [first, second]), true);
  let confirmedIdentities;
  assert.equal(
    await install(2, [second], async (generation, meetingPermits) => {
      assert.equal(generation, first.generation);
      confirmedIdentities = meetingPermits.map(({ identity }) => identity);
      assert.equal(state.allows({ ...first, source: 'microphone' }), false);
      assert.equal(state.allows({ ...first, source: 'screen_share' }), false);
      assert.equal(state.allows({ ...second, source: 'microphone' }), true);
      assert.equal(state.allows({ ...second, source: 'screen_share' }), true);
      return false;
    }),
    false,
  );
  assert.deepEqual(confirmedIdentities, ['u2']);
  assert.equal(state.allows({ ...first, source: 'microphone' }), false);
  assert.equal(state.allows({ ...first, source: 'screen_share' }), false);
  assert.equal(state.allows({ ...second, source: 'microphone' }), true);
  assert.equal(state.allows({ ...second, source: 'screen_share' }), true);

  assert.equal(
    await install(3, [second], async (_generation, meetingPermits) => {
      assert.deepEqual(
        meetingPermits.map(({ identity }) => identity),
        ['u2'],
      );
      return true;
    }),
    true,
  );
  assert.equal(state.allows({ ...second, source: 'microphone' }), true);
  assert.equal(state.allows({ ...second, source: 'screen_share' }), true);
});

test('stable meeting re-entry rotates only the returning participant credential', async () => {
  const { state } = fixture();
  const first = { ...permit, roomLifecycle: 'stable' };
  const survivor = { ...first, identity: 'u2' };
  const rejoined = { ...first, version: 2 };
  const install = async (sequence, permits, reconcile = async () => true) => {
    const pull = state.beginPull('stable-reentry-' + sequence);
    return state.installWithRetirement(
      { ...pull, sequence, permits },
      async () => assert.fail('a stable meeting re-entry cannot retire the room'),
      reconcile,
    );
  };

  assert.equal(await install(1, [first, survivor]), true);
  let targetPermits;
  assert.equal(
    await install(2, [rejoined, survivor], async (_generation, permits) => {
      targetPermits = permits;
      assert.equal(state.allows({ ...first, source: 'microphone' }), false);
      assert.equal(state.allows({ ...survivor, source: 'microphone' }), true);
      return true;
    }),
    true,
  );
  assert.deepEqual(targetPermits, [
    { identity: 'u1', version: 2, sources: ['microphone'] },
    { identity: 'u2', version: 1, sources: ['microphone'] },
  ]);
  assert.equal(state.allows({ ...first, source: 'microphone' }), false);
  assert.equal(state.allows({ ...rejoined, source: 'microphone' }), true);
  assert.equal(state.allows({ ...survivor, source: 'microphone' }), true);
});

test('stable meeting permits cannot move a live generation to a different room', async () => {
  const { state } = fixture();
  const stablePermit = { ...permit, roomLifecycle: 'stable' };
  const firstPull = state.beginPull('stable-room-first');
  assert.equal(
    await state.installWithRetirement(
      { ...firstPull, sequence: 1, permits: [stablePermit] },
      async () => true,
    ),
    true,
  );

  const replacement = state.beginPull('stable-room-replacement');
  let retiredRoom;
  assert.equal(
    await state.installWithRetirement(
      {
        ...replacement,
        sequence: 2,
        permits: [{ ...stablePermit, room: 'replacement-room' }],
      },
      async (generation) => {
        retiredRoom = generation;
        return true;
      },
    ),
    false,
  );
  assert.equal(retiredRoom, stablePermit.generation);
  assert.equal(state.allows({ ...stablePermit, source: 'microphone' }), false);
});
