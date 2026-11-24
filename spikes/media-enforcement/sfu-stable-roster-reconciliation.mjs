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
        permit.version < 1,
    ) ||
    new Set(permits.map((permit) => permit.identity)).size !== permits.length
  ) {
    return { reconciled: false, removed: 0, durationMs: Math.max(0, clock() - startedAt) };
  }

  const allowedVersions = new Map(permits.map((permit) => [permit.identity, permit.version]));
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
    if (!room) return { exists: false, unauthorized: [] };
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
        !allowedVersions.has(participant.identity) ||
        !matchesAuthorizationVersion(
          participant.metadata,
          allowedVersions.get(participant.identity),
        ),
    );
    return { exists: true, unauthorized };
  };

  let removed = 0;
  try {
    while (clock() < deadline) {
      const observed = await observe();
      if (observed.unauthorized.length === 0) {
        await sleep(100);
        const confirmed = await observe();
        if (confirmed.unauthorized.length === 0) {
          return {
            reconciled: true,
            removed,
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
      await sleep(50);
    }
  } catch {
    // SFU API, authorization, and participant-enumeration failures fail closed.
  }

  return { reconciled: false, removed, durationMs: Math.max(0, clock() - startedAt) };
}
