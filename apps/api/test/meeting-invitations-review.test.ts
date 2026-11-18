import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { describe, expect, it, vi } from 'vitest';
import { OFFICE_PROTOCOL_VERSION } from '@gather/contracts';
import { VIVO_GEOMETRY, canStep } from '@gather/world';
import type { WorldSnapshot } from '@gather/contracts';
import vivoManifest from '@gather/assets/manifests/vivo-map.json' with { type: 'json' };
import { OfficeRuntimeService } from '../dist/modules/office/runtime/office-runtime.service.js';
import { trustedOfficeMap } from '../dist/modules/office/office-map-registry.js';

const workspaceId = randomUUID();
const officeId = randomUUID();
const officeEpoch = randomUUID();
const zone = VIVO_GEOMETRY.zones.find((item) => item.kind === 'meeting')!;
const map = trustedOfficeMap(vivoManifest.mapVersion)!;
const inside = (tx: number, ty: number) =>
  tx >= zone.bounds.tx &&
  tx < zone.bounds.tx + zone.bounds.width &&
  ty >= zone.bounds.ty &&
  ty < zone.bounds.ty + zone.bounds.height;
const tiles = Array.from(
  { length: VIVO_GEOMETRY.widthTiles * VIVO_GEOMETRY.heightTiles },
  (_, index) => ({
    tx: index % VIVO_GEOMETRY.widthTiles,
    ty: Math.floor(index / VIVO_GEOMETRY.widthTiles),
  }),
).filter(
  (tile) =>
    map.validated.isReachable(tile) &&
    !map.seats.some((seat) => seat.tile.tx === tile.tx && seat.tile.ty === tile.ty),
);
const roomTiles = tiles.filter((tile) => inside(tile.tx, tile.ty));
const pixel = (tile: { tx: number; ty: number }) => ({
  x: tile.tx * 32 + 16,
  y: tile.ty * 32 + 16,
});

type Participant = {
  publicState: WorldSnapshot['participants'][number];
  meetingRoute?: { tx: number; ty: number }[];
  meetingInvitationId?: string;
};
function fixture(recipientInside = false, nearbyBeforeJoin = false) {
  const runtime = new OfficeRuntimeService();
  const people = [1, 2, 3].map((number) => {
    const ticket = {
      userId: `user-${number}`,
      displayName: `User ${number}`,
      sessionId: `session-${number}`,
      membershipGrantId: `grant-${number}`,
      workspaceId,
      officeId,
      officeEpoch,
      mapVersion: vivoManifest.mapVersion,
      protocolVersion: OFFICE_PROTOCOL_VERSION,
    };
    const socketId = `socket-${number}`;
    const reservation = runtime.reserve(ticket, socketId);
    return { ticket, socketId, id: reservation.participationId };
  });
  // Arrange deterministic server positions without spending this test on keyboard navigation.
  const office = (
    runtime as unknown as { offices: Map<string, { participants: Map<string, Participant> }> }
  ).offices.get(officeId)!;
  const sender = people[0]!;
  const recipient = people[1]!;
  const other = people[2]!;
  const state = (id: string) => office.participants.get(id)!;
  state(sender.id).publicState.position = pixel(roomTiles[0]!);
  state(recipient.id).publicState.position = recipientInside
    ? pixel(roomTiles[1]!)
    : { ...VIVO_GEOMETRY.spawn };
  state(other.id).publicState.position = pixel(tiles.find((tile) => !inside(tile.tx, tile.ty))!);
  if (nearbyBeforeJoin) {
    const neighbour = roomTiles.find((tile) =>
      canStep(roomTiles[0]!, tile, map.validated.bounds, map.validated.collision),
    )!;
    state(other.id).publicState.position = pixel(neighbour);
    runtime.setProximityOptIn(
      officeId,
      workspaceId,
      sender.ticket.userId,
      sender.socketId,
      sender.id,
      officeEpoch,
      true,
    );
    runtime.setProximityOptIn(
      officeId,
      workspaceId,
      other.ticket.userId,
      other.socketId,
      other.id,
      officeEpoch,
      true,
    );
  }
  const join = runtime.joinMeetingZone(
    officeId,
    workspaceId,
    sender.ticket.userId,
    sender.socketId,
    sender.id,
    officeEpoch,
    zone.zoneId,
  );
  expect(typeof join).toBe('object');
  const generation = runtime
    .proximityMediaPermits()
    .find((permit) => permit.identity === sender.id)!.generation;
  const meetingActive = runtime.activateProximityGeneration(generation)[0]!.update;
  runtime.drainMeetingNotices();
  const invite = () =>
    runtime.createMeetingInvitation(
      officeId,
      workspaceId,
      sender.ticket.userId,
      sender.socketId,
      sender.id,
      officeEpoch,
      recipient.id,
      zone.zoneId,
    );
  const respond = (id: string, decision: 'accept' | 'decline') =>
    runtime.respondMeetingInvitation(
      officeId,
      workspaceId,
      recipient.ticket.userId,
      recipient.socketId,
      recipient.id,
      officeEpoch,
      id,
      decision,
    );
  let now = performance.now();
  const tick = () => runtime.tick(officeId, (now += 50));
  return { runtime, sender, recipient, other, state, invite, respond, tick, meetingActive };
}

