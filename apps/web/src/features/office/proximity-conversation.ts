import type { ConversationUpdate } from '@gather/contracts';

export function latestProximityConversation(
  updates: ConversationUpdate[],
  participationId: string | null,
) {
  if (!participationId) return null;
  for (let index = updates.length - 1; index >= 0; index -= 1) {
    const update = updates[index]!;
    if (
      update.kind === 'proximity' &&
      update.state !== 'ended' &&
      update.participants.some((participant) => participant.participationId === participationId)
    ) {
      const terminal = updates.some(
        (candidate) =>
          candidate.kind === 'proximity' &&
          candidate.state === 'ended' &&
          candidate.conversationId === update.conversationId &&
          candidate.officeEpoch === update.officeEpoch &&
          candidate.version >= update.version,
      );
      if (terminal) continue;
      return update;
    }
  }
  return null;
}
