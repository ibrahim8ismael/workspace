# WebRTC and LiveKit integration plan

The owner-accepted D02 topology (2026-11-08) uses self-hosted LiveKit for opt-in proximity audio and fixed private meetings. The browser uses native WebRTC through the LiveKit client SDK. The production media path depends on the D03 enforcement spike. See the [decision register](../decisions/README.md) and [implementation sequence](../planning/BACKEND_SYSTEM_IMPLEMENTATION.md).

## Libraries and network boundaries

| Component | Responsibility |
| --- | --- |
| NestJS media and conversation services | Authorize application membership, derive generation and source policy, issue short-lived grants, and reconcile state through the pinned `livekit-server-sdk` |
| Browser media adapter | Use the pinned `livekit-client` for permission requests, track lifecycle and media connection/reconnect. Add the adapter during the separate client integration stage |
| LiveKit OSS server and TURN | Pin the tested compatible server image/digest in M0. Handle SDK signaling and SFU forwarding. Validate advertised public IP, media UDP/TCP and TURN/TLS on the target network |
| Private signaling guard and supervisor | Enforce current generation permits across public signaling paths. Independently stop SFU forwarding on enforcement failure. Prove the custom mechanism against the pinned stack |
| Socket.IO | Carry app presence and authorized conversation/meeting state. SDP/ICE exchange, track delivery and media reconnect use LiveKit's protocol |

