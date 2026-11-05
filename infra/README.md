# Infrastructure

Reserved directories: `compose`, `caddy`, `mongodb`, `redis`, and `media`.

No deployment manifests, containers or services are configured or started by this scaffold. Future changes must follow [operations requirements](../docs/operations/README.md), keep internal services private and prove independent media supervision. Do not add Docker startup to install/build hooks.
