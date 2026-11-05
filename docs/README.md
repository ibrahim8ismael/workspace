# Gather Lite project documentation

Status: initial planning baseline · Updated: 2026-11-05

Gather Lite is a **B2B SaaS virtual office for companies and their teams**, delivered through a browser with React application controls, a Phaser world, NestJS APIs, Socket.IO authoritative office state, MongoDB/Mongoose durable data, Redis/BullMQ jobs, and self-hosted LiveKit media. The initial monorepo scaffold and dependencies are installed; product features remain unimplemented. Product schemas, routes, tasks and acceptance checks below remain proposed or planned unless supported by implementation evidence. The scaffold liveness route and job-reference schema are recorded in the repository setup notes.

## Product direction

B2B SaaS is an agreed requirement. Read the [B2B SaaS product plan](product/B2B_SAAS.md) for company tenancy, onboarding, administration and commercial scope. One company per workspace is the recommended MVP mapping; a separate organization hierarchy remains open. Payments remain excluded from MVP.

## Start here

1. Read the [source project brief](../GATHER_LITE_PROJECT_KNOWLEDGE.md).
2. Review [architecture and shared invariants](architecture/README.md).
3. Find a domain in the [26-entity catalog](entities/README.md); each folder has a specification and implementation plan.
4. Follow the [milestone roadmap](planning/ROADMAP.md) and [initial backlog](planning/BACKLOG.md).
5. Resolve [open decisions](decisions/README.md) before the affected milestone.
6. Specify [HTTP](contracts/HTTP.md), [realtime](contracts/REALTIME.md) and [data](architecture/DATA_MODEL.md) contracts before implementation.
7. Record actual results in the [acceptance register](planning/ACCEPTANCE.md).

## Source precedence

- [GATHER_LITE_PROJECT_KNOWLEDGE.md](../GATHER_LITE_PROJECT_KNOWLEDGE.md) v1.2 is the authoritative supplied architecture/migration brief. Its agreed, recommended and open statuses remain distinct.
- [GATHER_LITE_TECH_STACK.md](../GATHER_LITE_TECH_STACK.md) is historical where it conflicts with that brief. In particular, Next.js, Colyseus and a systemd-only media deployment must not silently replace the current React/Phaser/NestJS/Socket.IO/Docker direction.
- These docs decompose that brief into initial entity and delivery plans. New names, routes, field choices and task IDs are proposals; they do not establish owner approval or implemented behavior.
- Source links are retained for traceability; this documentation task did not independently reverify upstream libraries, versions or capabilities.
- Original source files remain at the repository root to avoid maintaining divergent copies.

## Structure

```text
docs/
  README.md
  product/            B2B SaaS requirements and tenant model
  architecture/       runtime boundaries and data model
  entities/           26 entity folders, each README.md + PLAN.md
  planning/           roadmap, backlog and evidence register
  contracts/          proposed HTTP and Socket.IO contracts
  decisions/          agreed direction and unresolved choices
  security/           permissions and authorization lifecycle
  operations/         deployment, observability and recovery plan
  migration/          upstream import and provenance plan
```

## MVP scope

Verified accounts and recovery; workspaces, membership and invitations; one fixed map per workspace; basic avatars; authoritative movement and seats; availability; opt-in one-to-one proximity voice; fixed group meetings; explicit camera and screen sharing; owner/member administration; reconnect and operational visibility.

Payments, chat/DM history, calendar integration, recording, AI notes, custom map editing/uploads, dynamic open-floor group clusters, mobile apps, SSO, email changes and E2EE are deferred. Their presence upstream does not add them to MVP. Four deferred entity folders capture future questions without scheduling implementation.

## Maintaining these docs

Use English for technical documentation, as specified in the source brief. Update the relevant entity, contracts, decision entry and acceptance criteria together when a decision changes. Keep recommended defaults labeled. Attach code and execution evidence before marking tasks verified. Do not treat an unchecked acceptance criterion as a passed control.

Repository setup is tracked in [setup progress](planning/SETUP_PROGRESS.md).

The [implemented repository layout](architecture/REPOSITORY.md) records the refined module grouping and package ownership.
