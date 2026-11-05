# Gather Lite — Project Knowledge and Implementation Brief

**Version:** 1.1  
**Updated:** 2026-11-05  
**Status:** Architecture and migration brief; application implementation has not started in this workspace.  
**Audience:** The project owner, developers, and Codex working in the implementation repository.

## 1. How Codex should use this document

Read this document before proposing architecture or implementing a feature. It consolidates the conversation's current direction and replaces conflicting choices in GATHER_LITE_TECH_STACK.md version 0.5 and OPEN_SOURCE_GATHER_ARCHITECTURE_COMPARISON.md. Those documents are historical references.

Distinguish the following statuses:

- **Agreed:** explicitly requested or clarified by the owner.
- **Recommended default:** an engineering proposal to use for planning; not evidence of an explicit owner decision.
- **Open:** must be resolved at the relevant implementation milestone.
- **Verified implementation:** requires actual code and recorded verification; this document does not establish that status.

Follow any implementation repository's AGENTS.md and applicable instructions. This file is knowledge, not permission to deploy, publish, or copy assets without checking their provenance. Do not report design controls or proposed acceptance tests as implemented or passed.

The owner's conversational preference is Arabic. Technical documentation is maintained in English for implementation use. Use TypeScript for new application code. Preserve tenant boundaries and authentication requirements while adapting upstream UI.

## 2. Product and owner intent

Gather Lite is a browser-based virtual office: people walk around a shared 2D space, see who is available, approach colleagues, join meeting areas, and communicate through voice, video, and screen sharing.

**Agreed product clarification (2026-11-05):** Gather Lite is a **B2B SaaS** product for companies and their teams. Company/customer tenancy, isolated access and company administration are core planning requirements. The recommended MVP mapping is one customer company per workspace/tenant with one office; whether an explicit organization entity must own multiple workspaces is open and must be resolved before freezing tenant schemas. A global user identity may hold independent memberships in multiple customer tenants; permissions never carry across them. Platform operations privileges are separate from customer owner/member roles. See [B2B SaaS product plan](docs/product/B2B_SAAS.md).

B2B SaaS positioning does not by itself change the existing decision to exclude payments from MVP. Pricing, subscriptions, commercial entitlements, enterprise identity features and contractual service levels remain future product decisions.

The owner selected this direction:

1. Reuse suitable frontend UI, visual assets, and map information from Open Office For All.
2. Rebuild the world renderer in Phaser using those assets; retain React for application UI.
3. Replace the upstream backend with NestJS APIs and Socket.IO realtime services.
4. Use MongoDB with Mongoose for durable application data and Redis for appropriate temporary state/cache. Keep BullMQ for background jobs.
5. Integrate self-hosted LiveKit OSS SFU with NestJS; understand WebRTC without implementing a media engine.
6. Own authentication in backend APIs using Secure HttpOnly cookies. No managed auth provider.
7. Use Caddy and Docker. Payments are excluded from MVP.

This is a frontend reuse and backend migration project, with a renderer rewrite. It is more work than hosting an unmodified upstream fork, and it should proceed through small working slices.

## 3. Current stack and superseded decisions

| Layer | Current direction | Status and responsibility |
|---|---|---|
| Application UI | React + TypeScript, adapting upstream UI | Agreed: menus, onboarding, chat surfaces, meeting controls, settings |
| Frontend tooling | Vite | Recommended default: preserve upstream build setup; Next.js is not required for the office client |
| World renderer | Phaser | Agreed: world scene, camera, sprites, animation, input, interpolation, interactions |
| HTTP backend | NestJS + TypeScript | Agreed: auth, workspaces, membership, persistence, invitations, media authorization |
| Realtime | Socket.IO integrated with NestJS | Agreed; replaces Colyseus and upstream raw ws transport |
| Database | MongoDB + Mongoose | Agreed: durable records and indexes; transactions where required |
| Authentication | First-party backend APIs and opaque server sessions | Agreed: HttpOnly browser cookie; no session token in frontend storage |
| Cache and temporary coordination | Redis | Agreed; usage and correctness requirements must be explicit |
| Background jobs | BullMQ + dedicated production Redis | Retained from prior planning: email, outbox delivery, retryable work |
| Audio/video transport | Self-hosted LiveKit OSS SFU | Agreed integration; LiveKit handles WebRTC media and signaling |
| Media topology | LiveKit for both proximity and meeting calls | Recommended MVP default; owner has not explicitly finalized P2P versus SFU for proximity |
| Ingress | Caddy | Agreed: TLS, static frontend hosting and HTTP/Socket.IO routing |
| Packaging/deployment | Docker and Docker Compose initially | Agreed: separately runnable services and persistent volumes |
| Media revocation enforcement | Application authorization plus a proven signaling/control enforcement design | Retained security requirement; Docker-compatible mechanism needs an early proof of concept |
| Billing/payments | Excluded from MVP | Agreed: no MVP provider, checkout, billing collections, subscriptions or payment gates; later commercial model remains open |

The old Next.js/Colyseus architecture is superseded by the current React/Phaser/NestJS/Socket.IO direction. Vite is a planning default, not an independently confirmed new framework requirement. Do not add both Socket.IO and Colyseus for the same office state. Centrifugo is not needed in this plan.

## 4. Upstream project and evidence boundaries

