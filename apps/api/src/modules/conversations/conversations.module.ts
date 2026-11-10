import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { TenancyModule } from '../tenancy/tenancy.module.js';
import { OfficeModule } from '../office/office.module.js';
import { ConversationModels } from './conversation.models.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';

@Module({
  imports: [IdentityModule, TenancyModule, OfficeModule],
  controllers: [ConversationsController],
  providers: [ConversationModels, ConversationsService],
  exports: [ConversationModels, ConversationsService],
})
export class ConversationsModule {}
