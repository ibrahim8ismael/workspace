# Gather Lite — Meeting Action Tickets

**Meeting time:** 3:08–3:20 PM  
**Reported by:** Team / Kassem_0001  
**Priority levels:** Suggested, subject to team review

## GitHub Issues #12 and #3 implementation status — 2026-11-17

Commit `7d4d00b` deploys the server-authoritative anchored/growing circle and trusted fixed-room meeting admission/UI to the pilot. API/contracts and web protocol v3 were rolled out together. Deployed proximity tests now verify three-user decoded audio and a two-user decoded-audio cutoff; fixed-room live media and revocation remain unverified. See the [implementation/rollback notes](PROXIMITY_GROUP_ROLLOUT.md) and [acceptance evidence](ACCEPTANCE.md).

---

### TICKET-001 — Support Group Meetings in the Same Room

**Type:** Feature  
**Priority:** High  
**Component:** Office / Meetings / Media

**Description:**  
Currently, meetings appear to support only one-to-one conversations. Users occupying the same meeting room should be able to join a shared group conversation.

**Acceptance Criteria:**
- [ ] Multiple users can participate in the same room-based meeting.
- [ ] All authorized participants can hear each other.
- [ ] Participants joining or leaving do not interrupt the remaining conversation.
- [ ] The UI displays the current participants.
- [ ] Users outside the meeting cannot join without authorization.

---

### TICKET-002 — Support Multi-User Proximity Conversations

**Type:** Feature  
**Priority:** High  
**Component:** Office / Proximity Audio

**Description:**  
Allow more than two users standing near one another to participate in the same proximity-based voice conversation.

**Acceptance Criteria:**
- [x] Nearby users can participate in a shared conversation instead of being limited to pairs.
- [x] Additional eligible users can join an existing conversation.
- [x] Each participant can hear the other authorized participants.
- [x] Joining and leaving are synchronized across connected clients.
- [x] Moving outside the permitted proximity area updates conversation membership according to the proximity rules.

**Delivery evidence (2026-11-16):** Deployed to the Gather Lite pilot from `281ee3240ce8bdc419bc2a35c485ed20eac98f97`. The controlled public-host browser canary verified A+B followed by C joining their existing conversation, two remote audio tracks and advancing decoded audio per participant, connected ICE, and A+B continuity after C left. Join latency measured 1,514 ms; C's remote audio element was removed in 174 ms. The existing live-media proximity boundary E2E and pairing tests cover departure beyond the exit radius and re-entry. Separate-network/TURN-only testing remains a wider-rollout gate; see the [rollout evidence and rollback runbook](PROXIMITY_GROUP_ROLLOUT.md).

---

### TICKET-003 — Fix Player Coordinate Synchronization

**Type:** Bug  
**Priority:** Critical  
**Component:** Realtime / World State

**Description:**  
Player coordinates are inconsistent between users. A character's position may appear differently on another user's screen, affecting proximity detection and conversation behavior.

**Acceptance Criteria:**
- [ ] All connected clients receive consistent authoritative player positions.
- [ ] Proximity calculations use the server-authoritative coordinates.
- [ ] Movement updates do not produce persistent position differences between clients.
- [ ] Reconnection correctly restores the latest player positions.
- [ ] Multi-user tests verify coordinate consistency during movement and conversation initiation.

---

### TICKET-004 — Fix Delayed Voice Permission and Conversation Activation

**Type:** Bug  
**Priority:** High  
**Component:** Media / Permissions

**Description:**  
Voice permissions or conversation authorization arrive too late, delaying the start of communication between eligible users.

Investigate whether the delay comes from browser microphone permissions, backend authorization, realtime events, or media connection establishment.

**Acceptance Criteria:**
- [ ] The source of the permission/activation delay is identified.
- [ ] Permission and conversation-state changes reach affected users promptly.
- [ ] Users receive clear feedback while microphone permission or media connection is pending.
- [ ] Voice communication starts without unnecessary authorization delays.
- [ ] End-to-end activation latency is measured and validated against an agreed target.

