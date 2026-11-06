# Transactional mail worker

Backend-only BullMQ dispatcher/processor for encrypted Mongo outbox messages. It is separate from the API and is never started by `pnpm dev` or installation.

Configure `MONGODB_URI`, `REDIS_QUEUE_URL`, `OUTBOX_ENCRYPTION_KEY`, and SMTP variables from the root `.env.example`. Use the same encryption key as the API. Queue Redis must be a dedicated persistent instance configured with `maxmemory-policy=noeviction`; the worker verifies that setting and needs permission to read it. Provision outbox indexes using `pnpm db:indexes` first.

```sh
pnpm dev:worker
```

`SMTP_HOST`, `SMTP_FROM` and a valid TLS arrangement are required. Port 587/STARTTLS is the default; use `SMTP_SECURE=true` for implicit TLS (typically port 465). Production requires implicit TLS or required STARTTLS. Credentials may be supplied through `SMTP_USER`/`SMTP_PASSWORD` for the selected provider. No provider was configured or contacted by the implementation tests.

The dispatcher polls committed outbox records and enqueues stable record IDs only. The processor checks expiry, authenticates/decrypts the payload, sends a plain-text one-time code with backend API instructions, and purges the encrypted secret after delivery. Expired payloads are purged without sending. Failed jobs use bounded retry/backoff; final delivery failure is visible in outbox state. Shutdown closes the worker, queue, Redis, Mongo and SMTP resources.

Delivery is at least once: a provider acknowledgement followed by a database failure can send duplicate mail. Token redemption and membership creation remain single-use/transactional. A superseded code may arrive after an in-flight send, but cannot redeem. Existing tests prove record-ID job payloads, encryption, transactional rollback, delivery idempotence after committed acknowledgement and expiry handling using a fake sender. They do not prove an actual SMTP/Redis/provider outage or deliverability scenario.

No browser/frontend connection or secret-bearing mail link is introduced. API and worker logs do not print tokens, recipients, passwords, ciphertext payloads or provider exceptions.
