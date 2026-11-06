# Initial backend authentication/RBAC evidence

Updated: 2026-11-06. Scope: backend APIs only, with no frontend connection or Docker execution.

## Planning checkpoint

The implementation plan was committed and pushed first as `a2858c8`: [plan](AUTH_AND_ROLES_IMPLEMENTATION.md). Backend source edits followed that checkpoint. The original entity/security plans were reviewed before the plan was written.

## Local checks

Executed with Node 24.18.0 / pnpm 10.33.0 and the pinned workspace lockfile:

- `pnpm check`: passed locally and in hosted CI for the initial 31-test implementation (formatting, lint, all TypeScript checks, shared tests, backend tests and workspace builds).
- After startup-index hardening, the targeted backend suite/build/typecheck passed with 32 tests; CI runs the complete check for that commit.
- Backend: 32 passing tests across two files; the integration suite uses real NestJS HTTP and MongoDB 8.2.6 in a temporary single-node replica set.
- Shared: five passing import/map/asset tests. The frontend was built as part of the existing repository check but no frontend source was edited or connected to the new API.
- `git diff --check`: clean after preserving original brief formatting appropriately.
- Documentation file links resolve.

## Behaviors exercised

- Strict DTOs, email canonicalization, unknown-field/role/operator rejection and bounded JSON bodies.
- Startup rejects a compound index that includes email but does not enforce email uniqueness; required indexes must have the exact unfiltered/non-sparse unique key shape.
- Argon2id verification, wrong/unknown password handling and initial weak-password policy.
- Authenticated encryption integrity and outbox-identity binding; no token plaintext in API responses or ID-only jobs.
- Safe CSRF bootstrap, origin rejection, preservation of valid existing cookies, session/CSRF rotation and cookie flags.
- Pending registration, password-bound email verification, preregistration takeover rejection and legitimate pending-account recovery.
- Idle expiry and reset-token expiry before TTL cleanup, supersession and concurrent one-time reset redemption.
- Stale login proof cannot issue valid access after a committed password reset.
- Logout-all/password change invalidate old sessions, and cross-account session-ID substitution fails.
- Suspension survives mailbox recovery.
- Company creation/initial ownership and office reference, idempotent retry/fingerprint conflict and concurrent owned-workspace quota.
- Independent company roles, cross-tenant denial, owner-only invitation administration, recipient binding and concurrent invite acceptance without duplicate counters.
- Explicit invitation expiry/revocation, transactional owner transfer, stale owner policy rejection, competing transfers, recent proof and removal without affecting other company membership.
- Concurrent admission at the final membership slot preserves exact count/uniqueness.
- Outbox failure rolls back registration/credential/token writes; delivery clears payloads, repeated acknowledged delivery does not resend, expired messages do not contact the sender.

The sender and BullMQ queue boundary are faked in outbox tests. No actual SMTP provider, persistent Redis service, production URI, external account, frontend browser session or Docker daemon was used. Test Mongo processes/HTTP servers are stopped during cleanup; only the ignored binary cache remains.

## Limits and follow-up gates

This is initial backend implementation evidence, not a deployed penetration test or complete pilot acceptance. Real SMTP deliverability/queue failure recovery, production HTTPS/proxy behavior, independent recovery/audit mirroring, a comprehensive compromised-password dataset, target-host hashing/load measurements, office admission and media revocation are still pending. The existing LiveKit chunk-size warning belongs to the imported frontend and does not prevent build success.

See [API contract](../contracts/AUTH_AND_ROLES_API.md) and [GitHub Actions](https://github.com/ibrahim8ismael/workspace/actions) for the interface and hosted runs associated with the implementation commit.
