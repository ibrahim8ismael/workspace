import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Schema } from 'mongoose';
import type { Connection, Model } from 'mongoose';
import { registerModel, schemaOptions } from '../../platform/database/models.js';

export interface OfficeJoinTicketRecord {
  _id: string;
  ticketDigest: string;
  userId: string;
  sessionId: string;
  workspaceId: string;
  officeId: string;
  membershipGrantId: string;
  officeEpoch: string;
  mapVersion: string;
  protocolVersion: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

const officeJoinTicketSchema = new Schema<OfficeJoinTicketRecord>(
  {
    _id: { type: String, required: true },
    ticketDigest: { type: String, required: true, select: false },
    userId: { type: String, required: true },
    sessionId: { type: String, required: true },
    workspaceId: { type: String, required: true },
    officeId: { type: String, required: true },
    membershipGrantId: { type: String, required: true },
    officeEpoch: { type: String, required: true },
    mapVersion: { type: String, required: true },
    protocolVersion: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true },
  },
  schemaOptions,
);
officeJoinTicketSchema.index({ ticketDigest: 1 }, { unique: true });
officeJoinTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
officeJoinTicketSchema.set('collection', 'office_join_tickets');

@Injectable()
export class OfficeJoinTicketModels {
  readonly tickets: Model<OfficeJoinTicketRecord>;

  constructor(@InjectConnection() connection: Connection) {
    this.tickets = registerModel(connection, 'OfficeJoinTicket', officeJoinTicketSchema);
  }

  async createIndexes() {
    await this.tickets.createIndexes();
  }
}
