# Issue #7 — Office entry verification

Verified on 2026-11-16 with two authenticated Chromium contexts against the local
OrbStack API, media guard and LiveKit SFU. The frontend was built locally and
layered onto the existing local Caddy runtime image; this was not a clean
Dockerfile build. The API and guard matched the current office protocol.

The live test wraps native browser `getUserMedia` only to record returned streams.
It does not replace capture streams, API responses, office events, or media signaling.
Chromium uses its fake microphone device with a controlled continuous WAV input,
so these results validate browser capture and publication, not physical hardware.

| Observation | Result |
| --- | --- |
| Capture before explicit microphone action | 0 streams, 0 live audio tracks |
| Turn microphone on | 1 enabled live track; observed after 324 ms |
| Turn microphone off | 0 live audio tracks; observed after 31 ms |
| Join with microphone on | Choice retained; entry tracks released until a conversation is authorized |
| Join with microphone off | Choice retained; 0 capture streams |
| Nearby coworker opts into voice | Selected microphone publishes without another click; both clients have a remote audio element and 1 live capture track |
| Conversation ready | Observed after 1425 ms from the coworker's microphone action |
| Peer receives decoded audio | 6 active energy probe samples before assertion completed |
| Mute inside the office | 0 live capture tracks for the muted user |
| Leave office / back to companies | All observed capture tracks released; re-entry defaults to off |

These are local polling measurements from one run, not latency guarantees.
The test checks the authenticated display name returned by registration and the
absence of a camera/video panel. The entry card uses API-loaded company name,
member count, membership role, account display name and email. Member count is
company membership, not a fabricated online presence count.

Reproduce against the local media Compose profile in `infra/README.md`:

```sh
node tests/e2e/create-continuous-tone.mjs /private/tmp/gather-entry-tone.wav
LIVE_OFFICE_E2E=1 LIVE_OFFICE_MEDIA_E2E=1 \
  LIVE_OFFICE_FAKE_AUDIO_WAV=/private/tmp/gather-entry-tone.wav \
  pnpm exec playwright test tests/e2e/live-office.spec.ts \
  -g 'entry microphone opens' --workers=1
```

The test attaches JSON measurements and saves `office-entry-microphone-on.png`.
Capture cancellation, permission denial/retry and device disconnection are covered
by unit tests; denial was not forced in the successful native capture run.
