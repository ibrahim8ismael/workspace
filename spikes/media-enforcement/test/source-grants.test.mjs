import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceGrantsAllowed } from '../source-grants.mjs';
const claims = {
  sub: 'u',
  video: { room: 'r', canPublish: true, canPublishSources: ['microphone'] },
};
test('reject broad, duplicate, unknown and screen audio publication grants', () => {
  for (const canPublishSources of [
    undefined,
    [],
    ['microphone', 'microphone'],
    ['screen_share_audio'],
    ['unknown'],
  ])
    assert.equal(
      sourceGrantsAllowed({ ...claims, video: { ...claims.video, canPublishSources } }),
      false,
    );
});
test('all JWT sources must be individually authorized, not just one source', () => {
  const permits = {
    allows: (query) =>
      query.identity === 'u' && query.room === 'r' && query.source === 'microphone',
  };
  assert.equal(sourceGrantsAllowed(claims, permits), true);
  assert.equal(
    sourceGrantsAllowed(
      { ...claims, video: { ...claims.video, canPublishSources: ['microphone', 'camera'] } },
      permits,
    ),
    false,
  );
  assert.equal(
    sourceGrantsAllowed({ sub: 'receiver', video: { room: 'r', canPublish: false } }, permits),
    true,
  );
});
