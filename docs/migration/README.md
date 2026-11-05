# Upstream reuse and migration plan

Status: user-supplied web/shared code integrated with pnpm; product migration pending · Updated: 2026-11-05

Source brief: [upstream inventory and limitations](../../GATHER_LITE_PROJECT_KNOWLEDGE.md). Its observed tree SHA `23d6b8999396f9e9d51291bf85bd7b72161f833f` is not a commit pin. Pin an actual commit before reuse; the supplied snapshot is not proof of current upstream behavior or cleared asset rights.

See [web/shared integration](WEB_IMPORT.md) and [pinned source manifest](UPSTREAM_IMPORT.json) for the current import and verification limits.

## Import sequence

1. Record commit, copied paths, source terms/notices and modifications. Inventory each asset's provenance; block unresolved/private third-party art.
2. Import the smallest reusable UI, one avatar/object and map metadata needed for M0. React/SVG procedural art may need export or a Phaser rewrite; individual PNG frames can remain textures.
3. Extract pure geometry/navigation/seat/zone helpers into `packages/world` after review. Define stable object IDs and the immutable map contract.
4. Mount Phaser with a typed React bridge. Prove pixel sampling, anchors, occlusion and complete cleanup using the real sample.
5. Replace `useOffice` raw-WebSocket integration with Socket.IO adapters; the protocols are not interchangeable. Replace localStorage account/admin/invite secrets with server session/ticket/role flows.
6. Adapt workspace/onboarding and media UI to backend DTOs. With all-LiveKit selected, reduce upstream P2P media logic rather than maintaining two lifecycles implicitly.
7. Exclude recorder, persistent chat/calendar and unsupported UI. The old monolithic backend and JSON business-data stores do not remain a hidden second authority.

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
