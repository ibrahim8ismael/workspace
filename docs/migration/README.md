# Upstream reuse and migration plan

Status: supplied web/map/styles integrated into authenticated app; remaining surfaces and media still in progress · Updated: 2026-11-10

Source brief: [upstream inventory and limitations](../../GATHER_LITE_PROJECT_KNOWLEDGE.md). The imported source and public assets are pinned to commit `23d6b8999396f9e9d51291bf85bd7b72161f833f`; the earlier tree-only identification was resolved by the recorded import. This pin is not proof of current upstream behavior or blanket clearance of every upstream asset. Preserve the copied notices and provenance; unresolved/private reference material remains excluded.

See [web/shared integration](WEB_IMPORT.md) and [pinned source manifest](UPSTREAM_IMPORT.json) for the current import and verification limits.

## Import sequence

1. Record commit, copied paths, source terms/notices and modifications. Inventory each asset's provenance; block unresolved/private third-party art.
2. Use the owner-supplied OpenOfficeForAll frontend, layout and styles as the product UI. Replace obsolete service/data calls screen by screen; do not rebuild a parallel shell. The current implementation steps are tracked in [OpenOfficeForAll UI integration](OPENOFFICE_UI_INTEGRATION.md). The owner selected the pinned Vivo map; existing Commons office rows migrate through the bounded `db:migrate-legacy-office-maps-to-vivo` command.
3. Extract pure geometry/navigation/seat/zone helpers into `packages/world` after review. Define stable object IDs and the immutable map contract.
4. Mount Phaser with a typed React bridge. Prove pixel sampling, anchors, occlusion and complete cleanup using the real sample.
5. Replace `useOffice` raw-WebSocket integration with Socket.IO adapters; the protocols are not interchangeable. Replace localStorage account/admin/invite secrets with server session/ticket/role flows.
6. Adapt workspace/onboarding and media UI to backend DTOs. With all-LiveKit selected, reduce upstream P2P media logic rather than maintaining two lifecycles implicitly.
7. Keep the supported fixed office text channel on project APIs; exclude DMs, nearby/meeting chat, channel administration, recorder, calendar and other unsupported UI until their policies and services exist. The old monolithic backend and JSON business-data stores do not remain a hidden second authority.

## Data migration decision

If no production upstream business data exists, seed a clean fixed map and onboard users through the new verified-account flow. If real data exists, implement an offline importer with backup, schema validation, dry run, idempotent import keys, stable ID mapping and record-count/error reporting. Do not add dual writes to files and MongoDB.

Passwords, sessions and anonymous browser identities require a separate compatibility decision; default to fresh verified onboarding and revoke upstream sessions. Preserve map/object IDs only after validating their uniqueness and tenant mappings. Do not interpret a guest display identity as a verified user.

## Provenance record template

```text
Asset/code ID:
Repository and pinned commit:
Copied source path:
Destination:
License/terms and required notices:
Third-party attribution/provenance evidence:
Changes/export pipeline:
Content hash and clearance status:
Reviewer/date:
```

See [assets](../entities/assets/README.md), [B001–B005](../planning/BACKLOG.md) and [renderer acceptance A06](../planning/ACCEPTANCE.md).
