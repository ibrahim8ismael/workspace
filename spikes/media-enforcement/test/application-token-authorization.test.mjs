import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applicationTokenAllowed } from '../application-token-authorization.mjs';
import { PermitState } from '../permit-state.mjs';

const identity = 'participation-uuid';
const room = 'generation-uuid';
const microphoneToken = {
  sub: identity,
  metadata: JSON.stringify({ gatherMediaVersion: 1 }),
  video: {
    room,
    roomJoin: true,
    canPublish: true,
    canPublishSources: ['microphone'],
    canSubscribe: true,
    canPublishData: false,
  },
};
const permit = {
  generation: room,
  identity,
  room,
  version: 1,
  sources: ['microphone'],
};

test('application guard accepts a non-fixture identity only for an installed mic permit', () => {
  const state = new PermitState('epoch', () => 0);
  state.beginPull('nonce');
  assert.equal(
    state.install({ epoch: 'epoch', nonce: 'nonce', sequence: 1, permits: [permit] }),
    true,
  );
  assert.equal(applicationTokenAllowed(microphoneToken, state, new Set()), true);
});

test('application guard rejects stale, substituted, retired and overbroad grants', () => {
  const state = new PermitState('epoch', () => 0);
  state.beginPull('nonce');
  assert.equal(
    state.install({ epoch: 'epoch', nonce: 'nonce', sequence: 1, permits: [permit] }),
    true,
  );
  assert.equal(applicationTokenAllowed(microphoneToken, state, new Set([room])), false);
  assert.equal(
    applicationTokenAllowed({ ...microphoneToken, sub: 'other' }, state, new Set()),
    false,
  );
  assert.equal(
    applicationTokenAllowed(
      { ...microphoneToken, video: { ...microphoneToken.video, room: 'other-room' } },
      state,
      new Set(),
    ),
    false,
  );
  assert.equal(
    applicationTokenAllowed(
      {
        ...microphoneToken,
        video: { ...microphoneToken.video, canPublishSources: ['microphone', 'camera'] },
      },
      state,
      new Set(),
    ),
    false,
  );
  const empty = new PermitState('epoch', () => 0);
  empty.beginPull('nonce');
  assert.equal(empty.install({ epoch: 'epoch', nonce: 'nonce', sequence: 1, permits: [] }), true);
  assert.equal(applicationTokenAllowed(microphoneToken, empty, new Set()), false);
  assert.equal(
    applicationTokenAllowed(
      { ...microphoneToken, metadata: JSON.stringify({ gatherMediaVersion: 2 }) },
      state,
      new Set(),
    ),
    false,
  );
  assert.equal(
    applicationTokenAllowed({ ...microphoneToken, metadata: undefined }, state, new Set()),
    false,
  );
});

test('meeting media authorization versions cover microphone and future screen-share grants', () => {
  const state = new PermitState('epoch', () => 0);
  state.beginPull('nonce');
  const screenToken = {
    ...microphoneToken,
    metadata: JSON.stringify({ gatherMediaVersion: 3 }),
    video: {
      ...microphoneToken.video,
      canPublishSources: ['microphone', 'screen_share'],
    },
  };
  const screenPermit = {
    ...permit,
    version: 3,
    sources: ['microphone', 'screen_share'],
  };
  assert.equal(
    state.install({ epoch: 'epoch', nonce: 'nonce', sequence: 1, permits: [screenPermit] }),
    true,
  );
  assert.equal(applicationTokenAllowed(screenToken, state, new Set()), true);
  assert.equal(state.allows({ ...screenPermit, source: 'screen_share' }), true);
  assert.equal(state.allows({ ...screenPermit, source: 'microphone' }), true);
});

test('screen-share revocation denies the old credential while preserving installed microphone access', async () => {
  const state = new PermitState('epoch', () => 0);
  const screenPermit = {
    ...permit,
    roomLifecycle: 'stable',
    version: 3,
    sources: ['microphone', 'screen_share'],
  };
  let challenge = state.beginPull('screen-granted');
  assert.equal(
    await state.installWithRetirement(
      { ...challenge, sequence: 1, permits: [screenPermit] },
      async () => assert.fail('a stable screen grant cannot retire its room'),
      async () => true,
    ),
    true,
  );
  const oldScreenToken = {
    ...microphoneToken,
    metadata: JSON.stringify({ gatherMediaVersion: 3 }),
    video: { ...microphoneToken.video, canPublishSources: ['microphone', 'screen_share'] },
  };
  const microphoneOnly = { ...screenPermit, sources: ['microphone'] };
  challenge = state.beginPull('screen-revoked');
  let observedDuringReconciliation = false;
  assert.equal(
    await state.installWithRetirement(
      { ...challenge, sequence: 2, permits: [microphoneOnly] },
      async () => assert.fail('a stable source revoke cannot retire its room'),
      async (_generation, permits) => {
        observedDuringReconciliation = true;
        assert.deepEqual(permits, [{ identity, version: 3, sources: ['microphone'] }]);
        assert.equal(state.allows({ ...screenPermit, source: 'screen_share' }), false);
        assert.equal(state.allows({ ...screenPermit, source: 'microphone' }), true);
        return true;
      },
    ),
    true,
  );
  assert.equal(observedDuringReconciliation, true);
  assert.equal(applicationTokenAllowed(oldScreenToken, state, new Set()), false);
  assert.equal(state.allows({ ...screenPermit, source: 'screen_share' }), false);
  assert.equal(state.allows({ ...screenPermit, source: 'microphone' }), true);
  assert.equal(
    applicationTokenAllowed(
      { ...microphoneToken, metadata: JSON.stringify({ gatherMediaVersion: 3 }) },
      state,
      new Set(),
    ),
    true,
    'a fresh microphone-only credential remains usable after screen-share revocation',
  );
});
