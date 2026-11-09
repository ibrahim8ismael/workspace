/** Initial engineering budgets; realtime admission and leases are enforced by the API. */
export const OFFICE_LIMITS = Object.freeze({
  maxParticipants: 20,
  maxMeetingParticipants: 6,
  maxInboundEventBytes: 4096,
  maxSnapshotBytes: 65536,
  maxWorldDimension: 32768,
  maxSeatStateEntries: 512,
  movementInputsPerSecond: 30,
  movementSpeedPixelsPerSecond: 192,
  movementIntentTimeoutMs: 250,
  simulationHz: 20,
  broadcastHz: 10,
  policyCheckIntervalMs: 1000,
  maxAuthorizationLeaseMs: 5000,
  socketPolicyCheckIntervalMs: 1000,
  socketHandshakeTimeoutMs: 5000,
  socketConnectionsPerIpPerMinute: 60,
  maxJoinTicketLifetimeMs: 30000,
  ticketWindowMs: 60000,
  ticketsPerActorPerWindow: 10,
  ticketsPerWorkspacePerWindow: 120,
  ticketsGloballyPerWindow: 1000,
  replayCacheEntries: 128,
  replayWindowMs: 30000,
  takeoverReferenceLifetimeMs: 30000,
});

/** Parsed-value guard; adapters must independently cap raw transport bytes before parsing. */
export function fitsJsonByteLimit(value: unknown, maxBytes: number): boolean {
  try {
    const json = JSON.stringify(value);
    return typeof json === 'string' && new TextEncoder().encode(json).byteLength <= maxBytes;
  } catch {
    return false;
  }
}
