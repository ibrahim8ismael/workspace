import { describe, expect, it } from 'vitest';
import {
  OFFICE_PROTOCOL_VERSION,
  MVP_MAP_ID,
  OFFICE_LIMITS,
  fitsJsonByteLimit,
  officeBootstrapResponseSchema,
  officeWorkspaceDetailResponseSchema,
  workspaceResponseSchema,
  joinTicketRequestSchema,
  joinTicketResponseSchema,
  officeSocketAuthSchema,
  worldInputEventSchema,
  presenceUpdateEventSchema,
  seatStandEventSchema,
  seatSitEventSchema,
  worldSnapshotSchema,
  worldDeltaForStateSchema,
  officeReadySchema,
  officeCommandAckSchema,
  officeClientEventNameSchema,
  officeClientEventSchemas,
} from '../dist/index.js';

const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const hash = 'a'.repeat(64);
const version = `${MVP_MAP_ID}-v1-${hash}`;
const manifest = {
  formatVersion: 1,
  mapId: MVP_MAP_ID,
  mapVersion: version,
  contentHash: hash,
  coordinateUnits: 'pixels',
  tileSize: 32,
  bounds: { width: 1664, height: 1600 },
  spawn: { x: 656, y: 1264 },
  geometryPath: `/maps/${version}.json`,
  assetManifestVersion: 'fixture-assets-v1',
};
const bootstrap = {
  workspaceId: id,
  officeId: other,
  mapVersion: version,
  protocolVersion: OFFICE_PROTOCOL_VERSION,
  manifest,
};
const participant = {
  participationId: id,
  displayName: 'Person',
  appearance: { bodyId: 'fixture-body', paletteId: 'fixture-palette' },
  position: { x: 656, y: 1264 },
  facing: 'south',
  availability: 'available',
  seatId: null,
  lastProcessedInputSequence: 0,
};
const snapshot = {
  officeEpoch: other,
  stateVersion: 1,
  serverTime: 1,
  participants: [participant],
  seats: [],
};
const command = { eventId: id, officeEpoch: other, payload: { sequence: 1, dx: 1, dy: 0 } };

