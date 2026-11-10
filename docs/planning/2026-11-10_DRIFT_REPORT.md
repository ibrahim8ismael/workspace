# CP06.11 documentation/code drift review

Scope: current documentation directly affected by the office chat and navigation integration, compared with its API, web and shared-contract implementations. This is a focused review, not a rerun across every repository design document.

## apps/web/README.md

No drift detected.

## docs/README.md

No drift detected.

## docs/architecture/DATA_MODEL.md

No drift detected.

## docs/architecture/REPOSITORY.md

No drift detected.

## docs/contracts/HTTP.md

No drift detected.

## docs/contracts/REALTIME.md

No drift detected.

## docs/decisions/2026-11-08_CP02.md

No drift detected.

## docs/decisions/README.md

No drift detected.

## docs/entities/channels/README.md

No drift detected.

## docs/entities/channels/PLAN.md

No drift detected.

## docs/entities/chat-messages/README.md

No drift detected.

## docs/entities/chat-messages/PLAN.md

No drift detected.

## docs/migration/README.md

No drift detected.

## docs/migration/OPENOFFICE_UI_INTEGRATION.md

No drift detected.

## docs/planning/ACCEPTANCE.md

No drift detected.

## docs/planning/BACKEND_SYSTEM_IMPLEMENTATION.md

No drift detected.

## docs/planning/FRONTEND_DATA_AUDIT.md

No drift detected.

## docs/planning/PROJECT_COMPLETION_PLAN.md

No drift detected.

## docs/planning/IMPLEMENTATION_PROGRESS.md

No drift detected.

# CP08 Documentation Drift Review

Scope: CP08 contracts and entity plans compared with the implementation after CP08.3c. Findings below record stale statements identified during the review and the corrections made in this documentation batch. This is a targeted review, not a rerun across every repository design document.

## OFFICE_V1.md

- Resolved: the conversation section said only `joining`/`ended` were implemented and that `mediaReady` was always false; CP08.2b now activates a current generation after the exact installation acknowledgement.
- Resolved: the section said no route signed tokens or consumed acknowledgements; CP08.2b implements pull/ACK routes and CP08.3a implements the protected media-token route.
- Remaining limitation: there is no application webhook handler or durable generation-retirement publisher; real LiveKit audio/cutoff is unverified.

## MEDIA.md

- Resolved: it said API/guard had not been run as a process pair. CP08.3c runs the Nest test API and CP07 guard in separate processes over signed localhost HTTP.
- Remaining limitation: the guard's signaling upstream in that test is a mock, so no real SFU join, forwarding cutoff, supervisor progress bridge or production ingress topology is demonstrated.

## conversations/README.md and conversations/PLAN.md

- Resolved: they described the protected grant route and active/media-ready state as unimplemented and always false. The current app requires an installed permit ACK, issues session/company/pair-bound microphone grants, and denies an old token after pair end/restart in the process fixture.
- Remaining limitation: the policy service is process-local; durable retirement, webhook reconciliation, actual SFU media and cutoff remain open.

## media-grants/README.md and media-grants/PLAN.md

- Resolved: they labeled grants as draft-only with all implementation checks open. The current code issues a no-store, short-lived, microphone-only JWT after session, membership, pair and installed-permit checks; the browser control is wired.
- Remaining limitation: a real two-browser SFU run, refreshed-token replay against the application grant, permission-denial evidence and production log redaction are not proven.

## media-permits/README.md and media-permits/PLAN.md

- Resolved: they described all application integration as pending. The CP08.3c process fixture verifies signed API policy pull/ACK and guard admission/denial using a mock upstream.
- Remaining limitation: production network/deployment integration and measured application-SFU cutoff are still pending.

## PROJECT_COMPLETION_PLAN.md

- Resolved: CP08's numbered implementation steps and proposed API/browser paths still described pairing, token issuance and UI as future work. The plan now marks completed slices and specifies separate real-SFU, revocation/failure, webhook and release-evidence phases with file boundaries and checks.

## BACKLOG.md and ACCEPTANCE.md

- Resolved: B018/A08 said no live API-to-guard transport existed. They now record the process-level localhost integration fixture and keep deployed API/SFU media, cutoff, TURN and isolation acceptance open.
