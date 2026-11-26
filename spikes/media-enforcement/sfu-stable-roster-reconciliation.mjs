import { TrackSource } from '../../apps/api/node_modules/livekit-server-sdk/dist/index.js';

const TRACK_SOURCE_VALUES = Object.freeze({
  camera: TrackSource.CAMERA,
  microphone: TrackSource.MICROPHONE,
  screen_share: TrackSource.SCREEN_SHARE,
});
const POLICY_SOURCES = new Set(Object.keys(TRACK_SOURCE_VALUES));

/** Remove unauthorized identities from a stable SFU room without interrupting its roster. */
export async function reconcileSfuStableRoster({
  roomService,
  generation,
  permits,
  timeoutMs = 3000,
  clock = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const startedAt = clock();
  const deadline = startedAt + timeoutMs;
  if (
    !roomService ||
    typeof generation !== 'string' ||
    !generation ||
    !Array.isArray(permits) ||
    permits.some(
      (permit) =>
        !permit ||
        typeof permit.identity !== 'string' ||
        !permit.identity ||
        !Number.isSafeInteger(permit.version) ||
        permit.version < 1 ||
        !Array.isArray(permit.sources) ||
        permit.sources.length < 1 ||
        new Set(permit.sources).size !== permit.sources.length ||
        permit.sources.some((source) => !POLICY_SOURCES.has(source)),
    ) ||
    new Set(permits.map((permit) => permit.identity)).size !== permits.length
  ) {
    return { reconciled: false, removed: 0, durationMs: Math.max(0, clock() - startedAt) };
  }

  const allowedPermits = new Map(permits.map((permit) => [permit.identity, permit]));
  const requestedPermissions = new Set();
  const matchesAuthorizationVersion = (metadata, expectedVersion) => {
    if (typeof metadata !== 'string') return false;
    try {
      const value = JSON.parse(metadata);
      return (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        value.gatherMediaVersion === expectedVersion
      );
    } catch {
      return false;
    }
  };
  const observe = async () => {
    const rooms = await roomService.listRooms([generation]);
    if (!Array.isArray(rooms)) throw new Error('invalid SFU room-list response');
    const room = rooms.find((candidate) => candidate.name === generation);
    if (!room) return { exists: false, unauthorized: [], permissionMismatches: [] };
    const participants = await roomService.listParticipants(generation);
    if (!Array.isArray(participants)) throw new Error('invalid participant-list response');
    if (
      participants.some(
        (participant) => typeof participant.identity !== 'string' || !participant.identity,
      )
    )
      throw new Error('invalid SFU participant identity');
    const unauthorized = participants.filter(
      (participant) =>
        !allowedPermits.has(participant.identity) ||
        !matchesAuthorizationVersion(
          participant.metadata,
          allowedPermits.get(participant.identity)?.version,
        ),
    );
    const permissionMismatches = participants.flatMap((participant) => {
      const permit = allowedPermits.get(participant.identity);
      if (!permit || unauthorized.includes(participant)) return [];
      const allowedSources = permit.sources.map((source) => TRACK_SOURCE_VALUES[source]);
      const currentSources = participant.permission?.canPublishSources;
      const permissionMatches =
        participant.permission?.canPublish === true &&
        Array.isArray(currentSources) &&
        currentSources.length === allowedSources.length &&
        allowedSources.every((source) => currentSources.includes(source));
      const hasUnauthorizedTrack = (participant.tracks ?? []).some(
        (track) => !allowedSources.includes(track.source),
      );
      return permissionMatches && !hasUnauthorizedTrack
        ? []
        : [
            {
              participant,
              permission: participant.permission
                ? {
                    ...participant.permission,
                    canPublish: true,
                    canPublishSources: allowedSources,
                  }
                : undefined,
            },
          ];
    });
    return { exists: true, unauthorized, permissionMismatches };
  };

  let removed = 0;
  let permissionsUpdated = 0;
  try {
    while (clock() < deadline) {
      const observed = await observe();
      if (observed.unauthorized.length === 0 && observed.permissionMismatches.length === 0) {
        await sleep(100);
        const confirmed = await observe();
        if (confirmed.unauthorized.length === 0 && confirmed.permissionMismatches.length === 0) {
          return {
            reconciled: true,
            removed,
            permissionsUpdated,
            durationMs: Math.max(0, clock() - startedAt),
          };
        }
      }

      const identitiesToRemove = new Set(
        observed.unauthorized.map((participant) => participant.identity),
      );
      await Promise.all(
        [...identitiesToRemove].map(async (identity) => {
          try {
            await roomService.removeParticipant(generation, identity);
            removed += 1;
          } catch {
            // Confirm removal from an authoritative fresh observation below.
          }
        }),
      );
      await Promise.all(
        observed.permissionMismatches.map(async ({ participant, permission }) => {
          if (!permission) return;
          const signature = JSON.stringify([participant.identity, permission.canPublishSources]);
          if (requestedPermissions.has(signature)) return;
          try {
            await roomService.updateParticipant(generation, participant.identity, { permission });
            requestedPermissions.add(signature);
            permissionsUpdated += 1;
          } catch {
            // Retry failed updates and confirm the effective permission from a fresh observation.
          }
        }),
      );
      await sleep(50);
    }
  } catch {
    // SFU API, authorization, and participant-enumeration failures fail closed.
  }

  return {
    reconciled: false,
    removed,
    permissionsUpdated,
    durationMs: Math.max(0, clock() - startedAt),
  };
}
