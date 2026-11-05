# Gather Lite — Technology Stack, Security and Implementation Plan

**Version:** 0.5 — implementation decisions specified  
**Updated:** 2026-11-04  
**Status:** Design corrections incorporated. Implementation and measured acceptance evidence are required before pilot release.

This version replaces the earlier plan and review appendix with one consistent design. Authentication is owned by the NestJS backend. The decisions below include engineering defaults selected for the MVP; numerical limits are starting configurations to verify, not measured performance claims.

## 1. Product and selected stack

Gather Lite is a desktop virtual office for small remote teams: enter a shared 2D map, move an avatar, see availability, and talk through proximity. The first technical slice is two users, one map, one authorized voice conversation.

| Area | Selected decision | Responsibility |
|---|---|---|
| Web application | Next.js + TypeScript | Application UI, routing, onboarding, settings, and media controls |
| 2D renderer | Phaser | Tilemaps, avatars, input, animation, and interpolation |
| Application backend | NestJS + TypeScript | Authentication, authorization, workspaces, invitations, persistence, and media control |
| Database | MongoDB + Mongoose | Durable identity, session, workspace, policy, and operational records |
| Authentication | First-party NestJS APIs | Email/password, verification, recovery, revocable server sessions |
| Browser authentication transport | Secure HttpOnly cookie | Opaque session identifier; session state lives on the backend |
| Multiplayer | Colyseus | Authoritative movement, collisions, zones, presence, and conversation membership |
| Media | Self-hosted LiveKit OSS SFU | Audio, video, and screen-sharing transport |
| Media access enforcement | Local TypeScript Media Guard and OS supervisor | Signaling admission, current authorization leases, room retirement, and fail-closed SFU shutdown |
| Cache | Redis | Bounded, disposable application cache and non-authoritative counters |
| Jobs | BullMQ + dedicated Redis | Email delivery, retryable work, outbox delivery and cleanup |
| Additional socket platform | None in MVP | Colyseus handles office realtime events |
| Packaging | TypeScript monorepo, separately runnable processes | Shared contracts, independent runtime capacity |
| Payments | Excluded | No payment provider, checkout, billing schema, or subscription enforcement |

Use maintained cryptographic and validation libraries. Owning authentication means owning its product flows and backend logic; it does not require implementing cryptographic primitives.

## 2. Deployment and trust boundaries

Use one public application origin, for example https://app.example.com:

- Web routes go to Next.js.
- /api routes go directly to NestJS through the trusted ingress.
- /realtime routes go to Colyseus with secure WebSocket support.
- LiveKit runs on a dedicated Linux media VM. A local Media Guard fronts its signaling endpoint; WebRTC media still flows directly to the SFU. Configure TURN separately from application ingress.
- MongoDB, Redis, internal policy endpoints, and management dashboards are private.

The app origin routes must resolve correctly in the selected hosting provider before implementation assumes same-origin cookies. Do not introduce shared parent-domain cookies to compensate for an incompatible hosting layout.

~~~mermaid
flowchart LR
    Browser["Browser: Next.js UI, Phaser, LiveKit SDK"]
    Edge["Trusted HTTPS ingress: one app origin"]
    Web["Next.js"]
    API["NestJS: auth, policy, media control"]
    World["Colyseus: authoritative office"]
    Mongo[("MongoDB: users, sessions, policy, outbox")]
    Cache[("Redis cache")]
    Jobs[("Redis queues")]
    Worker["BullMQ workers"]
    Guard["Local Media Guard: admission and enforcement"]
    Supervisor["OS supervisor: guard + SFU process group"]
    Media["LiveKit SFU + authenticated TURN"]

    Browser --> Edge
    Edge --> Web
    Edge -->|"/api"| API
    Edge <-->|"/realtime"| World
    API <--> Mongo
    API <--> Cache
    API --> Jobs
    Jobs --> Worker
    Worker <--> Mongo
    World <-->|"authenticated internal policy calls"| API
    API <-->|"scoped control and authorization snapshots"| Guard
    Browser <-->|"authenticated signaling"| Guard
    Guard <-->|"local signaling proxy and room control"| Media
    Supervisor -->|"watchdog and forced shutdown"| Guard
    Supervisor -->|"same supervised process group"| Media
    Browser <-->|"WebRTC media"| Media
~~~

The application backend owns durable policy. Colyseus owns live movement and conversation membership. NestJS owns LiveKit integration. Redis cache never decides authorization. LiveKit room membership is an effect of application policy, not its source of truth.

The Media Guard is a small security adapter on the media VM, not another application messaging platform. It authenticates signaling admission, then proxies the protocol without reimplementing WebRTC or rewriting media/signaling payloads. It checks current scoped authorization and applies local room-control commands. NestJS sends all application media-control commands through this adapter. The SFU signaling/admin listener has no public bypass; public media ports do not expose an alternate signaling path.

Use server-side session cookies only for the app origin. Strip Cookie headers before forwarding ticket-authenticated realtime requests to Colyseus. Never forward app cookies to LiveKit. Internal endpoints require service credentials and network restrictions; a private-looking URL is not authentication.

## 3. First-party authentication design

### 3.1 Credentials and account lifecycle

MVP identity is a verified email address and password. User IDs are application-generated opaque identifiers. Product profiles and credentials are separate records with explicit response projections.

- Normalize email with one documented policy and enforce a unique database index. Do not apply provider-specific transformations such as removing dots or plus suffixes.
- Require email verification before workspace creation, invitation acceptance, or office entry.
- Pending accounts receive no authenticated session. Verification must also confirm the pending registration's password through the verification form; possession of a verification link alone must not activate credentials chosen by someone who preregistered another person's email. A legitimate mailbox owner who does not know that password uses the recovery flow to establish new credentials. Expire abandoned pending registrations and never merge accounts automatically.
- Use Argon2id through a maintained library with a unique generated salt per password. Benchmark its parameters on the deployment hardware and bound concurrent hash work. Use at least a current OWASP-recommended configuration; a starting profile is 19 MiB memory, two iterations, parallelism one, to increase if measured capacity permits.
- For password-only accounts, use a minimum of 15 characters, permit passphrases and password-manager paste, allow at least 64 characters, and reject known common/compromised passwords. Set a documented upper input bound without truncation.
- Return generic login/recovery responses and avoid an obvious timing difference for unknown users. Apply account and IP throttles plus an overall hashing concurrency limit.
- Use HTTPS for all credential exchange. Never log plaintext passwords, password hashes, session IDs, reset links, or invitation secrets.
- MVP supports registration, verification, login, logout, logout-all, session inspection, password change, and password reset. Email change, social login, and enterprise SSO are deferred.
- Require recent password reauthentication for password changes, owner transfer, and destructive workspace operations. Platform infrastructure administration uses a separate restricted access path.

