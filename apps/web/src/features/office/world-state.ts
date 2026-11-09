import {
  worldDeltaForStateSchema,
  worldSnapshotSchema,
  type WorldDelta,
  type WorldSnapshot,
} from '@gather/contracts';

export type WorldApplyResult =
  { kind: 'applied'; snapshot: WorldSnapshot } | { kind: 'resync'; snapshot: WorldSnapshot };

export function applyWorldDelta(current: WorldSnapshot, raw: unknown): WorldApplyResult {
  const parsed = worldDeltaForStateSchema(current).safeParse(raw);
  if (!parsed.success) return { kind: 'resync', snapshot: current };
  const delta: WorldDelta = parsed.data;
  const removed = new Set(delta.removedParticipationIds);
  const participants = new Map(
    current.participants
      .filter((participant) => !removed.has(participant.participationId))
      .map((participant) => [participant.participationId, participant]),
  );
  for (const participant of delta.participants)
    participants.set(participant.participationId, participant);
  const candidate = {
    officeEpoch: delta.officeEpoch,
    stateVersion: delta.stateVersion,
    serverTime: delta.serverTime,
    participants: [...participants.values()],
    seats: delta.seats,
  };
  const checked = worldSnapshotSchema.safeParse(candidate);
  return checked.success
    ? { kind: 'applied', snapshot: checked.data }
    : { kind: 'resync', snapshot: current };
}