describe('office v1 contracts (fixtures do not approve a map or grant access)', () => {
  it('preserves imported object:index seat IDs without accepting asset paths', () => {
    expect(
      seatSitEventSchema.safeParse({ ...command, payload: { seatId: 'chair_1:0' } }).success,
    ).toBe(true);
    expect(
      worldSnapshotSchema.safeParse({
        ...snapshot,
        participants: [{ ...participant, seatId: 'chair_1:0' }],
        seats: [{ seatId: 'chair_1:0', occupantParticipationId: id }],
      }).success,
    ).toBe(true);
    expect(
      seatSitEventSchema.safeParse({ ...command, payload: { seatId: '../private' } }).success,
    ).toBe(false);
  });
  it('allowlists event names without restoring legacy join/signaling/token commands', () => {
    expect(officeClientEventSchemas['world:input'].safeParse(command).success).toBe(true);
    for (const event of ['join', 'signal', 'media:token', 'chat', '__proto__', 'toString'])
      expect(officeClientEventNameSchema.safeParse(event).success).toBe(false);
    for (const event of officeClientEventNameSchema.options)
      expect(Object.hasOwn(officeClientEventSchemas, event)).toBe(true);
  });
  it('requires matching immutable map identity, a same-origin geometry reference and bounded spawn', () => {
    expect(officeBootstrapResponseSchema.safeParse(bootstrap).success).toBe(true);
    for (const changed of [
      { ...manifest, mapId: 'campus' },
      { ...manifest, contentHash: 'b'.repeat(64) },
      { ...manifest, geometryPath: 'https://untrusted.example/maps.json' },
      { ...manifest, geometryPath: '/maps/../private.json' },
      { ...manifest, geometryPath: `/maps/${MVP_MAP_ID}-v1-${'b'.repeat(64)}.json` },
      { ...manifest, spawn: { x: 1664, y: 100 } },
      { ...manifest, bounds: { width: Infinity, height: 1600 } },
      { ...manifest, adminKey: 'secret' },
    ])
      expect(
        officeBootstrapResponseSchema.safeParse({ ...bootstrap, manifest: changed }).success,
      ).toBe(false);
    expect(
      officeBootstrapResponseSchema.safeParse({ ...bootstrap, protocolVersion: 2 }).success,
    ).toBe(false);
    expect(
      officeBootstrapResponseSchema.safeParse({
        ...bootstrap,
        mapVersion: `${MVP_MAP_ID}-v1-${'b'.repeat(64)}`,
      }).success,
    ).toBe(false);
  });

  it('rejects a self-consistent Vivo manifest and other pre-commons map identities', () => {
    const vivoHash = 'c'.repeat(64);
    const vivoVersion = `vivo-v1-${vivoHash}`;
    const vivoManifest = {
      ...manifest,
      mapId: 'vivo',
      mapVersion: vivoVersion,
      contentHash: vivoHash,
      geometryPath: `/maps/${vivoVersion}.json`,
    };
    expect(
      officeBootstrapResponseSchema.safeParse({
        ...bootstrap,
        mapVersion: vivoVersion,
        manifest: vivoManifest,
      }).success,
    ).toBe(false);
    expect(
      joinTicketRequestSchema.safeParse({ mapVersion: vivoVersion, protocolVersion: 1 }).success,
    ).toBe(false);
    for (const changed of [
      { ...manifest, mapId: 'campus' },
      { ...manifest, mapId: 'vivo' },
      { ...manifest, mapVersion: `campus-v1-${hash}` },
      { ...manifest, mapVersion: `vivo-v1-${hash}` },
      { ...manifest, mapVersion: `commons-v2-${hash}` },
      { ...manifest, mapVersion: `commons-v1-${'B'.repeat(64)}` },
      { ...manifest, contentHash: 'b'.repeat(64) },
      { ...manifest, geometryPath: `/maps/vivo-v1-${hash}.json` },
      { ...manifest, geometryPath: `/maps/campus-v1-${hash}.json` },
      { ...manifest, geometryPath: `/maps/${version}.json/extra` },
      { ...manifest, mapVersion: 'pending-m0' },
    ])
      expect(
        officeBootstrapResponseSchema.safeParse({ ...bootstrap, manifest: changed }).success,
      ).toBe(false);
    expect(
      officeBootstrapResponseSchema.safeParse({
        ...bootstrap,
        mapVersion: 'pending-m0',
        manifest: { ...manifest, mapVersion: 'pending-m0' },
      }).success,
    ).toBe(false);
  });

  it('keeps the office detail extension out of existing workspace create responses', () => {
    const workspace = { id, name: 'Company', slug: 'company', role: 'owner', memberCount: 1 };
    expect(workspaceResponseSchema.safeParse({ workspace }).success).toBe(true);
    expect(
      officeWorkspaceDetailResponseSchema.safeParse({
        workspace: { ...workspace, officeId: other },
      }).success,
    ).toBe(true);
    expect(
      workspaceResponseSchema.safeParse({ workspace: { ...workspace, officeId: other } }).success,
    ).toBe(false);
  });

  it('does not accept client identities, takeover flags or pending maps in ordinary admission', () => {
    const body = { mapVersion: version, protocolVersion: 1 };
    const auth = { ticket: 'a'.repeat(43), protocolVersion: 1 };
    expect(joinTicketRequestSchema.safeParse(body).success).toBe(true);
    expect(officeSocketAuthSchema.safeParse(auth).success).toBe(true);
    for (const field of ['userId', 'role', 'workspaceId', 'takeover', 'spawn']) {
      expect(joinTicketRequestSchema.safeParse({ ...body, [field]: id }).success).toBe(false);
      expect(officeSocketAuthSchema.safeParse({ ...auth, [field]: id }).success).toBe(false);
    }
    expect(joinTicketRequestSchema.safeParse({ ...body, mapVersion: 'pending-m0' }).success).toBe(
      false,
    );
    expect(
      joinTicketResponseSchema.safeParse({
        ticket: auth.ticket,
        expiresAt: '2026-11-08T12:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      joinTicketResponseSchema.safeParse({
        ticket: auth.ticket,
        expiresAt: 'tomorrow',
        tokenDigest: 'secret',
      }).success,
    ).toBe(false);
  });

  it('accepts bounded intent, never client coordinates, speeds or role changes', () => {
    expect(worldInputEventSchema.safeParse(command).success).toBe(true);
    for (const payload of [
      { ...command.payload, x: 10 },
      { ...command.payload, speed: 1000 },
      { ...command.payload, dx: 2 },
      { ...command.payload, sequence: -1 },
      { ...command.payload, sequence: 4294967296 },
      { ...command.payload, sequence: 1.5 },
    ])
      expect(worldInputEventSchema.safeParse({ ...command, payload }).success).toBe(false);
    expect(worldInputEventSchema.safeParse({ ...command, userId: id }).success).toBe(false);
    expect(
      presenceUpdateEventSchema.safeParse({ ...command, payload: { availability: 'away' } })
        .success,
    ).toBe(true);
    expect(
      presenceUpdateEventSchema.safeParse({
        ...command,
        payload: { availability: 'available', role: 'owner' },
      }).success,
    ).toBe(false);
    expect(seatStandEventSchema.safeParse({ ...command, payload: { x: 300 } }).success).toBe(false);
  });

  it('rejects private projections, duplicate participants and inconsistent seat occupancy', () => {
    expect(worldSnapshotSchema.safeParse(snapshot).success).toBe(true);
    for (const field of [
      'userId',
      'sessionId',
      'email',
      'authVersion',
      'conversationId',
      'leaseDeadline',
    ]) {
      expect(
        worldSnapshotSchema.safeParse({
          ...snapshot,
          participants: [{ ...participant, [field]: id }],
        }).success,
      ).toBe(false);
    }
    expect(
      worldSnapshotSchema.safeParse({ ...snapshot, participants: [participant, participant] })
        .success,
    ).toBe(false);
    expect(
      worldSnapshotSchema.safeParse({
        ...snapshot,
        seats: [{ seatId: 'seat-1', occupantParticipationId: other }],
      }).success,
    ).toBe(false);
    expect(
      worldSnapshotSchema.safeParse({
        ...snapshot,
        participants: [{ ...participant, seatId: 'seat-1' }],
      }).success,
    ).toBe(false);
    expect(
      worldSnapshotSchema.safeParse({
        ...snapshot,
        participants: [{ ...participant, seatId: 'seat-1' }],
        seats: [{ seatId: 'seat-1', occupantParticipationId: id }],
      }).success,
    ).toBe(true);
  });

  it('requires fresh ready identity and the locally accepted epoch/base before applying a delta', () => {
    const ready = {
      workspaceId: id,
      officeId: other,
      mapVersion: version,
      protocolVersion: 1,
      participationId: id,
      snapshot,
    };
    expect(officeReadySchema.safeParse(ready).success).toBe(true);
    expect(officeReadySchema.safeParse({ ...ready, participationId: other }).success).toBe(false);
    const delta = {
      officeEpoch: other,
      baseVersion: 1,
      stateVersion: 2,
      serverTime: 2,
      participants: [],
      removedParticipationIds: [],
      seats: [],
    };
    const current = worldDeltaForStateSchema({ officeEpoch: other, stateVersion: 1 });
    expect(current.safeParse(delta).success).toBe(true);
    expect(current.safeParse({ ...delta, officeEpoch: id }).success).toBe(false);
    expect(current.safeParse({ ...delta, baseVersion: 0 }).success).toBe(false);
    expect(current.safeParse({ ...delta, stateVersion: 1 }).success).toBe(false);
    expect(
      worldDeltaForStateSchema({ officeEpoch: other, stateVersion: 2 }).safeParse(delta).success,
    ).toBe(false);
    expect(
      current.safeParse({ ...delta, participants: [participant], removedParticipationIds: [id] })
        .success,
    ).toBe(false);
  });

  it('keeps acknowledgements bounded and free of diagnostic/identity payloads', () => {
    const ack = { eventId: id, ok: false, error: { code: 'rate_limited', retryAfterMs: 1000 } };
    expect(officeCommandAckSchema.safeParse(ack).success).toBe(true);
    expect(
      officeCommandAckSchema.safeParse({ ...ack, error: { ...ack.error, stack: 'private' } })
        .success,
    ).toBe(false);
    expect(
      officeCommandAckSchema.safeParse({ ...ack, error: { ...ack.error, retryAfterMs: Infinity } })
        .success,
    ).toBe(false);
    expect(
      officeCommandAckSchema.safeParse({ eventId: id, ok: true, result: { sessionId: id } })
        .success,
    ).toBe(false);
  });

  it('bounds aggregate snapshots and rejects external avatar URLs', () => {
    const participants = Array.from({ length: 21 }, (_, index) => ({
      ...participant,
      participationId: `${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`,
    }));
    expect(worldSnapshotSchema.safeParse({ ...snapshot, participants }).success).toBe(false);
    const seats = Array.from({ length: 512 }, (_, index) => ({
      seatId: `seat-${index}-${'a'.repeat(70)}`,
      occupantParticipationId: null,
    }));
    const oversized = {
      ...snapshot,
      seats,
      participants: participants.slice(0, 20).map((value) => ({
        ...value,
        displayName: 'أ'.repeat(80),
        appearance: { bodyId: 'a'.repeat(80), paletteId: 'b'.repeat(80) },
      })),
    };
    expect(fitsJsonByteLimit(oversized, OFFICE_LIMITS.maxSnapshotBytes)).toBe(false);
    expect(worldSnapshotSchema.safeParse(oversized).success).toBe(false);
    expect(
      worldSnapshotSchema.safeParse({
        ...snapshot,
        participants: [
          {
            ...participant,
            appearance: { bodyId: 'https://untrusted.example/avatar.png', paletteId: 'blue' },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('counts UTF-8 bytes and rejects unencodable values rather than trusting character counts', () => {
    expect(fitsJsonByteLimit('é'.repeat(2048), OFFICE_LIMITS.maxInboundEventBytes)).toBe(false);
    expect(fitsJsonByteLimit('a'.repeat(4094), OFFICE_LIMITS.maxInboundEventBytes)).toBe(true);
    expect(fitsJsonByteLimit('a'.repeat(4095), OFFICE_LIMITS.maxInboundEventBytes)).toBe(false);
    expect(fitsJsonByteLimit(1n, OFFICE_LIMITS.maxInboundEventBytes)).toBe(false);
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(fitsJsonByteLimit(cycle, OFFICE_LIMITS.maxInboundEventBytes)).toBe(false);
  });
});
