import { Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { fail } from './errors.js';

@Injectable()
export class ValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}
  transform(value: unknown): unknown {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) fail(400, 'validation_failed');
    return parsed.data;
  }
}
