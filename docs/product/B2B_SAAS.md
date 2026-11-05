# B2B SaaS product plan

Status: B2B SaaS positioning agreed by owner on 2026-11-05; details below retain their stated proposal/open status.

## Customer and product

Gather Lite provides virtual offices to businesses and their teams. The customer is a company; employees use the office as individual users. Tenant isolation, company onboarding and company administration shape the product from the first implementation slice.

## Tenant model

Recommended MVP default: **one customer company = one workspace/tenant = one fixed office**. This reuses the currently planned workspace and membership model. A person has a global account and independent company memberships; joining another company grants no access to the first company's data or calls. Present the current company clearly in navigation, invitations and administrative actions.

Open before schema freeze: whether customers need multiple workspaces under one organization from the first release. If required, add an organization entity, explicit organization membership/roles, and organization-to-workspace policy relationships; update indexes, API scopes, quotas and runtime/media policy consistently. The current note does not approve that additional hierarchy automatically. See D12 in the [decision register](../decisions/README.md).

## Company onboarding and administration

- Company onboarding creates the customer tenant, initial owner and office transactionally. Choose self-service, operator-assisted pilots or a combination before implementing the full flow (D13).
- Owners invite verified team members, remove access and transfer ownership through current tenant policy. Owner/member remain the MVP roles; a separate company admin role is a future choice.
- A global account can switch only among its current authorized companies. Invitations identify the intended company and recipient; accepting one cannot grant unrelated tenant access.
- Platform operators are separate from customer owners. Company ownership grants no infrastructure or cross-company privileges. Any future support access requires explicit scoped authorization and an audit trail; no implicit impersonation or global support bypass.
- Company lifecycle needs active/suspended/closed semantics and offboarding/data-retention decisions. Account suspension and company suspension are distinct; define how company suspension removes office and media access before exposing the control.

## Isolation and service operation

Tenant scope applies to MongoDB queries/indexes, office ownership, Socket.IO subscriptions/snapshots, map overrides, conversations/media permits, invitations, jobs and audit records. Shared static assets may be common, while private company data remains scoped. Cache and idempotency keys must include the scope relevant to the command.

Apply per-company limits as well as service-wide resource budgets. One company's input, mail or media churn must not exhaust other customers' normal operations. Measure noisy-neighbor behavior during the operational pilot; existing numeric quotas are provisional capacity defaults, not commercial plan entitlements.

Recommended initial deployment is shared application infrastructure with logical tenant isolation, consistent with the current stack. Shared media-node fail-closed shutdown can interrupt several companies' calls; document and measure that blast radius. Dedicated deployments, data residency choices and contractual availability commitments remain open commercial/operations decisions.

## Commercial and enterprise scope

Payments remain excluded from MVP. B2B SaaS positioning does not schedule a payment provider, subscriptions, billing collections or payment gates. Pricing, paid seats versus concurrent participants, plans, trials, invoicing, subscription lifecycle and entitlements need explicit product decisions before a commercial billing milestone.

SSO, SCIM provisioning, custom domains, organization hierarchies, advanced roles, customer-facing audit exports and contractual SLA/data-residency features require separate scope decisions. They are not implied MVP promises. Internal recovery and reliability targets remain engineering objectives until measured.

## Planning acceptance

- [ ] Resolve customer-to-workspace cardinality and onboarding mode before tenant schema/flow freeze.
- [ ] Verify company A cannot read company B's APIs, socket state, invitations, jobs or media with substituted IDs.
- [ ] Verify a user in two companies retains independent roles, current-company context and membership revocation behavior.
- [ ] Verify tenant suspension/offboarding behavior once specified, including live office/media removal.
- [ ] Measure company-level quotas, noisy-neighbor behavior and shared-node media interruption scope.
- [ ] Keep company roles separate from platform operations access and audit any future support-access mechanism.

See [workspace plan](../entities/workspaces/PLAN.md), [roadmap](../planning/ROADMAP.md) and [acceptance register](../planning/ACCEPTANCE.md).
