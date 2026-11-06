import type { Queue } from 'bullmq';
import type { Model } from 'mongoose';
import type { OutboxRecord } from '@gather/delivery';

export async function dispatchOutbox(model: Model<OutboxRecord>, queue: Queue) {
  await model.updateMany(
    { expiresAt: { $lte: new Date() }, payload: { $ne: null } },
    { $set: { state: 'expired', payload: null } },
  );
  const rows = await model
    .find({ state: { $in: ['pending', 'queued'] }, expiresAt: { $gt: new Date() } })
    .sort({ createdAt: 1 })
    .limit(100)
    .lean();
  for (const row of rows) {
    const existing = await queue.getJob(row._id);
    if (!existing)
      await queue.add(
        'transactional-email',
        { outboxEventId: row._id },
        {
          jobId: row._id,
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { age: 86400, count: 1000 },
          removeOnFail: { age: 7 * 86400, count: 1000 },
        },
      );
    await model.updateOne({ _id: row._id, state: 'pending' }, { $set: { state: 'queued' } });
  }
}
