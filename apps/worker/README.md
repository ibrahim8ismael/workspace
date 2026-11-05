# Worker starter

BullMQ, ioredis and server-only delivery contracts are installed. The entrypoint currently prints scaffold status and exits; it does not connect to Redis or send mail. Implement the transactional outbox, encrypted payload lifecycle and approved provider before registering any processors. Start separately with `pnpm dev:worker` when working on this application.