Recent reauthentication means password verification bound to the current session within five minutes. Provide an explicit reauthentication endpoint, rotate that session ID and CSRF binding, and throttle its password hashing like login. A password-change command also verifies the current password as part of the mutation. Other tabs refresh their CSRF binding after a session rotation instead of reusing stale tokens.

Sources: [OWASP authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

### 3.2 Session model and cookie

Choose opaque server sessions rather than browser access/refresh JWT pairs for the MVP. Generate a fresh 32-byte cryptographically random identifier and store only its SHA-256 digest in MongoDB. Random session secrets can use a fast digest; password hashes require Argon2id.

Production cookie:

~~~http
Set-Cookie: __Host-gather_session=<random-value>; Path=/; Secure; HttpOnly; SameSite=Lax
~~~

Do not set Domain. The cookie is host-only. Use HTTPS in development when validating production cookie behavior.

Session records contain user ID, user authVersion at issue, createdAt, absoluteExpiresAt, idleExpiresAt, revokedAt, and CSRF binding. The authoritative request guard checks session validity, user status, current authVersion, and timestamps from MongoDB. TTL indexes are cleanup only: an expired row must be rejected even if MongoDB has not deleted it.

Starting session policy: 12-hour absolute lifetime and 60-minute idle lifetime. Explicit app activity can renew the idle deadline up to the absolute limit. Background heartbeats alone do not extend it; during an active meeting, the UI obtains a user-confirmed extension when required. Warn before expiry and disconnect on expiry.

Create a new session ID after login or successful reauthentication, invalidate the previous session where applicable, and rotate its CSRF binding. Never upgrade an attacker-provided session ID in place. Logout revokes the server record and clears the cookie using the same scope. Logout-all and password reset increment user authVersion to invalidate every prior authenticated session.

Session authorization reads are not cached in Redis for MVP. This simplifies revocation semantics at modest initial scale. MongoDB failure denies new protected requests and grants.

The application session secret never appears in JavaScript, localStorage, IndexedDB, or URLs. Short-lived LiveKit tokens and one-use office tickets are separate scoped capabilities required by their SDKs; keep them only in memory.

Source: [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

### 3.3 CSRF, browser isolation, and response caching

HttpOnly prevents JavaScript from reading the cookie; it does not prevent forged requests or an XSS payload from acting as the signed-in user.

Use synchronizer CSRF tokens bound to the server session. A same-origin GET /api/auth/csrf bootstrap returns the token with Cache-Control: no-store. For unauthenticated forms, issue a short-lived anonymous session with a CSRF binding; it grants no user access and is replaced on login. Bound anonymous session creation by expiry and rate limits.

Require Sec-Fetch-Site: same-origin and a custom X-Requested-With: GatherLite header on this bootstrap route for the supported modern browsers. Reject cross-site/navigational bootstrap requests before setting cookies. Reuse a valid authenticated session rather than replacing it with an anonymous one. This prevents the bootstrap endpoint itself becoming a way to overwrite an existing session through a cross-site request.

Require the CSRF token in X-CSRF-Token on state-changing browser requests, including login, logout, recovery submission, invitation acceptance, office-ticket creation, and media grants. Enforce an exact configured Origin for those requests; reject unexpected or missing Origin in this browser-only API. Accept JSON for these endpoints and reject unsupported content types. Safe GET requests must not mutate business state.

Disable cross-origin credential access in MVP. SameSite=Lax is an additional layer, not the sole CSRF defense. Reject cross-site browser WebSocket handshakes using an exact Origin allowlist in addition to ticket validation. CORS does not authorize sockets.

Authenticated and auth-token HTTP responses use private/no-store caching. Next.js must not cache or statically render private workspace or session responses across users. Only the auth/session backend path should parse or set session cookies. Apply a restrictive CSP, output escaping, frame restrictions and appropriate security headers; avoid untrusted HTML and third-party scripts in the authenticated app.

Source: [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

### 3.4 Verification, password recovery, and concurrency

Use separate purposes and collections or strict purpose fields for email verification and password reset. Generate random 32-byte, single-use tokens; store digests with user ID, expiry, usedAt, and relevant authVersion.

Password-reset tokens expire after 15 minutes; verification tokens after 24 hours. Redemption checks the stored expiry directly. GET links display a confirmation form; the state change requires a CSRF-protected POST so email link scanners cannot consume tokens accidentally.

Generate links from a configured trusted public URL, never an untrusted Host header. Use a recovery page with no third-party resources, no-store and Referrer-Policy: no-referrer; remove secrets from browser history after reading them. Reset-request and resend responses are generic and rate-limited.

Consume a reset token, replace the password hash, and increment authVersion atomically in a MongoDB transaction. Recheck credential/authVersion during session issuance so a concurrent login using a superseded password cannot create a valid session after reset. Do not automatically log the user in after password recovery.

Complete pending-account recovery explicitly: a valid recovery token proves mailbox possession and may set verifiedAt while establishing the new password in that same transaction. It must not reactivate a suspended/deleted account or restore workspace membership. Normal verification requires both its valid token and the pending password. Provide rate-limited resend-verification with generic responses; replacing a token supersedes earlier tokens for that purpose. Check user/purpose/version and perform token consumption with the account update atomically.

Email delivery uses the outbox/worker design in section 8. Store any delivery secret needed for retry in an encrypted, short-lived outbox payload, then purge it; hashing a redemption token does not make its emailed plaintext link non-sensitive. Reject expired messages at delivery. Duplicate delivery must not create additional usable tokens or memberships.

Source: [OWASP password recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

### 3.5 Initial API contract

| Endpoint | Purpose | Mandatory controls |
|---|---|---|
| GET /api/auth/csrf | Bootstrap session-bound CSRF token | Same-origin Fetch Metadata and custom header, preserve valid session, no-store, rate limit |
| POST /api/auth/register | Create pending account and verification delivery | Anonymous CSRF, origin, validation, uniqueness, abuse limits |
| POST /api/auth/verify-email | Verify pending account | CSRF, verification token, pending password, atomic consume/account update |
| POST /api/auth/resend-verification | Replace verification delivery | CSRF, generic response, supersede prior verification token, delivery limits |
| POST /api/auth/login | Verify credentials and issue fresh session cookie | Anonymous/authenticated CSRF, origin, throttling, bounded hash work |
| GET /api/auth/me | Return safe current-user/session data | Valid server session, no-store |
| GET /api/auth/sessions | List own sessions with safe metadata | Valid session; never expose token digests or secrets |
| POST /api/auth/logout | Revoke current session | Exact origin; valid sessions require CSRF; revoke before clearing cookie and invalidate realtime access |
| POST /api/auth/logout-all | Revoke all authenticated sessions | Session, CSRF, authVersion increment |
| POST /api/auth/forgot-password | Request recovery delivery | CSRF, generic response, request/delivery limits |
| POST /api/auth/reset-password | Redeem recovery token | CSRF, atomic token consume/password change/authVersion increment |
| POST /api/auth/change-password | Replace password after reauthentication | Session, CSRF, current password, revoke prior sessions |
| POST /api/auth/reauthenticate | Establish five-minute recent-auth proof | Session, CSRF, current password, throttling, rotate session and CSRF binding |
| POST /api/offices/:id/join-ticket | Obtain scoped realtime admission | Verified account, valid session, CSRF, membership/capacity check |
| POST /api/conversations/:id/media-token | Obtain current media capability | Session, CSRF, current generation and participant authorization |

No auth-debug endpoints or unrestricted token issuers are deployed outside private development.

## 4. Multiplayer admission and authorization lifecycle

### 4.1 Colyseus access

A successful HTTP login does not automatically authorize a multiplayer connection.

1. Browser requests an office ticket from NestJS through its HttpOnly session and CSRF token.
2. NestJS verifies user/session state and workspace membership, then issues a random, one-use ticket valid for 30 seconds.
   Before issuing it, resolve/create the canonical office instance through Colyseus and obtain its current epoch; a restart requires a fresh ticket. Office discovery is not an authorization bypass.
3. Store only the ticket digest in MongoDB with user/session/workspace/office scope, office instance epoch, protocol version, and expiry.
4. Colyseus consumes that ticket through an authenticated internal NestJS endpoint. Consumption and admission-policy checks are atomic; validate the actual office selected by matchmaking.
5. Bind the verified identity to server-owned player state. Never accept userId, tenantId, role, or participant identity as authoritative client claims.

The single realtime owner reserves participation and capacity atomically while admission completes, using a short deadline and cleanup on failure. Concurrent ticket consumption must not create duplicate players or exceed capacity. Do not synchronize an unverified player into public room state.

Use the pinned SDK's HTTP matchmaking/auth hook to exchange the ticket in a protected body. Do not put credentials in query strings. Verify the actual SDK transport and proxy logs during implementation. A failed or expired attempt obtains a new ticket.

Explicitly override the framework authentication entrypoint; reject missing tickets by default. Current Colyseus documentation describes a static onAuth hook that can short-circuit instance onAuth, so an instance hook alone is not a reliable mandatory admission gate. The custom entrypoint must validate and consume our opaque ticket, not use a built-in JWT verifier. The resulting verified identity is checked against the resolved office/epoch before publishing any player state. Verify every join/create/seat-consumption path for the pinned version, including a seat reservation used after revocation. See [Colyseus room authentication](https://docs.colyseus.io/auth/room).

MVP reconnects require a fresh authenticated ticket and policy check. Do not allow a Colyseus automatic-resume token to bypass this check; preserving position is optional, preserving authorization is mandatory. Start back at the configured spawn if necessary.

### 4.2 Continuing authorization

NestJS remains the identity and membership authority. Colyseus batch-checks active sessions and membership versions every second via an authenticated internal call. A response grants an office authorization lease for at most five seconds.

Measure lease time from the requesting process's monotonic request-start time, not response arrival. Its deadline is the earlier of request-start plus five seconds and the known remaining session lifetime. Reject responses that arrive after that deadline, belong to an older request sequence, or reference another process/office epoch. Restart with no valid leases and reacquire them. Expiry checks must run independently of new client messages; a delayed response cannot revive an expired connection.

Session revocation, suspension, workspace-member removal, password reset, and idle/absolute expiry invalidate affected leases. Send an immediate control notification after the authoritative database change; periodic checks recover from missed notifications. Notifications are an optimization, not a correctness dependency.

On a failed check, deny privileged actions. On lease expiry, disconnect affected world participants and close their conversation membership. Target normal-operation world revocation within five seconds of the committed change; measure it. The Media Guard independently enforces the same underlying authorization deadline and the shutdown budget in section 6.

Internal requests use TLS, scoped service credentials, request deadlines, explicit tenant/office scope, replay-resistant event identifiers and bounded timestamps. No service may choose arbitrary callback URLs or backend destinations from client input.

NestJS and Colyseus use fresh boot epochs. After either authority restarts, deny media grants until current office ownership and desired conversation state have been resynchronized; previously queued events cannot reopen retired room generations.

## 5. Office simulation and conversation rules

Use one canonical Colyseus room per office, owned by one process. For MVP, serialize room creation in the single realtime process and keep an explicit office-to-room mapping. Scaling later requires a shared driver/presence configuration and fenced ownership; a generic load balancer alone does not establish one owner.

- Use versioned Tiled JSON maps and licensed/original tile assets with shared collision data. Ship a static immutable map for MVP; no map upload or editor.
- Colyseus validates movement speed, boundaries, collisions and zone transitions. Advance on server time, not on the number of input messages received.
- Start with a 20 Hz simulation and a 10 Hz patch cadence, then benchmark. Phaser interpolates remote movement. Avoid one React rerender per simulation tick.
- Validate messages at runtime, reject unknown fields/types and non-finite numbers, and bound payloads and input frequency.
- One active office tab per user in a workspace for MVP. A second tab receives an explicit conflict; it must not silently evict an ongoing call. An explicit takeover reauthorizes and closes the old participation.
- Open-office conversations are one-to-one, with deterministic matching. A participant can belong to only one active conversation.
- Start with a two-tile join radius and three-tile leave radius plus a 500 ms exit debounce. Tune these UX defaults. Unauthorized policy changes are not delayed by proximity debounce.
- Busy/away state blocks automatic matching. Private meeting zones override open-office matching and require zone access.
- Fixed meeting zones allow groups; dynamic open-floor group clustering is deferred.
- Users explicitly enable proximity participation. A visible call dock shows the current conversation. Microphone and camera start off; browser permission does not substitute for app consent. Screen sharing always requires explicit action.

Only safe display fields enter synchronized state. Do not broadcast session IDs, ticket secrets, password data, invitation tokens, email addresses, private policies, or the full membership database. Private-zone access is independent of whether its avatars remain visually visible.

## 6. LiveKit media design and revocation

### 6.1 Selected SFU and alternative

Both LiveKit and mediasoup are WebRTC SFUs. LiveKit is selected because it provides signaling, room/participant management, browser SDKs, and a JavaScript server SDK. NestJS controls it; browsers send media directly to the SFU.

mediasoup is a lower-level Node.js integration with C++ media workers. It provides media primitives while the application supplies signaling and room orchestration. Revisit it only if custom media behavior justifies the additional engineering ownership.

### 6.2 Room and grant decisions

Use one media room per conversation generation, including private-zone conversations. Never put the entire office into one media room and rely on client-side unsubscribe or volume controls for private-room security.

Colyseus owns the desired participant set and conversation version. NestJS serializes media control per conversation, confirms valid sessions/memberships/leases, and signs a 60-second room-scoped LiveKit admission token locally with the server SDK. It does not send the API secret to browsers or call LiveKit to sign a token.

Return the token over no-store HTTPS; keep it in browser memory only. Grant only joining, required subscription, and allowed track sources. Ordinary users receive no administration or room-management grants. Exclude arbitrary data publishing unless a feature explicitly needs it.

Create a fresh opaque media-room name for every generation. Never reuse it after closure, including after a process restart. Participant identities are session/participation scoped opaque values, with mappings kept privately.

### 6.3 Selected enforcement design: Media Guard and fail-closed supervision

Self-hosted LiveKit does not invalidate existing tokens when a participant is removed or permissions change. Its server can refresh tokens. Admission TTL is not a session-expiry or immediate-revocation guarantee. See [LiveKit token lifecycle](https://docs.livekit.io/frontends/reference/tokens-grants/).

**Selected implementation:** a local TypeScript Media Guard gates signaling and supervises room retirement. An independent systemd watchdog supervises the guard and SFU as one process group. This is application infrastructure to implement; it is not a built-in LiveKit authorization feature.

Admission rules:

1. Expose only the guard's TLS signaling endpoint. Firewall the underlying LiveKit signaling/admin port from public access; private operations use loopback. Inventory the pinned SDK's required client paths, including join/reconnect/validation, and allowlist them. Deny unknown paths and server-management routes at public ingress.
2. Before forwarding any join or reconnect, verify the LiveKit JWT with maintained tooling: expected signing algorithm/key/issuer, signature, time claims, room and participant identity. Require the configured app Origin for browser signaling.
3. Also require a current local permit for that exact room generation, participant, guard boot epoch and controller epoch. Reject a valid JWT if the permit is missing, expired, superseded or grants more than current policy. Server-refreshed tokens must pass the same check.
4. NestJS stages current generation/participant policy; the guard installs permits only from replies to its own nonce-scoped snapshot requests described below. The media-token endpoint waits for acknowledgement of a matching installed permit version, rechecks policy, then signs. Return a retryable unavailable response if this cannot complete within a bounded deadline. Acknowledgement does not extend permit expiry.
5. Clock-check the permit again at upgrade acceptance and in the enforcement loop. Session cookies are never accepted as media credentials. No public fallback route may reach the unguarded SFU.
6. Redact signaling token query parameters and Authorization headers before any request, proxy-error or access logging. Permit only bounded handshake sizes and connection attempts; preserve the pinned SDK's supported protocol behavior without adding public fallback routes.

Authorization lease protocol:

- The guard polls NestJS every second with a fresh nonce, request sequence and guard boot epoch. NestJS replies with the authoritative conversation version, active participant permits and their remaining authorization lifetimes.
- Each remaining lifetime is capped by the unexpired Colyseus lease and underlying account/session/membership validity. NestJS cannot renew a room from its own heartbeat alone.
- The guard computes each deadline from its own monotonic request-start time plus the returned remaining lifetime, capped at five seconds. Accounting from request start is conservative when the reply is delayed. Reject old sequences, mismatched nonces/epochs and already-expired responses.
- Positive grants and renewals use only this pull protocol. A pushed control command may revoke access or request an immediate poll, but cannot create or extend a permit. Delayed snapshots cannot restore a retired generation even if their request sequence is newer; enforce monotonic conversation versions and irreversible retirement within the current boot epoch.
- The enforcement loop runs at least every 250 ms, independently of browser traffic. Expired permits immediately block new signaling; their affected room generation enters retirement.

Room retirement protocol:

1. Serialize commands by conversation and version. When membership or permissions narrow, the guard first marks the old generation denied locally, then closes its signaling connections and deletes that LiveKit room through the local server API.
2. Allow at most one second for confirmed local deletion. If deletion fails, times out, or leaves enforcement uncertain, terminate the guard/SFU process group instead of serving protected media with uncertain policy.
3. Only after confirmed retirement may NestJS install a new generation for the remaining authorized participants and return its tokens. A two-person call with a departure ends; its next conversation always gets a fresh name.
4. Never reuse retired room names. Unknown/retired generations are denied by default, so stale tokens cannot recreate accessible old rooms through the guard.
5. On a controller or guard restart, deny admission until state is resynchronized and all continuing conversations receive new media generations. Do not restore permits from a cache or reuse old room names after a backup restore.

Independent shutdown:

- Run the guard as the supervised parent of the LiveKit process, with both in the same systemd control group. Select Type=notify, NotifyAccess=main, WatchdogSec=2s, TimeoutAbortSec=1s, TimeoutStopSec=1s, KillMode=control-group, SendSIGKILL=yes, LimitCORE=0 and Restart=on-failure, then verify their effective behavior on the chosen Linux image.
- The guard sends its watchdog heartbeat only after its enforcement loop has completed the current deadline checks. A generic HTTP health response or a separate heartbeat thread must not conceal a stalled enforcement loop.
- Do not add blocking stop hooks, send timeout-extension notifications, or let the SFU child emit the parent's readiness/watchdog heartbeat. Fatal enforcement errors must exit nonzero so the failure policy applies.
- An expired/failed guard must terminate the SFU child as well. Refuse readiness and new admission during a cold restart until fresh policy has been installed. No system operator deployment may leave an independently running, unguarded SFU.

Starting measurable budget: at most five seconds of authorization lease plus at most three seconds of enforcement/supervisor shutdown, for an eight-second maximum target from an authorization change or loss of authoritative renewal to protected-media cutoff at SFU forwarding. Immediate retirement commands should normally be faster. Already delivered packets/content cannot be recalled. This is a bounded revocation window, not an instantaneous guarantee.

Assumptions: the host OS, supervisor and firewall remain trusted and scheduled; the bound must be demonstrated under injected process hangs, network partitions and realistic load. A fully compromised host, copied content and voluntary sharing by an authorized participant are outside this control's guarantee. If acceptance fails, repair the implementation before pilot release.

Availability tradeoff: failed local enforcement or a guard hang can interrupt every call on the single media node. This deliberate fail-closed choice is acceptable for the initial pilot; display a reconnect/error state. Normal generation migration can also interrupt media. These behaviors must be measured in M0 and integrated in M3.

References for underlying behavior: [LiveKit client signaling protocol](https://docs.livekit.io/reference/internals/client-protocol/), [systemd service supervision](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html). The guard and its permit protocol are project design decisions.

### 6.4 End-to-end call flow

~~~mermaid
sequenceDiagram
    participant B as Browser
    participant N as NestJS
    participant D as MongoDB
    participant W as Colyseus
    participant G as Local Media Guard
    participant L as LiveKit

    B->>N: Bootstrap CSRF and submit login over HTTPS
    N->>D: Verify password and create server session
    N-->>B: Set Secure HttpOnly host-only cookie
    B->>N: POST office ticket with cookie and CSRF
    N->>D: Validate session, user and workspace membership
    N-->>B: Return one-use office ticket
    B->>W: Authenticate office admission with ticket
    W->>N: Consume ticket and bind office/user/session
    W->>W: Validate movement and form conversation
    W->>N: Submit versioned desired conversation membership
    B->>N: Request current conversation media grant
    N->>N: Stage current conversation policy
    G->>N: Request snapshot with nonce and boot epoch
    N-->>G: Return scoped policy and remaining authorization lifetime
    G-->>N: Acknowledge installed permit version and generation
    N->>N: Validate current policy and sign scoped LiveKit token
    N-->>B: Return media URL and token, no-store
    B->>G: Join/reconnect with signed token
    G->>L: Forward signaling only while permit is current
    B->>L: WebRTC media; publish after explicit consent
    W->>N: Membership or generation changes
    N->>G: Retire old generation
    G->>L: Delete room locally or shut down SFU on failure
    G-->>N: Retirement confirmed before new generation
~~~

The token endpoint derives the media room and participant identity from trusted server state. It never accepts a client-selected LiveKit room or participant list.

## 7. Data model and database invariants

| Collection | Key data and invariants |
|---|---|
| users | Opaque ID, normalized email, verifiedAt, status, authVersion; unique email index |
| credentials | Unique userId, password hash/parameters/version; backend-only projection |
| sessions | Unique session digest, userId, issued authVersion, CSRF binding, deadlines, revocation; expiry cleanup index |
| auth_tokens | Purpose, userId, token digest, expiry, usedAt, authVersion; atomic single-use redemption |
| workspaces | Name, unique slug, ownerId, policyVersion, timestamps |
| memberships | Workspace/user/role/status/version; unique workspaceId + userId |
| invitations | Workspace, intended normalized email, token digest, expiry, acceptedAt, creator |
| offices | Workspace, immutable map/version, spawn, canonical office ID; one office per workspace |
| office_zones | Office/workspace, bounds, meeting policy, capacity; verify parent ownership |
| join_tickets | Unique digest, session/user/workspace/office/epoch scope, consumedAt, expiry |
| outbox | Event ID, purpose, delivery state, attempts, expiry; encrypted temporary secrets if needed |
| audit_events | Minimal security actions and opaque actor/tenant IDs; no credentials or content |

MongoDB is the single durable identity and workspace-policy authority. Redis is not the authoritative session store.

Use a replica-set deployment supporting transactions from development onward. Mongoose validation does not replace MongoDB indexes or atomic updates. Apply indexes through deployment migrations; do not rely on production auto-index creation.

Scope every workspace-owned operation by workspace and resource ID. Verify zone-to-office-to-workspace relationships. Owner/member are the MVP roles. Maintain one owner; owner removal requires an authorized atomic transfer to an existing verified member.

Invitations are recipient-bound, single-use, and expire after seven days. Accept only from a verified account matching the intended address. Consume the invitation and create membership in one transaction; duplicate retries return the existing outcome. Reject the same invitation from another account.

For sensitive mutations, an earlier authorization read followed by an unrelated write is insufficient. Transactions can read a snapshot predating a concurrent revocation. Inside the transaction, perform real conditional writes against the relevant session/user/membership or workspace policy records using their expected versions, then perform the protected mutation. Revocation and the protected action must contend on the same policy records; retry conflicts by rechecking authorization, never by reusing a previous allow decision. A no-op update does not establish that write conflict.

Maintain workspace memberCount and account ownedWorkspaceCount using conditional increments/decrements in the same transaction as membership/workspace changes. This enforces the 30-member and owned-workspace caps under concurrent requests. Idempotent retries must not increment counts twice.

Use majority-acknowledged writes for identity, revocation and membership mutations. For strict admission and authorization-lease status checks outside transactions, use bounded primary linearizable reads that uniquely identify each authority document; the batch API may issue those reads with bounded concurrency. Majority read concern alone does not promise real-time freshness. Use snapshot transactions plus the conditional policy writes above for atomic multi-document changes. Handle unknown commit outcomes through stable operation identifiers and result lookup before repeating side effects. Never spread arbitrary client JSON into queries or updates; runtime DTO validation rejects operators and fields outside an explicit allowlist.

Sources: [MongoDB consistency and real-time order](https://www.mongodb.com/docs/manual/core/read-isolation-consistency-recency/), [MongoDB transaction stale reads and write conflicts](https://www.mongodb.com/docs/v8.0/core/transactions-production-consideration/).

Ephemeral state belongs to Colyseus: player position, direction, availability, zone, conversation, version and process epoch. World crashes return users to spawn after fresh admission; MongoDB is not updated every tick.

## 8. Redis, BullMQ, and consistency

Production has two Redis workloads with separate instances:

- **Cache Redis:** bounded evictable entries with TTL; never stores authoritative access decisions.
- **Queue Redis:** BullMQ data, noeviction, persistence enabled, memory headroom alerts, bounded completed/failed job retention.

Prefixes, ACLs and logical databases do not provide independent eviction or failure policies. Development may share an instance only with queue-safe settings and bounded cache usage. LiveKit/Colyseus coordination Redis is unnecessary for the initial single-node services; decide its isolation when scaling is actually required.

Write required delivery events to a MongoDB outbox in the same transaction as the domain mutation. An outbox dispatcher sends stable IDs to BullMQ and retries safely. Workers must tolerate repeated delivery; an email provider may still send a duplicate after an ambiguous timeout, so the underlying action remains single-use.

Passwords never enter jobs. Queue payloads contain IDs, not reset tokens or cookies. If delivery needs a secret URL, the worker reads an encrypted short-lived payload from the outbox through scoped access. Scrub it after successful delivery/expiry; log no payloads. Enforce bounded retries/backoff and a visible failed-delivery path.

Do not route movement, synchronous admission, session validation, or urgent revocation through a job backlog.

Source: [BullMQ production configuration](https://docs.bullmq.io/guide/going-to-production), [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs).

## 9. Socket.IO and Centrifugo decision

| Option | Appropriate use | MVP disposition |
|---|---|---|
| Colyseus | Authoritative office rooms, state synchronization and room messages | Selected |
| Socket.IO | General bidirectional application events closely integrated with Node/NestJS | Deferred until a distinct feature needs it |
| Centrifugo | Independent channel pub/sub and broad application fan-out | Deferred until scale or service decoupling requires it |

Both extra platforms add connection authentication, permissions, recovery rules and operational load. Current office events fit Colyseus; adding another socket server does not solve media privacy or durable policy synchronization.

## 10. Deployment, quotas, and operations

Use a TypeScript monorepo with apps/web, apps/api, apps/realtime and apps/worker plus shared runtime contracts, configuration and map metadata. Share safe DTOs, not credential models or server secrets. Pin compatible SDK/server versions and track dependency updates.

Start in one region with one realtime process and one LiveKit node. Application processes run in containers with scoped credentials and private networking. The media node is a dedicated Linux VM with the local guard/SFU supervision specified in section 6. WebSocket ingress needs WSS support; LiveKit additionally needs the documented public media ports, TLS and authenticated TURN. Verify TURN/TLS in corporate networks before pilot launch.

The signaling guard and TURN/TLS must not compete for the same public IP/port. Provide a distinct public TURN endpoint/IP for TCP 443 connectivity or an explicitly verified layer-4 routing arrangement. This must preserve the guard as the sole signaling entry and must not expose the SFU's admin listener.

Managed MongoDB and Redis are acceptable. Select providers supporting the chosen transaction, persistence and networking requirements. Do not enable Kubernetes, automatic room failover or multi-region behavior before defining ownership fencing and measuring demand.

Initial enforced quotas, to tune after measurements:

| Resource | Starting cap |
|---|---|
| Workspace | 30 members, one office, one floor |
| Per verified account | At most three owned workspaces; enforce atomically |
| Active office | 20 concurrent participants |
| Per workspace user | One active office participation |
| Private meeting zone | Six active media participants |
| Media publication | One microphone, one camera, at most one screen share per participant |
| Movement | 30 inputs/second per player with a small bounded burst |
| Client application message | 4 KiB maximum, with smaller per-message limits where possible |
| Admission/media grants | 10 requests/minute per session plus account, IP and global bounds |
| Login attempts | Five failures per account per 15 minutes plus IP/global limits and progressive backoff |
| Recovery/verification mail | Three requests per account/hour plus IP/global delivery budgets |

Avoid permanent account lockout that allows an attacker to deny service. Bound anonymous signup/session creation and password-hash work. Enforce media sources/permissions using server capabilities; verify track limits on the pinned server and prevent or promptly stop excess publication. Repeated abuse triggers removal and generation retirement.

Server-required media migration uses a separate bounded recovery budget, validated against the current conversation generation and coalesced per transition. A participant repeatedly crossing a boundary must not consume other members' normal grant budgets. Rate-limit the source of churn and show a retry state; never keep publishing in a retired room to avoid a quota error.

Treat login/API/session limits separately from normal game message cadence. Use only ingress-sanitized proxy headers for client IP; strip externally supplied forwarded/internal-auth headers.

MVP video starts with a conservative 360p/15fps target, limited visible subscriptions and a single explicit screen share. Server-enforced caps and bandwidth budgets must be established before raising limits. Self-hosting has ongoing bandwidth, TURN and operations cost even with no billing.

Operational requirements:

- Private/no-store auth responses; no shared authenticated cache. Redact sensitive headers, query parameters and bodies at the edge and in tracing.
- Structured logs with request/event IDs; monitor login abuse, grants, media join failures, orphan rooms, lease expiry, memory, egress and queue age.
- Record minimal security audit events for role changes, invites, recovery and revocation; begin with 30-day retention and restrict access.
- Mirror security-change records to a restricted recovery/audit store outside the application backup set. The audit_events collection restored from that same MongoDB backup is not independent recovery evidence. Missing or unacknowledged audit intervals require suspended access and manual reconciliation.
- Keep recording, ingress, egress and bots disabled. Transport encryption is required; E2EE is deferred and must not be claimed.
- Separate environment secrets; rotate LiveKit/service/encryption credentials with a documented recovery process.
- Restore MongoDB backups in staging. Initial recovery objectives: at most one hour of durable-data loss and four hours to restore; provider configuration must demonstrate them.
- Health/readiness checks, graceful room drain, explicit incompatible-protocol errors and rollback instructions are required.
- Readiness must include current guard policy and effective SFU supervision. On a media-guard outage, the app shows media unavailable; it never reconnects through an alternate unguarded host.

## 11. MVP scope and ordered milestones

The first release includes verified accounts, recovery, workspace creation, recipient-bound invitations, one office/map, basic avatars, presence, one-to-one proximity voice, fixed group meeting zones, explicit camera/screen sharing, owner/member administration and reconnect UX.

Deferred: payments, custom maps, multiple floors, dynamic open-floor group clusters, persistent chat/DMs, AI notes, mobile apps, calendar integrations, SSO, email changes, and general-purpose messaging infrastructure.

### M0 — Contracts and deployment skeleton

Freeze the session/cookie/CSRF contract, authority boundaries, runtime message schemas, immutable map format and office/conversation state machines. Pin dependencies. Prove same-origin ingress, HTTPS, transaction-capable MongoDB and private service networking.

Build the specified Media Guard/supervisor vertical slice here: two private test identities, one isolated conversation and a three-person removal case. Inject original/refreshed-token replay, NestJS loss, Colyseus loss, a frozen guard, local SFU-control failure and a signaling bypass attempt. Verify the eight-second cutoff target, permit expiry, whole-process-group termination and safe cold restart. Record the interruption cost before expanding the product. Keep spike identities and token endpoints isolated from public deployments.

**Gate:** same-origin cookie/CSRF routing and the selected media-control design pass their integration checks on the pinned deployment. Fix any failed behavior before expanding the implementation. Development bypasses are absent from staging's production build.

### M1 — Authentication foundation

Build registration, verification, login/logout, recovery, sessions, authVersion invalidation, rate limits, queue/outbox email and credential concurrency protection. Session identifiers stay outside JavaScript.

**Gate:** session fixation, CSRF, enumeration, reset replay, parallel reset/login and expired-record cases pass the acceptance checks in section 13. Account recovery is delivered successfully through the actual email provider.

### M2 — Two-user authoritative office

Build one map and Colyseus room, ticket admission, movement/collision, one-tab policy and continuing authorization leases. Use two verified fixture accounts in a private workspace.

**Gate:** forged/replayed/expired tickets and direct unauthenticated joins fail; message flooding cannot increase speed; revocation and fresh reconnect behave as specified.

### M3 — Proximity voice and media privacy proof

Integrate deterministic pairing, explicit consent, LiveKit grant issuance, conversation generations, retirement and reconciliation with the Media Guard proven in M0. Connect actual session and office authorization leases to the guard's enforcement deadlines.

**Gate:** stale/original/refreshed-token rejoin, guard bypass and controller/network-failure checks pass with real auth. Measure migration interruption and the eight-second cutoff target. Failed checks prevent pilot release.

### M4 — Workspace onboarding and fixed meetings

Add workspace creation, transactional invitations, owner/member controls, fixed group zones and takeover UX. Add camera and screen sharing after voice isolation passes. A zone capacity change must not bypass conversation admission.

**Gate:** cross-tenant substitutions, owner-transfer races, invitation concurrency and private-zone isolation pass.

### M5 — Operational pilot

Measure 20 office participants, TURN-only clients, weak networks, multi-tab behavior, restarts, queue recovery and backup restore. Verify quotas, monitoring, patches and recovery ownership.

**Gate:** all P1 items below have implementation evidence. Target at least 95% successful media joins and a two-second p95 conversation join on a declared stable-network test profile; measure failure/retirement behavior separately. Targets are provisional. Run no public capacity claims before results exist.

## 12. Final design review — findings and disposition

This is a design review, not a penetration test. The plan now selects mitigations instead of leaving core identity, room topology or Redis policy open. A selected mitigation remains unverified until its release gate passes.

| ID | Priority | Gap found or rechecked | Decision and remaining evidence |
|---|---|---|---|
| S1 | P1 | HttpOnly alone does not prevent CSRF, XSS actions or stale sessions | Same-origin ingress, session-bound CSRF, CSP/output controls and authoritative expiry/revocation checks; verify bypass attempts |
| S2 | P1 | Custom auth adds credential, recovery and concurrency risks | Argon2id, verification, atomic single-use tokens, authVersion and bounded hashing; verify reset/login race |
| S3 | P1 | A valid HTTP session or framework default does not authorize a socket | Explicit mandatory Colyseus auth override, scoped tickets, origin checks, fresh reconnect and bounded leases |
| S4 | P1 | Self-hosted media token replay and refresh survive removal | Media Guard validates every signaling admission against current permits; generation retirement and independent whole-SFU shutdown are specified in section 6 |
| S5 | P1 | Late events, lease responses or restarts can restore obsolete access | Monotonic request-start deadlines, response sequences, boot epochs, serialized versions and reconciliation |
| S6 | P1 | Tenant ID substitution, stale policy reads and invitation/owner races | Scoped queries, allowlisted DTOs, indexes, conditional policy writes and transactional capacity counters |
| S7 | P1 | Free use can exhaust hash workers, rooms or media bandwidth | Server quotas, admission throttles, track caps and global budgets |
| S8 | P1 | Cache eviction can corrupt queue state | Separate production Redis instances, noeviction queue policy and persistence |
| S9 | P1 | Email workers need secrets that a token digest cannot reconstruct | Encrypted expiring outbox secret, ID-only jobs, redaction, restricted keys and purge |
| S10 | P2 | Database writes and queue delivery can diverge | Transactional outbox and idempotent effects; duplicate email remains possible but token use stays single-use |
| S11 | P1 | TTL deletion, stale snapshots or cache state can weaken revocation | Explicit expiry, primary linearizable status checks, majority writes, authVersion and transactional policy conflicts; TTL is cleanup only |
| S12 | P2 | Cookies across subdomains, Next.js caching and shared SDK contracts can leak access/data | Host-only cookie, one app origin, private/no-store, runtime validation and pinned compatible protocol |
| S13 | P2 | Recovery links, telemetry and third-party scripts can leak scoped secrets | Fixed trusted link origin, no-referrer recovery pages, no-store, stripped URLs, redacted logs and limited scripts |
| S14 | P2 | Media-control assumptions can invalidate later implementation | Implement and verify the specified guard/supervisor slice in M0 before feature expansion |
| S15 | P1 | A preregistered email can leave an attacker knowing the account password | No authenticated pending session; verification also proves the pending password, or recovery replaces it and invalidates prior credentials |
| S16 | P1 | Backup restore can resurrect old credentials, revocations and role assignments | Suspend restored access, invalidate sessions/tokens, reconcile security mutations and require fresh credential recovery where history is uncertain |

A database restore can resurrect previously revoked sessions, changed passwords and removed memberships. Before traffic resumes, invalidate restored sessions and outstanding auth/invite/join tokens and retire all previous media generations. Keep restored accounts/workspaces suspended until security mutations after the backup have been reconciled from an independent audit/recovery source. Where credential history cannot be established, require fresh password recovery through the verified mailbox rather than allowing an older restored password. A fresh login alone does not repair credential rollback. Document and rehearse this procedure with restricted recovery administration.

**Design correction status:** all review findings now have selected controls, implementation scope and acceptance criteria in this document. The media-enforcement architecture is specified rather than left as an open choice. Remaining work is implementation, environment selection and verification. The document is ready for M0 implementation; it is not evidence that a deployed application has passed a security review.

## 13. Required acceptance checks

These are future implementation checks, not results from this document-editing task.

1. Inspect Set-Cookie in the deployed origin: Secure, HttpOnly, Path=/, SameSite=Lax, no Domain; verify no session secret in frontend storage, URLs, traces or assets.
2. Submit cross-origin login/logout, recovery, invitation and grant requests with missing/wrong CSRF and Origin; reject them. Cross-site CSRF bootstrap must not overwrite an existing cookie. Authenticate no socket with Origin alone.
3. Attempt session fixation, session digest reuse, absolute/idle expiry, logout-all and two-tab member removal. Expired database rows must remain unusable before TTL cleanup.
4. Race password-reset redemption against itself and against login/password change. Only the committed credential version can issue a valid session.
5. Swap workspace/office/zone/user IDs on every read, update, join and grant path. Try NoSQL operator payloads and unexpected writable fields.
6. Redeem an invitation concurrently, from the wrong account and after expiry; verify single membership and one-use semantics.
7. Replay tickets, target another office, bypass matchmaking and resume with an old reconnect credential. None may skip session/policy checks.
8. Delay/reorder conversation messages, request grants during exits, terminate Colyseus/NestJS, and isolate controllers from a healthy SFU.
9. Retain original and refreshed LiveKit tokens, rejoin retired rooms, bypass the guard through every signaling/admin path and attempt extra publication. Replayed grants must be rejected by current permits and no retired room may receive protected media.
10. Pressure cache Redis independently of queue Redis; interrupt workers at external-effect acknowledgement and the outbox/enqueue boundary; preserve recoverable business state.
11. Exercise TURN-only and lossy networks, browser permission denial, idle expiry in meetings, explicit tab takeover and media generation migration.
12. Restore a backup and verify forced session/token invalidation, new media epochs, queue reconciliation, secret handling and alerting before reopening access.
13. Preregister another person's email and attempt to activate it with a verification link without knowing its pending password; then verify that legitimate mailbox recovery safely replaces the credentials.
14. Restore a backup predating password reset, suspension and member removal. Old credentials and access must remain blocked until security state is reconciled or safely re-established.
15. Delay a successful lease reply beyond five seconds, return older replies out of order, and restart either authority. No reply may extend access beyond its original deadline or revive an invalid epoch.
16. Exercise Colyseus's actual static/instance auth dispatch, direct seat consumption, and every create/join path; no framework default or stale reservation may bypass the custom gate.
17. Race owner/member revocation against privileged writes, and race invitation acceptance/workspace creation at quota limits. Verify conditional policy conflicts and exact counters under retries.
18. Complete pending-account recovery, resend verification, perform session reauthentication in two tabs, and churn meeting-zone membership. Confirm recovery reaches a usable verified account without lifting suspensions or exhausting other participants' grant quotas.
19. Freeze/kill the Media Guard, lose either policy authority, delay/replay its snapshot response and fail the local delete-room API while SFU media remains reachable. Verify the eight-second cutoff target, whole-process-group shutdown, default-deny restart and no signaling fallback.

## 14. Environment selections and implementation signoff

The architecture decisions above are selected. The following deployment details and measurements remain:

- Hosting provider and first region with validated same-origin ingress, WebRTC/TURN connectivity and private networking.
- Transaction-capable MongoDB and separate Redis service plans meeting persistence/recovery needs.
- Transactional email provider, sending-domain setup, encryption-key storage and deliverability.
- Exact maintained packages and compatible versions for Argon2id, CSRF, validation, Colyseus and LiveKit.
- A Linux image and deployed systemd configuration implementing the guard/SFU control group, public-port isolation, TURN routing and measured cutoff budget from section 6.
- Exact video caps, lease timings, matching thresholds and session UX after performance/usability validation.
- Public-beta MFA policy: evaluate privileged workspace actions before an internet-wide launch; internal infrastructure admins require MFA.
- E2EE if future confidentiality requirements demand it. MVP makes no E2EE claim.

No payment provider or additional websocket platform is needed to resolve these items.

Pilot signoff requires recorded results for every P1 control in section 12, the acceptance checks in section 13, and named owners for deployment, recovery and security patching. Design specification, implementation completion and verification signoff are distinct statuses; none should be marked passed without its evidence.

## 15. Official reference material

Security defaults in this plan are informed by the linked sources. Timing, quotas, topology and rollout order are project engineering decisions requiring verification.

- [OWASP authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP password recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- [OWASP WebSocket security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)
- [NestJS CSRF integration](https://docs.nestjs.com/security/csrf)
- [Next.js documentation](https://nextjs.org/docs)
- [Phaser documentation](https://docs.phaser.io/)
- [Mongoose schemas](https://mongoosejs.com/docs/guide.html)
- [MongoDB consistency and real-time order](https://www.mongodb.com/docs/manual/core/read-isolation-consistency-recency/)
- [MongoDB transaction stale reads and write conflicts](https://www.mongodb.com/docs/v8.0/core/transactions-production-consideration/)
- [Colyseus room lifecycle](https://docs.colyseus.io/room)
- [Colyseus room authentication](https://docs.colyseus.io/auth/room)
- [Colyseus state synchronization](https://docs.colyseus.io/state)
- [Colyseus scaling](https://docs.colyseus.io/scalability)
- [LiveKit SFU architecture](https://docs.livekit.io/reference/internals/livekit-sfu/)
- [LiveKit server SDK](https://docs.livekit.io/reference/server-sdk-js/)
- [LiveKit tokens and self-hosted limitations](https://docs.livekit.io/frontends/reference/tokens-grants/)
- [LiveKit self-hosted deployment](https://docs.livekit.io/transport/self-hosting/deployment/)
- [LiveKit client signaling protocol](https://docs.livekit.io/reference/internals/client-protocol/)
- [systemd service supervision](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
- [mediasoup overview](https://mediasoup.org/documentation/overview/)
- [mediasoup signaling](https://mediasoup.org/documentation/v3/communication-between-client-and-server/)
- [BullMQ production configuration](https://docs.bullmq.io/guide/going-to-production)
- [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs)
- [Socket.IO rooms](https://socket.io/docs/v4/rooms/)
- [Centrifugo introduction](https://centrifugal.dev/docs/getting-started/introduction)