---

### TICKET-005 — Replace the Placeholder First Page

**Type:** Bug / UI Integration  
**Priority:** High  
**Component:** Frontend / Navigation

**Description:**  
The first page of the application appears to be a fake, mock, or placeholder page rather than a fully functional part of the product.

**Acceptance Criteria:**
- [ ] Identify the first page referenced in the meeting.
- [ ] Remove or replace placeholder-only content.
- [ ] Connect the page to actual application functionality and data where required.
- [ ] Ensure buttons, navigation, and user actions work correctly.
- [ ] Verify the page behaves correctly for the relevant authenticated or unauthenticated user state.

---

### TICKET-006 — Enforce a Maximum of 20 Conversation Participants

**Type:** Feature / Business Rule  
**Priority:** High  
**Component:** Conversations / Media

**Description:**  
Introduce a maximum capacity of **20 participants per conversation**, based on the meeting decision.

**Acceptance Criteria:**
- [ ] A single conversation supports up to 20 simultaneous participants.
- [ ] The backend enforces the participant limit.
- [ ] Attempts to join a full conversation are rejected gracefully.
- [ ] Users receive a clear conversation-full message.
- [ ] The limit remains enforced during simultaneous join attempts.
- [ ] Disconnects and participant departures release capacity correctly.

**Open clarification:** Confirm whether this limit applies to proximity conversations, room-based meetings, or both.

---

### TICKET-007 — Implement Two-Block Proximity Detection and Conversation Circle

**Type:** Feature  
**Priority:** High  
**Component:** World Geometry / Proximity

**Description:**  
Define nearby conversation eligibility based on a distance of **two map blocks in every direction** from the character, with a conversation area represented as a circle around the user or conversation.

**Acceptance Criteria:**
- [ ] Proximity eligibility is calculated using player coordinates.
- [ ] The configured proximity distance is two map blocks.
- [ ] Eligible users inside the area can participate in the nearby conversation.
- [ ] Users outside the area are not automatically eligible.
- [ ] Proximity results are consistent across all clients.
- [ ] A circular visual indicator represents the nearby conversation area when appropriate.

**Open clarification:** Confirm whether the two-block rule uses a true circular distance or a square grid neighborhood, and how the shared conversation center is determined.

---

### TICKET-008 — Add Avatar Talking Animation

**Type:** Feature / UX  
**Priority:** Medium  
**Component:** Avatar / Animation / Media

**Description:**  
Display a visual animation or indicator when a user's avatar is speaking during a voice conversation.

**Acceptance Criteria:**
- [ ] Speaking users have a visible talking animation or indicator.
- [ ] The indicator appears while speech is detected, not merely while the microphone is enabled.
- [ ] Speaking-state changes are visible to other participants.
- [ ] The animation stops when the user stops speaking.
- [ ] Muted or disconnected users do not incorrectly appear to be speaking.
- [ ] The animation does not interfere with walking or sitting animations.

---

## Suggested Implementation Order

1. **TICKET-003:** Fix coordinate synchronization.
2. **TICKET-004:** Resolve permission/activation delays.
3. **TICKET-007:** Establish reliable two-block proximity rules.
4. **TICKET-002:** Enable multi-user proximity conversations.
5. **TICKET-001:** Enable group meetings in rooms.
6. **TICKET-006:** Enforce the 20-participant limit.
7. **TICKET-008:** Add speaking animations.
8. **TICKET-005:** Replace the placeholder first page (can proceed independently).

## Decisions to Confirm

- Does the 20-user limit apply to both meeting rooms and proximity conversations?
- Issue #9's two-tile eligibility uses true Euclidean circle distance; deployed v3 anchors the shared circle at the founding pair midpoint.
- Does “permission arrives too late” refer to the browser microphone prompt, backend authorization, or actual voice connection?
- Which specific first page was described as fake?

## GitHub Issue and PR Review — 2026-11-16

