import { sourceGrantsAllowed } from './source-grants.mjs';

/** Authorize an application-issued identity only against the currently installed permit. */
export function applicationTokenAllowed(claims, permits, retired) {
  const room = claims.video?.room;
  const identity = claims.sub;
  if (
    claims.video?.roomJoin !== true ||
    typeof room !== 'string' ||
    typeof identity !== 'string' ||
    !room ||
    !identity ||
    retired.has(room) ||
    !sourceGrantsAllowed(claims, permits)
  )
    return false;
  return permits.allows({
    generation: room,
    identity,
    room,
    version: 1,
    source: 'microphone',
  });
}
