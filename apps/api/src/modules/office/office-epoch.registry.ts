import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

@Injectable()
export class OfficeEpochRegistry {
  private readonly epochs = new Map<string, string>();

  forOffice(officeId: string): string {
    let epoch = this.epochs.get(officeId);
    if (!epoch) {
      epoch = randomUUID();
      this.epochs.set(officeId, epoch);
    }
    return epoch;
  }

  current(officeId: string): string | null {
    return this.epochs.get(officeId) ?? null;
  }

  rotate(officeId: string): string {
    const epoch = randomUUID();
    this.epochs.set(officeId, epoch);
    return epoch;
  }
}