**Repository:** https://github.com/VictorSandovalDev/OpenOfficeForAll  
**Inspected branch:** main  
**Inspected Git tree SHA:** 23d6b8999396f9e9d51291bf85bd7b72161f833f  
**Inventory observed:** 498 blobs, including code, configuration, documentation and image assets. The tree SHA is not recorded as a commit SHA.

The conversation inspected the repository tree, package manifest, key server and account modules, frontend integration hooks, renderer/navigation excerpts, deployment files and documentation. It did not read every source line or visually inspect every asset, run the application, run upstream tests, or conduct a security audit. Pin a real upstream commit before import and review all code actually reused.

### 4.1 Actual upstream stack

| Area | Observed implementation |
|---|---|
| UI | React, React DOM, TypeScript, Vite, CSS, lucide-react |
| World | Custom React/SVG scene and pixel images, not Phaser |
| Backend | Node built-in HTTP server plus ws library; no NestJS or Express dependency in the inspected manifest |
| Realtime | Custom JSON WebSocket messages on /ws?room=<slug> |
| Account storage | Local accounts.json; password hashing through Node scrypt; SHA-256 session-token digests |
| Browser session transport | Token stored in localStorage and sent in JSON/join payloads; not HttpOnly cookies |
| Durable office data | JSON files for workspaces, decorations, names, chat, calendar and desks |
| Live state | Process-local maps and sets; participants and seating occupancy are transient |
| Proximity calls | Browser RTCPeerConnection P2P; server relays SDP/ICE signaling |
| Group meetings | Optional LiveKit client integration, room-specific tokens and SFU connections |
| Deployment | Node container, Caddy, coturn, LiveKit, Compose and volumes |
| Verification tooling | Node test runner; TypeScript noEmit and Vite build; GitHub workflow files present |

Manifest versions observed: react/react-dom 19.3.1, livekit-client 2.22.4, lucide-react 1.61.0, ws 8.22.0, TypeScript 7.0.2, Vite 8.3.5. Docker uses node:24-alpine; Compose references Caddy 2.8, coturn 4.6 and LiveKit v1.13. These are snapshot observations, not approved version recommendations. Select maintained compatible versions, lockfiles and image digests at implementation time.

### 4.2 Important upstream paths

| Path | Purpose and migration treatment |
|---|---|
| src/main.tsx | Entry and workspace selection; adapt bootstrap and auth |
| src/App.tsx | Application composition and controls; split responsibilities as needed |
| src/WorkspaceHome.tsx | Workspace dashboard; connect to authorized APIs |
| src/VivoScene.tsx | Current React/SVG world; replace rendering with Phaser |
| src/navigation.ts | A* pathfinding and movement helpers; evaluate reusable pure logic |
| src/avatarSprite.ts and src/avatarLook.ts | Frame mapping, anchors and appearance; adapt to Phaser textures |
| src/sprites/ | Art composition, drawing and asset metadata; inventory generated versus file-based art |
| public/assets/pixel/ | Candidate image assets; check provenance and licenses |
| shared/ | Map, geometry, objects, seats and meeting helpers; extract engine-independent rules |
| src/useOffice.ts | Raw WebSocket connection/state hook; replace with Socket.IO adapter |
| src/useMedia.ts | P2P capture/negotiation and track management; study, then replace or reduce according to chosen topology |
| src/useSfu.ts | Existing LiveKit integration; adapt lifecycle and grants rather than copy security assumptions |
| src/config.ts | Runtime config, account API and localStorage secrets; replace auth/secret handling |
| src/workspaces.ts | Workspace APIs and browser recent history; replace server contracts |
| src/chat/ and src/calendar/ | Reusable UI; persistent chat/calendar are deferred MVP scope |
| src/meetingRecorder.ts | Browser audio recording; exclude from MVP |
| server/index.mjs | HTTP + world + persistence + signaling monolith; replace with NestJS modules |
| server/accounts.mjs | JSON accounts and sessions; replace with Mongo-backed auth |
| tests/ | Behavioral examples; adapt relevant invariants to new contracts |
| Dockerfile, deploy/, docker-compose.yml | Deployment starting reference; review networking and secrets before reuse |

LiveKit and password-account code exist in the inspected repository. An earlier reading treated some README roadmap items as unfinished because parsed checkboxes lost their checked state. Do not infer missing implementation from that rendering. Some deployment prose is still stale, such as text claiming no accounts exist; prefer inspected code plus verification.

### 4.3 Reuse and licensing

The root project declares MIT. Preserve required license and copyright notices when copying covered code. Review asset README files, provenance, third-party packages and any separate terms; root MIT alone does not establish rights to every asset or trademark. Do not import ignored private reference packs or third-party Gather branding/maps/art. Record upstream commit, copied paths, license notices and modifications in provenance documentation before distribution. This is a required due-diligence step, not a completed legal clearance.

## 5. Frontend: React UI and Phaser world

Keep application screens in React. Mount one Phaser game instance inside a dedicated world component; create/destroy it with the component lifecycle and clean up listeners, timers, audio and network subscriptions. Do not recreate the game for each React state change.

Phaser owns rendered world objects, local input, camera, animations and interpolation. React owns forms, panels, accessibility-friendly controls and media tiles. A typed bridge exchanges commands and coarse events; never synchronize the entire scene through React on every frame or expose a mutable global object as the application contract.

### 5.1 Asset migration

