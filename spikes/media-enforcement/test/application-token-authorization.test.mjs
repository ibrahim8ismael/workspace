import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applicationTokenAllowed } from '../application-token-authorization.mjs';
import { PermitState } from '../permit-state.mjs';

const identity = 'participation-uuid';
const room = 'generation-uuid';
const microphoneToken = {
  sub: identity,
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
});
