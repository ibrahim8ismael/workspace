# Issue #31: authoritative rooms and meeting audio isolation

Issue: <https://github.com/ibrahim8ismael/workspace/issues/31>

## Scope and model

Build on the existing meeting-zone identity and map geometry, rather than introducing a second unrelated room registry. A room belongs to a workspace, office and map version, has stable identity, bounds and explicit entrance geometry, capacity and admission policy. Retain compatible `zoneId` references for invitations and meeting commands where possible.

Track physical occupancy independently from admitted meeting membership. Coordinates determine occupancy and eligibility; only explicit authorized meeting admission grants media access. Expose authoritative room state to connected clients, including occupancy, membership and derived door state. This issue supplies a consistent source for door behavior; it does not require a new room editor.

## Implementation sequence

1. Inspect map geometry, runtime meeting groups, invitation routing, proximity candidate selection, token issuance and media guard retirement. Identify the implementation actually used by the gateway; avoid adding security checks only to an unused helper.
2. Define the unified room contract and validate boundaries and entrances against the trusted map. Document protocol changes and preserve compatibility where feasible.
3. Derive synchronized room occupancy and meeting admission from authoritative runtime state. Cover entry, movement, seat changes, invite acceptance, explicit join/leave, availability, disconnect and revocation.
4. Isolate room media across boundaries and adjacent rooms. Reject unauthorized tokens and prevent proximity conversations from bridging rooms. Reuse existing generation rotation and guard enforcement to revoke already issued media access.
5. Add regression tests for authoritative state, invitation admission, outsiders, adjacent simultaneous meetings, stale tokens, exit, revocation and reconnect.
6. Add and run multi-client actual media delivery tests for inside, outside doorway/walls, adjacent rooms and exit/revocation. Use existing local LiveKit/guard fixtures, without equating UI assertions or minted-token tests to verified audio isolation.
7. Independently review Luna's implementation, return actionable findings, run relevant contract/world/API/web checks and record exact evidence and remaining limitations here.

## Responsibilities and isolation

Luna implements code and regression coverage in `/private/tmp/gather-issue-31` on `codex/issue-31-room-audio-isolation`, based on main at `73d3fec`. The parent agent owns the plan, independent review and verification. Existing uncommitted work in the original checkout is outside scope. Do not publish, merge or mark acceptance complete without evidence.

## Acceptance evidence

Luna implemented the runtime, room contract, synchronized projection and unit coverage. Independent review corrected optional room-domain normalization, covered existing-group expansion, connected the client's room and door display to server occupancy, updated protocol fixtures, removed duplicate room publication, and added the real six-client media regression.

- `pnpm check`: passed, including lint, formatting, typecheck, generated asset checks and all production builds.
- Contracts: 29 passed. World: 31 passed. Web: 80 passed. API: 131 passed, two gated media cases skipped in the default suite. Media-enforcement spike: 33 passed. Asset and legacy-shared checks: five passed each.
- Mounted office Chromium UI E2E: one passed.
- Actual room audio regression: one passed separately with `CP08_REAL_MEDIA=1`, LiveKit, the application media guard and six Chromium sessions. Two adjacent Vivo room pairs and a separate outside proximity pair received exactly their own partner's audio. Physical outsiders at the doorway and wall could not obtain room tokens. Decoded audio continued in unaffected pairs during room exit and revocation.
- Measured decoded-audio cutoff: 39 ms after physical exit and 1,604 ms after company-membership removal. Already issued tokens were rejected by the guard after retirement. A fresh socket participation did not inherit admission.
- Baseline real proximity audio test also passed after fixing the test fixture to explicitly enable its microphone; production microphone behavior is unchanged by that fixture fix.

Verification used Node 24.22.3 and the locked dependencies. The existing local application was left running unchanged; the tests created and cleaned up isolated MongoDB, LiveKit and browser fixtures. This validates local behavior and does not establish production deployment or a latency percentile.

The shared office protocol is now version 4 because room metadata gained required fields. Deploy the API and web together. Older office tabs need to reload before admission.
