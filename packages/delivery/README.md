# Server-only delivery package

Shared home for the API/worker outbox model and delivery contracts. Current exports include the ID-only job-reference schema, Mongo outbox schema/model, strict mail payload schema, key validation and AES-256-GCM encryption bound to outbox identity. Domain mutations and outbox inserts share API-owned transactions; dispatch/SMTP processors live in `apps/worker`. Real provider/Redis outage evidence and production key management remain pending. Browser applications must not import this package. Feature Mongo models stay with their owning API module.
