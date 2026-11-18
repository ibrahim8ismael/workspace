# Wave notification sound — issue #38

Issue: <https://github.com/ibrahim8ismael/workspace/issues/38>

## Intended behavior

A member receiving a new wave hears a short recognizable alert and retains the existing visual notice naming the sender. The sender and unrelated members remain silent. Sound follows the existing sound-effects volume preference, including zero volume and the legacy mute preference. Microphone mute controls voice capture independently.

Each validated wave event is eligible once. Duplicate delivery, React rerenders and changing preferences must not replay an old wave. Rapid waves must not overlap. Browser audio restrictions or unavailable audio APIs must leave visual notifications working without uncaught errors or stale playback later.

## Implementation and review

1. Reuse the existing office wave validation and event identity.
2. Add a small synthesized alert and recipient-aware lifecycle integration.
3. Reuse the existing effects-volume setting without adding a separate preference.
4. Test recipient filtering, duplicate delivery, mute and unmute, rapid events, autoplay blocking and disposal.
5. Review independently after Luna implements the code, then run focused tests, web typechecking, lint and formatting checks.

Two-session browser validation should check enabled sound, muted sound and blocked playback while confirming the visual sender notice. Report unavailable infrastructure explicitly; unit tests do not establish that live validation passed.

## Work isolation

Implementation uses `codex/issue-38-wave-sound`, based on `origin/main` at `ae5f88e`, in a separate worktree. Existing edits on `codex/issue-17-space-messaging` are outside this change.

## Review and validation results

Luna implemented the alert and addressed the independent review findings: browser activation recovery, gain-node cleanup, constructible audio mocks and React effect dependencies. The reviewer also cleared stopped oscillator references and extended the existing mounted-office browser test.

- Web unit suite: 14 files, 80 tests passed.
- Web TypeScript checks passed.
- Chromium mounted-office test passed with real oscillator-start instrumentation and mocked API/socket transport. It checks the visual sender notice, recipient filtering, duplicate suppression, muted effects, blocked playback and a fresh wave after recovery.
- Browser blocking is simulated; this is not a real two-member live-stack test or an assessment of physical speaker output. The local live-office and Mailpit endpoints were unavailable.
- The host uses Node v24.12.0, below the declared v24.18.0 minimum. Verification used the locked dependencies with pnpm's engine gate disabled.

