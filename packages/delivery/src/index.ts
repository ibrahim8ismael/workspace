import { z } from 'zod';

/** Jobs reference durable outbox records, never raw tokens or email secrets. */
export const deliveryJobReferenceSchema = z
  .object({
    outboxEventId: z.string().min(1),
  })
  .strict();

export type DeliveryJobReference = z.infer<typeof deliveryJobReferenceSchema>;