- Load PNG images directly as textures. Existing individual walking/sitting frames can become Phaser animations; no SVG conversion is required.
- SVG files can be loaded as rasterized textures when useful. This preserves appearance at a selected resolution, not React handlers or interactive SVG DOM behavior.
- Art generated by React/SVG drawing code needs export/rasterization or reimplementation as Phaser graphics/textures. Not every visible upstream element is an existing PNG.
- Inventory asset dimensions, foot anchors, direction, animation order, hit areas, occlusion layers and appearance customization. Packing an atlas is optional optimization after correct rendering.
- Preserve pixel-art sampling, consistent world units and sprite origins. Verify walls and furniture render in the correct order relative to avatars.
- Translate map metadata into a versioned engine-independent map definition: coordinate units, walkable cells, blocked edges, collision shapes, seat anchors/exits, zones and object IDs.
- Tiled JSON is an optional authoring/import format, not a prerequisite for reusing upstream metadata. Do not turn the whole map into one picture if interactive objects and collisions must remain editable by code.

The backend and Phaser consume compatible immutable map/collision definitions. Client collision improves feel; the server remains authoritative. JSON is appropriate for versioned static map/asset manifests. Replacing local JSON persistence means replacing mutable business-data files, not banning JSON as a format.

### 5.2 Frontend integration changes

Replace upstream raw WebSocket hooks with socket.io-client; the protocols are not interchangeable. Preserve UI behavior through typed feature adapters rather than making components depend on gateway internals. Replace localStorage auth/admin/invite secrets and client-chosen identities with backend session, invitation and role flows. Non-sensitive preferences and recent-workspace UI history can remain local.

Private HTTP responses must use no-store and never be bundled into static frontend assets. Load media libraries when needed. Accessible React controls should cover essential actions that a canvas alone cannot expose.

## 6. Target runtime architecture

~~~mermaid
flowchart LR
    Browser[React UI + Phaser + Socket.IO client + LiveKit client]
    Edge[Caddy: HTTPS and static frontend]
    API[NestJS: HTTP API + Socket.IO gateway + office runtime]
    DB[(MongoDB replica set + Mongoose)]
    Cache[(Redis cache)]
    Queue[(Dedicated Redis for BullMQ)]
    Worker[BullMQ worker]
    Guard[Media signaling authorization enforcement]
    SFU[Self-hosted LiveKit SFU + TURN]
    Browser --> Edge
    Edge -->|API and Socket.IO| API
    API <--> DB
    API <--> Cache
    API --> Queue --> Worker
    Worker <--> DB
    API <--> Guard
    Browser <-->|LiveKit signaling| Guard
    Guard <--> SFU
    Browser <-->|WebRTC media| SFU
~~~

Begin with a modular NestJS application containing HTTP and realtime gateways in one process, plus an independent worker and media services. This avoids a network boundary between business policy and the single MVP world owner. Keep module boundaries so realtime can become a separate service later when measured load warrants it.

Suggested NestJS modules: Auth, Users, Workspaces, Memberships, Invitations, Maps, OfficeRuntime, Realtime, Conversations, Media, Jobs/Outbox, and Audit/Health. Gateways validate, authorize and dispatch to services; do not put world rules or database operations directly in a giant event switch.

## 7. Socket.IO, world state and authority

Socket.IO supplies transport, rooms, reconnection, acknowledgements and broadcasting. It does not supply an authoritative simulation, collision rules, tenant authorization or durable exactly-once business processing. These are our responsibilities after replacing Colyseus.

### 7.1 Admission and continuing authorization

1. Authenticate HTTP using the server session. Verify account and workspace membership before issuing a random one-use office join ticket.
2. Bind its digest to user/session/workspace/office, protocol version, current office epoch and a 30-second expiry in MongoDB.
3. Send the ticket in the Socket.IO auth payload over TLS; keep it in browser memory, never URL parameters. Set up the namespace middleware to reject missing or invalid admission.
4. Atomically consume the ticket and recheck current policy. Serialize seat/capacity reservation in the single office runtime before broadcasting a participant.
5. Assign identity and roles from server records. A room slug, userId, socket.id or client role never proves membership.
6. Reconnect through fresh admission and obtain a full current snapshot. Do not replay stale moves or let connection-state recovery silently restore obsolete authorization.

Use an exact browser Origin allowlist at transport admission; Socket.IO CORS configuration alone does not protect WebSocket connections. Authorize every privileged event, not just initial connect. Validate runtime schemas, payload sizes, rates and allowed fields. HTTP CSRF tokens do not replace socket admission.

Periodically recheck session/account/membership state independently of client traffic. Retain the prior plan's proposed one-second checks and maximum five-second authorization lease, subject to measurement. Deadlines use monotonic request-start time, bounded remaining session lifetime, sequence numbers and fresh boot epochs; delayed replies cannot renew expired authorization. Immediate revocation events accelerate removal; periodic checks recover missed notifications.

On lease expiry remove world participation and conversation authorization. MongoDB failure denies new grants and protected operations; existing activity expires within the defined bounded policy. A fresh process starts with no valid leases.

### 7.2 Simulation and synchronization

