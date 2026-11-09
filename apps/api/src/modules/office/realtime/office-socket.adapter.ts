import type { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
import { OFFICE_LIMITS } from '@gather/contracts';

export class OfficeSocketAdapter extends IoAdapter {
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
      allowRequest: (request, callback) => {
        callback(null, request.headers.origin === this.appOrigin);
      },
      // Socket.IO recovery is intentionally off; reconnect requires a fresh HTTP ticket.
    } satisfies Partial<ServerOptions>;
    // Socket.IO applies defaults to options not specified here; its public type marks those
    // defaulted constructor options as required even though callers can omit them.
    return super.createIOServer(port, serverOptions as ServerOptions);
  }
}
