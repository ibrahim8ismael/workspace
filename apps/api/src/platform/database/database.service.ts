import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { ClientSession } from 'mongoose';

@Injectable()
export class DatabaseService {
  constructor(@InjectConnection() readonly connection: Connection) {}
  async transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    return this.connection.transaction(work, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority', wtimeout: 5000 },
      readPreference: 'primary',
      maxCommitTimeMS: 5000,
    });
  }
}
