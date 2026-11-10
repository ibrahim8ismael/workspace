# Gather Lite project documentation

Current review (2026-11-10): read the [documentation/code drift report](planning/2026-11-08_DRIFT_REPORT.md), [full MVP completion plan](planning/PROJECT_COMPLETION_PLAN.md), and [OpenOfficeForAll UI integration plan](migration/OPENOFFICE_UI_INTEGRATION.md) for the current baseline, remaining work, dependencies and evidence gates. Historical evidence retains its original dates; current documentation corrections are tracked in the [implementation progress](planning/IMPLEMENTATION_PROGRESS.md). The completion plan is proposed delivery work, not approval of open decisions or release signoff.

Status: CP00–CP07 locally implemented/proven; supplied OpenOfficeForAll UI migration and product media integration pending · Updated: 2026-11-10

Gather Lite is a **B2B SaaS virtual office for companies and their teams**, delivered through a browser with React controls, a Phaser world, NestJS APIs, Socket.IO authoritative office state, MongoDB/Mongoose data, Redis/BullMQ jobs, and a planned self-hosted LiveKit product path. Account/company APIs, office admission/runtime, a current authenticated browser integration, transactional audit and encrypted mail outbox/worker are implemented and locally verified. The supplied OpenOfficeForAll source is present, but its shell is not yet the default and its legacy service calls are not connected; the owner has selected that UI and its styles as the product base. The new AuthApp and office screen currently provide the integration proof. Product LiveKit media and release acceptance remain open. See the [current API reference](contracts/AUTH_AND_ROLES_API.md) and [UI migration plan](migration/OPENOFFICE_UI_INTEGRATION.md); proposed routes and release criteria remain proposals unless code/evidence supports them.

## Product direction

B2B SaaS is an agreed requirement. Read the [B2B SaaS product plan](product/B2B_SAAS.md) for company tenancy, onboarding, administration and commercial scope. The owner accepted one company/workspace/office and verified-user self-service onboarding on 2026-11-08; a future organization hierarchy requires a separate decision. Payments remain excluded from MVP.

Current implementation checkpoints: CP00–CP07 have local implementation or experimental proof; production/release acceptance remains open. CP04 connects browser accounts/companies and delivery; CP05/CP06 add authoritative office realtime and a live Commons browser view; CP07 is an isolated local media-enforcement proof, not product voice. See [owner decisions](decisions/README.md), [office v1 contract](contracts/OFFICE_V1.md), and [progress](planning/IMPLEMENTATION_PROGRESS.md). CP08 media UX and migration of the supplied UI onto current services remain next.

## Start here

1. Read the [source project brief](../GATHER_LITE_PROJECT_KNOWLEDGE.md).
2. Review [architecture and shared invariants](architecture/README.md).
3. Find a domain in the [26-entity catalog](entities/README.md); each folder has a specification and implementation plan.
4. Use the [completion plan](planning/PROJECT_COMPLETION_PLAN.md) and [implementation progress](planning/IMPLEMENTATION_PROGRESS.md), then follow the [system backend implementation plan](planning/BACKEND_SYSTEM_IMPLEMENTATION.md), [milestone roadmap](planning/ROADMAP.md) and [initial backlog](planning/BACKLOG.md).
5. Resolve [open decisions](decisions/README.md) before the affected milestone.
6. Review the [HTTP](contracts/HTTP.md), [Socket.IO](contracts/REALTIME.md), [WebRTC/LiveKit](contracts/MEDIA.md) and [data](architecture/DATA_MODEL.md) contracts before implementation.
7. Record actual results in the [acceptance register](planning/ACCEPTANCE.md).

## Source precedence

- [GATHER_LITE_PROJECT_KNOWLEDGE.md](../GATHER_LITE_PROJECT_KNOWLEDGE.md) v1.5 is the authoritative supplied architecture/migration brief. Its agreed, recommended and open statuses remain distinct.
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
  contracts/          HTTP, Socket.IO and LiveKit interface plans
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

The [web/shared import](migration/WEB_IMPORT.md) records source provenance; the [OpenOfficeForAll UI integration plan](migration/OPENOFFICE_UI_INTEGRATION.md) records the owner-approved migration into current APIs and Socket.IO.

Backend work starts from the [authentication and company roles implementation plan](planning/AUTH_AND_ROLES_IMPLEMENTATION.md), written before source implementation.

The backend-only [authentication and company roles API](contracts/AUTH_AND_ROLES_API.md) now implements the first identity/tenancy slice. Frontend integration and production release gates remain separate.

Current CP07 local enforcement proof: [measured audio/video fault evidence and deployment limits](planning/MEDIA_ENFORCEMENT_EVIDENCE.md). The named isolated experiment exit is demonstrated; production A07 acceptance and application media integration remain separate.
