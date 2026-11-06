import { decryptMail } from '@gather/delivery';
import type { Model } from 'mongoose';
import type { OutboxRecord, MailPayload } from '@gather/delivery';

export async function deliverOutbox(
  id: string,
  model: Model<OutboxRecord>,
  key: Buffer,
  send: (payload: MailPayload, expiresAt: Date) => Promise<void>,
) {
  const record = await model
    .findOne({ _id: id, state: { $in: ['pending', 'queued'] } })
    .select('+payload')
    .lean();
  if (!record) return;
  if (record.expiresAt.getTime() <= Date.now() || !record.payload) {
    await model.updateOne(
      { _id: id, state: { $in: ['pending', 'queued'] } },
      { $set: { state: 'expired', payload: null } },
    );
    return;
  }
  try {
    const payload = decryptMail(id, record.payload, key);
    await model.updateOne({ _id: id }, { $inc: { attempts: 1 } });
    await send(payload, record.expiresAt);
    await model.updateOne(
      { _id: id, state: { $in: ['pending', 'queued'] } },
      { $set: { state: 'delivered', payload: null, deliveredAt: new Date() } },
    );
  } catch {
    throw new Error('mail_delivery_failed');
  }
}
