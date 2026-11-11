import { randomBytes } from 'node:crypto';

// A new epoch on every local guard process start prevents a previous process
// incarnation from reusing its in-memory permit sequence.
process.env.CP07_GUARD_EPOCH = randomBytes(32).toString('hex');
await import('../../spikes/media-enforcement/guard-process.mjs');