- One canonical in-memory owner per office in MVP. Serialize commands that compete for seats, conversation membership and capacity, including across awaited calls.
- Send movement intent/direction and sequence numbers; advance using server time. Validate speed, world bounds, wall edges, furniture, seat exits and zone access. Client-supplied coordinates are not authoritative.
- Recommended starting point: 20 Hz simulation and up to 10 Hz state broadcasts, measured with the real map. Phaser predicts local motion, reconciles corrections and interpolates remote players.
- Initial join/rejoin returns a versioned snapshot. Later updates carry office epoch, state version and ordered deltas; resnapshot on gaps. Do not depend on automatic reconnect for durable event delivery.
- Movement should coalesce/drop obsolete updates rather than buffer and replay every old position after offline periods. Persistent commands need acknowledgement, idempotency keys and database confirmation.
- Keep tick state in process memory. Do not write every movement to MongoDB or Redis. Persist deliberate durable changes separately.
- One active office participation per user/workspace initially; explicit reauthorized takeover, not silent eviction of an active call.
- Broadcast only safe display fields. Never include email, password hashes, session/ticket secrets, invitation secrets or private policies in participant snapshots.

### 7.3 Conversation state machine

Recommended MVP behavior: explicit proximity opt-in, deterministic one-to-one pairing on the open floor, one conversation per participant, busy/away preventing automatic pairing, fixed zones for groups. Starting UX thresholds: two-tile join, three-tile leave, 500 ms exit debounce. Permission revocation is not debounced.

Use states such as idle, eligible, joining, active, retiring and ended. The server determines the authorized participant set and increments conversation versions on changes. Microphone/camera start off; screen sharing requires an explicit user action. UI shows who is in the current conversation and connection/retry status.

### 7.4 Scaling later

Socket.IO's Redis Adapter distributes broadcasts; it does not make independent in-memory office simulations consistent. Keep one process initially. Multiple processes require explicit office ownership/routing with fencing and failover before enabling them. HTTP polling transport also requires sticky routing across nodes, or a consciously selected WebSocket-only transport. Redis Pub/Sub is not a durable audit/job log.

## 8. WebRTC, LiveKit and NestJS responsibilities

We are not implementing a WebRTC engine or a custom SFU. Browsers implement WebRTC; LiveKit provides an SFU, signaling and SDKs. NestJS owns application policy and integrates with the maintained LiveKit server SDK.

| Component | Owns |
|---|---|
| Browser/LiveKit client | Capture permission, tracks, media connection, reconnect UX and display |
| Socket.IO office runtime | Presence, movement, zone/conversation membership and application events |
| NestJS Media service | Verify session and current conversation, issue scoped grants, reconcile rooms and participants |
| LiveKit SFU | WebRTC signaling, routing audio/video/screen tracks, media adaptation |
| TURN | Relay connectivity when peers cannot directly reach the media endpoint |

With LiveKit, do not recreate its SDP/ICE exchange over Socket.IO. Application events such as conversation-ready are separate from LiveKit's own signaling. NestJS does not forward audio/video packets through HTTP or Socket.IO.

### 8.1 Topology choice

**Recommended MVP default:** LiveKit for proximity and group meetings, with no parallel P2P stack. This reduces negotiation/reconnect code paths and centralizes media access control, at the cost of SFU bandwidth and operational responsibility.

**Alternative discussed:** native browser P2P for proximity, LiveKit for groups, matching upstream. NestJS/Socket.IO would relay SDP/ICE and validate signaling recipients; TURN would still be needed. This adds two media lifecycles and makes server-enforced termination of established direct media harder. It is not selected by the owner yet. Resolve before implementing media; do not build both by default.

mediasoup was considered: an OSS SFU toolkit using Node APIs and C++ media workers, requiring us to own more signaling, room and transport orchestration. LiveKit remains the chosen integration because it already supplies these components. Self-hosted OSS is distinct from LiveKit Cloud features.

### 8.2 Media grant and privacy rules

- Separate media rooms by conversation/private meeting. Do not put the whole office in one room and rely on local mute, volume or unsubscribe for privacy.
- Resolve room generation and participant identity on the server. Use opaque participation-scoped identities and new room names for retired generations.
- Recommended starting admission JWT lifetime: 60 seconds, issued with the server SDK after authorization; keep only in browser memory. Grant only needed join, publish sources and subscription capabilities; no admin permissions for users.
- Secrets stay in backend runtime secret storage; never VITE_ variables or frontend bundles. Token endpoints are no-store and CSRF/session protected.
- Verify signed LiveKit webhooks and process duplicates idempotently. They help reconcile actual media state, but do not authorize users or replace current world policy.
- Do not reuse upstream six-hour grants, localStorage credentials, browser-only leave enforcement, or a fixed room name as the production security design.
- Recommended initial video profile: 360p/15fps and bounded subscriptions/track sources. Capacity and bandwidth need measurement, including TURN.
- No recording, egress, ingress bots or AI notes in MVP. Do not retain the upstream browser recorder just because it is available. Transport encryption does not mean E2EE; E2EE is deferred.

### 8.3 Retained revocation requirement and early spike

Self-hosted LiveKit removal disconnects a participant but does not provide Cloud's token-revocation behavior. Tokens can be refreshed; admission expiry alone does not terminate an existing call. Short JWT TTL plus RemoveParticipant is therefore not a complete prevention of stale re-entry.

The earlier plan proposed a local TypeScript Media Guard which checks current authorization permits before all signaling join/reconnect paths, denies retired generations, and triggers room retirement. An independent supervisor stops SFU forwarding if permit enforcement or room deletion cannot be trusted. Keep this as a proposed implementation mechanism for the retained bounded-revocation requirement; it is custom infrastructure, not a built-in LiveKit feature or proven code.

Essential constraints to preserve in the spike:

