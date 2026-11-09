/** Verify the complete signed publication grant against the installed fixture permit. */
export function sourceGrantsAllowed(claims, permits) {
  if (claims.video?.canPublish !== true) return true;
  const sources = claims.video.canPublishSources;
  if (
    !Array.isArray(sources) ||
    !sources.length ||
    sources.length > 3 ||
    new Set(sources).size !== sources.length
  )
    return false;
  return sources.every(
    (source) =>
      ['microphone', 'camera', 'screen_share'].includes(source) &&
      (!permits ||
        permits.allows({
          generation: claims.video.room,
          identity: claims.sub,
          room: claims.video.room,
          version: 1,
          source,
        })),
  );
}
