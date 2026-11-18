# Security and authorization plan

Status: initial HTTP auth/tenant controls locally verified; browser/live/production gates pending · Updated: 2026-11-08

## Permission baseline

| Action | Anonymous / pending | Active verified member | Workspace owner |
|---|---|---|---|
| Register, request verification/recovery | Bounded, generic request flows | Supported account flow | Same account rules |
| Create workspace | Denied | Allowed within owned quota | Allowed within owned quota |
| Accept invitation | Denied | Matching verified mailbox only | Same recipient rule |
| Read tenant / enter office / join eligible call | Denied | Current membership and resource policy required | Same admission/capacity checks |
| Change own availability/appearance | Denied for office actions | Allowlisted self fields | Same self rules |
| Invite/remove members, change workspace settings | Denied | Denied | Conditional current owner policy |
| Leave workspace | Denied | Allowed with exact counter update | Transfer ownership first |
| Transfer ownership | Denied | Cannot initiate | Recent reauthentication; verified member target and exact counters |
| Read operational audit/control endpoints | Denied | Denied | Workspace role does not imply infrastructure privileges |

Suspended/revoked/expired identities fail regardless of role. Exact read projections and destructive commands require contract completion. Infrastructure administrators require MFA; user MFA policy remains a future launch decision.

## B2B tenant boundary

Customer-company permissions remain independent for users in several companies. Company owners are not platform operators. Verify cross-company API, socket, invitation and media isolation and prevent scoped jobs/cache keys from leaking or acting across tenants. Future support access must be explicitly authorized and audited; no implicit impersonation is planned.

## Authorization chain

1. HTTP validates current opaque session, account status/authVersion and CSRF/Origin for mutations.
2. Workspace resource policy checks full parent relationships, not only supplied IDs.
3. A one-use 30-second join ticket binds session, identity, tenant, office, epoch and protocol.
4. Socket.IO middleware consumes/rechecks the ticket; the runtime reserves capacity before broadcasting participation.
5. Continuing world checks use proposed one-second cadence and at most five-second leases bounded by actual session validity. Monotonic request-start deadlines, fresh epochs and response ordering prevent late renewal.
6. Conversations derive their current authorized set from the runtime. Grants follow current permit installation and another policy check.
7. Guard signaling checks, irreversible generation retirement and independent SFU supervision must enforce bounded media removal. Eight seconds is an unproven target until M0 evidence exists.

## Implementation controls

- Host-only Secure HttpOnly session cookie; no raw sessions in JavaScript/URLs/storage. CSRF bootstrap preserves an existing session and bounds anonymous state.
- Exact Origin and same-origin routing, output escaping, restrictive CSP/frame policy and no arbitrary HTML. HttpOnly does not make XSS harmless.
- Purpose-separated expiring token digests and atomic redemption; pending-password proof prevents preregistration takeover.
- Argon2id with maintained library and measured parameters; bounded password length/hash concurrency; generic recovery and no permanent attacker-triggerable lockout.
- Tenant-scoped allowlisted queries/projections; real transaction policy writes contend with concurrent revocation.
- Redact cookie/auth headers, tickets, reset links, secret bodies and media signaling JWT parameters at edge/app/tracing. Recovery pages use no-store/no-referrer and no third-party resources.
- No recording/bots/egress or E2EE claims. Publish only approved sources after explicit device consent; enforce pinned-server capability limits.
- Separate cache/queue failure policies; queue payload IDs only, encrypted expiring mail secrets, restricted keys.
- Independent audit evidence and suspended restored access prevent backup rollback from reviving old credentials or memberships.

## Authentication attempt limits and proxy identity

Login failures are bounded by both source address and normalized account address pair: five attempts
per account/source pair in a 15-minute fixed window, plus the existing per-source and global budgets.
Failures from many addresses therefore do not lock the victim account; repeated guessing from one
address remains bounded. Reauthentication and current-password checks for password changes each
have five attempts per account per 15 minutes, shared across that account's sessions, alongside the
per-source budget. These are expiring rate-limit records, not account lock flags.

The API resolves a forwarded client address only when the immediate socket peer exactly matches an
entry in `TRUSTED_PROXY_IPS`. It accepts one valid IP from that proxy and falls back to the peer for
untrusted, absent, invalid, or multi-hop values. Express `trust proxy` remains disabled. The pilot
Compose network pins Caddy at `172.26.0.4`, and the deployment env example trusts only that IP.
Nginx overwrites `X-Real-IP` with the actual peer for both HTTP and Socket.IO, removes client-supplied
`X-Forwarded-For`, and Caddy replaces the API-facing `X-Forwarded-For` with that canonical value.
HTTP and Socket.IO retain separate budgets, each keyed by the resolved client address. When changing
the edge subnet, reserve Caddy's address and update both `TRUSTED_PROXY_IPS` and the Caddy Compose
address; never trust a broad subnet or arbitrary forwarding headers.

These controls are implemented in the repository branch but are not yet part of the deployed pilot.
The targeted API tests cover trusted/untrusted peer resolution, account/IP login limits, and shared
password-proof limits. The server-side proxy configuration still requires a coordinated rollout to
take effect in the running environment.

See [acceptance evidence](../planning/ACCEPTANCE.md), [media permit plan](../entities/media-permits/PLAN.md) and [operations](../operations/README.md). Local portions of account/session/CSRF/tenant/crypto checks are recorded in [auth implementation evidence](../planning/AUTH_IMPLEMENTATION_EVIDENCE.md). Deployed browser policy, broader compromised-password screening, live socket/media authorization, secret redaction at ingress and independent recovery remain pending; no full release gate is passed by this summary.