- No public bypass to underlying LiveKit signaling/admin endpoints. Inventory pinned SDK paths including reconnect and token refresh behavior; proxy without rewriting the media protocol.
- Guard-initiated nonce/sequence-scoped policy pulls; positive permits are bounded by world/session/membership validity, not merely controller liveness. Push messages may revoke or request a refresh, never independently extend authorization.
- Monotonic request-start deadlines, fresh boot epochs, irreversible generation retirement and rejection of late or superseded snapshots. New participants receive tokens only after the intended permit version is installed and current policy is rechecked.
- Independent expiry enforcement; locally deny admission before DeleteRoom; version/serialize transitions. A one-second control timeout is a proposed starting value, not a measured guarantee.
- If control fails or the guard freezes, stop the guarded SFU through an independent mechanism and start again in default-deny mode. Show the node-wide call interruption honestly in UX and operations.
- Proposed total media cutoff target: eight seconds from revocation, based on five seconds of authorization plus three seconds of enforcement/shutdown budget. Measure forwarding cessation; do not claim immediate revocation or recall of already delivered content.

**Docker reconciliation is open:** ordinary restart policies and separate guard/LiveKit containers do not prove this safety property. The previous systemd control-group proposal cannot be assumed to terminate Docker-managed SFU processes. Select a container-aware independent supervisor or a tested supervised media unit, verify its authority to stop the SFU without exposing unrestricted Docker control, and test failure/restart behavior. If this mechanism is not viable, explicitly revise the revocation requirement and architecture with the owner; do not silently downgrade it.

## 9. MongoDB, Mongoose, Redis and jobs

### 9.1 Durable versus transient data

| Data | Location and rule |
|---|---|
| Users, credential hashes, session digests | MongoDB; never broadcast or client-persist secrets |
| Workspace memberships, roles, invitations | MongoDB with tenant-scoped queries and unique indexes |
| Workspace configuration, decoration edits, map version | MongoDB; base map/assets remain immutable versioned static content |
| Live positions, seat occupancy, current conversation state | Office owner's memory; reconstruct/reauthorize on restart |
| Cache, rate-limit counters, expiring hints | Redis with bounded TTL and documented failure behavior |
| Background queue state | Dedicated BullMQ Redis with persistence and noeviction |
| Durable event awaiting delivery | MongoDB transactional outbox |
| Images/sprite atlases | Static build/CDN/object storage, not base64 blobs inside user records |
| Chat history/calendar | MongoDB if added later; UI reuse does not bring them into MVP automatically |

Suggested collections: users, credentials, sessions, auth_tokens, workspaces, memberships, invitations, offices, map_versions/map_overrides, office_join_tickets, outbox, audit_events. Add chat_messages, channels, desk_assignments or calendar_events only when their feature enters scope.

Use schema validation, explicit DTO projections and allowlisted updates. Never pass a raw request object or client Mongo operator to a query/update. Index normalized email, session/ticket/token digests, workspace+user membership and relevant time/order keys. TTL indexes clean up records; application guards must check expiry themselves.

Use a transaction-capable replica set in development and production. Enforce single-use invites/tickets, owner transfer, token redemption and capacity counters atomically. Limit each workspace to one owner for MVP; transfer roles in one transaction. Sensitive authorization-plus-write operations must conflict with concurrent revocation by conditionally writing the relevant policy/version record, not merely reading a snapshot then writing an unrelated document.

Use majority-acknowledged security writes and bounded primary reads with the required freshness; where strict per-document ordering is needed, evaluate linearizable reads explicitly. Avoid reading authorization from secondaries or stale caches. Unknown commit outcomes require idempotency reconciliation, not blindly repeating effects.

### 9.2 JSON migration

Preserve map/object IDs and establish stable Mongo IDs and workspace mappings. Build an explicit offline importer with schema validation, backup, dry run, idempotent import keys and a record-count/error report. Password/session material must not be imported into the new auth system without an approved compatibility policy; prefer fresh account onboarding and revoke upstream sessions. Guest browser identities are not verified account identities.

If no production upstream data exists, seed clean maps/workspaces and skip a general importer. Do not introduce ongoing dual writes to files and MongoDB.

### 9.3 Redis and BullMQ

Production cache Redis may evict disposable keys. Queue Redis needs persistence, noeviction, retention limits and monitoring; sharing conflicting eviction policies risks queue correctness. Local development can share one instance only with queue-safe settings and bounded cache size. Redis is not the durable source of identity or membership in the MVP.

Use BullMQ for transactional emails and retryable background tasks. Critical movement and immediate access revocation must not wait on a queue.

Write business state and an outbox record in the same MongoDB transaction. A dispatcher enqueues stable job IDs; workers perform idempotent effects and record delivery status. Duplicate email remains possible, but token redemption and membership creation remain single-use.

Put record IDs rather than reset links/passwords/session secrets into jobs. Retryable email secrets require a separately encrypted, expiring outbox payload with restricted keys, redaction and purge after delivery/expiry. Discard expired mail before sending it.

## 10. First-party authentication and browser security

### 10.1 Credentials and recovery

