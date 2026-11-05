# Security and authorization plan

Status: required controls and proposed defaults; unverified · Updated: 2026-11-05

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

See [acceptance evidence](../planning/ACCEPTANCE.md), [media permit plan](../entities/media-permits/PLAN.md) and [operations](../operations/README.md). All checks remain future implementation work.
