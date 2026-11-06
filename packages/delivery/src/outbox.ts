import { Schema } from 'mongoose';
import type { Connection, Model } from 'mongoose';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';

export const mailPayloadSchema = z
  .object({
    recipient: z.email(),
    kind: z.enum(['verify-email', 'reset-password', 'invitation']),
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    companyName: z.string().max(80).optional(),
  })
  .strict();
export type MailPayload = z.infer<typeof mailPayloadSchema>;
export interface EncryptedPayload {
  iv: string;
  tag: string;
  ciphertext: string;
  keyVersion: number;
}
export interface OutboxRecord {
  _id: string;
  subjectId: string;
  kind: MailPayload['kind'];
  payload: EncryptedPayload | null;
  state: 'pending' | 'queued' | 'delivered' | 'expired' | 'failed';
  attempts: number;
  expiresAt: Date;
  cleanupAt: Date;
  createdAt: Date;
  deliveredAt: Date | null;
}
const encryptedSchema = new Schema<EncryptedPayload>(
  {
    iv: { type: String, required: true },
    tag: { type: String, required: true },
    ciphertext: { type: String, required: true },
    keyVersion: { type: Number, required: true },
  },
  { _id: false },
);
export const outboxSchema = new Schema<OutboxRecord>(
  {
    _id: { type: String, required: true },
    subjectId: { type: String, required: true },
    kind: { type: String, enum: ['verify-email', 'reset-password', 'invitation'], required: true },
    payload: { type: encryptedSchema, default: null, select: false },
    state: {
      type: String,
      enum: ['pending', 'queued', 'delivered', 'expired', 'failed'],
      required: true,
    },
    attempts: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
    cleanupAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
    deliveredAt: { type: Date, default: null },
  },
  { versionKey: false, strict: 'throw', autoIndex: false },
);
outboxSchema.set('collection', 'outbox');
outboxSchema.index({ state: 1, createdAt: 1 });
outboxSchema.index({ subjectId: 1, kind: 1 });
outboxSchema.index({ cleanupAt: 1 }, { expireAfterSeconds: 0 });
export function outboxModel(connection: Connection): Model<OutboxRecord> {
  return (
    (connection.models['Outbox'] as Model<OutboxRecord> | undefined) ??
    connection.model<OutboxRecord>('Outbox', outboxSchema)
  );
}
export function encryptionKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded)
    throw new Error('OUTBOX_ENCRYPTION_KEY must be canonical base64 for 32 random bytes');
  return key;
}
export function encryptMail(id: string, value: MailPayload, key: Buffer): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(id));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(mailPayloadSchema.parse(value)), 'utf8'),
    cipher.final(),
  ]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    keyVersion: 1,
  };
}
export function decryptMail(id: string, value: EncryptedPayload, key: Buffer): MailPayload {
  if (value.keyVersion !== 1) throw new Error('Unsupported outbox key version');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
  decipher.setAAD(Buffer.from(id));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return mailPayloadSchema.parse(JSON.parse(plain));
}
