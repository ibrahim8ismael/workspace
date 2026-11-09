import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
export const policySignature = (key, body) => createHmac('sha256', key).update(body).digest('hex');
export function validPolicySignature(key, body, signature) {
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(
    Buffer.from(policySignature(key, body), 'hex'),
    Buffer.from(signature, 'hex'),
  );
}
/** Authenticated, bounded policy transport; installation owns request-start expiry/sequence validation. */
export async function pullPolicy({
  endpoint,
  key,
  state,
  fetchImpl = fetch,
  onRequest = () => {},
  onInstalled = () => {},
}) {
  if (typeof key !== 'string' || Buffer.byteLength(key) < 32)
    throw new Error('policy key too short');
  const challenge = state.beginPull(randomBytes(32).toString('hex'));
  const body = JSON.stringify(challenge);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  try {
    onRequest(challenge);
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-CP07-Signature': policySignature(key, body),
      },
      body,
    });
    if (
      response.status !== 200 ||
      !response.body ||
      !response.headers.get('content-type')?.startsWith('application/json')
    )
      return false;
    const reader = response.body.getReader();
    let size = 0;
    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) {
          await reader.cancel();
          return false;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    if (!validPolicySignature(key, bytes, response.headers.get('X-CP07-Signature'))) return false;
    const snapshot = JSON.parse(bytes.toString('utf8'));
    if (
      !snapshot ||
      Object.keys(snapshot).sort().join(',') !== 'epoch,nonce,permits,sequence' ||
      !Array.isArray(snapshot.permits) ||
      snapshot.permits.length > 256 ||
      snapshot.permits.some(
        (permit) =>
          !permit ||
          Object.keys(permit).sort().join(',') !== 'generation,identity,room,sources,version',
      )
    )
      return false;
    if (!state.install(snapshot)) return false;
    onInstalled(snapshot);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
