/** Fixture-only guard process. No controller leases or production privileges are installed here. */
import { TokenVerifier } from '../../apps/api/node_modules/livekit-server-sdk/dist/AccessToken.js';
import { createSignalingGuard } from './signaling-guard.mjs';
import { RetirementStore } from './retirement-store.mjs';
const { CP07_KEY, CP07_SECRET, CP07_ORIGIN, CP07_RETIREMENTS } = process.env;
if (!CP07_KEY || !CP07_SECRET || !CP07_ORIGIN || !CP07_RETIREMENTS)
  throw new Error('missing fixture configuration');
const verifier = new TokenVerifier(CP07_KEY, CP07_SECRET);
const guard = createSignalingGuard({
  upstream: 'http://127.0.0.1:7880',
  origin: CP07_ORIGIN,
  authorize: async (token) => {
    const claims = await verifier.verify(token, 0);
    const retired = new RetirementStore(CP07_RETIREMENTS);
    return (
      claims.video?.roomJoin === true &&
      claims.video?.room === 'cutoff-fixture' &&
      ['publisher', 'receiver'].includes(claims.sub) &&
      !retired.has(claims.video.room)
    );
  },
});
guard.server.listen(7885, '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    guard.close();
    process.exit(0);
  });
