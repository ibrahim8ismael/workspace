/**
 * Deny and retire an SFU generation. A failed participant observation is never
 * interpreted as an empty room; callers must not install replacement policy
 * unless this returns retired: true.
 */
export async function retireSfuGeneration({
  roomService,
  generation,
  timeoutMs = 3000,
  clock = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const startedAt = clock();
  const deadline = startedAt + timeoutMs;
  if (!roomService || typeof generation !== 'string' || !generation) {
    return { retired: false, durationMs: Math.max(0, clock() - startedAt) };
  }

  const observe = async () => {
    const rooms = await roomService.listRooms([generation]);
    const room = rooms.find((candidate) => candidate.name === generation);
    if (!room) return { room: null, participants: [] };
    const participants = await roomService.listParticipants(generation);
    if (!Array.isArray(participants)) throw new Error('invalid participant-list response');
    return { room, participants };
  };

  const removeParticipants = async (participants) => {
    await Promise.all(
      participants.map(async (participant) => {
        if (typeof participant.identity !== 'string' || !participant.identity)
          throw new Error('invalid SFU participant identity');
        // A failed removal is followed by a fresh authoritative observation. If
        // the participant remains, the loop retries until the cutoff deadline.
        await roomService
          .removeParticipant(generation, participant.identity)
          .catch(() => undefined);
      }),
    );
  };

  try {
    while (clock() < deadline) {
      const observed = await observe();
      if (!observed.room) {
        await sleep(100);
        const confirmed = await observe();
        if (!confirmed.room) return { retired: true, durationMs: Math.max(0, clock() - startedAt) };
        continue;
      }

      if (observed.participants.length > 0) {
        await removeParticipants(observed.participants);
        await roomService.deleteRoom(generation).catch(() => undefined);
        await sleep(50);
        continue;
      }

      const participantCount = Number(observed.room.numParticipants);
      if (!Number.isFinite(participantCount) || participantCount < 0) break;
      if (participantCount === 0) {
        await sleep(100);
        const confirmed = await observe();
        if (
          !confirmed.room ||
          (confirmed.participants.length === 0 && Number(confirmed.room.numParticipants) === 0)
        )
          return { retired: true, durationMs: Math.max(0, clock() - startedAt) };
      } else {
        await roomService.deleteRoom(generation).catch(() => undefined);
        await sleep(50);
      }
    }
  } catch {
    // Network, authorization, and participant-enumeration errors all fail closed.
  }

  return { retired: false, durationMs: Math.max(0, clock() - startedAt) };
}