- Email/password with a documented canonicalization policy and unique index. No provider-specific plus/dot normalization.
- Use a maintained Argon2id library; benchmark at least the current accepted minimum, bound concurrent hashing and validate maximum input length. A prior starting point was 19 MiB memory, two iterations and parallelism one; verify current guidance when implementing.
- Recommended password-only policy: minimum 15 characters, support at least 64, allow paste/passphrases and block common/compromised values without truncation.
- Verify email before workspace creation, invite acceptance or office entry. Pending registration grants no authenticated session.
- Prevent preregistration takeover: verification must establish knowledge of the pending password, or mailbox recovery replaces that password before activation. Never activate an attacker-selected password merely on clicking a verification link.
- Random single-use purpose-separated verification/reset tokens, digests in Mongo, explicit expiry (starting defaults: 24-hour verification, 15-minute reset), CSRF-protected POST redemption. GET links only display a form.
- Recovery replaces the credential, consumes the token and increments authVersion atomically. Recheck credential/authVersion during concurrent session issuance. Do not automatically log in after reset or restore suspended status/membership.
- Provide generic recovery/resend responses, supersede older tokens, IP/account/global limits and bounded hashing. No permanent attacker-triggerable account lockout.
- Require recent password reauthentication for password change, owner transfer and destructive operations. Email changes, SSO/social auth and user MFA are deferred; infrastructure administration requires MFA.

### 10.2 Sessions

Generate opaque random 32-byte secrets and store only their SHA-256 digests in MongoDB. Recommended starting session lifetime: 12 hours absolute and 60 minutes idle. User activity can extend idle time within the absolute limit; passive heartbeat alone cannot. Provide warning and user-confirmed extension behavior for long meetings.

~~~http
Set-Cookie: __Host-gather_session=<opaque-secret>; Path=/; Secure; HttpOnly; SameSite=Lax
~~~

No Domain attribute. Only the app origin receives the cookie. Verify session expiry, revocation, account status and current user authVersion on protected calls; no authoritative Redis session caching initially. Rotate session and CSRF binding on login/reauthentication. Logout clears the correctly scoped cookie and revokes the record; reset/logout-all invalidates old sessions and realtime/media authorization. Reject expired records even before TTL removal.

Never put the app session secret into JavaScript, localStorage, IndexedDB or URLs. One-use office tickets and scoped LiveKit JWTs are separate capabilities, kept only in memory. Session cookies are not forwarded to media services.

### 10.3 CSRF, XSS and origins

Use a single configured public app origin. Session-bound synchronizer CSRF tokens are required on state-changing HTTP calls, including auth, tickets and media grants; require exact Origin and JSON content type. Bootstrap short-lived anonymous CSRF state for login/register without granting user access.

The CSRF bootstrap must preserve a valid existing session. For supported modern browsers require same-origin Fetch Metadata plus a custom X-Requested-With header before setting a bootstrap cookie, so cross-site navigation cannot overwrite a session. Bound anonymous session creation.

HttpOnly does not prevent XSS from acting as the user. Apply output escaping, restrictive CSP and frame policies; review upstream rich-text rendering and external-link/note features. Avoid untrusted HTML and unnecessary third-party scripts. Redact cookies, auth headers, tickets, LiveKit signaling token parameters, recovery links and secret bodies in Caddy/app logs and tracing.

Use a configured trusted origin for email links, not an untrusted Host header. Recovery pages use no-store/no-referrer, no third-party resources and remove secrets from browser history. Credentialed cross-origin access is disabled in the initial topology.

## 11. API and event contract outline

Define one shared TypeScript contract package with runtime schemas (Zod is the recommended default), event constants, protocol/map versions, limits and safe DTOs. Shared TypeScript types alone do not validate network input. Keep map rules free of framework, filesystem, env and database dependencies.

HTTP APIs include:

- Auth: csrf, register, verify-email, resend-verification, login, me, sessions, logout, logout-all, forgot/reset/change-password and reauthenticate.
- Workspaces: create/list/read, membership/invitations, owner controls; all lookups scoped to the authenticated actor.
- Offices: map manifest, snapshot bootstrap and POST join-ticket.
- Conversations: POST media-token with server-resolved current generation; clients cannot mint arbitrary room identities.

Suggested Socket.IO events include office:join/ready, world:input/snapshot/delta/resync, presence:update, seat:sit/stand, conversation:update/leave, meeting:join/leave, reaction:send and structured errors/acknowledgements. Names are proposed contracts, not existing code. No custom WebRTC signal event is needed if the recommended all-LiveKit topology is selected.

Use idempotency keys for durable commands, request/event IDs for diagnostics and typed error codes such as unauthorized, membership_required, room_full, protocol_mismatch, stale_epoch, rate_limited and media_unavailable. Server code revalidates every workspace/zone/target scope.

## 12. Caddy, Docker and operational boundaries

Recommended topology: Caddy serves built React assets and routes /api and /socket.io to NestJS on the same application origin. Media has a separate TLS signaling endpoint with no public administrative bypass. MongoDB, Redis and internal control APIs stay private.

Docker Compose services: web/ingress, backend, worker, Mongo replica set, cache Redis, queue Redis, LiveKit, and required media guard/supervision and TURN arrangement. A separate coturn deployment is optional if the selected LiveKit embedded TURN configuration meets requirements; avoid two unnecessary relays. Configure UDP/media/public IP explicitly; Caddy HTTPS routing alone cannot carry all WebRTC traffic.

The upstream Caddy route uses host.docker.internal for host-networked LiveKit. Do not assume this resolves on every Linux Docker setup; configure and verify the actual host gateway/private address. Validate TURN/TLS port 443 routing on a separate endpoint/IP or tested layer-4 arrangement. Guarded signaling must not gain an alternate public bypass through TURN or another proxy route.

Use maintained pinned images, runtime secrets outside version control, least-privilege containers, durable volumes, readiness/liveness checks and graceful draining. Don't restart an authoritative office behind a load balancer without forcing a new epoch and fresh admission.

