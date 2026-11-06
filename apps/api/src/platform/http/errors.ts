import { HttpException } from '@nestjs/common';

export function fail(status: number, code: string, message = code): never {
  throw new HttpException({ code, message }, status);
}
export function invariant(condition: unknown, status: number, code: string): asserts condition {
  if (!condition) fail(status, code);
}
