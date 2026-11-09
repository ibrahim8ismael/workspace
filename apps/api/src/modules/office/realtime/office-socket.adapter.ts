import type { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
import { OFFICE_LIMITS } from '@gather/contracts';

export class OfficeSocketAdapter extends IoAdapter {
  private readonly connectionAttempts = new Map<string, { windowStart: number; count: number }>();
  private readonly maxTrackedAddresses = 10_000;

  constructor(
    app: INestApplication,
    private readonly appOrigin: string,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const serverOptions = {
      ...options,
      path: '/socket.io',
      serveClient: false,
      transports: ['websocket'],
      maxHttpBufferSize: OFFICE_LIMITS.maxInboundEventBytes,
      connectTimeout: OFFICE_LIMITS.socketHandshakeTimeoutMs,
      allowRequest: (request, callback) => {
        const allowedOrigin = request.headers.origin === this.appOrigin;
        const remoteAddress = request.socket.remoteAddress;
        const now = Date.now();
        for (const [address, bucket] of this.connectionAttempts) {
          if (now - bucket.windowStart >= 60_000) this.connectionAttempts.delete(address);
        }
        let allowedRate = false;
        if (remoteAddress) {
          const bucket = this.connectionAttempts.get(remoteAddress);
          if (!bucket || now - bucket.windowStart >= 60_000) {
            if (bucket || this.connectionAttempts.size < this.maxTrackedAddresses) {
              this.connectionAttempts.set(remoteAddress, { windowStart: now, count: 1 });
              allowedRate = true;
            }
          } else if (bucket.count < OFFICE_LIMITS.socketConnectionsPerIpPerMinute) {
            bucket.count += 1;
            allowedRate = true;
          }
        }
        callback(null, allowedOrigin && allowedRate);
      },
      // Socket.IO recovery is intentionally off; reconnect requires a fresh HTTP ticket.
    } satisfies Partial<ServerOptions>;
    // Socket.IO applies defaults to options not specified here; its public type marks those
    // defaulted constructor options as required even though callers can omit them.
    return super.createIOServer(port, serverOptions as ServerOptions);
  }
}