Monitor socket counts, event rate, tick delay, memory, snapshot size, media join failures, TURN usage/egress, stale/orphan rooms, lease expiry, auth abuse, queue age and backup failures. Keep minimal restricted security audit events; proposed retention is 30 days.

Provisional MVP quotas inherited from earlier planning: 30 members/workspace, 3 owned workspaces/user, 20 simultaneous office participants, 6 people/meeting zone, 30 input messages/second and 4 KiB application-event payloads. These are unmeasured configuration defaults, not upstream capacity claims. Apply separate login, ticket, grant and delivery budgets; server-required media migration must not let a churning user exhaust everyone else's token budget.

Back up MongoDB and necessary asset/config metadata; initial proposed objectives are RPO 1 hour and RTO 4 hours, requiring an actual provider and restore drill. Mirror security-change evidence outside the application backup set. On restore, suspend access, invalidate restored sessions/outstanding tokens/media generations, reconcile later password resets/suspensions/membership removals, and require fresh mailbox recovery where credential history is uncertain. A fresh login using an old restored password does not repair rollback.

## 13. Repository organization and migration sequence

Suggested structure, to be adapted to the implementation repository:

~~~text
apps/web/                 React UI + mounted Phaser game
apps/api/                 NestJS HTTP, Socket.IO and office runtime
apps/worker/              BullMQ processors and outbox dispatcher
packages/contracts/       Runtime schemas, DTOs and event/version constants
packages/world/           Map format and pure collision/seat/zone rules
packages/assets/          Cleared assets, manifests and provenance
infra/                    Caddy, Docker, LiveKit, TURN and media supervision
docs/                     Architecture, decisions, runbooks and acceptance evidence
~~~

Use a lockfile and one package-management convention. Preserve upstream behavior with explicit adapters, not a second hidden legacy backend. A temporary private test harness can compare rendering/rules; public deployments must have one authoritative backend and no debug token issuer.

### Milestone 0 — Provenance, contracts and difficult assumptions

Pin upstream commit and inventory every reused path/asset. Decide Vite versus any separately justified framework requirement; settle all-LiveKit versus hybrid P2P. Freeze map coordinates, contract schemas, session/CSRF model and ownership rules.

Prove Docker/Caddy same-origin routing, replica-set transactions, basic React/Phaser integration using one real avatar/object, and the media revocation/supervision spike. A rendering sample must demonstrate pixel scale, foot anchors and occlusion. A media spike must exercise stale/refreshed-token re-entry, controller loss, guard freeze, failed deletion and public bypass attempts before expanding features.

### Milestone 1 — Backend identity and workspace foundation

Implement Mongo models/indexes, auth lifecycle, cookie/CSRF behavior, transactional invitation/owner rules, audit and outbox/worker mail. Connect minimal React onboarding. Remove legacy localStorage tokens and shared admin/invite-key authorization from the new client paths.

### Milestone 2 — One authoritative two-user office

Mount Phaser; import one fixed map and essential avatar animations. Build Socket.IO ticket admission, world input/validation, snapshots/deltas, seats and reauthorization. Verify collisions, stale inputs, reconnect/epoch changes and explicit tab takeover.

### Milestone 3 — Proximity voice and privacy

Implement explicit opt-in, deterministic matching, conversation versions and actual LiveKit grants/enforcement. Exercise real microphone media, permission denial, browser reconnect, TURN-only networks and stale room access. Record measured revocation and call interruption behavior.

### Milestone 4 — Pilot feature completion

Add fixed group meetings, camera/screen share, workspace administration and necessary reused UI. Validate tenant/zone boundaries, race conditions, quotas and media publication limits. Keep deferred UI hidden until supported.

### Milestone 5 — Operational pilot

Measure a 20-user office on declared hardware/network profiles, plus weaker networks and media failure cases. Exercise Redis/worker recovery, Mongo loss, controlled restarts, backups/restores and media supervision. Earlier provisional UX targets were 95% successful media joins and two-second p95 conversation join on a declared stable-network profile; revise using evidence.

## 14. MVP scope and release acceptance

**MVP:** verified accounts/recovery, workspace membership/invitations, one fixed reusable map, essential avatars, authoritative movement/seats, availability, opt-in one-to-one proximity voice, fixed group meetings, explicit camera/screen share, administration, reconnect and operational visibility.

**Deferred:** payments/billing, persistent chat/DMs, calendar integration, recorder/egress, AI notes, user map uploads/editor, complex dynamic group clustering, mobile apps, multi-region hosting, SSO/social login, email changes and E2EE. Existing upstream UI for these features is reusable material, not a commitment to implement all of them now.

Required implementation evidence before pilot:

1. Correct cookies, CSRF, browser Origin rejection and no secrets in storage/URLs/logs.
2. Registration/verification/recovery race handling, session fixation prevention, expiry/logout-all, preregistration takeover prevention and real email delivery.
3. Tenant ID substitution, NoSQL operator/mass-assignment attempts, single-use invitations, owner/capacity races and expired records before TTL cleanup.
4. Socket admission bypass/replay, stale recovery, identity spoofing, oversized/rate-abusive events and revoked membership while the socket is open.
5. Server-time movement limits, wall/seat/zone validation, snapshots after gaps, command idempotency, tab conflicts and incompatible protocol/map versions.
6. Pixel assets/anchors/occlusion, Phaser cleanup, React bridge behavior and essential accessible controls.
7. Original/refreshed media-token replay, retired generations, grant sources, independent lease expiry, failed controllers/guard/SFU control, public signaling bypass and measured forwarding cutoff.
8. Browser permission denial, camera/screen lifecycle, TURN-only access, weak networks, media migration and no recording feature leaking into MVP.
9. Cache eviction versus queue persistence, duplicate worker processing, outbox/enqueue failures and expired encrypted delivery payloads.
10. Controlled restart/epoch changes, no unguarded fallback, operational alerts and backup restore that cannot resurrect old credentials or revoked membership.

