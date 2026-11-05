import { deliveryJobReferenceSchema } from '@gather/delivery';

// No Redis connection or processor is started until the outbox contract is implemented.
console.info('Worker scaffold: no processors configured.');
console.info('Queue payload fields:', Object.keys(deliveryJobReferenceSchema.shape));
