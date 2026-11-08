import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';
import type { Model } from 'mongoose';
import { registerModel, schemaOptions } from '../../platform/database/models.js';

export interface UserRecord {
  _id: string;
  normalizedEmail: string;
  displayName: string;
  status: 'pending' | 'active' | 'suspended';
  verifiedAt: Date | null;
  authVersion: number;
  policyVersion: number;
  ownedWorkspaceCount: number;
  createdAt: Date;
}
export interface CredentialRecord {
  _id: string;
  userId: string;
  passwordHash: string;
  version: number;
  accessFence: number;
  changedAt: Date;
}
export interface SessionRecord {
  _id: string;
  tokenDigest: string;
  csrfSecret: string;
  kind: 'anonymous' | 'authenticated';
  userId: string | null;
  authVersion: number;
  version: number;
  createdAt: Date;
  absoluteExpiresAt: Date;
  idleExpiresAt: Date;
  revokedAt: Date | null;
  reauthenticatedAt: Date | null;
}
export interface AuthTokenRecord {
  _id: string;
  userId: string;
  purpose: 'verify-email' | 'reset-password';
  tokenDigest: string;
  authVersion: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}
export interface RateLimitRecord {
  _id: string;
  count: number;
  expiresAt: Date;
}

export const userSchema = new Schema<UserRecord>(
  {
    _id: { type: String, required: true },
    normalizedEmail: { type: String, required: true },
    displayName: { type: String, required: true },
    status: { type: String, enum: ['pending', 'active', 'suspended'], required: true },
    verifiedAt: { type: Date, default: null },
    authVersion: { type: Number, required: true },
    policyVersion: { type: Number, required: true },
    ownedWorkspaceCount: { type: Number, required: true },
    createdAt: { type: Date, required: true },
  },
  schemaOptions,
);
userSchema.index({ normalizedEmail: 1 }, { unique: true });
export const credentialSchema = new Schema<CredentialRecord>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    passwordHash: { type: String, required: true, select: false },
    version: { type: Number, required: true },
    accessFence: { type: Number, required: true, default: 0 },
    changedAt: { type: Date, required: true },
  },
  schemaOptions,
);
credentialSchema.index({ userId: 1 }, { unique: true });
export const sessionSchema = new Schema<SessionRecord>(
  {
    _id: { type: String, required: true },
    tokenDigest: { type: String, required: true, select: false },
    csrfSecret: { type: String, required: true, select: false },
    kind: { type: String, enum: ['anonymous', 'authenticated'], required: true },
    userId: { type: String, default: null },
    authVersion: { type: Number, required: true },
    version: { type: Number, required: true },
    createdAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    idleExpiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    reauthenticatedAt: { type: Date, default: null },
  },
  schemaOptions,
);
sessionSchema.index({ tokenDigest: 1 }, { unique: true });
sessionSchema.index({ userId: 1, revokedAt: 1 });
sessionSchema.index({ absoluteExpiresAt: 1 }, { expireAfterSeconds: 0 });
export const tokenSchema = new Schema<AuthTokenRecord>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    purpose: { type: String, enum: ['verify-email', 'reset-password'], required: true },
    tokenDigest: { type: String, required: true, select: false },
    authVersion: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true },
  },
  schemaOptions,
);
tokenSchema.index({ tokenDigest: 1 }, { unique: true });
tokenSchema.index({ userId: 1, purpose: 1 });
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const rateLimitSchema = new Schema<RateLimitRecord>(
  {
    _id: { type: String, required: true },
    count: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
  },
  schemaOptions,
);
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

userSchema.set('collection', 'users');
credentialSchema.set('collection', 'credentials');
sessionSchema.set('collection', 'sessions');
tokenSchema.set('collection', 'auth_tokens');
rateLimitSchema.set('collection', 'rate_limits');

@Injectable()
export class IdentityModels {
  readonly users: Model<UserRecord>;
  readonly credentials: Model<CredentialRecord>;
  readonly sessions: Model<SessionRecord>;
  readonly tokens: Model<AuthTokenRecord>;
  readonly rateLimits: Model<RateLimitRecord>;
  constructor(@InjectConnection() connection: Connection) {
    this.users = registerModel(connection, 'User', userSchema);
    this.credentials = registerModel(connection, 'Credential', credentialSchema);
    this.sessions = registerModel(connection, 'BrowserSession', sessionSchema);
    this.tokens = registerModel(connection, 'AuthToken', tokenSchema);
    this.rateLimits = registerModel(connection, 'RateLimit', rateLimitSchema);
  }
  async createIndexes() {
    for (const model of [this.users, this.credentials, this.sessions, this.tokens, this.rateLimits])
      await model.createIndexes();
  }
}
