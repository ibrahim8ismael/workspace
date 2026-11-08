# CP00 drift disposition

Updated: 2026-11-08. Implementer: Codex. This maps every per-file section of the [input drift snapshot](2026-11-08_DRIFT_REPORT.md) to a documentation correction or intentionally pending work in the [completion plan](PROJECT_COMPLETION_PLAN.md). The original report remains unchanged so it continues to describe the compared input commit.

Corrected means the current description or model/task mapping is reconciled, not that all future features in that file now exist. Initial entity implementation checkboxes refer to existing code; full acceptance criteria remain open. Historical setup/import/technology observations retain their dates and explicit supersession labels. Future model fields are not added automatically to match a draft; an owning contract must justify them first.

All 91 input sections are accounted for below. No new product decisions, schema changes or A01–A11 release passes are established by CP00. Progress and push history are recorded in [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md).

| Input document | CP00 disposition | Remaining work / boundary |
| --- | --- | --- |
| [README.md](../../README.md) | Current status/model text reconciled | CP01–CP11 where the document describes pending target components; no new runtime behavior claimed |
| [GATHER_LITE_PROJECT_KNOWLEDGE.md](../../GATHER_LITE_PROJECT_KNOWLEDGE.md) | Current status/model text reconciled | CP01–CP11 where the document describes pending target components; no new runtime behavior claimed |
| [GATHER_LITE_TECH_STACK.md](../../GATHER_LITE_TECH_STACK.md) | Current status/model text reconciled | Historical only: superseded choices stay labeled; current contracts govern future work |
| [docs/README.md](../../docs/README.md) | Current status/model text reconciled | CP01–CP11 where the document describes pending target components; no new runtime behavior claimed |
| [docs/architecture/README.md](../../docs/architecture/README.md) | Current status/model text reconciled | CP01–CP11 where the document describes pending target components; no new runtime behavior claimed |
| [docs/architecture/DATA_MODEL.md](../../docs/architecture/DATA_MODEL.md) | Current status/model text reconciled | CP01–CP11 where the document describes pending target components; no new runtime behavior claimed |
| [docs/architecture/REPOSITORY.md](../../docs/architecture/REPOSITORY.md) | Current status/model text reconciled | CP01–CP11 where the document describes pending target components; no new runtime behavior claimed |
| [docs/contracts/AUTH_AND_ROLES_API.md](../../docs/contracts/AUTH_AND_ROLES_API.md) | No discrepancy in stated scope | No CP00 correction required |
| [docs/contracts/HTTP.md](../../docs/contracts/HTTP.md) | Intentionally open implementation/evidence finding | CP01/CP03–CP10: remaining runtime schemas and proposed HTTP routes |
| [docs/contracts/REALTIME.md](../../docs/contracts/REALTIME.md) | Intentionally open implementation/evidence finding | CP03/CP05/CP06: ticketed sockets, live leases, world and browser |
| [docs/contracts/MEDIA.md](../../docs/contracts/MEDIA.md) | Intentionally open implementation/evidence finding | Existing documented boundary retained; no finding requiring implementation in this snapshot |
| [docs/decisions/README.md](../../docs/decisions/README.md) | Current status/model text reconciled | CP01 and owning packets: unresolved D02–D13 remain explicit; no owner choice inferred |
| [docs/entities/README.md](../../docs/entities/README.md) | Current status/model text reconciled | CP01–CP11 where the document describes pending target components; no new runtime behavior claimed |
| [docs/migration/README.md](../../docs/migration/README.md) | Current status/model text reconciled | CP02/CP06/CP08/CP10: migration adapters/deferred UI and D10 business-data decision |
| [docs/migration/WEB_IMPORT.md](../../docs/migration/WEB_IMPORT.md) | Current status/model text reconciled | CP01–CP11 where the document describes pending target components; no new runtime behavior claimed |
| [docs/operations/EGM.md](../../docs/operations/EGM.md) | No discrepancy in stated scope | No CP00 correction required |
| [docs/operations/README.md](../../docs/operations/README.md) | Intentionally open implementation/evidence finding | CP04/CP07/CP10/CP11: real environment, monitoring, recovery and pilot |
| [docs/planning/ACCEPTANCE.md](../../docs/planning/ACCEPTANCE.md) | No discrepancy in stated scope | No CP00 correction required |
| [docs/planning/AUTH_AND_ROLES_IMPLEMENTATION.md](../../docs/planning/AUTH_AND_ROLES_IMPLEMENTATION.md) | No discrepancy in stated scope | No CP00 correction required |
| [docs/planning/AUTH_IMPLEMENTATION_EVIDENCE.md](../../docs/planning/AUTH_IMPLEMENTATION_EVIDENCE.md) | No discrepancy in stated scope | No CP00 correction required |
| [docs/planning/BACKEND_SYSTEM_IMPLEMENTATION.md](../../docs/planning/BACKEND_SYSTEM_IMPLEMENTATION.md) | Intentionally open implementation/evidence finding | CP01–CP11: application/environment work follows the completion plan |
| [docs/planning/BACKLOG.md](../../docs/planning/BACKLOG.md) | Current status/model text reconciled | CP01–CP11: application/environment work follows the completion plan |
| [docs/planning/OFFICE_ADMISSION_IMPLEMENTATION.md](../../docs/planning/OFFICE_ADMISSION_IMPLEMENTATION.md) | Intentionally open implementation/evidence finding | CP02/CP03/CP05: map, bootstrap/tickets, activation grant and runtime |
| [docs/planning/ROADMAP.md](../../docs/planning/ROADMAP.md) | Current status/model text reconciled | CP01–CP11: application/environment work follows the completion plan |
| [docs/planning/SETUP_PROGRESS.md](../../docs/planning/SETUP_PROGRESS.md) | Current status/model text reconciled | CP01–CP11 where the document describes pending target components; no new runtime behavior claimed |
| [docs/product/B2B_SAAS.md](../../docs/product/B2B_SAAS.md) | Intentionally open implementation/evidence finding | CP01/CP04/CP09/CP11: hierarchy/lifecycle decisions, company UI and measured isolation |
| [docs/security/README.md](../../docs/security/README.md) | Current status/model text reconciled | CP04–CP11: deployed browser/live/media/recovery evidence remains open |
| [apps/api/README.md](../../apps/api/README.md) | No discrepancy in stated scope | No CP00 correction required |
| [apps/web/README.md](../../apps/web/README.md) | Current status/model text reconciled | CP01–CP11 where the document describes pending target components; no new runtime behavior claimed |
| [apps/shared/README.md](../../apps/shared/README.md) | No discrepancy in stated scope | No CP00 correction required |
| [apps/worker/README.md](../../apps/worker/README.md) | No discrepancy in stated scope | No CP00 correction required |
| [packages/contracts/README.md](../../packages/contracts/README.md) | Current status/model text reconciled | CP01–CP11 where the document describes pending target components; no new runtime behavior claimed |
| [packages/delivery/README.md](../../packages/delivery/README.md) | Current status/model text reconciled | CP01–CP11 where the document describes pending target components; no new runtime behavior claimed |
| [packages/world/README.md](../../packages/world/README.md) | No discrepancy in stated scope | No CP00 correction required |
| [packages/assets/README.md](../../packages/assets/README.md) | Current status/model text reconciled | CP02/CP06: selected runtime catalog/derived art and renderer proof |
| [packages/tooling/README.md](../../packages/tooling/README.md) | Current status/model text reconciled | CP01–CP11 where the document describes pending target components; no new runtime behavior claimed |
| [infra/README.md](../../infra/README.md) | No discrepancy in stated scope | No CP00 correction required |
| [tests/README.md](../../tests/README.md) | No discrepancy in stated scope | No CP00 correction required |
| [spikes/media-enforcement/README.md](../../spikes/media-enforcement/README.md) | No discrepancy in stated scope | No CP00 correction required |
| [docs/entities/assets/PLAN.md](../../docs/entities/assets/PLAN.md) | Current status/model text reconciled | CP02/CP06: selected runtime catalog/derived art and renderer proof |
| [docs/entities/assets/README.md](../../docs/entities/assets/README.md) | Current status/model text reconciled | CP02/CP06: selected runtime catalog/derived art and renderer proof |
| [docs/entities/audit-events/PLAN.md](../../docs/entities/audit-events/PLAN.md) | Current status/model text reconciled | CP04/CP10: approved recovery metadata, independent evidence and restoration |
| [docs/entities/audit-events/README.md](../../docs/entities/audit-events/README.md) | Current status/model text reconciled | CP04/CP10: approved recovery metadata, independent evidence and restoration |
| [docs/entities/auth-tokens/PLAN.md](../../docs/entities/auth-tokens/PLAN.md) | Current status/model text reconciled | CP04/CP05/CP06/CP09: browser/security/profile/live integration and approved lifecycle |
| [docs/entities/auth-tokens/README.md](../../docs/entities/auth-tokens/README.md) | Current status/model text reconciled | CP04/CP05/CP06/CP09: browser/security/profile/live integration and approved lifecycle |
| [docs/entities/avatars/PLAN.md](../../docs/entities/avatars/PLAN.md) | Intentionally open implementation/evidence finding | CP02/CP05/CP06: approved geometry/catalog and authoritative client/world integration |
| [docs/entities/avatars/README.md](../../docs/entities/avatars/README.md) | Intentionally open implementation/evidence finding | CP02/CP05/CP06: approved geometry/catalog and authoritative client/world integration |
| [docs/entities/calendar-events/PLAN.md](../../docs/entities/calendar-events/PLAN.md) | Intentionally open implementation/evidence finding | CP06: remove/hide unsupported controls; functionality stays deferred/conditional |
| [docs/entities/calendar-events/README.md](../../docs/entities/calendar-events/README.md) | Intentionally open implementation/evidence finding | CP06: remove/hide unsupported controls; functionality stays deferred/conditional |
| [docs/entities/channels/PLAN.md](../../docs/entities/channels/PLAN.md) | Intentionally open implementation/evidence finding | CP06: remove/hide unsupported controls; functionality stays deferred/conditional |
| [docs/entities/channels/README.md](../../docs/entities/channels/README.md) | Intentionally open implementation/evidence finding | CP06: remove/hide unsupported controls; functionality stays deferred/conditional |
| [docs/entities/chat-messages/PLAN.md](../../docs/entities/chat-messages/PLAN.md) | Intentionally open implementation/evidence finding | CP06: remove/hide unsupported controls; functionality stays deferred/conditional |
| [docs/entities/chat-messages/README.md](../../docs/entities/chat-messages/README.md) | Intentionally open implementation/evidence finding | CP06: remove/hide unsupported controls; functionality stays deferred/conditional |
| [docs/entities/conversations/PLAN.md](../../docs/entities/conversations/PLAN.md) | Intentionally open implementation/evidence finding | CP07–CP09: proof, current conversations/grants and integrated tests |
| [docs/entities/conversations/README.md](../../docs/entities/conversations/README.md) | Intentionally open implementation/evidence finding | CP07–CP09: proof, current conversations/grants and integrated tests |
| [docs/entities/credentials/PLAN.md](../../docs/entities/credentials/PLAN.md) | Current status/model text reconciled | CP04/CP05/CP06/CP09: browser/security/profile/live integration and approved lifecycle |
| [docs/entities/credentials/README.md](../../docs/entities/credentials/README.md) | Current status/model text reconciled | CP04/CP05/CP06/CP09: browser/security/profile/live integration and approved lifecycle |
| [docs/entities/desk-assignments/PLAN.md](../../docs/entities/desk-assignments/PLAN.md) | Intentionally open implementation/evidence finding | CP06: remove/hide unsupported controls; functionality stays deferred/conditional |
| [docs/entities/desk-assignments/README.md](../../docs/entities/desk-assignments/README.md) | Intentionally open implementation/evidence finding | CP06: remove/hide unsupported controls; functionality stays deferred/conditional |
| [docs/entities/invitations/PLAN.md](../../docs/entities/invitations/PLAN.md) | Current status/model text reconciled | Existing documented boundary retained; no finding requiring implementation in this snapshot |
| [docs/entities/invitations/README.md](../../docs/entities/invitations/README.md) | Current status/model text reconciled | Existing documented boundary retained; no finding requiring implementation in this snapshot |
| [docs/entities/jobs/PLAN.md](../../docs/entities/jobs/PLAN.md) | Current status/model text reconciled | CP04/CP10: actual queue/provider faults, key management, safe tenant projection and operations |
| [docs/entities/jobs/README.md](../../docs/entities/jobs/README.md) | Current status/model text reconciled | CP04/CP10: actual queue/provider faults, key management, safe tenant projection and operations |
| [docs/entities/join-tickets/PLAN.md](../../docs/entities/join-tickets/PLAN.md) | Intentionally open implementation/evidence finding | CP02/CP03/CP05: map, bootstrap/tickets, activation grant and runtime |
| [docs/entities/join-tickets/README.md](../../docs/entities/join-tickets/README.md) | Intentionally open implementation/evidence finding | CP02/CP03/CP05: map, bootstrap/tickets, activation grant and runtime |
| [docs/entities/map-overrides/PLAN.md](../../docs/entities/map-overrides/PLAN.md) | Intentionally open implementation/evidence finding | CP06: remove/hide unsupported controls; functionality stays deferred/conditional |
| [docs/entities/map-overrides/README.md](../../docs/entities/map-overrides/README.md) | Intentionally open implementation/evidence finding | CP06: remove/hide unsupported controls; functionality stays deferred/conditional |
| [docs/entities/map-versions/PLAN.md](../../docs/entities/map-versions/PLAN.md) | Intentionally open implementation/evidence finding | CP02/CP05/CP06: approved geometry/catalog and authoritative client/world integration |
| [docs/entities/map-versions/README.md](../../docs/entities/map-versions/README.md) | Intentionally open implementation/evidence finding | CP02/CP05/CP06: approved geometry/catalog and authoritative client/world integration |
| [docs/entities/media-grants/PLAN.md](../../docs/entities/media-grants/PLAN.md) | Intentionally open implementation/evidence finding | CP07–CP09: proof, current conversations/grants and integrated tests |
| [docs/entities/media-grants/README.md](../../docs/entities/media-grants/README.md) | Intentionally open implementation/evidence finding | CP07–CP09: proof, current conversations/grants and integrated tests |
| [docs/entities/media-permits/PLAN.md](../../docs/entities/media-permits/PLAN.md) | Intentionally open implementation/evidence finding | CP07–CP09: proof, current conversations/grants and integrated tests |
| [docs/entities/media-permits/README.md](../../docs/entities/media-permits/README.md) | Intentionally open implementation/evidence finding | CP07–CP09: proof, current conversations/grants and integrated tests |
| [docs/entities/meeting-zones/PLAN.md](../../docs/entities/meeting-zones/PLAN.md) | Intentionally open implementation/evidence finding | Existing documented boundary retained; no finding requiring implementation in this snapshot |
| [docs/entities/meeting-zones/README.md](../../docs/entities/meeting-zones/README.md) | Intentionally open implementation/evidence finding | Existing documented boundary retained; no finding requiring implementation in this snapshot |
| [docs/entities/memberships/PLAN.md](../../docs/entities/memberships/PLAN.md) | Current status/model text reconciled | CP03/CP05: activation grants, live removal and lease expiry |
| [docs/entities/memberships/README.md](../../docs/entities/memberships/README.md) | Current status/model text reconciled | CP03/CP05: activation grants, live removal and lease expiry |
| [docs/entities/offices/PLAN.md](../../docs/entities/offices/PLAN.md) | Current status/model text reconciled | CP02/CP03/CP05: map, bootstrap/tickets, activation grant and runtime |
| [docs/entities/offices/README.md](../../docs/entities/offices/README.md) | Current status/model text reconciled | CP02/CP03/CP05: map, bootstrap/tickets, activation grant and runtime |
| [docs/entities/outbox/PLAN.md](../../docs/entities/outbox/PLAN.md) | Current status/model text reconciled | CP04/CP10: actual queue/provider faults, key management, safe tenant projection and operations |
| [docs/entities/outbox/README.md](../../docs/entities/outbox/README.md) | Current status/model text reconciled | CP04/CP10: actual queue/provider faults, key management, safe tenant projection and operations |
| [docs/entities/participants/PLAN.md](../../docs/entities/participants/PLAN.md) | Intentionally open implementation/evidence finding | CP03/CP05/CP06: ticketed sockets, live leases, world and browser |
| [docs/entities/participants/README.md](../../docs/entities/participants/README.md) | Intentionally open implementation/evidence finding | CP03/CP05/CP06: ticketed sockets, live leases, world and browser |
| [docs/entities/seats/PLAN.md](../../docs/entities/seats/PLAN.md) | Intentionally open implementation/evidence finding | CP02/CP05/CP06: approved geometry/catalog and authoritative client/world integration |
| [docs/entities/seats/README.md](../../docs/entities/seats/README.md) | Intentionally open implementation/evidence finding | CP02/CP05/CP06: approved geometry/catalog and authoritative client/world integration |
| [docs/entities/sessions/PLAN.md](../../docs/entities/sessions/PLAN.md) | Current status/model text reconciled | CP04/CP05/CP06/CP09: browser/security/profile/live integration and approved lifecycle |
| [docs/entities/sessions/README.md](../../docs/entities/sessions/README.md) | Current status/model text reconciled | CP04/CP05/CP06/CP09: browser/security/profile/live integration and approved lifecycle |
| [docs/entities/users/PLAN.md](../../docs/entities/users/PLAN.md) | Current status/model text reconciled | CP04/CP05/CP06/CP09: browser/security/profile/live integration and approved lifecycle |
| [docs/entities/users/README.md](../../docs/entities/users/README.md) | Current status/model text reconciled | CP04/CP05/CP06/CP09: browser/security/profile/live integration and approved lifecycle |
| [docs/entities/workspaces/PLAN.md](../../docs/entities/workspaces/PLAN.md) | Current status/model text reconciled | CP01/CP04/CP09/CP11: hierarchy/lifecycle decisions, company UI and measured isolation |
| [docs/entities/workspaces/README.md](../../docs/entities/workspaces/README.md) | Current status/model text reconciled | CP01/CP04/CP09/CP11: hierarchy/lifecycle decisions, company UI and measured isolation |
