import 'reflect-metadata';
import { createConnection } from 'mongoose';
import { outboxModel } from '@gather/delivery';
import { IdentityModels } from '../../modules/identity/identity.models.js';
import { TenancyModels } from '../../modules/tenancy/tenancy.models.js';
import { AuditService } from '../../modules/audit/audit.service.js';
import { OfficeJoinTicketModels } from '../../modules/office/join-ticket.models.js';
import { ConversationModels } from '../../modules/conversations/conversation.models.js';
import { MediaWebhookModels } from '../../modules/media/media-webhook.models.js';

const uri = process.env['MONGODB_URI'];
if (!uri) throw new Error('MONGODB_URI is required');
const connection = await createConnection(uri, {
  autoIndex: false,
  serverSelectionTimeoutMS: 5000,
}).asPromise();
try {
  const hello = await connection.db!.admin().command({ hello: 1 });
  if (!hello['setName'] && hello['msg'] !== 'isdbgrid')
    throw new Error('A transaction-capable MongoDB replica set is required');
  await new IdentityModels(connection).createIndexes();
  await new TenancyModels(connection).createIndexes();
  await new OfficeJoinTicketModels(connection).createIndexes();
  await new ConversationModels(connection).createIndexes();
  await new MediaWebhookModels(connection).createIndexes();
  await new AuditService(connection).model.createIndexes();
  await outboxModel(connection).createIndexes();
  console.info('Backend indexes created. No indexes were dropped.');
} finally {
  await connection.close();
}
