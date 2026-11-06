import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    let status = 503;
    let code = 'service_unavailable';
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code =
        typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string'
          ? body.code
          : status === 404
            ? 'not_found'
            : status === 429
              ? 'rate_limited'
              : 'request_failed';
    } else if (exception instanceof Error && 'status' in exception && exception.status === 413) {
      status = 413;
      code = 'payload_too_large';
    } else if (
      exception instanceof SyntaxError &&
      'status' in exception &&
      exception.status === 400
    ) {
      status = 400;
      code = 'invalid_json';
    } else if (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      exception.code === 11000
    ) {
      status = 409;
      code = 'conflict';
    }
    if (status === 429) response.setHeader('Retry-After', '60');
    response.setHeader('Cache-Control', 'no-store');
    const requestId =
      typeof response.locals['requestId'] === 'string'
        ? response.locals['requestId']
        : randomUUID();
    response.status(status).json({ error: { code, message: code, requestId } });
    // Deliberately do not serialize exception objects, request bodies, URLs or headers.
  }
}
