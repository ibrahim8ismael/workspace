/** Experimental guard process; optional authenticated fixture policy leases, no application integration. */
import { TokenVerifier } from '../../apps/api/node_modules/livekit-server-sdk/dist/AccessToken.js';
import { createSignalingGuard } from './signaling-guard.mjs';
import { performance } from 'node:perf_hooks';
import { sourceGrantsAllowed } from './source-grants.mjs';
import { PermitState } from './permit-state.mjs';
import { pullPolicy } from './policy-pull.mjs';
import { RetirementStore } from './retirement-store.mjs';
const { CP07_KEY, CP07_SECRET, CP07_ORIGIN, CP07_RETIREMENTS } = process.env;
if (!CP07_KEY || !CP07_SECRET || !CP07_ORIGIN || !CP07_RETIREMENTS)
  throw new Error('missing fixture configuration');
const verifier = new TokenVerifier(CP07_KEY, CP07_SECRET);
const policyEnabled = Boolean(process.env.CP07_POLICY_ENDPOINT);
const epoch = 'media-fixture';
const permits = new PermitState(
  epoch,
  () => performance.now(),
  new RetirementStore(CP07_RETIREMENTS),
);
let pulling = false,
  version = 0;
const pull = async () => {
  if (!policyEnabled || pulling) return;
  pulling = true;
  const installedVersion = ++version;
  try {
    await pullPolicy({
      endpoint: process.env.CP07_POLICY_ENDPOINT,
      key: process.env.CP07_POLICY_KEY,
      state: permits,
      onRequest: ({ nonce }) =>
        process.stdout.write(
          JSON.stringify({ kind: 'expect', nonce, version: installedVersion }) + '\n',
        ),
      onInstalled: ({ nonce, sequence }) =>
        process.stdout.write(
          JSON.stringify({ kind: 'ack', epoch, nonce, sequence, version: installedVersion }) + '\n',
        ),
    });
  } finally {
    pulling = false;
  }
};
if (policyEnabled) {
  await pull();
  setInterval(pull, 500);
}

const guard = createSignalingGuard({
  upstream: 'http://127.0.0.1:7880',
  origin: CP07_ORIGIN,
  authorize: async (token) => {
    const claims = await verifier.verify(token, 0);
    const retired = new RetirementStore(CP07_RETIREMENTS);
    return (
      claims.video?.roomJoin === true &&
      ((claims.video?.room === 'cutoff-fixture' &&
        ['publisher', 'receiver'].includes(claims.sub)) ||
        (process.env.CP07_COMPANIES === '1' &&
          claims.video?.room === 'company-b-fixture' &&
          ['publisher-b', 'receiver-b'].includes(claims.sub))) &&
      !retired.has(claims.video.room) &&
      sourceGrantsAllowed(claims, policyEnabled ? permits : undefined) &&
      (!policyEnabled ||
        permits.allows({
          generation: claims.video.room,
          identity: claims.sub,
          room: claims.video.room,
          version: 1,
          source: 'microphone',
        }))
    );
  },
});
guard.server.listen(7885, '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    guard.close();
    process.exit(0);
  });
