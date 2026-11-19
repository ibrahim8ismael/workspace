export type WorkspaceMemberIdentity = { userId: string; displayName: string };
export type OfficePresenceParticipant = {
  participationId: string;
  userId?: string;
  availability: 'available' | 'busy' | 'away';
};

export function deriveWorkspacePresence(
  members: readonly WorkspaceMemberIdentity[],
  participants: readonly OfficePresenceParticipant[],
  meetingParticipationIds: ReadonlySet<string>,
) {
  const uniqueMembers: WorkspaceMemberIdentity[] = [];
  const memberIds = new Set<string>();
  for (const member of members) {
    if (memberIds.has(member.userId)) continue;
    memberIds.add(member.userId);
    uniqueMembers.push(member);
  }
  const participantsByUser = new Map(
    participants.flatMap((participant) =>
      participant.userId ? [[participant.userId, participant] as const] : [],
    ),
  );
  const online = uniqueMembers.flatMap((member) => {
    const participant = participantsByUser.get(member.userId);
    return participant
      ? [
          {
            member,
            participant,
            inMeeting: meetingParticipationIds.has(participant.participationId),
          },
        ]
      : [];
  });
  const onlineIds = new Set(online.map(({ member }) => member.userId));
  return {
    online,
    offline: uniqueMembers.filter((member) => !onlineIds.has(member.userId)),
  };
}
