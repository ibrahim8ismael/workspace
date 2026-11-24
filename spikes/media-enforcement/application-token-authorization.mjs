import { sourceGrantsAllowed } from './source-grants.mjs';

/** Authorize an application-issued identity only against the currently installed permit. */
export function applicationTokenAllowed(claims, permits, retired) {
  const room = claims.video?.room;
  const identity = claims.sub;
  let mediaVersion;
  try {
    const metadata = JSON.parse(claims.metadata);
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      Array.isArray(metadata) ||
      Object.keys(metadata).sort().join(',') !== 'gatherMediaVersion' ||
      !Number.isSafeInteger(metadata.gatherMediaVersion) ||
      metadata.gatherMediaVersion < 1
    )
      return false;
    mediaVersion = metadata.gatherMediaVersion;
  } catch {
    return false;
  }
  if (
    claims.video?.roomJoin !== true ||
    typeof room !== 'string' ||
    typeof identity !== 'string' ||
    !room ||
    !identity ||
    retired.has(room) ||
    !sourceGrantsAllowed(claims, permits, mediaVersion)
  )
    return false;
  return permits.allows({
    generation: room,
    identity,
    room,
    version: mediaVersion,
    source: 'microphone',
  });
}
