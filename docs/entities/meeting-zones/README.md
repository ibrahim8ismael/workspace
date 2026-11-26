# Meeting zones

Status: implemented in office protocol v4; local multi-client room-audio acceptance passed · Updated: 2026-11-18

## Responsibility

Represent fixed meeting areas with explicit server-authorized group admission and media isolation.

- Owning module: Maps / Conversations.
- State location: Versioned trusted static map geometry; live meeting membership and generations in the single office runtime.
- The browser receives the trusted zone projection for display but cannot establish zone membership. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Runtime data

- `zoneId`, `mapVersion`, tile rectangle and tile size
- `workspaceId`, `officeId`, office epoch
- physical `occupancy` independently from explicitly `admittedMembers`
- explicit-admission access policy, occupancy-indicated walkable entrances, and transient conversation ID/version/lifecycle
- the room projection does not expose media generation, token or credentials
- fixed capacity of twenty; office occupancy remains independently capped at twenty

## Relationships

- [Map Versions](../map-versions/README.md)
- [Offices](../offices/README.md)
- [Participants](../participants/README.md)
- [Conversations](../conversations/README.md)

## Invariants and lifecycle

- The API uses the trusted map version installed for the office; it derives zone bounds and does not trust client coordinates or zone claims.
- The office-wide `meeting:zones` projection is scoped to workspace, office and epoch. Entrances come from trusted map collision plus map bounds and blocked tiles, are cached per trusted map and are descriptive; `occupied` never locks a doorway or exit.
- Occupancy reflects authoritative server positions. It does not grant meeting membership or media; `admittedMembers` reflects the separate meeting runtime roster.
- An explicit `meeting:join` requires an active live office participation, current availability, no conflicting conversation, physical presence inside the half-open zone rectangle and capacity below twenty. Invitation arrivals reserve capacity before travel begins.
- Walking into a room does not join or enable the microphone. Walking out or losing eligibility immediately removes the member.
- Membership changes increment the authoritative conversation version. The meeting keeps its stable LiveKit room identity while media policy removes departed participants; detailed roster updates are private through `conversation:update` and the office-wide room projection includes admitted participation IDs. Every admitted member can publish a microphone; only the current presenter can publish screen video.
- The web UI shows the current room, explicit Join/Leave actions, authoritative roster, capacity, invitation responses and mic controls. Presenter ownership is server-authoritative; its media permit is installed and revoked with the share lifecycle.
- `meeting:screen-share:start`, `meeting:screen-share:confirm`, and `meeting:screen-share:stop` use office protocol version 8. Private `meeting:screen-share:update` events carry versioned state only to admitted participants. Newly admitted viewers and authorized state resyncs receive the current state.
- A `starting` reservation expires after 30 seconds unless confirmed. A live share renews a 30-second server lease through the existing `confirm` command; presenter disconnect, failed refresh, or browser track end releases ownership within that lease. Meeting departure or loss of office authorization clears the departing presenter's state and informs remaining participants. Screen video uses a LiveKit track name containing the server-issued share ID. Only a signed matching unpublish event can clear that exact share; late events cannot clear a newer share, and publication events never grant ownership. Stop, expiry, departure or lost authorization removes the screen source while preserving microphone and subscription permissions. Old screen-capable credentials cannot restore the permission on reconnect. An API restart produces a fresh runtime policy; the guard retires the prior meeting generation and confirms its SFU room empty before acknowledging replacement policy.

## Interface outline

- `meeting:join { zoneId }`, `meeting:leave { conversationId, conversationVersion }`, and the scoped invitation/accept/decline/cancel events.
- The server emits private authoritative roster and media readiness updates. Meeting geometry is read-only display state.

`meeting:zones` protocol v4 sends room ownership, map version, bounds, capacity, explicit-admission policy, occupancy, admitted roster, live conversation ID/version/state when present, and bounded entrance geometry. It carries no generation, presentation state, or credential.

## Verification status

Contract, runtime and independent boundary-review tests cover bounded snapshots, occupancy versus admission, meeting membership retirement, proximity generation retirement, and the proximity room-domain boundary. Local real-SFU tests passed with six browser sessions: two adjacent room meetings and one separate proximity pair outside the doorway/wall. Each receiver decoded only its partner's audio; measured cutoff was 39 ms after physical room exit and 1,604 ms after company-membership revocation. Old tokens were rejected and reconnect did not restore admission. These measurements predate issue #66's stable meeting-room behavior, describe the local fixture only, and are not deployed acceptance or a latency percentile. Rerun room-media isolation against the revised membership policy. See [implementation plan](PLAN.md) and [issue #31 plan](../../planning/ISSUE_31_ROOM_AUDIO_ISOLATION.md).
