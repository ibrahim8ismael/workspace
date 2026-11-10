/** Synthetic policy authority for the isolated CP07 fixture, not application policy. */
import http from 'node:http';
import { decodePolicyKey, policySignature, validPolicySignature } from './policy-pull.mjs';
const key = process.env.CP07_POLICY_KEY;
try {
  decodePolicyKey(key);
} catch {
  throw new Error('missing 32-byte base64 policy fixture key');
}
let sequence = 0;
let delayMs = 0;
process.on('SIGUSR1', () => {
  delayMs = 1500;
});
http
  .createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/policy') {
      res.writeHead(404);
      res.end();
      return;
    }
    let body = '';
    req.setTimeout(1000, () => req.destroy());
    try {
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 1024) {
          res.writeHead(413);
          res.end();
          return;
        }
      }
      if (!validPolicySignature(key, body, req.headers['x-cp07-signature'])) {
        res.writeHead(403);
        res.end();
        return;
      }
      const request = JSON.parse(body);
      if (
        Object.keys(request).sort().join(',') !== 'epoch,nonce' ||
        !/^[a-f0-9]{64}$/.test(request.epoch) ||
        !/^[a-f0-9]{64}$/.test(request.nonce)
      ) {
        res.writeHead(400);
        res.end();
        return;
      }
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const response = JSON.stringify({
        ...request,
        sequence: ++sequence,
        permits: [
          'publisher',
          'receiver',
          ...(process.env.CP07_COMPANIES === '1' ? ['publisher-b', 'receiver-b'] : []),
        ].map((identity) => ({
          generation: identity.endsWith('-b') ? 'company-b-fixture' : 'cutoff-fixture',
          identity,
          room: identity.endsWith('-b') ? 'company-b-fixture' : 'cutoff-fixture',
          version: 1,
          sources: ['microphone', 'camera'],
        })),
      });
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'X-CP07-Signature': policySignature(key, response),
      });
      res.end(response);
    } catch {
      res.writeHead(400);
      res.end();
    }
  })
  .listen(7886, '127.0.0.1');