The tickets map to the repository's GitHub issues below. Coordinate sync was delivered by PRs #10 and #11. Issue #4's earlier proximity-group pilot code is deployed at [`281ee324`](https://github.com/ibrahim8ismael/workspace/commit/281ee3240ce8bdc419bc2a35c485ed20eac98f97); issue #12/#3 is deployed at local merge commit `7d4d00b`. The current pilot evidence and the still-open fixed-meeting acceptance are recorded in the acceptance register.

| Ticket | GitHub issue | Work found in this repository | Disposition |
| --- | --- | --- | --- |
| TICKET-001 | [#3](https://github.com/ibrahim8ismael/workspace/issues/3) | Trusted versioned map zones, explicit join/leave, server roster, twenty-person capacity, invitation run-to-join and UI actions use the existing media guard/token path. Local runtime, contract and component checks pass. | Open pending deployed multi-client fixed-room audio and membership/session revocation checks. |
| TICKET-002 | [#4](https://github.com/ibrahim8ismael/workspace/issues/4) | Proximity groups of 2–6 are deployed at [commit `281ee324`](https://github.com/ibrahim8ismael/workspace/commit/281ee3240ce8bdc419bc2a35c485ed20eac98f97). Local real-SFU tests and the controlled pilot browser canary verify three-way audio, synchronized roster changes, member removal, and survivor continuity. | Closed after posting [pilot deployment evidence](https://github.com/ibrahim8ismael/workspace/issues/4#issuecomment-6914505267); no PR exists for this direct-to-main change. Wider release remains gated on separate-network/TURN tests. |
| TICKET-003 | [#5](https://github.com/ibrahim8ismael/workspace/issues/5) | Fixed by [PR #10](https://github.com/ibrahim8ismael/workspace/pull/10), merged to `main`. Follow-up test [PR #11](https://github.com/ibrahim8ismael/workspace/pull/11) was merged into the coordinate-sync topic branch after #10 had already merged, so its additional live-test changes are not in current `main`. | Already closed by PR #10. No further close action. |
| TICKET-004 | [#6](https://github.com/ibrahim8ismael/workspace/issues/6) | The third-user failure was traced to pair-only membership. Local group authorization measured 762 ms; browser-permission latency and an agreed activation target remain unverified. | Open; update diagnosis/target before closure. |
| TICKET-005 | [#7](https://github.com/ibrahim8ismael/workspace/issues/7) | No first-page replacement work was made. | Open; no PR. |
| TICKET-006 | [#8](https://github.com/ibrahim8ismael/workspace/issues/8) | Fixed meetings now support twenty participants; proximity voice remains capped at six. | Open; confirm whether issue #8 requires twenty-person proximity groups too. |
| TICKET-007 | [#9](https://github.com/ibrahim8ismael/workspace/issues/9) | Deployed v3 uses two-tile Euclidean pair eligibility, anchored midpoint, two-tile initial radius, bounded one-tile growth to six tiles, safe shrink and dotted geometry in Vivo and Commons. Automated boundary/runtime tests and renderer checks pass. | Open pending repeat five-sample cutoff p95 on the merged image and live stale-grant/revocation verification. |
| Issue #12 | [#12](https://github.com/ibrahim8ismael/workspace/issues/12) | Root cause in the prior implementation: centroid recentering plus a three-tile departure radius and 500 ms debounce retained group authorization after the intended area. Current worktree removes membership immediately beyond the canonical published circle and rotates media generation. | Open pending decoded-audio cutoff measurement (≤2 s maximum, p95 ≤1 s target), real-SFU revocation tests and rollout. |
| TICKET-008 | [#2](https://github.com/ibrahim8ismael/workspace/issues/2) | No avatar speaking animation was added. | Open; no PR. |

Parent roadmap: [#1](https://github.com/ibrahim8ismael/workspace/issues/1) remains open until its child issue acceptance is supported by evidence. Issue #5 is already closed by PR #10. Issue #4 was closed on 2026-11-16 after posting earlier pilot evidence. Issues #3 and #12 remain open pending verification/deployment; issue #8's 20-person scope remains an independent decision. No status changes or GitHub comments are made by this repository patch.