describe('meeting invitation review regressions', () => {
  it('keeps pending and declined invitations out of movement and media permissions', () => {
    const f = fixture();
    const position = { ...f.state(f.recipient.id).publicState.position };
    const invite = f.invite();
    expect(typeof invite).toBe('object');
    if (typeof invite === 'string') throw new Error(invite);
    for (let index = 0; index < 10; index++) f.tick();
    expect(f.state(f.recipient.id).publicState.position).toEqual(position);
    expect(
      f.runtime.proximityMediaPermits().some((permit) => permit.identity === f.recipient.id),
    ).toBe(false);
    expect(f.respond(invite.invitationId, 'decline')).toMatchObject({ status: 'declined' });
    expect(f.respond(invite.invitationId, 'accept')).toBe('conflict');
    expect(f.state(f.recipient.id).publicState.position).toEqual(position);
  });

  it('stops an accepted route immediately when its inviter disconnects', () => {
    const f = fixture();
    const invite = f.invite();
    if (typeof invite === 'string') throw new Error(invite);
    expect(f.respond(invite.invitationId, 'accept')).toMatchObject({ status: 'arriving' });
    const position = { ...f.state(f.recipient.id).publicState.position };
    f.runtime.release(
      officeId,
      workspaceId,
      f.sender.ticket.userId,
      f.sender.socketId,
      f.sender.id,
    );
    f.tick();
    expect(f.state(f.recipient.id).publicState.position).toEqual(position);
    expect(f.state(f.recipient.id).meetingRoute).toBeUndefined();
    expect(
      f.runtime.proximityMediaPermits().some((permit) => permit.identity === f.recipient.id),
    ).toBe(false);
  });

  it('admits an accepting recipient already standing in the destination', () => {
    const f = fixture(true);
    const invite = f.invite();
    if (typeof invite === 'string') throw new Error(invite);
    expect(f.respond(invite.invitationId, 'accept')).toMatchObject({ status: 'arriving' });
    f.tick();
    expect(
      f.runtime.proximityMediaPermits().some((permit) => permit.identity === f.recipient.id),
    ).toBe(true);
    expect(f.state(f.recipient.id).meetingInvitationId).toBeUndefined();
  });

  it('stops before moving when the sender leaves the destination meeting zone', () => {
    const f = fixture();
    const invite = f.invite();
    if (typeof invite === 'string') throw new Error(invite);
    expect(f.respond(invite.invitationId, 'accept')).toMatchObject({ status: 'arriving' });
    const position = { ...f.state(f.recipient.id).publicState.position };
    f.state(f.sender.id).publicState.position = { ...VIVO_GEOMETRY.spawn };
    f.tick();
    expect(f.state(f.recipient.id).publicState.position).toEqual(position);
    expect(f.state(f.recipient.id).meetingRoute).toBeUndefined();
  });

  it('cannot issue both meeting and proximity permits for the same participant', () => {
    const f = fixture();
    const senderTile = roomTiles[0]!;
    const neighbour = roomTiles.find((tile) =>
      canStep(senderTile, tile, map.validated.bounds, map.validated.collision),
    )!;
    expect(neighbour).toBeDefined();
    f.state(f.other.id).publicState.position = pixel(neighbour);
    f.runtime.setProximityOptIn(
      officeId,
      workspaceId,
      f.other.ticket.userId,
      f.other.socketId,
      f.other.id,
      officeEpoch,
      true,
    );
    f.runtime.setProximityOptIn(
      officeId,
      workspaceId,
      f.sender.ticket.userId,
      f.sender.socketId,
      f.sender.id,
      officeEpoch,
      true,
    );
    const permits = f.runtime
      .proximityMediaPermits()
      .filter((permit) => permit.identity === f.sender.id);
    expect(permits).toHaveLength(1);
  });
  it('moves along authoritative deltas and admits only after arrival', () => {
    const f = fixture();
    const invite = f.invite();
    if (typeof invite === 'string') throw new Error(invite);
    expect(f.respond(invite.invitationId, 'accept')).toMatchObject({ status: 'arriving' });
    const start = { ...f.state(f.recipient.id).publicState.position };
    let moved = false;
    let updates = 0;
    for (let index = 0; index < 1500 && f.state(f.recipient.id).meetingInvitationId; index++) {
      const before = { ...f.state(f.recipient.id).publicState.position };
      const update = f.tick();
      const after = f.state(f.recipient.id).publicState.position;
      if (before.x !== after.x || before.y !== after.y) moved = true;
      if (update?.delta.participants.some((person) => person.participationId === f.recipient.id))
        updates++;
      if (f.state(f.recipient.id).meetingInvitationId)
        expect(
          f.runtime.proximityMediaPermits().some((permit) => permit.identity === f.recipient.id),
        ).toBe(false);
    }
    expect(moved).toBe(true);
    expect(updates).toBeGreaterThan(1);
    expect(f.state(f.recipient.id).publicState.position).not.toEqual(start);
    expect(f.state(f.recipient.id).meetingInvitationId).toBeUndefined();
    expect(
      f.runtime.proximityMediaPermits().some((permit) => permit.identity === f.recipient.id),
    ).toBe(true);
    const snapshots = [f.sender, f.recipient].map((person) =>
      f.runtime.resync(
        officeId,
        workspaceId,
        person.ticket.userId,
        person.socketId,
        person.id,
        officeEpoch,
        0,
      ),
    );
    expect(snapshots.every((snapshot) => typeof snapshot === 'object')).toBe(true);
    if (typeof snapshots[0] === 'object' && typeof snapshots[1] === 'object') {
      const { serverTime: senderServerTime, ...senderSnapshot } = snapshots[0].snapshot;
      const { serverTime: recipientServerTime, ...recipientSnapshot } = snapshots[1].snapshot;
      expect(senderServerTime).toEqual(expect.any(Number));
      expect(recipientServerTime).toEqual(expect.any(Number));
      expect(senderSnapshot).toEqual(recipientSnapshot);
    }
    expect(f.respond(invite.invitationId, 'accept')).toBe('conflict');
  });

  it('rejects simultaneous invitations to an already reserved recipient', () => {
    const f = fixture();
    expect(typeof f.invite()).toBe('object');
    expect(f.invite()).toBe('conflict');
  });

  it('rejects a replayed invite command after its first invitation was declined', () => {
    const f = fixture();
    const eventId = randomUUID();
    const invite = () =>
      f.runtime.createMeetingInvitation(
        officeId,
        workspaceId,
        f.sender.ticket.userId,
        f.sender.socketId,
        f.sender.id,
        officeEpoch,
        f.recipient.id,
        zone.zoneId,
        Date.now(),
        eventId,
      );
    const first = invite();
    if (typeof first === 'string') throw new Error(first);
    expect(f.respond(first.invitationId, 'decline')).toMatchObject({ status: 'declined' });
    expect(invite()).toBe('conflict');
  });
  it('keeps simultaneous invites to different recipients valid across roster generations', () => {
    const f = fixture(true);
    f.state(f.other.id).publicState.position = pixel(roomTiles[2]!);
    const first = f.invite();
    const second = f.runtime.createMeetingInvitation(
      officeId,
      workspaceId,
      f.sender.ticket.userId,
      f.sender.socketId,
      f.sender.id,
      officeEpoch,
      f.other.id,
      zone.zoneId,
    );
    if (typeof first === 'string' || typeof second === 'string')
      throw new Error('Invitations rejected');
    expect(f.respond(first.invitationId, 'accept')).toMatchObject({ status: 'arriving' });
    expect(
      f.runtime.respondMeetingInvitation(
        officeId,
        workspaceId,
        f.other.ticket.userId,
        f.other.socketId,
        f.other.id,
        officeEpoch,
        second.invitationId,
        'accept',
      ),
    ).toMatchObject({ status: 'arriving' });
    f.tick();
    expect(
      f.runtime
        .proximityMediaPermits()
        .map((permit) => permit.identity)
        .sort(),
    ).toEqual([f.sender.id, f.recipient.id, f.other.id].sort());
  });
  it('stops with obstruction feedback if another member blocks the accepted path', () => {
    const f = fixture();
    const invite = f.invite();
    if (typeof invite === 'string') throw new Error(invite);
    f.respond(invite.invitationId, 'accept');
    f.runtime.drainMeetingInvitationNotices();
    const nextTile = f.state(f.recipient.id).meetingRoute![0]!;
    f.state(f.other.id).publicState.position = pixel(nextTile);
    const position = { ...f.state(f.recipient.id).publicState.position };
    f.tick();
    expect(f.state(f.recipient.id).publicState.position).toEqual(position);
    expect(f.state(f.recipient.id).meetingInvitationId).toBeUndefined();
    expect(
      f.runtime
        .drainMeetingInvitationNotices()
        .some(
          (notice) =>
            notice.invitation.status === 'cancelled' && notice.invitation.reason === 'obstructed',
        ),
    ).toBe(true);
  });

  it('expires pending invites without moving and permits a fresh invitation', () => {
    const f = fixture();
    const invite = f.invite();
    if (typeof invite === 'string') throw new Error(invite);
    const position = { ...f.state(f.recipient.id).publicState.position };
    const clock = vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 60_001);
    try {
      f.tick();
      expect(f.respond(invite.invitationId, 'accept')).toBe('conflict');
      expect(f.state(f.recipient.id).publicState.position).toEqual(position);
      expect(
        f.runtime
          .drainMeetingInvitationNotices()
          .some((notice) => notice.invitation.status === 'expired'),
      ).toBe(true);
    } finally {
      clock.mockRestore();
    }
    expect(typeof f.invite()).toBe('object');
  });

  it('cannot join twice if the recipient joined the room while an invitation was pending', () => {
    const f = fixture(true);
    const invite = f.invite();
    if (typeof invite === 'string') throw new Error(invite);
    expect(
      f.runtime.joinMeetingZone(
        officeId,
        workspaceId,
        f.recipient.ticket.userId,
        f.recipient.socketId,
        f.recipient.id,
        officeEpoch,
        zone.zoneId,
      ),
    ).toMatchObject({ notices: [] });
    expect(f.respond(invite.invitationId, 'accept')).toMatchObject({
      status: 'destination_unavailable',
    });
    f.tick();
    expect(
      f.runtime.proximityMediaPermits().filter((permit) => permit.identity === f.recipient.id),
    ).toHaveLength(1);
  });
  it('retires roster generations without ending the meeting for retained members', () => {
    const f = fixture(true);
    const invite = f.invite();
    if (typeof invite === 'string') throw new Error(invite);
    f.respond(invite.invitationId, 'accept');
    f.tick();
    const notices = f.runtime.drainMeetingNotices();
    expect(
      notices
        .filter((notice) => notice.socketIds.includes(f.sender.socketId))
        .map((notice) => notice.update.state),
    ).toEqual(['retiring', 'joining']);
    const generation = f.runtime
      .proximityMediaPermits()
      .find((permit) => permit.identity === f.sender.id)!.generation;
    const active = f.runtime.activateProximityGeneration(generation)[0]!.update;
    expect(active.participants).toHaveLength(2);
    f.runtime.leaveProximityConversation(
      officeId,
      workspaceId,
      f.recipient.ticket.userId,
      f.recipient.socketId,
      f.recipient.id,
      officeEpoch,
      active.conversationId,
      active.version,
    );
    const departed = f.runtime.drainMeetingNotices();
    expect(
      departed
        .filter((notice) => notice.update.state === 'ended')
        .flatMap((notice) => notice.socketIds),
    ).toEqual([f.recipient.socketId]);
    expect(
      departed
        .filter((notice) => notice.socketIds.includes(f.sender.socketId))
        .map((notice) => notice.update.state),
    ).toEqual(['retiring', 'joining']);
  });
  it('restores a prior nearby-voice preference after leaving a meeting', () => {
    const f = fixture(false, true);
    expect(
      f.runtime.proximityMediaPermits().filter((permit) => permit.identity === f.sender.id),
    ).toHaveLength(1);
    f.runtime.leaveProximityConversation(
      officeId,
      workspaceId,
      f.sender.ticket.userId,
      f.sender.socketId,
      f.sender.id,
      officeEpoch,
      f.meetingActive.conversationId,
      f.meetingActive.version,
    );
    f.runtime.reconcileProximity(officeId);
    const permits = f.runtime.proximityMediaPermits();
    const senderPermit = permits.find((permit) => permit.identity === f.sender.id)!;
    expect(senderPermit).toBeDefined();
    expect(permits.find((permit) => permit.identity === f.other.id)?.generation).toBe(
      senderPermit.generation,
    );
  });

  it('restores nearby voice after an accepted invitation route is cancelled', () => {
    const f = fixture();
    const spawnTile = {
      tx: Math.floor(VIVO_GEOMETRY.spawn.x / 32),
      ty: Math.floor(VIVO_GEOMETRY.spawn.y / 32),
    };
    const neighbour = tiles.find((tile) =>
      canStep(spawnTile, tile, map.validated.bounds, map.validated.collision),
    )!;
    f.state(f.other.id).publicState.position = pixel(neighbour);
    f.runtime.setProximityOptIn(
      officeId,
      workspaceId,
      f.recipient.ticket.userId,
      f.recipient.socketId,
      f.recipient.id,
      officeEpoch,
      true,
    );
    f.runtime.setProximityOptIn(
      officeId,
      workspaceId,
      f.other.ticket.userId,
      f.other.socketId,
      f.other.id,
      officeEpoch,
      true,
    );
    const invite = f.invite();
    if (typeof invite === 'string') throw new Error(invite);
    expect(f.respond(invite.invitationId, 'accept')).toMatchObject({ status: 'arriving' });
    expect(
      f.runtime.proximityMediaPermits().some((permit) => permit.identity === f.recipient.id),
    ).toBe(false);
    f.runtime.cancelMeetingInvitation(
      officeId,
      workspaceId,
      f.sender.ticket.userId,
      f.sender.socketId,
      f.sender.id,
      officeEpoch,
      invite.invitationId,
    );
    f.runtime.reconcileProximity(officeId);
    const permits = f.runtime.proximityMediaPermits();
    const recipientPermit = permits.find((permit) => permit.identity === f.recipient.id)!;
    expect(recipientPermit).toBeDefined();
    expect(permits.find((permit) => permit.identity === f.other.id)?.generation).toBe(
      recipientPermit.generation,
    );
  });
});
