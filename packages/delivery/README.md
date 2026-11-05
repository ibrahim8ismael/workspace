# Server-only delivery package

Shared home for the API/worker outbox model and delivery contracts. Initial export only validates an outbox record reference. Transactions, encryption, providers, Mongo schemas and job processors remain unimplemented. Browser applications must not import this package. Feature Mongo models stay with their owning API module.
