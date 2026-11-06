import { Injectable, Inject } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from './database.service.js';
import { IdentityModels } from '../../modules/identity/identity.models.js';
import { TenancyModels } from '../../modules/tenancy/tenancy.models.js';
import { AuditService } from '../../modules/audit/audit.service.js';
import { OutboxService } from '../../modules/identity/delivery/outbox.service.js';
import type { ApiEnvironment } from '../config/environment.js';

@Injectable()
export class IndexesService implements OnApplicationBootstrap {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
    @Inject(IdentityModels) private readonly identity: IdentityModels,
    @Inject(TenancyModels) private readonly tenancy: TenancyModels,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}
  async create() {
    await this.identity.createIndexes();
    await this.tenancy.createIndexes();
    await this.audit.model.createIndexes();
    await this.outbox.model.createIndexes();
  }
  async onApplicationBootstrap() {
    const hello = await this.db.connection.db!.admin().command({ hello: 1 });
    if (!hello['setName'] && hello['msg'] !== 'isdbgrid')
      throw new Error('Authentication requires a transaction-capable MongoDB replica set');
    if (this.config.get('DB_AUTO_INDEX', { infer: true }) === 'true') await this.create();
    // Refuse to serve without the uniqueness constraints used by account/tenant operations.
    const required = [
      { model: this.identity.users, key: 'normalizedEmail' },
      { model: this.identity.credentials, key: 'userId' },
      { model: this.identity.sessions, key: 'tokenDigest' },
      { model: this.identity.tokens, key: 'tokenDigest' },
      { model: this.tenancy.workspaces, key: 'slug' },
      { model: this.tenancy.invitations, key: 'tokenDigest' },
    ];
    for (const { model, key } of required) {
      const indexes = await model.collection.indexes();
      if (!indexes.some((index) => index.unique && key in index.key))
        throw new Error(
          `Missing required unique index: ${model.collection.name}/${key}. Run db:indexes.`,
        );
    }
    const memberships = await this.tenancy.memberships.collection.indexes();
    if (
      !memberships.some(
        (index) => index.unique && 'workspaceId' in index.key && 'userId' in index.key,
      )
    )
      throw new Error('Missing unique membership index. Run db:indexes.');
  }
}