The current manifests pin `livekit-server-sdk` 2.19.2 in the API and `livekit-client` 2.23.0 in the web workspace. Select and verify a compatible self-hosted server image in the spike. Route signaling through the guard and publish only the required media/TURN listeners. Keep underlying signaling, administrative APIs, guard controls and webhook receiver private. Confirm media routing independently of Caddy HTTPS. See [LiveKit ports and firewall](https://docs.livekit.io/transport/self-hosting/ports-firewall/).

## Application lifecycle

1. The server marks an admitted participant eligible after explicit opt-in. Start with deterministic one-to-one pairing, one active conversation per participation, availability gates, and provisional two-tile join, three-tile leave and 500 ms exit debounce. Never debounce a security revocation. Define a stable tie-break and test simultaneous matches and boundary churn.
2. For a fixed meeting zone, require an explicit `meeting:join`. Check current lease, workspace/office/zone, physical access and serialized capacity. Use six participants as a provisional cap. Keep meeting and proximity memberships mutually exclusive and define what happens when a participant leaves the zone.
3. The office authority owns the desired member set, version and state (`joining`, `active`, `retiring`, `ended`; participant eligibility is separate). Create one isolated LiveKit room per conversation generation. Derive opaque room names and participation-scoped LiveKit identities on the server. Track permit readiness separately from whether a browser has connected to media. Deliver `conversation:update` only to authorized members and the minimum necessary end notice to a removed participant.
4. The client requests a grant through the HTTP route below. Connect through the guarded signaling endpoint. Microphone and camera start off and screen share requires an explicit browser action. Permission denial must leave the office usable and must not trigger automatic capture. Stop local tracks on leave, generation change, permission loss or teardown. An authorized survivor can reconnect with a grant for a new generation.
5. On leave, membership/account/session loss, zone removal or narrowed source policy, retire the affected generation. Deny new signaling first and stop old forwarding before granting a replacement generation. A departed pair ends. A surviving group may migrate with fresh grants. Treat signed webhooks as observations for reconciliation, and reconcile missing events through the private server SDK.

## Grant endpoint and source policy

`POST /api/conversations/:conversationId/media-token` accepts strict `{ participationId, conversationVersion }` and returns `200 { serverUrl, token, expiresAt, conversationVersion, generation }` with `Cache-Control: no-store`.

- Check current session, CSRF and Origin. Resolve the target from the active participation owned by that exact session, the current tenant/office, the current conversation member set and the unexpired office lease. Reject client-selected rooms, identity, membership or permission fields.
- Stage current policy and wait within a bounded deadline for acknowledgement of the exact installed permit version and generation. Recheck current policy before signing. If policy changes or permit installation fails, return the appropriate safe conflict or `503 media_unavailable`. Reauthorize retries and use separate budgets for normal grants and controlled migration/recovery.
- Issue a scoped LiveKit JWT with a proposed 60-second admission lifetime, join permission only for the current room, and explicitly allowed subscribe/publish capabilities. Deny data publishing, room administration and unused grants. Keep credentials in server-side secret storage. Keep the response token in browser memory and redact it from proxy logs, exceptions and telemetry, including SDK signaling query parameters.
- Proximity allows only microphone publication. Meetings may publish microphone, camera and screen video as individually permitted sources. Screen audio stays disabled in the first slice pending policy. Enforce source grants on the media path and prove source/track limits in the spike. Start with a provisional 360p/15fps camera profile and bounded subscriptions, then measure.
- Keep business authorization independent of LiveKit token refresh. LiveKit documents admission expiry and self-hosted token revocation behavior. Test both an original and server-refreshed JWT against the guard after retirement. [LiveKit access tokens and grants](https://docs.livekit.io/frontends/reference/tokens-grants/)

## Private enforcement and reconciliation

| Interface | Draft behavior |
| --- | --- |
| Guard → NestJS policy pull | Authenticated machine request with fresh nonce, ordered sequence, guard boot epoch and bounded scope. Reply carries controller epoch, current room generation/version, source policy and remaining authoritative lease lifetime |
| Guard → NestJS install acknowledgement | Confirm the exact installed generation/version and boot epochs. Acknowledgement never extends a deadline. Validate scope and reject stale/duplicate messages safely |
| NestJS → guard retirement hint | Authenticated, ordered revoke/retire or poll-now signal. Positive authorization comes from a current guard-initiated pull |
| Guard → private LiveKit admin | Deny joins locally first, close affected signaling and retire the room via the server API. Escalate if deletion or enforcement is uncertain. No browser access to this interface |
| LiveKit → private webhook | Preserve the raw body for `WebhookReceiver` signature verification. Bound input, deduplicate by event ID, match known room generations and ignore late events for retired state. Use the webhook for reconciliation only |
| Independent supervisor → guard/SFU unit | Stop SFU forwarding when guard enforcement stalls or room retirement fails. Use bounded control privileges and enforcement-progress heartbeats. Refuse readiness and start default-deny with new epochs |

Use monotonic request-start deadlines at the guard, capped by remaining office authorization. Reject delayed or superseded replies and never reuse retired generation names. Check the permit and JWT scope on every supported join/reconnect path, including server-refreshed tokens. Inventory the pinned signaling paths and test direct-route bypass. Cold restarts start empty and require fresh authorizations and generations. [LiveKit webhook verification and delivery behavior](https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events/)

## M0 experiment and release gates

Run a private two-person and three-person fixture with the chosen pinned SDK/server, exact signaling ingress, independent supervisor and media endpoints. Instrument the last forwarded protected packet or equivalent forwarding evidence. Test original/refreshed replay, expired grants, wrong room/identity/source, controller loss, delayed policy replies, guard freeze, failed or uncertain room deletion, process restart and public signaling/admin bypass.

Use an eight-second cutoff as the provisional total target, with up to five seconds of authorization and three seconds for enforcement/shutdown. A one-second deletion confirmation deadline is an initial experiment setting. Measure from revocation or loss of authoritative renewal to forwarding cessation under fault and load, and record both call migration interruption and the shared node's cross-tenant impact. A successful HTTP delete, a disconnected UI or an expired JWT alone is insufficient evidence.

For M3/M4, verify opt-in and permission denial, two-/three-person generation changes, camera/screen restrictions, TURN-only and weak networks, retry budgets, tenant and private-zone isolation, and browser cleanup. Close A07/A08 with measured evidence. M5 adds concurrent companies, node failure blast radius and operational recovery. Measure the proposed 95% successful media joins and two-second p95 join on a declared stable-network profile. Keep the product media route gated until the isolated proof passes or the owner explicitly approves a revised architecture and requirement. See the [media spike](../../spikes/media-enforcement/README.md), [operations plan](../operations/README.md) and [acceptance register](../planning/ACCEPTANCE.md).