These checks describe future work. No application/infrastructure acceptance results have been obtained by writing this knowledge file.

## 15. Open decisions and instructions for future changes

| Decision | Planning default / required resolution |
|---|---|
| B2B customer tenancy | Agreed B2B SaaS; recommend one company per workspace for MVP; resolve organization → multiple-workspace hierarchy before freezing schemas |
| Proximity media topology | Recommend all-LiveKit; resolve before implementing media |
| Frontend build system | Recommend preserving Vite; use Next.js only with an explicit requirement and owner decision |
| Exact upstream import | Pin commit; inventory copied code/art and provenance before import |
| LiveKit revocation enforcement under Docker | Retain security requirement; choose and prove independent supervision in Milestone 0 |
| Map format and asset build | Adapt upstream metadata; optionally use Tiled and atlas tooling after proving compatibility |
| Package/image versions | Select maintained compatible versions, lockfiles and image digests at implementation start |
| Hosting, region, secrets and mail provider | Validate same-origin ingress, UDP/TURN, private networking and recovery objectives |
| Auth/session quotas, media caps and time budgets | Provisional defaults; tune from measured behavior without silently weakening security |
| Future scaling | Single office owner initially; owner routing/fencing required before horizontal world scaling |

When decisions change, update the stack table, diagrams, contracts, migration milestones and acceptance criteria together. Do not reintroduce superseded Colyseus or managed-auth choices based on older conversation fragments. Do not remove security requirements merely because upstream omitted them. Explain scope/availability costs and obtain an explicit decision for a material guarantee change.

To use in an implementation repository, copy this file to docs/GATHER_LITE_PROJECT_KNOWLEDGE.md and reference it from that repository's AGENTS.md, for example:

~~~text
Before architecture or implementation work, read docs/GATHER_LITE_PROJECT_KNOWLEDGE.md.
Treat its agreed decisions as the project baseline and keep recommended/open choices explicit.
Update it when accepted architecture decisions change.
~~~

This snippet is for the implementation repository. The current mirrored ChatGPT project's sources directory remains read-only.

## 16. Source links

Upstream observations refer to the inspected snapshot, with links to main for navigation; pin commit-specific source links when importing. The official links below explain library capabilities, not verification of our custom design.

- [Open Office For All repository and MIT license](https://github.com/VictorSandovalDev/OpenOfficeForAll)
- [Upstream dependency manifest](https://github.com/VictorSandovalDev/OpenOfficeForAll/blob/main/package.json)
- [React/SVG world](https://github.com/VictorSandovalDev/OpenOfficeForAll/blob/main/src/VivoScene.tsx)
- [Raw WebSocket frontend integration](https://github.com/VictorSandovalDev/OpenOfficeForAll/blob/main/src/useOffice.ts)
- [P2P WebRTC integration](https://github.com/VictorSandovalDev/OpenOfficeForAll/blob/main/src/useMedia.ts)
- [LiveKit frontend integration](https://github.com/VictorSandovalDev/OpenOfficeForAll/blob/main/src/useSfu.ts)
- [Upstream browser config/auth storage](https://github.com/VictorSandovalDev/OpenOfficeForAll/blob/main/src/config.ts)
- [Upstream account implementation](https://github.com/VictorSandovalDev/OpenOfficeForAll/blob/main/server/accounts.mjs)
- [Server/protocol documentation](https://github.com/VictorSandovalDev/OpenOfficeForAll/blob/main/server/README.md)
- [Compose topology](https://github.com/VictorSandovalDev/OpenOfficeForAll/blob/main/docker-compose.yml)
- [Phaser asset loading](https://phaser.io/oss/docs/api-documentation/class/loader-loaderplugin)
- [NestJS gateways](https://docs.nestjs.com/websockets/gateways)
- [NestJS Socket.IO adapter and multi-node requirements](https://docs.nestjs.com/websockets/adapter)
- [Socket.IO rooms](https://socket.io/docs/v4/rooms/)
- [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/)
- [Socket.IO Redis Adapter](https://socket.io/docs/v4/redis-adapter/)
- [LiveKit SFU](https://docs.livekit.io/reference/internals/livekit-sfu/)
- [LiveKit token grants/lifecycle](https://docs.livekit.io/home/server/generating-tokens)
- [LiveKit participant management and Cloud-only revocation](https://docs.livekit.io/intro/basics/rooms-participants-tracks/participants/)
- [LiveKit self-hosting and deployment](https://docs.livekit.io/transport/self-hosting/deployment/)
- [mediasoup overview](https://mediasoup.org/documentation/overview/)
- [Mongoose schema guide](https://mongoosejs.com/docs/guide.html)
- [MongoDB consistency](https://www.mongodb.com/docs/manual/core/read-isolation-consistency-recency/)
- [MongoDB transaction considerations](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/)
- [BullMQ production configuration](https://docs.bullmq.io/guide/going-to-production)
- [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs)
- [OWASP authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- [OWASP WebSocket security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)
