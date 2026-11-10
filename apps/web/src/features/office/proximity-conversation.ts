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
      update.participants.some((participant) => participant.participationId === participationId)
    )
      return update;
  }
  return null;
}
