import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { ClientSession } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { outboxModel, encryptionKey, encryptMail } from '@gather/delivery';
import type { MailPayload } from '@gather/delivery';
import type { ApiEnvironment } from '../../../platform/config/environment.js';

@Injectable()
export class OutboxService {
  readonly model;
  private readonly key: Buffer;
  constructor(
    @InjectConnection() connection: Connection,
    @Inject(ConfigService) config: ConfigService<ApiEnvironment, true>,
  ) {
    this.model = outboxModel(connection);
    this.key = encryptionKey(config.get('OUTBOX_ENCRYPTION_KEY', { infer: true }));
  }
  async create(subjectId: string, payload: MailPayload, expiresAt: Date, session: ClientSession) {
    const id = randomUUID();
    await this.model.create(
      [
        {
          _id: id,
          subjectId,
          kind: payload.kind,
          payload: encryptMail(id, payload, this.key),
          state: 'pending',
          attempts: 0,
          expiresAt,
          cleanupAt: new Date(expiresAt.getTime() + 7 * 86400_000),
          createdAt: new Date(),
          deliveredAt: null,
        },
      ],
      { session },
    );
  }
  async expire(subjectId: string, kind: MailPayload['kind'], session: ClientSession) {
    await this.model.updateMany(
      { subjectId, kind, state: { $in: ['pending', 'queued'] } },
      { $set: { state: 'expired', payload: null } },
      { session },
    );
  }
}
