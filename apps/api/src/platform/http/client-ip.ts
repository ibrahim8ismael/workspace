import { isIP } from 'node:net';

function normalizeAddress(address: string): string {
  const value = address.trim();
  return value.toLowerCase().startsWith('::ffff:') ? value.slice(7) : value;
}

export function validProxyIpList(value: string): boolean {
  if (!value.trim()) return true;
  return value.split(',').every((entry) => {
    const address = normalizeAddress(entry);
    return address.length > 0 && isIP(address) !== 0;
  });
}

/** Resolve a client address only when the immediate network peer is an explicitly trusted proxy. */
export function clientIp(
  remoteAddress: string | undefined,
  forwardedFor: string | string[] | undefined,
  trustedProxyIps: string,
): string {
  const peer = remoteAddress ? normalizeAddress(remoteAddress) : '';
  if (!peer || isIP(peer) === 0) return 'unknown';

  const trusted = new Set(
    trustedProxyIps
      .split(',')
      .map(normalizeAddress)
      .filter((address) => address.length > 0 && isIP(address) !== 0),
  );
  if (!trusted.has(peer)) return peer;

  // The edge proxy replaces, rather than appends to, this header. Multiple values are
  // rejected so a caller cannot choose which hop a downstream layer trusts.
  if (typeof forwardedFor !== 'string' || forwardedFor.includes(',')) return peer;
  const address = normalizeAddress(forwardedFor);
  return address && isIP(address) !== 0 ? address : peer;
}
