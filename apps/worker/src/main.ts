import { createConnection } from 'mongoose';
import { Redis } from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { z } from 'zod';
import { deliveryJobReferenceSchema, encryptionKey, outboxModel } from '@gather/delivery';
import { createMailSender } from './providers/mail.js';
import { deliverOutbox } from './processors/delivery.js';
import { dispatchOutbox } from './outbox/dispatcher.js';

const env = z
  .object({
    MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//),
    REDIS_QUEUE_URL: z.url(),
    OUTBOX_ENCRYPTION_KEY: z.string(),
  })
  .parse(process.env);
const key = encryptionKey(env.OUTBOX_ENCRYPTION_KEY);
const sender = createMailSender(process.env);
const connection = await createConnection(env.MONGODB_URI, {
  autoIndex: false,
  bufferCommands: false,
  serverSelectionTimeoutMS: 5000,
}).asPromise();
const redis = new Redis(env.REDIS_QUEUE_URL, { maxRetriesPerRequest: null, lazyConnect: true });
redis.on('error', () => console.error('Queue connection unavailable.'));
await redis.connect();
const policy = await redis.config('GET', 'maxmemory-policy');
if (!Array.isArray(policy) || policy[1] !== 'noeviction') {
  await redis.quit();
  await connection.close();
  throw new Error('Queue Redis must use noeviction');
}
const model = outboxModel(connection);
const queue = new Queue('gather-mail', { connection: redis });
const worker = new Worker(
  'gather-mail',
  async (job) => {
    const payload = deliveryJobReferenceSchema.parse(job.data);
    await deliverOutbox(payload.outboxEventId, model, key, sender.send);
  },
  { connection: redis, concurrency: 2 },
);
worker.on('error', () => console.error('Mail worker unavailable.'));
worker.on('failed', (job) => {
  if (job?.id && job.attemptsMade >= (job.opts.attempts ?? 1))
    void model
      .updateOne(
        { _id: job.id, state: { $in: ['pending', 'queued'] } },
        { $set: { state: 'failed' } },
      )
      .catch(() => console.error('Delivery status update failed.'));
});
let dispatching = false;
async function dispatch() {
  if (dispatching) return;
  dispatching = true;
  try {
    await dispatchOutbox(model, queue);
  } catch {
    console.error('Outbox dispatch unavailable.');
  } finally {
    dispatching = false;
  }
}
await dispatch();
const timer = setInterval(() => {
  void dispatch();
}, 5000);
console.info('Mail worker running. Payloads and credentials are not logged.');
await new Promise<void>((resolve) => {
  process.once('SIGTERM', resolve);
  process.once('SIGINT', resolve);
});
clearInterval(timer);
await worker.close();
await queue.close();
await redis.quit();
await connection.close();
sender.close();
